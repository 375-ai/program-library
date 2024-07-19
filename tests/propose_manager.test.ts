import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorError } from "@coral-xyz/anchor";
import { RewardsDistributor } from "../target/types/rewards_distributor";
import { Keypair } from "@solana/web3.js";
import { assert, expect } from "chai";

describe("set pending admin instruction", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const manager = provider.wallet as anchor.Wallet;
  const proposed_manager = anchor.web3.Keypair.generate();
  const unauthorized_manager = anchor.web3.Keypair.generate();
  const agent = anchor.web3.Keypair.generate();

  const program = anchor.workspace
    .RewardsDistributor as Program<RewardsDistributor>;

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

  it("authorized manager can call propose manager", async () => {
    const rewardsAccount_ = await program.account.rewardsAccount.fetch(
      rewardsAccountKeypair.publicKey
    );

    let events = [];
    let listener = program.addEventListener(
      "NewProposedManager",
      (event: any) => {
        events.push(event);
      }
    );

    await program.methods
      .proposeManager(proposed_manager.publicKey)
      .accounts({
        manager: manager.publicKey,
        rewardsAccount: rewardsAccountKeypair.publicKey,
      })
      .rpc();

    const rewardsAccount = await program.account.rewardsAccount.fetch(
      rewardsAccountKeypair.publicKey
    );

    assert(
      rewardsAccount.proposedManager.equals(proposed_manager.publicKey),
      "Public keys should be the same"
    );

    assert.equal(events.length, 1);
    let NewProposedManagerEvent = events[0];

    assert(
      NewProposedManagerEvent.proposedManager.equals(
        proposed_manager.publicKey
      ),
      "Public keys should be the same"
    );

    program.removeEventListener(listener);
  });

  it("unauthorized pubkey cannot call propose manager", async () => {
    try {
      await program.methods
        .proposeManager(unauthorized_manager.publicKey)
        .accounts({
          manager: unauthorized_manager.publicKey,
          rewardsAccount: rewardsAccountKeypair.publicKey,
        })
        .signers([unauthorized_manager])
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

  it("manager cannot propose manager while program is paused", async () => {
    try {
      await program.methods
        .pause()
        .accounts({
          manager: manager.publicKey,
          rewardsAccount: rewardsAccountKeypair.publicKey,
        })
        .rpc();

      await program.methods
        .proposeManager(proposed_manager.publicKey)
        .accounts({
          manager: manager.publicKey,
          rewardsAccount: rewardsAccountKeypair.publicKey,
        })
        .rpc();
      // we use this to make sure we definitely throw an error
      assert(false, "should've failed but didn't ");
    } catch (_err) {
      expect(_err).to.be.instanceOf(AnchorError);
      const err: AnchorError = _err;
      expect(err.error.errorCode.number).to.equal(6004);
      expect(err.error.errorCode.code).to.equal("ShouldNotBePaused");
      expect(err.program.equals(program.programId)).is.true;
    }
  });
});
