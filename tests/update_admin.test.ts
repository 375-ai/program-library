import * as anchor from "@coral-xyz/anchor";
import { Program, AnchorError } from "@coral-xyz/anchor";
import { RewardsDistributor } from "../target/types/rewards_distributor";
import { Keypair } from "@solana/web3.js";
import { assert, expect } from "chai";

describe("update admin instruction", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const admin = provider.wallet as anchor.Wallet;
  const new_admin = provider.wallet as anchor.Wallet;
  const unauthorized_admin = anchor.web3.Keypair.generate();

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

  it("authorized update admin", async () => {
    let events = [];
    let listener = program.addEventListener("AdminUpdated", (event: any) => {
      events.push(event);
    });

    await program.methods
      .updateAdmin(new_admin.publicKey)
      .accounts({
        admin: admin.publicKey,
        rewardsAccount: rewardsAccountKeypair.publicKey,
      })
      .rpc();

    const currentAdmin = await program.account.rewardsAccount.fetch(
      rewardsAccountKeypair.publicKey
    );

    assert(
      currentAdmin.admin.equals(new_admin.publicKey),
      "Public keys should be the same"
    );

    assert.equal(events.length, 1);
    let adminUpdatedEvent = events[0];

    assert(
      adminUpdatedEvent.newAdmin.equals(new_admin.publicKey),
      "Public keys should be the same"
    );

    program.removeEventListener(listener);
  });

  it("unauthorized update admin", async () => {
    try {
      await program.methods
        .updateAdmin(new_admin.publicKey)
        .accounts({
          admin: unauthorized_admin.publicKey,
          rewardsAccount: rewardsAccountKeypair.publicKey,
        })
        .signers([unauthorized_admin])
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
});
