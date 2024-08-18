import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { RewardsDistributor } from "../target/types/rewards_distributor";
import { Keypair } from "@solana/web3.js";
import { assert, expect } from "chai";
import { u64 } from "@saberhq/token-utils";
import { BalanceTree } from "../src/libs/balance-tree";
import { writeFile, writePublicKey } from "../src/utils/keyStore";

describe("simulate tree", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const receiverPubKey = provider.wallet.publicKey;

  const manager = provider.wallet as anchor.Wallet;
  const agent = anchor.web3.Keypair.generate();

  const program = anchor.workspace
    .RewardsDistributor as Program<RewardsDistributor>;
  writePublicKey(program.programId, "program_devnet");

  // Generate a new keypair for the rewards account
  const rewardsAccountKeypair = new Keypair();
  const NUM_LEAVES = 100_000;
  const NUM_SAMPLES = 25;

  const elements = [];

  for (let i = 0; i < NUM_LEAVES; i++) {
    const node = { account: receiverPubKey, amount: new u64("100") };
    elements.push(node);
  }
  const tree = new BalanceTree(elements);

  it("Is initialized!", async () => {
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
  });

  it("proof verification works", () => {
    const account = receiverPubKey;
    const root = tree.getRoot();
    writeFile(root.toString("hex"), "root_hash");

    for (let i = 0; i < NUM_LEAVES; i += NUM_LEAVES / NUM_SAMPLES) {
      const proof = tree.getProof(i, account, new u64(100));
      const validProof = BalanceTree.verifyProof(
        i,
        account,
        new u64(100),
        proof,
        root
      );
      expect(validProof).to.be.true;
    }
  });
});
