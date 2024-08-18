import { utils } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "../config/constants";
import { u64 } from "@saberhq/token-utils";

/**
 * Claim status account address.
 * @param rewardsAccountKey Rewards account public key.
 * @param index Leaf index.
 * @param epochAccount Epoch account public key.
 * @param program Program.
 */
export const findClaimStatusKey = ({index, rewardsAccountKey, epochAccount, program}: {
  rewardsAccountKey: PublicKey,
  index: u64,
  epochAccount: PublicKey,
  program: PublicKey
}): [PublicKey, number] => {
  return PublicKey.findProgramAddressSync(
    [
      utils.bytes.utf8.encode("ClaimStatus"),
      rewardsAccountKey.toBytes(),
      index.toArrayLike(Buffer, "le", 8),
      epochAccount.toBytes(),
    ],
    program
  );
};

/**
 * Epoch account address.
 * @param rewardsAccountKey Rewards account public key.
 * @param epochNr Epoch number.
 */
export const deriveEpochPDA = ({rewardsAccountKey, epochNr}: {rewardsAccountKey: PublicKey, epochNr: u64}): [PublicKey, number] => {
  return PublicKey.findProgramAddressSync(
    [
      utils.bytes.utf8.encode("EpochAccount"),
      rewardsAccountKey.toBytes(),
      epochNr.toArrayLike(Buffer, "le", 8),
    ],
    PROGRAM_ID
  );
};
