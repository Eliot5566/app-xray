import { open } from "node:fs/promises";

// Sequential little-endian reads from a large file, fetched in chunks, so a multi-gigabyte model's
// header can be parsed without loading the weights.

const CHUNK = 1 << 20;

export class FileCursor {
  private buf = Buffer.alloc(0);
  private bufStart = 0;
  pos = 0;

  private constructor(
    private readonly handle: Awaited<ReturnType<typeof open>>,
    readonly size: number,
    /** Bytes the parser may read before giving up, to bound work on hostile files. */
    private readonly limit: number,
  ) {}

  static async open(file: string, limit = 256 * 1024 * 1024): Promise<FileCursor> {
    const handle = await open(file, "r");
    const { size } = await handle.stat();
    return new FileCursor(handle, size, limit);
  }

  close(): Promise<void> {
    return this.handle.close();
  }

  async bytes(n: number): Promise<Buffer> {
    if (n < 0 || this.pos + n > this.size) throw new Error(`unexpected end of file at byte ${this.pos}`);
    if (this.pos + n > this.limit) throw new Error(`header is larger than ${this.limit} bytes`);
    const end = this.bufStart + this.buf.length;
    if (this.pos < this.bufStart || this.pos + n > end) {
      const len = Math.max(n, CHUNK);
      const chunk = Buffer.alloc(Math.min(len, this.size - this.pos));
      await this.handle.read(chunk, 0, chunk.length, this.pos);
      this.buf = chunk;
      this.bufStart = this.pos;
    }
    const off = this.pos - this.bufStart;
    this.pos += n;
    return this.buf.subarray(off, off + n);
  }

  async skip(n: number): Promise<void> {
    if (n < 0 || this.pos + n > this.size) throw new Error(`unexpected end of file at byte ${this.pos}`);
    this.pos += n;
  }

  async u8(): Promise<number> {
    return (await this.bytes(1))[0]!;
  }
  async u32(): Promise<number> {
    return (await this.bytes(4)).readUInt32LE(0);
  }
  async u64(): Promise<number> {
    const v = (await this.bytes(8)).readBigUInt64LE(0);
    if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`value too large at byte ${this.pos - 8}`);
    return Number(v);
  }
}
