import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorError } from "@coral-xyz/anchor";
import {
  RewardsDistributor,
  IDL as RewardsDistributorIDL,
} from "../target/types/rewards_distributor";
import {Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram} from "@solana/web3.js";
import { assert, expect } from "chai";
import {confirmedAirdrop, createNewMint, createTokenAccount} from "./utils";
import { deriveEpochPDA, findClaimStatusKey } from "../src/utils/pda";
import { getKeypair, writePublicKey } from "../src/utils/keyStore";
import { u64 } from "@saberhq/token-utils";
import { BalanceTree } from "../src/libs/balance-tree";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
const {
  createMint,
  getAssociatedTokenAddress,
  mintTo,
  createAccount,
} = require("@solana/spl-token");

describe("epoch tests", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const manager = provider.wallet as anchor.Wallet;
  const agent = anchor.web3.Keypair.generate();
  const receiver = anchor.web3.Keypair.generate();
  const epochTwoReceiver = anchor.web3.Keypair.generate();

  let managerTokenAccount;
  let mint: PublicKey;
  let payer;

  const program = anchor.workspace
    .RewardsDistributor as Program<RewardsDistributor>;
  writePublicKey(program.programId, "program_devnet");

  // Generate a new keypair for the rewards account
  const rewardsAccountKeypair = new Keypair();

  const elements = [
    {
      account: receiver.publicKey,
      amount: new anchor.BN(10),
    },
  ];
  const tree = new BalanceTree(elements);

  const corrected_root: any = tree.getRoot();

  const epochTwoElements = [
    {
      account: epochTwoReceiver.publicKey,
      amount: new anchor.BN(10),
    },
  ];
  const epochTwoTree = new BalanceTree(epochTwoElements);

  const epochTwoCorrected_root: any = epochTwoTree.getRoot();

  before(async () => {
    await confirmedAirdrop(
      provider.connection,
      agent.publicKey,
      LAMPORTS_PER_SOL * 5 // 5 SOL
    );
    await confirmedAirdrop(
        provider.connection,
        receiver.publicKey,
        LAMPORTS_PER_SOL * 5 // 5 SOL
    );

    payer = getKeypair("payer");

    mint = await createMint(
      provider.connection,
      getKeypair("payer"),
      // mint authority
      getKeypair("payer").publicKey,
      // freeze authority
      getKeypair("payer").publicKey,
      // decimals
      0
    );

    managerTokenAccount = await createAccount(
      provider.connection,
      getKeypair("payer"),
      mint,
      getKeypair("payer").publicKey
      // undefined, undefined,
    );

    await mintTo(
      provider.connection,
      getKeypair("payer"),
      mint,
      managerTokenAccount,
      // tokenAccount,
      getKeypair("payer"),
      // mint exactly 1 token
      100,
      // no `multiSigners`
      [],
      undefined,
      TOKEN_PROGRAM_ID
    );
  });

  it("Is initialized!", async () => {
    let events = [];
    let listener = program.addEventListener("Initialized", (event: any) => {
      events.push(event);
    });

    await program.methods
      .initialize(agent.publicKey)
      .accounts({
        manager: manager.publicKey,
        rewardsAccount: rewardsAccountKeypair.publicKey,
      })
      .signers([rewardsAccountKeypair])
      .rpc();

    const rewardAccount = await program.account.rewardsAccount.fetch(
      rewardsAccountKeypair.publicKey
    );
    assert(
      rewardAccount.manager.equals(manager.publicKey),
      "Public keys should be the same"
    );

    assert.equal(events.length, 1);
    let initializedEvent = events[0];

    assert(
      initializedEvent.manager.equals(manager.publicKey),
      "Public keys should be the same"
    );

    program.removeEventListener(listener);
  });

  it("manager cannot call add epoch", async () => {
    const root: number[] = new Array(32).fill(0);

    const rewardAccountBeforeCall = await program.account.rewardsAccount.fetch(
      rewardsAccountKeypair.publicKey
    );

    const previous_epoch_nr = new u64(rewardAccountBeforeCall.currentEpochNr);
    const current_epoch_nr = new u64(previous_epoch_nr.add(new anchor.BN(1)));

    const [currentEpoch, currentEpochBump] = deriveEpochPDA({
      rewardsAccountKey: rewardsAccountKeypair.publicKey,
      epochNr: current_epoch_nr,
    });

    const argsTuple: [number, number[]] = [currentEpochBump, root];

    const mintAccount = await createNewMint();

    try {
      await program.methods
        .addEpoch(...argsTuple)
        .accounts({
          mint: mintAccount,
          systemProgram: SystemProgram.programId,
          agent: manager.publicKey,
          rewardsAccount: rewardsAccountKeypair.publicKey,
          currentEpochAccount: currentEpoch,
        })
        .rpc();
      // we use this to make sure we definitely throw an error
      assert(false, "should've failed but didn't");
    } catch (_err) {
      expect(_err).to.be.instanceOf(AnchorError);
      const err: AnchorError = _err;
      expect(err.error.errorCode.number).to.equal(6000);
      expect(err.error.errorCode.code).to.equal("Unauthorized");
      expect(err.program.equals(program.programId)).is.true;
    }
  });

  it("agent can call add epoch", async () => {
    const root: number[] = new Array(32).fill(0);

    const rewardAccountBeforeCall = await program.account.rewardsAccount.fetch(
      rewardsAccountKeypair.publicKey
    );

    const previous_epoch_nr = new u64(rewardAccountBeforeCall.currentEpochNr);
    const current_epoch_nr = new u64(previous_epoch_nr.add(new anchor.BN(1)));

    const [currentEpoch, currentEpochBump] = deriveEpochPDA({
      rewardsAccountKey: rewardsAccountKeypair.publicKey,
      epochNr: current_epoch_nr,
    });

    const argsTuple: [number, number[]] = [currentEpochBump, root];

    await program.methods
      .addEpoch(...argsTuple)
      .accounts({
        mint,
        systemProgram: SystemProgram.programId,
        agent: agent.publicKey,
        rewardsAccount: rewardsAccountKeypair.publicKey,
        currentEpochAccount: currentEpoch,
      })
      .signers([agent])
      .rpc();
  });

  it("manager cannot call correct epoch", async () => {
    const rewardAccountBeforeCall = await program.account.rewardsAccount.fetch(
      rewardsAccountKeypair.publicKey
    );

    const current_epoch_nr = new u64(rewardAccountBeforeCall.currentEpochNr);

    const [currentEpoch, currentEpochBump] = deriveEpochPDA({
      rewardsAccountKey: rewardsAccountKeypair.publicKey,
      epochNr: current_epoch_nr,
    });

    try {
      await program.methods
        .correctEpoch(current_epoch_nr, corrected_root)
        .accounts({
          agent: manager.publicKey,
          mint,
          rewardsAccount: rewardsAccountKeypair.publicKey,
          epochAccount: currentEpoch,
        })
        .rpc();
      // we use this to make sure we definitely throw an error
      assert(false, "should've failed but didn't");
    } catch (_err) {
      expect(_err).to.be.instanceOf(AnchorError);
      const err: AnchorError = _err;
      expect(err.error.errorCode.number).to.equal(6000);
      expect(err.error.errorCode.code).to.equal("Unauthorized");
      expect(err.program.equals(program.programId)).is.true;
    }
  });

  it("agent can call correct epoch", async () => {
    const rewardAccountBeforeCall = await program.account.rewardsAccount.fetch(
      rewardsAccountKeypair.publicKey
    );

    const current_epoch_nr = new u64(rewardAccountBeforeCall.currentEpochNr);

    const [currentEpoch, currentEpochBump] = deriveEpochPDA({
      rewardsAccountKey: rewardsAccountKeypair.publicKey,
      epochNr: current_epoch_nr,
    });

    await program.methods
      .correctEpoch(current_epoch_nr, corrected_root)
      .accounts({
        agent: agent.publicKey,
        mint,
        rewardsAccount: rewardsAccountKeypair.publicKey,
        epochAccount: currentEpoch,
      })
      .signers([agent])
      .rpc();
  });

  it("agent cannot call add epoch for next epoch without approving previous epoch", async () => {
    const root: number[] = new Array(32).fill(0);

    const rewardAccountBeforeCall = await program.account.rewardsAccount.fetch(
      rewardsAccountKeypair.publicKey
    );

    const previous_epoch_nr = new u64(rewardAccountBeforeCall.currentEpochNr);
    const current_epoch_nr = new u64(previous_epoch_nr.add(new anchor.BN(1)));

    const [currentEpoch, currentEpochBump] = deriveEpochPDA({
      rewardsAccountKey: rewardsAccountKeypair.publicKey,
      epochNr: current_epoch_nr,
    });

    const argsTuple: [number, number[]] = [currentEpochBump, root];

    try {
      await program.methods
        .addEpoch(...argsTuple)
        .accounts({
          mint: mint,
          systemProgram: SystemProgram.programId,
          agent: agent.publicKey,
          rewardsAccount: rewardsAccountKeypair.publicKey,
          currentEpochAccount: currentEpoch,
        })
        .signers([agent])
        .rpc();
      // we use this to make sure we definitely throw an error
      assert(false, "should've failed but didn't ");
    } catch (error) {
      const errCode = RewardsDistributorIDL.errors.find(
        (er) => er.name === "PreviousEpochIsNotApproved"
      ).code;
      expect(error.message).to.include(errCode.toString());
    }
  });

  it("manager cannot use wrong mint to approve epoch", async () => {
    const rewardAccountBeforeCall = await program.account.rewardsAccount.fetch(
      rewardsAccountKeypair.publicKey
    );

    const current_epoch_nr = new u64(rewardAccountBeforeCall.currentEpochNr);

    const [currentEpoch, currentEpochBump] = deriveEpochPDA({
      rewardsAccountKey: rewardsAccountKeypair.publicKey,
      epochNr: current_epoch_nr,
    });

    const epochAccountBeforeCall = await program.account.epochAccount.fetch(
      currentEpoch
    );
    assert(!epochAccountBeforeCall.isApproved);

    const wrongMint = await createMint(
      provider.connection,
      getKeypair("payer"),
      // mint authority
      getKeypair("payer").publicKey,
      // freeze authority
      getKeypair("payer").publicKey,
      // decimals
      0
    );

    const epochTokenAccount = await getAssociatedTokenAddress(
      wrongMint,
      currentEpoch,
      true
    );

    try {
      await program.methods
        .approveEpoch(current_epoch_nr, new anchor.BN(10))
        .accounts({
          rewardsAccount: rewardsAccountKeypair.publicKey,
          epochAccount: currentEpoch,
          manager: manager.publicKey,
          epochTokenAccount: epochTokenAccount,
          managerTokenAccount: managerTokenAccount,
          mintAccount: wrongMint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
    } catch (error) {
      const errCode = RewardsDistributorIDL.errors.find(
        (er) => er.name === "InvalidMintAccount"
      ).code;
      expect(error.message).to.include(errCode.toString());
    }
  });

  it("manager can call approve epoch", async () => {
    const rewardAccountBeforeCall = await program.account.rewardsAccount.fetch(
      rewardsAccountKeypair.publicKey
    );

    const current_epoch_nr = new u64(rewardAccountBeforeCall.currentEpochNr);

    const [currentEpoch, currentEpochBump] = deriveEpochPDA({
      rewardsAccountKey: rewardsAccountKeypair.publicKey,
      epochNr: current_epoch_nr,
    });

    const epochAccountBeforeCall = await program.account.epochAccount.fetch(
      currentEpoch
    );
    assert(!epochAccountBeforeCall.isApproved);

    const epochTokenAccount = await getAssociatedTokenAddress(
      mint,
      currentEpoch,
      true
    );

    await program.methods
      .approveEpoch(current_epoch_nr, new anchor.BN(10))
      .accounts({
        rewardsAccount: rewardsAccountKeypair.publicKey,
        epochAccount: currentEpoch,
        manager: manager.publicKey,
        epochTokenAccount: epochTokenAccount,
        managerTokenAccount: managerTokenAccount,
        mintAccount: mint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const epochAccountAfterCall = await program.account.epochAccount.fetch(
      currentEpoch
    );
    assert(epochAccountAfterCall.isApproved);
  });
  it("user cannot call claim with wrong mint", async () => {
    const amount = new u64(10);
    const index = new u64(0);
    const proof: any = tree.getProof(
      index.toNumber(),
      receiver.publicKey,
      amount
    );

    const rewardAccountBeforeCall = await program.account.rewardsAccount.fetch(
      rewardsAccountKeypair.publicKey
    );
    const epoch_nr = rewardAccountBeforeCall.currentApprovedEpoch;

    const argsTuple: [u64, u64, number[][]] = [index, amount, proof];

    const wrongMint = await createMint(
      provider.connection,
      getKeypair("payer"),
      // mint authority
      getKeypair("payer").publicKey,
      // freeze authority
      getKeypair("payer").publicKey,
      // decimals
      0
    );

    const receiverTokenAccount = await getAssociatedTokenAddress(
      wrongMint,
      receiver.publicKey,
      false
    );

    const [currentEpoch, currentEpochBump] = deriveEpochPDA({
      rewardsAccountKey: rewardsAccountKeypair.publicKey,
      epochNr: epoch_nr,
    });

    const [claimStatus, bump] = findClaimStatusKey({
      rewardsAccountKey: rewardsAccountKeypair.publicKey,
      index,
      epochAccount: currentEpoch,
      program: program.programId,
    });

    const distributorTokenAccount = await createTokenAccount(
      wrongMint,
      currentEpoch
    );

    try {
      await program.methods
        .claim(...argsTuple)
        .accounts({
          claimStatus,
          from: distributorTokenAccount,
          to: receiverTokenAccount,
          receiver: receiver.publicKey,
          rewardsAccount: rewardsAccountKeypair.publicKey,
          epochAccount: currentEpoch,
          mintAccount: wrongMint,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([receiver])
        .rpc();
    } catch (error) {
      const errCode = RewardsDistributorIDL.errors.find(
        (er) => er.name === "InvalidMintAccount"
      ).code;
      expect(error.message).to.include(errCode.toString());
    }
  });

  it("user can call claim", async () => {
    const amount = new u64(10);
    const index = new u64(0);
    const proof: any = tree.getProof(
      index.toNumber(),
      receiver.publicKey,
      amount
    );

    const rewardAccountBeforeCall = await program.account.rewardsAccount.fetch(
      rewardsAccountKeypair.publicKey
    );
    const epoch_nr = rewardAccountBeforeCall.currentApprovedEpoch;

    const argsTuple: [u64, u64, number[][]] = [index, amount, proof];
    const receiverTokenAccount = await getAssociatedTokenAddress(
      mint,
      receiver.publicKey,
      false
    );
    const [currentEpoch, currentEpochBump] = deriveEpochPDA({
      rewardsAccountKey: rewardsAccountKeypair.publicKey,
      epochNr: epoch_nr,
    });

    const [claimStatus, bump] = findClaimStatusKey({
      rewardsAccountKey: rewardsAccountKeypair.publicKey,
      index,
      epochAccount: currentEpoch,
      program: program.programId,
    });

    const distributorTokenAccount = await getAssociatedTokenAddress(
      mint,
      currentEpoch,
      true
    );

    await program.methods
      .claim(...argsTuple)
      .accounts({
        claimStatus,
        from: distributorTokenAccount,
        to: receiverTokenAccount,
        receiver: receiver.publicKey,
        rewardsAccount: rewardsAccountKeypair.publicKey,
        epochAccount: currentEpoch,
        mintAccount: mint,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([receiver])
      .rpc();
  });

  it("fails for empty proof", async () => {
    const amount = new u64(100);
    const index = new u64(90001);
    const fakeReceiver = Keypair.generate();

    await confirmedAirdrop(
        provider.connection,
        fakeReceiver.publicKey,
        LAMPORTS_PER_SOL * 5 // 5 SOL
    );

    const rewardAccountBeforeCall = await program.account.rewardsAccount.fetch(
      rewardsAccountKeypair.publicKey
    );
    const epoch_nr = rewardAccountBeforeCall.currentApprovedEpoch;
    const [currentEpoch, currentEpochBump] = deriveEpochPDA({
      rewardsAccountKey: rewardsAccountKeypair.publicKey,
      epochNr: epoch_nr,
    });

    const [claimStatus, bump] = findClaimStatusKey({
      rewardsAccountKey: rewardsAccountKeypair.publicKey,
      index,
      epochAccount: currentEpoch,
      program: program.programId,
    });

    const argsTuple: [u64, u64, number[][]] = [index, amount, []];

    const fakeReceiverTokenAccount = await getAssociatedTokenAddress(
      mint,
      fakeReceiver.publicKey,
      false
    );

    const distributorTokenAccount = await getAssociatedTokenAddress(
      mint,
      currentEpoch,
      true
    );

    try {
      await program.methods
        .claim(...argsTuple)
        .accounts({
          claimStatus,
          from: distributorTokenAccount,
          to: fakeReceiverTokenAccount,
          receiver: fakeReceiver.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          mintAccount: mint,
          rewardsAccount: rewardsAccountKeypair.publicKey,
          epochAccount: currentEpoch,
        })
        .signers([fakeReceiver])
        .rpc();
    } catch (error) {
      const errCode = RewardsDistributorIDL.errors.find(
        (er) => er.name === "InvalidProof"
      ).code;
      expect(error.message).to.include(errCode.toString());
    }
  });

  it("agent can call add epoch two", async () => {
    const rewardAccountBeforeCall = await program.account.rewardsAccount.fetch(
      rewardsAccountKeypair.publicKey
    );

    const previous_epoch_nr = new u64(rewardAccountBeforeCall.currentEpochNr);
    const current_epoch_nr = new u64(previous_epoch_nr.add(new anchor.BN(1)));

    const [currentEpoch, currentEpochBump] = deriveEpochPDA({
      rewardsAccountKey: rewardsAccountKeypair.publicKey,
      epochNr: current_epoch_nr,
    });

    const argsTuple: [number, number[]] = [
      currentEpochBump,
      epochTwoCorrected_root,
    ];

    await program.methods
      .addEpoch(...argsTuple)
      .accounts({
        mint: mint,
        systemProgram: SystemProgram.programId,
        agent: agent.publicKey,
        rewardsAccount: rewardsAccountKeypair.publicKey,
        currentEpochAccount: currentEpoch,
      })
      .signers([agent])
      .rpc();
  });

  it("manager can call approve epoch two", async () => {
    const rewardAccountBeforeCall = await program.account.rewardsAccount.fetch(
      rewardsAccountKeypair.publicKey
    );

    const current_epoch_nr = new u64(rewardAccountBeforeCall.currentEpochNr);

    const [currentEpoch, currentEpochBump] = deriveEpochPDA({
      rewardsAccountKey: rewardsAccountKeypair.publicKey,
      epochNr: current_epoch_nr,
    });

    const epochAccountBeforeCall = await program.account.epochAccount.fetch(
      currentEpoch
    );
    assert(!epochAccountBeforeCall.isApproved);

    const epochTokenAccount = await getAssociatedTokenAddress(
      mint,
      currentEpoch,
      true
    );

    await program.methods
      .approveEpoch(current_epoch_nr, new anchor.BN(10))
      .accounts({
        rewardsAccount: rewardsAccountKeypair.publicKey,
        epochAccount: currentEpoch,
        manager: manager.publicKey,
        epochTokenAccount: epochTokenAccount,
        managerTokenAccount: managerTokenAccount,
        mintAccount: mint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const epochAccountAfterCall = await program.account.epochAccount.fetch(
      currentEpoch
    );
    assert(epochAccountAfterCall.isApproved);
  });
});
