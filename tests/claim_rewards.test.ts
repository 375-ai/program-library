import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  RewardsDistributor,
  IDL as RewardsDistributorIDL,
} from "../target/types/rewards_distributor";
import { Keypair, SystemProgram } from "@solana/web3.js";
import { assert, expect } from "chai";
import { u64 } from "@saberhq/token-utils";
import { BalanceTree } from "../src/libs/balance-tree";
import { getKeypair, writeFile, writePublicKey } from "../src/utils/keyStore";
import { createAndSeedDistributor, createTokenAccount } from "./utils";
import { deriveDistributorPDA, findClaimStatusKey } from "../src/utils/pda";
const { TOKEN_PROGRAM_ID } = require("@solana/spl-token");

describe("claim", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const admin = provider.wallet as anchor.Wallet;
  const receiverPubKey = provider.wallet.publicKey;
  const accounts = [];

  const program = anchor.workspace
    .RewardsDistributor as Program<RewardsDistributor>;
  writePublicKey(program.programId, "program_devnet");

  const rewardsAccountKeypair = new Keypair();
  const NUM_LEAVES = 100_000;
  const elements = [{ account: receiverPubKey, amount: new u64("100") }];

  for (let i = 0; i < NUM_LEAVES; i++) {
    const acc = new Keypair();
    const node = { account: acc.publicKey, amount: new u64("100") };
    elements.push(node);
    accounts.push(acc);
  }

  const tree = new BalanceTree(elements);

  let distributor;
  let distributorTokenAccount;
  let mintAccount;
  let baseKey;
  let payer = getKeypair("payer");

  before(async () => {
    let events = [];
    let listener = program.addEventListener("Initialized", (event: any) => {
      events.push(event);
    });

    baseKey = Keypair.generate();
    let bump;
    [distributor, bump] = await deriveDistributorPDA(baseKey.publicKey);

    [mintAccount, distributorTokenAccount] = await createAndSeedDistributor(
      new u64(100 * NUM_LEAVES),
      distributor
    );

    const root: any = tree.getRoot();
    const maxTotalClaim: anchor.BN = new anchor.BN(1000);
    const maxNumNodes: anchor.BN = new anchor.BN(10);

    const argsTuple: [number, number[], anchor.BN, anchor.BN] = [
      bump,
      root,
      maxTotalClaim,
      maxNumNodes,
    ];

    // initialize rewards accounts
    await program.methods
      .initialize()
      .accounts({
        admin: admin.publicKey,
        rewardsAccount: rewardsAccountKeypair.publicKey,
      })
      .signers([rewardsAccountKeypair])
      .rpc();

    await program.methods
      .setMerkleDistributor(...argsTuple)
      .accounts({
        base: baseKey.publicKey,
        distributor,
        mint: mintAccount,
        systemProgram: SystemProgram.programId,
        admin: admin.publicKey,
        rewardsAccount: rewardsAccountKeypair.publicKey,
      })
      .signers([baseKey])
      .rpc();

    assert.equal(events.length, 1);
    let initializedEvent = events[0];

    assert(
      initializedEvent.admin.equals(admin.publicKey),
      "Public keys should be the same"
    );

    program.removeEventListener(listener);
  });

  it("works as expected", async () => {
    let events = [];
    let listener = program.addEventListener("ClaimedEvent", (event: any) => {
      events.push(event);
    });

    const amount = new u64(100);
    const index = new u64(0);
    const receiver = provider.wallet.publicKey;
    const proof: any = tree.getProof(
      index.toNumber(),
      provider.wallet.publicKey,
      amount
    );

    const [claimStatus, bump] = await findClaimStatusKey(
      index,
      distributor,
      program.programId
    );

    const argsTuple: [u64, u64, number[][]] = [index, amount, proof];
    const receiverTokenAccount = await createTokenAccount(
      mintAccount,
      receiver
    );

    await program.methods
      .claim(...argsTuple)
      .accounts({
        distributor,
        claimStatus,
        from: distributorTokenAccount,
        to: receiverTokenAccount,
        receiver,
        payer: payer.publicKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const bal = await provider.connection.getTokenAccountBalance(
      receiverTokenAccount
    );

    expect(bal.value.uiAmountString).to.be.eq(amount.toString());

    assert.equal(events.length, 1);
    let claimedEvent = events[0];

    let argsTupleIndex = argsTuple[0];
    let argsTupleAmount = argsTuple[1];
    assert(
      claimedEvent.index.toString() == argsTupleIndex.toString(),
      "index should be the same"
    );

    assert(
      claimedEvent.receiver.equals(receiver),
      "Public keys should be the same"
    );

    assert(
      claimedEvent.amount.toString() == argsTupleAmount.toString(),
      "amount should be the same"
    );

    program.removeEventListener(listener);
  });

  it("fails for empty proof", async () => {
    const amount = new u64(100);
    const index = new u64(90001);
    const fakeReceiver = Keypair.generate();

    const [claimStatus, bump] = await findClaimStatusKey(
      index,
      distributor,
      program.programId
    );

    const argsTuple: [u64, u64, number[][]] = [index, amount, []];
    const fakeReceiverTokenAccount = await createTokenAccount(
      mintAccount,
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

  it("cannot claim twice", async () => {
    const amount = new u64(100);
    const index = new u64(1);
    const receiver = elements[1].account;
    const proof: any = tree.getProof(
      index.toNumber(),
      elements[1].account,
      amount
    );

    const [claimStatus, bump] = await findClaimStatusKey(
      index,
      distributor,
      program.programId
    );

    const argsTuple: [u64, u64, number[][]] = [index, amount, proof];
    const receiverTokenAccount = await createTokenAccount(
      mintAccount,
      receiver
    );

    await program.methods
      .claim(...argsTuple)
      .accounts({
        distributor,
        claimStatus,
        from: distributorTokenAccount,
        to: receiverTokenAccount,
        receiver,
        payer: payer.publicKey,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([accounts[0]])
      .rpc();

    try {
      await program.methods
        .claim(...argsTuple)
        .accounts({
          distributor,
          claimStatus,
          from: distributorTokenAccount,
          to: receiverTokenAccount,
          receiver,
          payer: payer.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([accounts[0]])
        .rpc();
    } catch (error) {
      expect(error.logs?.join(" ")).to.have.string(
        `Allocate: account Address { address: ${claimStatus.toString()}, base: None } already in use`
      );
    }

    const bal = await provider.connection.getTokenAccountBalance(
      receiverTokenAccount
    );

    expect(bal.value.uiAmountString).to.be.eq(amount.toString());
  });

  it("cannot claim more than proof", async () => {
    const amount = new u64(100);
    const index = new u64(2);
    const receiver = elements[2].account;
    const proof: any = tree.getProof(
      index.toNumber(),
      elements[2].account,
      amount
    );

    const [claimStatus, bump] = await findClaimStatusKey(
      index,
      distributor,
      program.programId
    );

    const argsTuple: [u64, u64, number[][]] = [index, new u64(200), proof];
    const receiverTokenAccount = await createTokenAccount(
      mintAccount,
      receiver
    );

    try {
      await program.methods
        .claim(...argsTuple)
        .accounts({
          distributor,
          claimStatus,
          from: distributorTokenAccount,
          to: receiverTokenAccount,
          receiver,
          payer: payer.publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([accounts[1]])
        .rpc();
    } catch (error) {
      const errCode = RewardsDistributorIDL.errors.find(
        (er) => er.name === "InvalidProof"
      ).code;
      expect(error.message).to.include(errCode.toString());
    }

    const bal = await provider.connection.getTokenAccountBalance(
      receiverTokenAccount
    );

    expect(bal.value.uiAmountString).to.be.eq("0");
  });
});
