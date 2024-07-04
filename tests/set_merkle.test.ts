import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { RewardsDistributor } from "../target/types/rewards_distributor";
import { Keypair, SystemProgram } from "@solana/web3.js";
import { assert } from "chai";
import { createNewMint, assertArraysEqual } from "./utils";
import { deriveDistributorPDA } from "../src/utils/pda";
import { writePublicKey } from "../src/utils/keyStore";

describe("set merkle tree instruction", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const admin = provider.wallet as anchor.Wallet;

  const program = anchor.workspace
    .RewardsDistributor as Program<RewardsDistributor>;
  writePublicKey(program.programId, "program_devnet");

  // Generate a new keypair for the rewards account
  const rewardsAccountKeypair = new Keypair();

  it("Is initialized!", async () => {
    let events = [];
    let listener = program.addEventListener("Initialized", (event: any) => {
      events.push(event);
    });

    await program.methods
      .initialize()
      .accounts({
        admin: admin.publicKey,
        rewardsAccount: rewardsAccountKeypair.publicKey,
      })
      .signers([rewardsAccountKeypair])
      .rpc();

    const currentAdmin = await program.account.rewardsAccount.fetch(
      rewardsAccountKeypair.publicKey
    );

    assert(
      currentAdmin.admin.equals(admin.publicKey),
      "Public keys should be the same"
    );

    assert.equal(events.length, 1);
    let initializedEvent = events[0];

    assert(
      initializedEvent.admin.equals(admin.publicKey),
      "Public keys should be the same"
    );

    program.removeEventListener(listener);
  });

  it("admin can set merkle tree", async () => {
    let events = [];
    let listener = program.addEventListener(
      "RootHashSubmitted",
      (event: any) => {
        events.push(event);
      }
    );

    const root: number[] = new Array(32).fill(0);
    const maxTotalClaim: BN = new BN(1000);
    const maxNumNodes: BN = new BN(10);

    const baseKey = Keypair.generate();
    const [distributor, bump] = await deriveDistributorPDA(baseKey.publicKey);

    const argsTuple: [number, number[], BN, BN] = [
      bump,
      root,
      maxTotalClaim,
      maxNumNodes,
    ];

    const mintAccount = await createNewMint();

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
    let rootHashSubmittedEvent = events[0];

    let argsTupleRoot = argsTuple[1];
    let argsTupleMaxTotalClaim = argsTuple[2];
    let argsTupleMaxNumNodes = argsTuple[3];

    assertArraysEqual(rootHashSubmittedEvent.hash, argsTupleRoot);

    assert(
      rootHashSubmittedEvent.maxTotalClaim.toString() ==
        argsTupleMaxTotalClaim.toString(),
      "max total claim should be the same"
    );

    assert(
      rootHashSubmittedEvent.maxNumNodes.toString() ==
        argsTupleMaxNumNodes.toString(),
      "max num nodes should be the same"
    );

    program.removeEventListener(listener);
  });
});
