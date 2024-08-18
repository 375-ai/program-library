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

describe("accept ownership", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // mock actors
  const manager = provider.wallet as anchor.Wallet;
  const base = manager.publicKey
  const proposed_manager = anchor.web3.Keypair.generate();
  const agent = anchor.web3.Keypair.generate();
  const unauthorized_agent = anchor.web3.Keypair.generate();

  const program = anchor.workspace
    .RewardsDistributor as Program<RewardsDistributor>;

  // Generate a new keypair for the rewards account
  const rewardsAccountKeypair = new Keypair();

  before(async () => {
    // initialize program
    await program.methods
      .initialize(agent.publicKey)
      .accounts({
        manager: manager.publicKey,
        rewardsAccount: rewardsAccountKeypair.publicKey,
      })
      .signers([rewardsAccountKeypair])
      .rpc();

    // propose manager
    await program.methods
      .proposeManager(proposed_manager.publicKey)
      .accounts({
        manager: manager.publicKey,
        rewardsAccount: rewardsAccountKeypair.publicKey,
      })
      .rpc();
  });

  it("pending admin can accept ownership", async () => {
    // accept manager
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
      // accept manager
      await program.methods
        .acceptManager()
        .accounts({
          proposedManager: manager.publicKey,
          rewardsAccount: rewardsAccountKeypair.publicKey,
        })
        .rpc();
      // we use this to make sure we definitely throw an error
      assert(false, "should've failed but didn't ");
    } catch (error) {
      const errCode = RewardsDistributorIDL.errors.find(
        (er) => er.name === "Unauthorized"
      ).code;
      expect(error.message).to.include(errCode.toString());
    }
  });

  it("unauthorized pubkey cannot call accept ownership", async () => {
    try {
      // accept manager
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
    } catch (error) {
      const errCode = RewardsDistributorIDL.errors.find(
        (er) => er.name === "Unauthorized"
      ).code;
      expect(error.message).to.include(errCode.toString());
    }
  });

  it("proposed manager cannot accept manager while program is paused", async () => {
    try {
      // propose manager
      await program.methods
        .proposeManager(proposed_manager.publicKey)
        .accounts({
          manager: proposed_manager.publicKey,
          rewardsAccount: rewardsAccountKeypair.publicKey,
        })
        .signers([proposed_manager])
        .rpc();

      // pause program
      await program.methods
        .pause()
        .accounts({
          manager: proposed_manager.publicKey,
          rewardsAccount: rewardsAccountKeypair.publicKey,
        })
        .signers([proposed_manager])
        .rpc();

      // accept manager
      await program.methods
        .acceptManager()
        .accounts({
          proposedManager: proposed_manager.publicKey,
          rewardsAccount: rewardsAccountKeypair.publicKey,
        })
        .signers([proposed_manager])
        .rpc();
      // we use this to make sure we definitely throw an error
      assert(false, "should've failed but didn't ");
    } catch (error) {
      const errCode = RewardsDistributorIDL.errors.find(
        (er) => er.name === "ShouldNotBePaused"
      ).code;
      expect(error.message).to.include(errCode.toString());
    }
  });
});
