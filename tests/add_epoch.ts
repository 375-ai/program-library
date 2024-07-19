import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import { Program, AnchorError } from "@coral-xyz/anchor";
import { RewardsDistributor } from "../target/types/rewards_distributor";
import {
  Keypair,
  SystemProgram,
  LAMPORTS_PER_SOL,
  Connection,
  clusterApiUrl,
} from "@solana/web3.js";
import { assert, expect } from "chai";
import { createNewMint, assertArraysEqual } from "./utils";
import { deriveDistributorPDA, deriveEpochPDA } from "../src/utils/pda";
import { writePublicKey } from "../src/utils/keyStore";
import { u64 } from "@saberhq/token-utils";

describe("add epoch instruction", async () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const manager = provider.wallet as anchor.Wallet;
  const agent = anchor.web3.Keypair.generate();

  const baseKey = Keypair.generate();
  const [distributor, bump] = await deriveDistributorPDA(baseKey.publicKey);

  await provider.connection.requestAirdrop(
    agent.publicKey,
    LAMPORTS_PER_SOL * 10000
  );

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

    const previos_epoch_nr = new u64(rewardAccountBeforeCall.currentEpochNr);
    const current_epoch_nr = new u64(1);

    const [previousEpoch, previousEpochbump] = deriveEpochPDA(previos_epoch_nr);
    const [currentEpoch, currentEpochbump] = deriveEpochPDA(current_epoch_nr);

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
    let events = [];
    let listener = program.addEventListener("EpochCreated", (event: any) => {
      events.push(event);
    });

    const root: number[] = new Array(32).fill(0);

    // const baseKey = Keypair.generate();
    // const [distributor, bump] = await deriveDistributorPDA(baseKey.publicKey);

    const rewardAccountBeforeCall = await program.account.rewardsAccount.fetch(
      rewardsAccountKeypair.publicKey
    );

    const previos_epoch_nr = new u64(rewardAccountBeforeCall.currentEpochNr);
    const current_epoch_nr = new u64(previos_epoch_nr.add(new anchor.BN(1)));

    const [previousEpoch, previousEpochbump] = deriveEpochPDA(previos_epoch_nr);
    const [currentEpoch, currentEpochbump] = deriveEpochPDA(current_epoch_nr);

    const argsTuple: [number, number[]] = [bump, root];

    const mintAccount = await createNewMint();

    await program.methods
      .addEpoch(...argsTuple)
      .accounts({
        base: baseKey.publicKey,
        distributor,
        mint: mintAccount,
        systemProgram: SystemProgram.programId,
        agent: agent.publicKey,
        rewardsAccount: rewardsAccountKeypair.publicKey,
        previousEpochAccount: previousEpoch,
        currentEpochAccount: currentEpoch,
      })
      .signers([baseKey, agent])
      .rpc();

    assert.equal(events.length, 1);
    let rootHashSubmittedEvent = events[0];

    let argsTupleRoot = argsTuple[1];

    assertArraysEqual(rootHashSubmittedEvent.hash, argsTupleRoot);

    program.removeEventListener(listener);
  });

  it("manager cannot call correct epoch", async () => {
    const rewardAccountBeforeCall = await program.account.rewardsAccount.fetch(
      rewardsAccountKeypair.publicKey
    );

    const current_epoch_nr = new u64(rewardAccountBeforeCall.currentEpochNr);

    const [currentEpoch, currentEpochbump] = deriveEpochPDA(current_epoch_nr);

    const corrected_root: number[] = new Array(32).fill(1);

    try {
      await program.methods
        .correctEpoch(corrected_root, current_epoch_nr)
        .accounts({
          distributor,
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

    const [currentEpoch, currentEpochbump] = deriveEpochPDA(current_epoch_nr);

    const corrected_root: number[] = new Array(32).fill(1);

    await program.methods
      .correctEpoch(corrected_root, current_epoch_nr)
      .accounts({
        distributor,
        agent: agent.publicKey,
        rewardsAccount: rewardsAccountKeypair.publicKey,
        epochAccount: currentEpoch,
      })
      .signers([agent])
      .rpc();
  });
});
