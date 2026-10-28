import { open } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";

// A minimal zip reader for APKs: lists entries from the central directory and inflates the few we
// read (the manifest, dex files). APKs are ordinary zips; zip64 and encryption do not occur.

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
      const count = tail.readUInt16LE(eocd + 10);
      const cdSize = tail.readUInt32LE(eocd + 12);
      const cdOffset = tail.readUInt32LE(eocd + 16);
      const cd = Buffer.alloc(cdSize);
      await handle.read(cd, 0, cdSize, cdOffset);
      const entries: ZipEntry[] = [];
      let p = 0;
      for (let i = 0; i < count && p + 46 <= cd.length; i++) {
        if (cd.readUInt32LE(p) !== 0x02014b50) throw new Error("corrupt zip central directory");
        const nameLen = cd.readUInt16LE(p + 28);
        const extraLen = cd.readUInt16LE(p + 30);
        const commentLen = cd.readUInt16LE(p + 32);
        entries.push({
          method: cd.readUInt16LE(p + 10),
          compressedSize: cd.readUInt32LE(p + 20),
          size: cd.readUInt32LE(p + 24),
          localHeaderOffset: cd.readUInt32LE(p + 42),
          name: cd.toString("utf8", p + 46, p + 46 + nameLen),
        });
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
