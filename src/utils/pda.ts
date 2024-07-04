import { utils } from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "../config/constants";
import { u64 } from "@saberhq/token-utils";

export const deriveDistributorPDA = (base: PublicKey): [PublicKey, number] => {
  return PublicKey.findProgramAddressSync(
    [utils.bytes.utf8.encode("RewardsDistributor"), base.toBytes()],
    PROGRAM_ID
  );
};

export const findClaimStatusKey = (
  index: u64,
  distributor: PublicKey,
  program: PublicKey
): [PublicKey, number] => {
  return PublicKey.findProgramAddressSync(
    [
      utils.bytes.utf8.encode("ClaimStatus"),
      index.toArrayLike(Buffer, "le", 8),
      distributor.toBytes(),
    ],
    program
  );
};
