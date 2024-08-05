import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorError } from "@coral-xyz/anchor";
import {
  RewardsDistributor,
  IDL as RewardsDistributorIDL,
} from "../target/types/rewards_distributor";
import { Keypair, LAMPORTS_PER_SOL, SystemProgram } from "@solana/web3.js";
import { assert, expect } from "chai";
import { createNewMint, createTokenAccount } from "./utils";
import {
  deriveDistributorPDA,
  deriveEpochPDA,
  findClaimStatusKey,
} from "../src/utils/pda";
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

  let distributor;
  let distributorTokenAccount;
  let managerTokenAccount;
  let mint;
  let baseKey;
  let bump;
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

  before(async () => {
    payer = getKeypair("payer");
    baseKey = Keypair.generate();
    [distributor, bump] = await deriveDistributorPDA(baseKey.publicKey);

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

    distributorTokenAccount = await getAssociatedTokenAddress(
      mint,
      distributor,
      true
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
      .initialize(agent.publicKey, new anchor.BN(0))
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

    const [previousEpoch, previousEpochBump] = deriveEpochPDA(previous_epoch_nr);
    const [currentEpoch, currentEpochBump] = deriveEpochPDA(current_epoch_nr);

    const argsTuple: [number, number[]] = [bump, root];

    const mintAccount = await createNewMint();

    try {
      await program.methods
        .addEpoch(...argsTuple)
        .accounts({
          base: baseKey.publicKey,
          distributor,
          mint: mintAccount,
          systemProgram: SystemProgram.programId,
          agent: manager.publicKey,
          rewardsAccount: rewardsAccountKeypair.publicKey,
          previousEpochAccount: previousEpoch,
          currentEpochAccount: currentEpoch,
        })
        .signers([baseKey])
        .rpc();
      // we use this to make sure we definitely throw an error
      assert(false, "should've failed but didn't ");
    } catch (_err) {
      expect(_err).to.be.instanceOf(AnchorError);
      const err: AnchorError = _err;
      expect(err.error.errorCode.number).to.equal(6000);
      expect(err.error.errorCode.code).to.equal("Unauthorized");
      expect(err.program.equals(program.programId)).is.true;
    }
  });

  it("agent can call add epoch", async () => {
    await provider.connection.requestAirdrop(
      agent.publicKey,
      LAMPORTS_PER_SOL * 10000
    );

    const root: number[] = new Array(32).fill(0);

    const rewardAccountBeforeCall = await program.account.rewardsAccount.fetch(
      rewardsAccountKeypair.publicKey
    );

    const previous_epoch_nr = new u64(rewardAccountBeforeCall.currentEpochNr);
    const current_epoch_nr = new u64(previous_epoch_nr.add(new anchor.BN(1)));
    const [previousEpoch, previousEpochBump] = deriveEpochPDA(previous_epoch_nr);
    const [currentEpoch, currentEpochBump] = deriveEpochPDA(current_epoch_nr);

    const argsTuple: [number, number[]] = [bump, root];

    const mint = await createMint(
      provider.connection,
      getKeypair("payer"),
      // mint authority
      getKeypair("payer").publicKey,
      // freeze authority
      getKeypair("payer").publicKey,
      // decimals
      0
    );
    await program.methods
      .addEpoch(...argsTuple)
      .accounts({
        base: baseKey.publicKey,
        distributor,
        mint: mint,
        systemProgram: SystemProgram.programId,
        agent: agent.publicKey,
        rewardsAccount: rewardsAccountKeypair.publicKey,
        previousEpochAccount: previousEpoch,
        currentEpochAccount: currentEpoch,
      })
      .signers([baseKey, agent])
      .rpc()
      .catch((e) => console.log(e));
  });

  it("manager cannot call correct epoch", async () => {
    const rewardAccountBeforeCall = await program.account.rewardsAccount.fetch(
      rewardsAccountKeypair.publicKey
    );

    const current_epoch_nr = new u64(rewardAccountBeforeCall.currentEpochNr);

    const [currentEpoch, currentEpochBump] = deriveEpochPDA(current_epoch_nr);

    try {
      await program.methods
        .correctEpoch(current_epoch_nr, corrected_root)
        .accounts({
          agent: manager.publicKey,
          rewardsAccount: rewardsAccountKeypair.publicKey,
          epochAccount: currentEpoch,
        })
        .rpc();
      // we use this to make sure we definitely throw an error
      assert(false, "should've failed but didn't ");
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

    const [currentEpoch, currentEpochBump] = deriveEpochPDA(current_epoch_nr);

    await program.methods
      .correctEpoch(current_epoch_nr, corrected_root)
      .accounts({
        agent: agent.publicKey,
        rewardsAccount: rewardsAccountKeypair.publicKey,
        epochAccount: currentEpoch,
      })
      .signers([agent])
      .rpc();
  });

  it("manager can call approve epoch", async () => {
    const rewardAccountBeforeCall = await program.account.rewardsAccount.fetch(
      rewardsAccountKeypair.publicKey
    );

    const current_epoch_nr = new u64(rewardAccountBeforeCall.currentEpochNr);

    const [currentEpoch, currentEpochBump] = deriveEpochPDA(current_epoch_nr);

    const epochAccountBeforeCall = await program.account.epochAccount.fetch(
      currentEpoch
    );
    assert(!epochAccountBeforeCall.isApproved);

    await program.methods
      .approveEpoch(current_epoch_nr, new anchor.BN(10))
      .accounts({
        rewardsAccount: rewardsAccountKeypair.publicKey,
        epochAccount: currentEpoch,
        distributor,
        manager: manager.publicKey,
        distributorTokenAccount: distributorTokenAccount,
        managerTokenAccount: managerTokenAccount,
        mintAccount: mint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc()
      .catch((e) => console.log(e));

    const epochAccountAfterCall = await program.account.epochAccount.fetch(
      currentEpoch
    );
    assert(epochAccountAfterCall.isApproved);
  });

  it("claim rewards", async () => {
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

    const [claimStatus, bump] = await findClaimStatusKey(
      index,
      distributor,
      program.programId
    );

    const argsTuple: [u64, anchor.BN, u64, number[][]] = [
      index,
      epoch_nr,
      amount,
      proof,
    ];
    const receiverTokenAccount = await createTokenAccount(
      mint,
      receiver.publicKey
    );

    const [currentEpoch, currentEpochBump] = deriveEpochPDA(epoch_nr);

    await program.methods
      .claim(...argsTuple)
      .accounts({
        distributor,
        claimStatus,
        from: distributorTokenAccount,
        to: receiverTokenAccount,
        receiver: receiver.publicKey,
        payer: payer.publicKey,
        rewardsAccount: rewardsAccountKeypair.publicKey,
        epochAccount: currentEpoch,
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
    let payer = getKeypair("payer");

    const [claimStatus, bump] = await findClaimStatusKey(
      index,
      distributor,
      program.programId
    );

    const rewardAccountBeforeCall = await program.account.rewardsAccount.fetch(
      rewardsAccountKeypair.publicKey
    );
    const epoch_nr = rewardAccountBeforeCall.currentApprovedEpoch;
    const [currentEpoch, currentEpochBump] = deriveEpochPDA(epoch_nr);

    const argsTuple: [u64, anchor.BN, u64, number[][]] = [
      index,
      epoch_nr,
      amount,
      [],
    ];
    const fakeReceiverTokenAccount = await createTokenAccount(
      mint,
      fakeReceiver.publicKey
    );

    try {
      await program.methods
        .claim(...argsTuple)
        .accounts({
          distributor,
          claimStatus,
          from: distributorTokenAccount,
          to: fakeReceiverTokenAccount,
          receiver: fakeReceiver.publicKey,
          payer: payer.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
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

    const bal = await provider.connection.getTokenAccountBalance(
      fakeReceiverTokenAccount
    );

    expect(bal.value.uiAmountString).to.be.eq("0");
  });
});
