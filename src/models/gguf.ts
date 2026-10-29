import { FileCursor } from "./reader.js";

// GGUF (llama.cpp) header reader: metadata key/values and tensor shapes, without the weights.
// https://github.com/ggml-org/ggml/blob/master/docs/gguf.md

export interface GgufInfo {
  version: number;
  metadata: Record<string, GgufValue>;
  tensors: number;
  parameters: number;
}

export type GgufValue = string | number | boolean | bigint | { array: string; length: number; sample: GgufValue[] };

const TYPE_NAMES = ["u8", "i8", "u16", "i16", "u32", "i32", "f32", "bool", "string", "array", "u64", "i64", "f64"];

// llama.cpp's LLAMA_FTYPE values, as stored in general.file_type.
export const FILE_TYPES: Record<number, string> = {
  0: "F32",
  1: "F16",
  2: "Q4_0",
  3: "Q4_1",
  7: "Q8_0",
  8: "Q5_0",
  9: "Q5_1",
  10: "Q2_K",
  11: "Q3_K_S",
  12: "Q3_K_M",
  13: "Q3_K_L",
  14: "Q4_K_S",
  15: "Q4_K_M",
  16: "Q5_K_S",
  17: "Q5_K_M",
  18: "Q6_K",
  19: "IQ2_XXS",
  20: "IQ2_XS",
  21: "Q2_K_S",
  22: "IQ3_XS",
  23: "IQ3_XXS",
  24: "IQ1_S",
  25: "IQ4_NL",
  26: "IQ3_S",
  27: "IQ3_M",
  28: "IQ2_S",
  29: "IQ2_M",
  30: "IQ4_XS",
  31: "IQ1_M",
  32: "BF16",
  36: "TQ1_0",
  37: "TQ2_0",
};

export async function readGguf(file: string): Promise<GgufInfo> {
  const c = await FileCursor.open(file);
  try {
    if ((await c.bytes(4)).toString("latin1") !== "GGUF") throw new Error("not a GGUF file");
    const version = await c.u32();
    if (version < 2 || version > 3) throw new Error(`unsupported GGUF version ${version}`);
    const tensorCount = await c.u64();
    const kvCount = await c.u64();
    if (kvCount > 100_000 || tensorCount > 1_000_000) throw new Error("implausible GGUF header counts");

    const str = async () => (await c.bytes(await c.u64())).toString("utf8");
    const value = async (type: number, keep: boolean): Promise<GgufValue> => {
      switch (type) {
        case 0:
          return c.u8();
        case 1:
          return (await c.bytes(1)).readInt8(0);
        case 2:
          return (await c.bytes(2)).readUInt16LE(0);
        case 3:
          return (await c.bytes(2)).readInt16LE(0);
        case 4:
          return c.u32();
        case 5:
          return (await c.bytes(4)).readInt32LE(0);
        case 6:
          return (await c.bytes(4)).readFloatLE(0);
        case 7:
          return (await c.u8()) !== 0;
        case 8:
          if (keep) return str();
          await c.skip(await c.u64());
          return "";
        case 9: {
          const itemType = await c.u32();
          const length = await c.u64();
          const sample: GgufValue[] = [];
          // Tokenizer arrays hold hundreds of thousands of entries; keep only a few.
          for (let i = 0; i < length; i++) {
            const v = await value(itemType, keep && i < 8);
            if (keep && i < 8) sample.push(v);
          }
          return { array: TYPE_NAMES[itemType] ?? `type${itemType}`, length, sample };
        }
        case 10:
          return (await c.bytes(8)).readBigUInt64LE(0);
        case 11:
          return (await c.bytes(8)).readBigInt64LE(0);
        case 12:
          return (await c.bytes(8)).readDoubleLE(0);
        default:
          throw new Error(`unknown GGUF value type ${type}`);
      }
    };

    const metadata: Record<string, GgufValue> = {};
    for (let i = 0; i < kvCount; i++) {
      const key = await str();
      metadata[key] = await value(await c.u32(), true);
    }

    let parameters = 0;
    for (let i = 0; i < tensorCount; i++) {
      await c.skip(await c.u64()); // name
      const dims = await c.u32();
      if (dims > 8) throw new Error("implausible tensor rank");
      let n = 1;
      for (let d = 0; d < dims; d++) n *= await c.u64();
      parameters += n;
      await c.skip(12); // type, offset
    }
    return { version, metadata, tensors: tensorCount, parameters };
  } finally {
    await c.close();
  }
}
