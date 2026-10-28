import { open } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";

// A minimal zip reader for APKs: lists entries from the central directory and inflates the few we
// read (the manifest, dex files, pickles inside PyTorch checkpoints). Zip64 is handled because
// large checkpoints need it; encryption is not.

export interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  localHeaderOffset: number;
}

export class ZipFile {
  private constructor(
    private readonly handle: Awaited<ReturnType<typeof open>>,
    readonly entries: ZipEntry[],
  ) {}

  static async open(file: string): Promise<ZipFile> {
    const handle = await open(file, "r");
    try {
      const { size } = await handle.stat();
      const tailSize = Math.min(size, 65_557);
      const tail = Buffer.alloc(tailSize);
      await handle.read(tail, 0, tailSize, size - tailSize);
      const eocd = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
      if (eocd < 0) throw new Error("not a zip archive (no end of central directory)");
      let count = tail.readUInt16LE(eocd + 10);
      let cdSize = tail.readUInt32LE(eocd + 12);
      let cdOffset = tail.readUInt32LE(eocd + 16);
      if ((cdOffset === 0xffffffff || count === 0xffff) && eocd >= 20 && tail.readUInt32LE(eocd - 20) === 0x07064b50) {
        const rec = Buffer.alloc(56);
        await handle.read(rec, 0, 56, Number(tail.readBigUInt64LE(eocd - 12)));
        if (rec.readUInt32LE(0) !== 0x06064b50) throw new Error("corrupt zip64 end of central directory");
        count = Number(rec.readBigUInt64LE(32));
        cdSize = Number(rec.readBigUInt64LE(40));
        cdOffset = Number(rec.readBigUInt64LE(48));
      }
      if (cdSize > 256 * 1024 * 1024) throw new Error("zip central directory is implausibly large");
      const cd = Buffer.alloc(cdSize);
      await handle.read(cd, 0, cdSize, cdOffset);
      const entries: ZipEntry[] = [];
      let p = 0;
      for (let i = 0; i < count && p + 46 <= cd.length; i++) {
        if (cd.readUInt32LE(p) !== 0x02014b50) throw new Error("corrupt zip central directory");
        const nameLen = cd.readUInt16LE(p + 28);
        const extraLen = cd.readUInt16LE(p + 30);
        const commentLen = cd.readUInt16LE(p + 32);
        const entry: ZipEntry = {
          method: cd.readUInt16LE(p + 10),
          compressedSize: cd.readUInt32LE(p + 20),
          size: cd.readUInt32LE(p + 24),
          localHeaderOffset: cd.readUInt32LE(p + 42),
          name: cd.toString("utf8", p + 46, p + 46 + nameLen),
        };
        readZip64Extra(cd.subarray(p + 46 + nameLen, p + 46 + nameLen + extraLen), entry);
        entries.push(entry);
        p += 46 + nameLen + extraLen + commentLen;
      }
      return new ZipFile(handle, entries);
    } catch (err) {
      await handle.close();
      throw err;
    }
  }

  find(name: string): ZipEntry | undefined {
    return this.entries.find((e) => e.name === name);
  }

  async read(entry: ZipEntry, maxBytes = 512 * 1024 * 1024): Promise<Buffer> {
    if (entry.size > maxBytes) throw new Error(`${entry.name} is larger than ${maxBytes} bytes`);
    const header = Buffer.alloc(30);
    await this.handle.read(header, 0, 30, entry.localHeaderOffset);
    if (header.readUInt32LE(0) !== 0x04034b50) throw new Error(`corrupt local header for ${entry.name}`);
    const dataStart = entry.localHeaderOffset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
    const data = Buffer.alloc(entry.compressedSize);
    await this.handle.read(data, 0, entry.compressedSize, dataStart);
    if (entry.method === 0) return data;
    if (entry.method === 8) return inflateRawSync(data, { maxOutputLength: maxBytes });
    throw new Error(`unsupported compression method ${entry.method} for ${entry.name}`);
  }

  close(): Promise<void> {
    return this.handle.close();
  }
}

/** Fields saturated at 0xffffffff live in the zip64 extra field, in this order. */
function readZip64Extra(extra: Buffer, entry: ZipEntry): void {
  for (let q = 0; q + 4 <= extra.length; ) {
    const id = extra.readUInt16LE(q);
    const len = extra.readUInt16LE(q + 2);
    if (id === 0x0001) {
      let r = q + 4;
      for (const key of ["size", "compressedSize", "localHeaderOffset"] as const) {
        if (entry[key] !== 0xffffffff || r + 8 > q + 4 + len) continue;
        entry[key] = Number(extra.readBigUInt64LE(r));
        r += 8;
      }
      return;
    }
    q += 4 + len;
  }
}
