import { Keypair, PublicKey } from "@solana/web3.js";
import * as fs from "fs";
import { logError } from ".";

export const writeFile = (data: string, name: string) => {
  fs.writeFileSync(`./src/config/keys/${name}.json`, JSON.stringify(data));
};

export const writePublicKey = (publicKey: PublicKey, name: string) => {
  fs.writeFileSync(
    `./src/config/keys/${name}_pub.json`,
    JSON.stringify(publicKey.toString())
  );
};

export const getPublicKey = (name: string) =>
  new PublicKey(
    JSON.parse(
      fs.readFileSync(`./src/config/keys/${name}_pub.json`) as unknown as string
    )
  );

export const getPrivateKeyRaw = (name: string) =>
  JSON.parse(
    fs.readFileSync(`./src/config/keys/${name}.json`) as unknown as string
  );

export const getPrivateKey = (name: string) =>
  Uint8Array.from(
    JSON.parse(
      fs.readFileSync(`./src/config/keys/${name}.json`) as unknown as string
    )
  );

export const getKeypair = (name: string) =>
  new Keypair({
    publicKey: getPublicKey(name).toBytes(),
    secretKey: getPrivateKey(name),
  });

export const getProgramId = () => {
  try {
    return getPublicKey("program");
  } catch (e) {
    logError("Given programId is missing or incorrect");
    process.exit(1);
  }
};
