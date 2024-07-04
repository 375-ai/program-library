import { getPublicKey } from "../utils/keyStore";

export const network = "devnet";
export const PROGRAM_ID = getPublicKey(`program_${network}`);

export const REWARDS_PROGRAM_ID = PROGRAM_ID;
