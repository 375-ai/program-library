import * as anchor from "@coral-xyz/anchor";
import { AnchorError, Program } from "@coral-xyz/anchor";
import { RewardsDistributor } from "../target/types/rewards_distributor";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

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
 * Prepares the program by initializing it and adding an epoch and approving it.
 * @param program Rewards distributor program.
 * @param withdrawalPeriodSeconds Withdrawal period in seconds for the rewards account.
 * @param agentKeypair Agent keypair that will be used to initialize the program.
 * @param managerKeypair Manager keypair that will be used to initialize the program.
 * @param rewardsAccountKeypair Rewards account keypair that will be used to initialize the program.
 * @param mint Mint public key.
 * @param merkleRoot Merkle root buffer for the epoch.
 * @param epochTokens Amount of tokens for the epoch.
 */
async function prepareProgram({
  program,
  withdrawalPeriodSeconds,
  agentKeypair,
  managerKeypair,
  rewardsAccountKeypair,
  mint,
  merkleRoot,
  epochTokens,
}: {
  program: Program<RewardsDistributor>;
  withdrawalPeriodSeconds: number;
  agentKeypair: Keypair;
  managerKeypair: Keypair;
  rewardsAccountKeypair: Keypair;
  mint: PublicKey;
  merkleRoot: Buffer;
  epochTokens: anchor.BN;
}) {
  // Initialize the rewards account
  await program.methods
    .initialize(agentKeypair.publicKey, new BN(withdrawalPeriodSeconds))
    .accounts({
      manager: managerKeypair.publicKey,
      rewardsAccount: rewardsAccountKeypair.publicKey,
    })
    .signers([rewardsAccountKeypair])
    .rpc();

  // Set up first epoch for tests
  const rewardsAccountData = await program.account.rewardsAccount.fetch(
    rewardsAccountKeypair.publicKey
  );
  let epochNr = new anchor.BN(rewardsAccountData.currentEpochNr.toNumber() + 1);

  const [epochAccount, epochBump] = deriveEpochPDA({
    rewardsAccountKey: rewardsAccountKeypair.publicKey,
    epochNr,
  });

  let managerTokenAccount = await getAssociatedTokenAddress(
    mint,
    managerKeypair.publicKey,
    false
  );

  let epochTokenAccount = await getAssociatedTokenAddress(
    mint,
    epochAccount,
    true
  );

  // Add and approve epoch for tests
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

  // Approve epoch (this transfers tokens to epoch account)
  await program.methods
    .approveEpoch(epochNr, epochTokens)
    .accounts({
      rewardsAccount: rewardsAccountKeypair.publicKey,
      epochAccount,
      manager: managerKeypair.publicKey,
      epochTokenAccount,
      managerTokenAccount,
      mintAccount: mint,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return { epochNr, epochAccount, epochTokenAccount };
}

describe("withdraw unclaimed instruction", () => {
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
  const providerWallet = provider.wallet as anchor.Wallet;
  const managerKeypair = providerWallet;

  // Load from key store
  const payer = getKeypair("payer");

  // Generate keypairs
  const agentKeypair = Keypair.generate();

  let mint: PublicKey;
  let managerTokenAccount: PublicKey;

  const testAmount = new BN(1).mul(scale);
  const merkleRoot = Buffer.from([
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
    22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32,
  ]);

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
  });

  describe("success cases", () => {
    it("should successfully withdraw unclaimed tokens after withdrawal period", async () => {
      let seconds = 10;

      // Setup
      const rewardsAccountKeypair = Keypair.generate();
      const { epochNr, epochAccount, epochTokenAccount } = await prepareProgram(
        {
          program,
          withdrawalPeriodSeconds: seconds,
          agentKeypair,
          managerKeypair: managerKeypair.payer,
          rewardsAccountKeypair,
          mint,
          merkleRoot,
          epochTokens: testAmount,
        }
      );

      // Get initial balances
      const initialManagerBalance = (
        await getAccount(provider.connection, managerTokenAccount)
      ).amount;
      const initialEpochBalance = (
        await getAccount(provider.connection, epochTokenAccount)
      ).amount;

      // Wait for the withdrawal period to pass
      const secondsWithBuffer = seconds + 5; // Add buffer to ensure period has passed
      console.log(
        `Waiting for withdrawal period to pass (${secondsWithBuffer} seconds)...`
      );
      await new Promise((resolve) =>
        setTimeout(resolve, secondsWithBuffer * 1_000)
      );

      // Withdraw unclaimed tokens
      const tx = await program.methods
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

      // Verify tokens were transferred back to manager
      const finalManagerBalance = (
        await getAccount(provider.connection, managerTokenAccount)
      ).amount;
      expect(finalManagerBalance).to.equal(
        initialManagerBalance + initialEpochBalance
      );

      // Verify epoch token account was closed
      try {
        await getAccount(provider.connection, epochTokenAccount);
        expect.fail("Epoch token account should be closed");
      } catch (error) {
        // Account should not exist
        expect(error.name).to.eq("TokenAccountNotFoundError");
      }

      // Verify epoch account still exists (not closed)
      const epochAccountInfo = await program.account.epochAccount.fetch(
        epochAccount
      );
      expect(epochAccountInfo).to.exist;
      expect(epochAccountInfo.isApproved).to.be.true;
    });

    it("should successfully withdraw with 0-seconds withdrawal period", async () => {
      // Setup
      const rewardsAccountKeypair = Keypair.generate();
      const { epochNr, epochAccount, epochTokenAccount } = await prepareProgram(
        {
          program,
          withdrawalPeriodSeconds: 0,
          agentKeypair,
          managerKeypair: managerKeypair.payer,
          rewardsAccountKeypair,
          mint,
          merkleRoot,
          epochTokens: testAmount,
        }
      );

      // With 0-seconds withdrawal period configured during initialization,
      // withdrawal should succeed immediately after approval
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

      // Verify withdrawal succeeded by checking account was closed
      try {
        await getAccount(provider.connection, epochTokenAccount);
        expect.fail("Epoch token account should be closed");
      } catch (error) {
        expect(error.name).to.eq("TokenAccountNotFoundError");
      }
    });

    it("should reclaim rent when closing epoch token account", async () => {
      // Setup
      const rewardsAccountKeypair = Keypair.generate();
      const { epochNr, epochAccount, epochTokenAccount } = await prepareProgram(
        {
          program,
          withdrawalPeriodSeconds: 0,
          agentKeypair,
          managerKeypair: managerKeypair.payer,
          rewardsAccountKeypair,
          mint,
          merkleRoot,
          epochTokens: testAmount,
        }
      );

      // Get manager's SOL balance before withdrawal
      const managerBalanceBefore = await provider.connection.getBalance(
        managerKeypair.publicKey
      );

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

      // Get manager's SOL balance after withdrawal
      const managerBalanceAfter = await provider.connection.getBalance(
        managerKeypair.publicKey
      );

      // Manager should have received rent back (approximately 0.00203 SOL minus transaction fees)
      // We'll just check that balance increased (accounting for tx fees)
      const rentReclaimed = managerBalanceAfter - managerBalanceBefore;
      console.log(
        `Rent reclaimed: ${rentReclaimed / anchor.web3.LAMPORTS_PER_SOL} SOL`
      );

      // Should be positive (received more than transaction cost)
      expect(rentReclaimed).to.be.greaterThan(0);
    });
  });

  describe("failure cases", () => {
    it("should fail if called by non-manager", async () => {
      const nonManagerKeypair = Keypair.generate();
      await provider.connection.requestAirdrop(
        nonManagerKeypair.publicKey,
        anchor.web3.LAMPORTS_PER_SOL
      );

      // Setup
      const rewardsAccountKeypair = Keypair.generate();
      const { epochNr, epochAccount, epochTokenAccount } = await prepareProgram(
        {
          program,
          withdrawalPeriodSeconds: 0,
          agentKeypair,
          managerKeypair: managerKeypair.payer,
          rewardsAccountKeypair,
          mint,
          merkleRoot,
          epochTokens: testAmount,
        }
      );

      try {
        await program.methods
          .withdrawUnclaimed(epochNr)
          .accounts({
            rewardsAccount: rewardsAccountKeypair.publicKey,
            epochAccount,
            manager: nonManagerKeypair.publicKey,
            epochTokenAccount,
            managerTokenAccount,
            mintAccount: mint,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([nonManagerKeypair])
          .rpc();

        expect.fail("Should have failed due to unauthorized access");
      } catch (error) {
        expect(error.error.errorMessage).to.include("Unauthorized signer");
      }
    });

    it("should fail if epoch is not approved", async () => {
      // Setup
      const rewardsAccountKeypair = Keypair.generate();
      const { epochNr, epochAccount, epochTokenAccount } = await prepareProgram(
        {
          program,
          withdrawalPeriodSeconds: 0,
          agentKeypair,
          managerKeypair: managerKeypair.payer,
          rewardsAccountKeypair,
          mint,
          merkleRoot,
          epochTokens: testAmount,
        }
      );

      // Create a new unapproved epoch
      const rewardsAccountData = await program.account.rewardsAccount.fetch(
        rewardsAccountKeypair.publicKey
      );
      const unapprovedEpochNr = new anchor.BN(
        rewardsAccountData.currentEpochNr.toNumber() + 1
      );

      const [unapprovedEpochAccount, unapprovedEpochBump] = deriveEpochPDA({
        rewardsAccountKey: rewardsAccountKeypair.publicKey,
        epochNr: unapprovedEpochNr,
      });

      // Add epoch but don't approve it
      await program.methods
        .addEpoch(unapprovedEpochBump, Array.from(merkleRoot))
        .accounts({
          rewardsAccount: rewardsAccountKeypair.publicKey,
          currentEpochAccount: unapprovedEpochAccount,
          agent: agentKeypair.publicKey,
          mint: mint,
          systemProgram: SystemProgram.programId,
        })
        .signers([agentKeypair])
        .rpc();

      const unapprovedEpochTokenAccount = await getAssociatedTokenAddress(
        mint,
        unapprovedEpochAccount,
        true
      );

      try {
        await program.methods
          .withdrawUnclaimed(unapprovedEpochNr)
          .accounts({
            rewardsAccount: rewardsAccountKeypair.publicKey,
            epochAccount: unapprovedEpochAccount,
            manager: managerKeypair.publicKey,
            epochTokenAccount: unapprovedEpochTokenAccount,
            managerTokenAccount,
            mintAccount: mint,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc();

        expect.fail("Should have failed due to unapproved epoch");
      } catch (error) {
        expect(error.error.errorCode.code).to.eq("AccountNotInitialized"); // `epoch_token_account` account is expected to be initialized when passing the account to the instruction
      }
    });

    it("should fail if program is paused", async () => {
      // Setup
      const rewardsAccountKeypair = Keypair.generate();
      const { epochNr, epochAccount, epochTokenAccount } = await prepareProgram(
        {
          program,
          withdrawalPeriodSeconds: 0,
          agentKeypair,
          managerKeypair: managerKeypair.payer,
          rewardsAccountKeypair,
          mint,
          merkleRoot,
          epochTokens: testAmount,
        }
      );

      // Pause the program
      await program.methods
        .pause()
        .accounts({
          rewardsAccount: rewardsAccountKeypair.publicKey,
          manager: managerKeypair.publicKey,
        })
        .rpc();

      try {
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

        expect.fail("Should have failed due to paused program");
      } catch (_err) {
        expect(_err).to.be.instanceOf(AnchorError);
        const err: AnchorError = _err;
        expect(err.error.errorCode.number).to.equal(6004);
        expect(err.error.errorCode.code).to.equal("ShouldNotBePaused");
        expect(err.program.equals(program.programId)).is.true;
      }
    });

    it("should fail if withdrawal period not reached", async () => {
      let seconds = 15;

      // Setup
      const rewardsAccountKeypair = Keypair.generate();
      const { epochNr, epochAccount, epochTokenAccount } = await prepareProgram(
        {
          program,
          withdrawalPeriodSeconds: seconds,
          agentKeypair,
          managerKeypair: managerKeypair.payer,
          rewardsAccountKeypair,
          mint,
          merkleRoot,
          epochTokens: testAmount,
        }
      );

      // Withdraw unclaimed tokens
      try {
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
        expect.fail("should have failed due to withdrawal period not reached");
      } catch (_err) {
        expect(_err).to.be.instanceOf(AnchorError);
        const err: AnchorError = _err;
        expect(err.error.errorCode.number).to.equal(6011);
        expect(err.error.errorCode.code).to.equal("WithdrawalPeriodNotReached");
        expect(err.program.equals(program.programId)).is.true;
      }
    });

    it("should fail if there are no tokens to withdraw", async () => {
      // Setup
      const rewardsAccountKeypair = Keypair.generate();
      const { epochNr, epochAccount, epochTokenAccount } = await prepareProgram(
        {
          program,
          withdrawalPeriodSeconds: 0,
          agentKeypair,
          managerKeypair: managerKeypair.payer,
          rewardsAccountKeypair,
          mint,
          merkleRoot,
          epochTokens: new BN(0),
        }
      );

      try {
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

        expect.fail("Should have failed due to no tokens to withdraw");
      } catch (_err) {
        expect(_err).to.be.instanceOf(AnchorError);
        const err: AnchorError = _err;
        expect(err.error.errorCode.number).to.equal(6012);
        expect(err.error.errorCode.code).to.equal("NoTokensToWithdraw");
        expect(err.program.equals(program.programId)).is.true;
      }
    });
  });

  describe("edge cases", () => {
    it("should handle withdrawal immediately after approval (0 seconds period)", async () => {
      // Setup
      const rewardsAccountKeypair = Keypair.generate();
      const { epochNr, epochAccount, epochTokenAccount } = await prepareProgram(
        {
          program,
          withdrawalPeriodSeconds: 0,
          agentKeypair,
          managerKeypair: managerKeypair.payer,
          rewardsAccountKeypair,
          mint,
          merkleRoot,
          epochTokens: testAmount,
        }
      );

      // This should succeed with 0-seconds withdrawal period
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

      // Verify it succeeded
      try {
        await getAccount(provider.connection, epochTokenAccount);
        expect.fail("Epoch token account should be closed");
      } catch (error) {
        expect(error.name).to.eq("TokenAccountNotFoundError");
      }
    });

    it("should preserve epoch historical data after withdrawal", async () => {
      // Setup
      const rewardsAccountKeypair = Keypair.generate();
      const { epochNr, epochAccount, epochTokenAccount } = await prepareProgram(
        {
          program,
          withdrawalPeriodSeconds: 0,
          agentKeypair,
          managerKeypair: managerKeypair.payer,
          rewardsAccountKeypair,
          mint,
          merkleRoot,
          epochTokens: testAmount,
        }
      );

      // Get current rewards account state to calculate correct epoch number
      const rewardsAccountData = await program.account.rewardsAccount.fetch(
        rewardsAccountKeypair.publicKey
      );

      // Get the new epoch number
      const newEpochNr = new anchor.BN(
        rewardsAccountData.currentEpochNr.toNumber() + 1
      );

      // Derive epoch account
      const [newEpochAccount, newEpochBump] = deriveEpochPDA({
        rewardsAccountKey: rewardsAccountKeypair.publicKey,
        epochNr: newEpochNr,
      });

      const newEpochTokenAccount = await getAssociatedTokenAddress(
        mint,
        newEpochAccount,
        true
      );

      // Add epoch
      await program.methods
        .addEpoch(newEpochBump, Array.from(merkleRoot))
        .accounts({
          rewardsAccount: rewardsAccountKeypair.publicKey,
          currentEpochAccount: newEpochAccount,
          agent: agentKeypair.publicKey,
          mint: mint,
          systemProgram: SystemProgram.programId,
        })
        .signers([agentKeypair])
        .rpc();

      // Approve epoch
      await program.methods
        .approveEpoch(newEpochNr, testAmount)
        .accounts({
          rewardsAccount: rewardsAccountKeypair.publicKey,
          epochAccount: newEpochAccount,
          manager: managerKeypair.publicKey,
          epochTokenAccount: newEpochTokenAccount,
          managerTokenAccount: managerTokenAccount,
          mintAccount: mint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      await program.methods
        .withdrawUnclaimed(newEpochNr)
        .accounts({
          rewardsAccount: rewardsAccountKeypair.publicKey,
          epochAccount: newEpochAccount,
          manager: managerKeypair.publicKey,
          epochTokenAccount: newEpochTokenAccount,
          managerTokenAccount,
          mintAccount: mint,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();

      // Get first epoch data
      const firstEpochData = await program.account.epochAccount.fetch(
        epochAccount
      );
      // Get the current epoch data
      const secondEpochData = await program.account.epochAccount.fetch(
        newEpochAccount
      );

      expect(firstEpochData.epochNr.toString()).to.equal(epochNr.toString());
      expect(firstEpochData.isApproved).to.equal(true);
      expect(Buffer.from(firstEpochData.hash)).to.deep.equal(merkleRoot);

      expect(secondEpochData.epochNr.toString()).to.equal(
        newEpochNr.toString()
      );
      expect(secondEpochData.isApproved).to.equal(true);
      expect(Buffer.from(secondEpochData.hash)).to.deep.equal(merkleRoot);
    });
  });
});
