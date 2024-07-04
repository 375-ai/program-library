import invariant from "tiny-invariant";
const BufferLayout = require("buffer-layout");

export const logError = (msg: string) => {
  console.log(`\x1b[31m${msg}\x1b[0m`);
};

export const publicKey = (property = "publicKey") => {
  return BufferLayout.blob(32, property);
};

export const uint64 = (property = "uint64") => {
  return BufferLayout.blob(8, property);
};

export const toBytes32Array = (b: Buffer): number[] => {
  invariant(b.length <= 32, `invalid length ${b.length}`);
  const buf = Buffer.alloc(32);
  b.copy(buf, 32 - b.length);

  return Array.from(buf);
};
