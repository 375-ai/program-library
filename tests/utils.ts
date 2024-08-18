import * as crypto from "crypto";
import * as anchor from "@coral-xyz/anchor";
import { u64 } from "@saberhq/token-utils";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getKeypair, writePublicKey } from "../src/utils/keyStore";
import { PublicKey, Transaction } from "@solana/web3.js";
import { assert } from "chai";

const {
  createMint,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  mintTo,
} = require("@solana/spl-token");

// Hash function that returns a Buffer
export function hash(data: string | Buffer): Buffer {
  return crypto.createHash("sha256").update(data).digest();
}

// Compute the Merkle root and return it as a Buffer
export function computeMerkleRoot(dataBlocks: string[]): Buffer {
  if (dataBlocks.length === 0) {
    throw new Error("No data blocks provided");
  }

  // Hash the leaf nodes
  let level = dataBlocks.map((block) => hash(block));

  // Build the tree
  while (level.length > 1) {
    const nextLevel: Buffer[] = [];

    for (let i = 0; i < level.length; i += 2) {
      if (i + 1 < level.length) {
        // Combine and hash pairs of nodes
        const combinedHash = hash(Buffer.concat([level[i], level[i + 1]]));
        nextLevel.push(combinedHash);
      } else {
        // If there is an odd number of elements, duplicate the last one
        nextLevel.push(level[i]);
      }
    }

    level = nextLevel;
  }

  return level[0];
}

export const createNewMint = async (): Promise<PublicKey> => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const connection = provider.connection;
  const payerKeyPair = getKeypair("payer");
  await connection.requestAirdrop(
    payerKeyPair.publicKey,
    LAMPORTS_PER_SOL * 10
  );

  return await createMint(
    connection,
    payerKeyPair,
    payerKeyPair.publicKey,
    null,
    0
  );
};

export const createAndSeedDistributor = async (
  maxTotalClaim: u64,
  distributor: PublicKey
): Promise<[PublicKey, PublicKey]> => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const connection = provider.connection;
  const payerKeyPair = getKeypair("payer");
  const distributorKeyPair = getKeypair("distributor");
  await connection.requestAirdrop(
    payerKeyPair.publicKey,
    LAMPORTS_PER_SOL * 10
  );
  await connection.requestAirdrop(
    distributorKeyPair.publicKey,
    LAMPORTS_PER_SOL * 10
  );

  const mint = await createMint(
    connection,
    payerKeyPair,
    payerKeyPair.publicKey,
    null,
    0
  );

  writePublicKey(mint, `mint_`);

  const distributorTokenAccount = await createTokenAccount(mint, distributor);

  writePublicKey(distributorTokenAccount, `distributor_mint_`);

  await mintTo(
    connection,
    payerKeyPair,
    mint,
    distributorTokenAccount,
    payerKeyPair,
    maxTotalClaim
  );

  return [mint, distributorTokenAccount];
};

export const createTokenAccount = async (
  mint: PublicKey,
  owner: PublicKey
): Promise<PublicKey> => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const connection = provider.connection;
  const payerKeyPair = getKeypair("payer");
  await connection.requestAirdrop(
    payerKeyPair.publicKey,
    LAMPORTS_PER_SOL * 10
  );

  const tokenAccount = await getAssociatedTokenAddress(mint, owner, true);
  const accountInfo = await connection.getAccountInfo(tokenAccount);

  if (!accountInfo) {
    // Create the associated token account if it does not exist
    const createAccountIx = createAssociatedTokenAccountInstruction(
      payerKeyPair.publicKey,
      tokenAccount,
      owner,
      mint
    );

    const transaction = new Transaction().add(createAccountIx);
    const signature = await connection.sendTransaction(transaction, [
      payerKeyPair,
    ]);
    await connection.confirmTransaction(signature, "confirmed");
  }

  return tokenAccount;
};

// Function to compare two arrays of numbers
export function assertArraysEqual(arr1: number[], arr2: number[]): void {
  // Check if arrays have the same length
  assert.strictEqual(
    arr1.length,
    arr2.length,
    `Arrays have different lengths: ${arr1.length} !== ${arr2.length}`
  );

  // Check if all elements are equal
  for (let i = 0; i < arr1.length; i++) {
    assert.strictEqual(
      arr1[i],
      arr2[i],
      `Elements at index ${i} are not equal: ${arr1[i]} !== ${arr2[i]}`
    );
  }
}

/**
 * Performs an airdrop and waits for the confirmation.
 * @param connection Connection.
 * @param publicKey Public key to airdrop.
 * @param amount Amount to airdrop.
 */
export const confirmedAirdrop = async (connection: anchor.web3.Connection, publicKey: PublicKey, amount: number) => {
  const signature = await connection.requestAirdrop(
    publicKey,
    amount
  );

  await connection.confirmTransaction(signature);
}

/**
 * Returns the formatted SOL balance.
 * @param balance SOL balance in lamports.
 */
export const formattedSOLBalance = (balance: number) => {
  return Math.round((balance / LAMPORTS_PER_SOL) * 100000) / 100000
}