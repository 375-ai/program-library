import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { RewardsDistributor } from "../target/types/rewards_distributor";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
const {
  createAccount,
  createMint,
  mintTo,
  getAssociatedTokenAddress,
  getAccount,
} = require("@solana/spl-token");
import { expect } from "chai";
import { BN } from "bn.js";
import { deriveEpochPDA } from "../src/utils/pda";
import { getKeypair, writePublicKey } from "../src/utils/keyStore";
import { confirmedAirdrop } from "./utils";

/**
 * Integration test to verify that existing functionality works with the new approved_at field
 * and that the new withdraw_unclaimed instruction functions correctly.
 */
describe("integration tests - withdrawal", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace
    .RewardsDistributor as Program<RewardsDistributor>;
  writePublicKey(program.programId, "program_devnet");

  // Decimals
  const decimals = 6;
  const scale = new BN(10).pow(new BN(decimals));

  // Get the wallet
  const providerWallet = provider.wallet;
  const managerKeypair = providerWallet;

  // Load from key store
  const payer = getKeypair("payer");

  // Generate keypairs
  const rewardsAccountKeypair = Keypair.generate();
  const agentKeypair = Keypair.generate();

  let mint: PublicKey;
  let managerTokenAccount: PublicKey;

  before(async () => {
    // Fund the manager and agent
    await confirmedAirdrop(
      provider.connection,
      managerKeypair.publicKey,
      LAMPORTS_PER_SOL * 5 // 5 SOL
    );
    await confirmedAirdrop(
      provider.connection,
      agentKeypair.publicKey,
      LAMPORTS_PER_SOL * 5 // 5 SOL
    );

    mint = await createMint(
      provider.connection,
      payer,
      payer.publicKey, // mint authority
      payer.publicKey, // freeze authority
      decimals
    );

    managerTokenAccount = await createAccount(
      provider.connection,
      payer,
      mint,
      payer.publicKey // owner
    );

    await mintTo(
      provider.connection,
      payer,
      mint,
      managerTokenAccount, // destination
      payer, // authority
      100 * Math.pow(10, decimals), // mint exactly 100 tokens
      [], // no `multiSigners`
      undefined, // no `confirmOptions`
      TOKEN_PROGRAM_ID
    );

    // Initialize the program once
    await program.methods
      .initialize(agentKeypair.publicKey, new BN(0)) // 0 seconds withdrawal period for testing
      .accounts({
        manager: managerKeypair.publicKey,
        rewardsAccount: rewardsAccountKeypair.publicKey,
      })
      .signers([rewardsAccountKeypair])
      .rpc();
  });

  it("should verify approved_at timestamp is set correctly", async () => {
    const uiAmount = new BN(5); // 5 tokens (UI)
    const baseAmount = uiAmount.mul(scale); // base units
    const merkleRoot = Buffer.from([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
      22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32,
    ]);

    // Get current rewards account state to calculate correct epoch number
    const rewardsAccountData = await program.account.rewardsAccount.fetch(
      rewardsAccountKeypair.publicKey
    );
    // The add_epoch instruction creates epoch with number = current_epoch_nr + 1
    const epochNr = new anchor.BN(
      rewardsAccountData.currentEpochNr.toNumber() + 1
    );

    // Derive epoch account
    const [epochAccount, epochBump] = deriveEpochPDA({
      rewardsAccountKey: rewardsAccountKeypair.publicKey,
      epochNr: epochNr,
    });

    const epochTokenAccount = await getAssociatedTokenAddress(
      mint,
      epochAccount,
      true
    );

    // Add epoch
    await program.methods
      .addEpoch(epochBump, Array.from(merkleRoot))
      .accounts({
        rewardsAccount: rewardsAccountKeypair.publicKey,
        currentEpochAccount: epochAccount,
        agent: agentKeypair.publicKey,
        mint: mint,
        systemProgram: SystemProgram.programId,
      })
      .signers([agentKeypair])
      .rpc();

    // Get epoch data before approval
    const epochDataBefore = await program.account.epochAccount.fetch(
      epochAccount
    );
    expect(epochDataBefore.isApproved).to.be.false;
    expect(epochDataBefore.approvedAt.toString()).to.equal("0"); // Should be 0 before approval

    // Approve epoch
    await program.methods
      .approveEpoch(epochNr, baseAmount)
      .accounts({
        rewardsAccount: rewardsAccountKeypair.publicKey,
        epochAccount: epochAccount,
        manager: managerKeypair.publicKey,
        epochTokenAccount: epochTokenAccount,
        managerTokenAccount: managerTokenAccount,
        mintAccount: mint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    // Get epoch data after approval
    const epochDataAfter = await program.account.epochAccount.fetch(
      epochAccount
    );
    expect(epochDataAfter.isApproved).to.be.true;
    expect(epochDataAfter.approvedAt.toString()).to.not.equal("0"); // Should have timestamp

    const approvedAt = epochDataAfter.approvedAt.toNumber();
    const now = Math.floor(Date.now() / 1000);

    // Timestamp should be recent (within last 10 seconds)
    expect(approvedAt).to.be.greaterThan(now - 10);
    expect(approvedAt).to.be.lessThanOrEqual(now + 1); // Not in future

    console.log(
      `Epoch approved at timestamp: ${approvedAt} (${new Date(
        approvedAt * 1000
      )})`
    );
  });

  it("should complete full workflow: add -> approve -> withdraw", async () => {
    const uiAmount = new BN(10); // 10 tokens (UI)
    const baseAmount = uiAmount.mul(scale); // base units
    const merkleRoot = Buffer.from([
      2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
      22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 1,
    ]);

    // Get current rewards account state to calculate correct epoch number
    const rewardsAccountData = await program.account.rewardsAccount.fetch(
      rewardsAccountKeypair.publicKey
    );
    // The add_epoch instruction creates epoch with number = current_epoch_nr + 1
    const epochNr = new anchor.BN(
      rewardsAccountData.currentEpochNr.toNumber() + 1
    );

    // Derive accounts
    const [epochAccount, epochBump] = deriveEpochPDA({
      rewardsAccountKey: rewardsAccountKeypair.publicKey,
      epochNr: epochNr,
    });

    const epochTokenAccount = await getAssociatedTokenAddress(
      mint,
      epochAccount,
      true
    );

    // Step 1: Add epoch
    await program.methods
      .addEpoch(epochBump, Array.from(merkleRoot))
      .accounts({
        rewardsAccount: rewardsAccountKeypair.publicKey,
        currentEpochAccount: epochAccount,
        agent: agentKeypair.publicKey,
        mint: mint,
        systemProgram: SystemProgram.programId,
      })
      .signers([agentKeypair])
      .rpc();

    // Step 2: Approve epoch (transfers tokens)
    const managerBalanceBefore = (
      await getAccount(provider.connection, managerTokenAccount)
    ).amount;

    await program.methods
      .approveEpoch(epochNr, baseAmount)
      .accounts({
        rewardsAccount: rewardsAccountKeypair.publicKey,
        epochAccount: epochAccount,
        manager: managerKeypair.publicKey,
        epochTokenAccount: epochTokenAccount,
        managerTokenAccount: managerTokenAccount,
        mintAccount: mint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    // Verify tokens were transferred to epoch account
    const epochBalance = (
      await getAccount(provider.connection, epochTokenAccount)
    ).amount;
    const managerBalanceAfterApproval = (
      await getAccount(provider.connection, managerTokenAccount)
    ).amount;

    expect(epochBalance).to.equal(BigInt(baseAmount.toString()));
    expect(managerBalanceAfterApproval).to.equal(
      managerBalanceBefore - BigInt(baseAmount.toString())
    );

    // Step 3: Wait and withdraw (uses withdrawal period from initialization)
    await program.methods
      .withdrawUnclaimed(epochNr)
      .accounts({
        rewardsAccount: rewardsAccountKeypair.publicKey,
        epochAccount,
        manager: managerKeypair.publicKey,
        epochTokenAccount,
        managerTokenAccount,
        mintAccount: mint,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    // Verify tokens were returned to manager
    const managerBalanceAfterWithdrawal = (
      await getAccount(provider.connection, managerTokenAccount)
    ).amount;
    expect(managerBalanceAfterWithdrawal).to.equal(managerBalanceBefore);

    // Verify epoch token account was closed
    try {
      await getAccount(provider.connection, epochTokenAccount);
      expect.fail("Epoch token account should be closed");
    } catch (error) {
      expect(error.name).to.eq("TokenAccountNotFoundError");
    }

    // Verify epoch account still exists for historical data
    const epochDataFinal = await program.account.epochAccount.fetch(
      epochAccount
    );
    expect(epochDataFinal.isApproved).to.be.true;
    expect(epochDataFinal.epochNr.toString()).to.equal(epochNr.toString());

    console.log("✅ Full workflow completed: add -> approve -> withdraw");
  });
});
