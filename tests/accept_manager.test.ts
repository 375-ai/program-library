import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorError } from "@coral-xyz/anchor";
import {
  RewardsDistributor,
  IDL as RewardsDistributorIDL,
} from "../target/types/rewards_distributor";
import { Keypair, SystemProgram, PublicKey } from "@solana/web3.js";
import { assert, expect } from "chai";

// The empty public key, typically represented by 32 zeros
const EMPTY_PUBLIC_KEY = new PublicKey("11111111111111111111111111111111");

describe("accpet ownership", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // mock actors
  const manager = provider.wallet as anchor.Wallet;
  const proposed_manager = anchor.web3.Keypair.generate();
  const unauthorized_manager = anchor.web3.Keypair.generate();
  const agent = anchor.web3.Keypair.generate();
  const unauthorized_agent = anchor.web3.Keypair.generate();

  const program = anchor.workspace
    .RewardsDistributor as Program<RewardsDistributor>;

  // Generate a new keypair for the rewards account
  const rewardsAccountKeypair = new Keypair();

  before(async () => {
    // initialize program
    await program.methods
      .initialize(agent.publicKey, new anchor.BN(0))
      .accounts({
        manager: manager.publicKey,
        rewardsAccount: rewardsAccountKeypair.publicKey,
      })
      .signers([rewardsAccountKeypair])
      .rpc();

    // set pending admin
    await program.methods
      .proposeManager(proposed_manager.publicKey)
      .accounts({
        manager: manager.publicKey,
        rewardsAccount: rewardsAccountKeypair.publicKey,
      })
      .rpc();
  });

  it("pending admin can accpet ownership", async () => {
    await program.methods
      .acceptManager()
      .accounts({
        proposedManager: proposed_manager.publicKey,
        rewardsAccount: rewardsAccountKeypair.publicKey,
      })
      .signers([proposed_manager])
      .rpc();

    const rewardsAccount = await program.account.rewardsAccount.fetch(
      rewardsAccountKeypair.publicKey
    );

    // checks that pending admin has been changed to the empty public key
    assert(
      rewardsAccount.proposedManager.equals(EMPTY_PUBLIC_KEY),
      "Public keys should be the same"
    );

    // checks that pending admin is now the admin
    assert(
      rewardsAccount.manager.equals(proposed_manager.publicKey),
      "Public keys should be the same"
    );
  });

  it("old manager cannot call accept ownership", async () => {
    try {
      await program.methods
        .acceptManager()
        .accounts({
          proposedManager: manager.publicKey,
          rewardsAccount: rewardsAccountKeypair.publicKey,
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

  it("unathorized pubkey cannot call accept ownership", async () => {
    try {
      await program.methods
        .acceptManager()
        .accounts({
          proposedManager: unauthorized_agent.publicKey,
          rewardsAccount: rewardsAccountKeypair.publicKey,
        })
        .signers([unauthorized_agent])
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

  // it("proposed manager cannot accept manager while program is paused", async () => {
  //   try {
  //     await program.methods
  //       .pause()
  //       .accounts({
  //         manager: manager.publicKey,
  //         rewardsAccount: rewardsAccountKeypair.publicKey,
  //       })
  //       .rpc()
  //       .catch((e) => console.log({ e }));

  //     await program.methods
  //       .acceptManager()
  //       .accounts({
  //         proposedManager: proposed_manager.publicKey,
  //         rewardsAccount: rewardsAccountKeypair.publicKey,
  //       })
  //       .signers([proposed_manager])
  //       .rpc();
  //     // we use this to make sure we definitely throw an error
  //     assert(false, "should've failed but didn't ");
  //   } catch (_err) {
  //     expect(_err).to.be.instanceOf(AnchorError);
  //     const err: AnchorError = _err;
  //     expect(err.error.errorCode.number).to.equal(6006);
  //     expect(err.error.errorCode.code).to.equal("ShouldNotBePaused");
  //     expect(err.program.equals(program.programId)).is.true;
  //   }
  // });
});
