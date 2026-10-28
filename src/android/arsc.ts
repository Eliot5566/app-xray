import { readStringPool } from "./axml.js";

// Resolves string resources (like the app's label, "@0x7f120032") from an APK's resources.arsc.
// Only what a label needs: string values in the default or English configuration.

const RES_TABLE = 0x0002;
const RES_STRING_POOL = 0x0001;
const RES_TABLE_PACKAGE = 0x0200;
const RES_TABLE_TYPE = 0x0201;

const FLAG_SPARSE = 0x01;
const FLAG_OFFSET16 = 0x02;
const ENTRY_COMPLEX = 0x0001;
const ENTRY_COMPACT = 0x0008;
const NO_ENTRY = 0xffffffff;

const TYPE_REFERENCE = 0x01;
const TYPE_STRING = 0x03;

interface Value {
  dataType: number;
  data: number;
  /** 0 for the default configuration, 1 for English, 2 for anything else. */
  rank: number;
}

export function resolveStrings(buf: Buffer, ids: number[]): Map<number, string> {
  const out = new Map<number, string>();
  if (buf.length < 12 || buf.readUInt16LE(0) !== RES_TABLE) return out;
  const wanted = new Set<number>();
  const values = new Map<number, Value>();
  let globalStrings: string[] = [];

  // References can point at other resources, so resolve in a couple of passes.
  for (const id of ids) wanted.add(id);
  for (let pass = 0; pass < 3 && wanted.size > 0; pass++) {
    scan(buf, wanted, values, (s) => (globalStrings = s));
    const next = new Set<number>();
    for (const id of wanted) {
      const v = values.get(id);
      if (v?.dataType === TYPE_REFERENCE && !values.has(v.data)) next.add(v.data);
    }
    wanted.clear();
    for (const id of next) wanted.add(id);
  }

  for (const id of ids) {
    let v = values.get(id);
    for (let depth = 0; v?.dataType === TYPE_REFERENCE && depth < 4; depth++) v = values.get(v.data);
    if (v?.dataType === TYPE_STRING && globalStrings[v.data] !== undefined) out.set(id, globalStrings[v.data]!);
  }
  return out;
}

function scan(buf: Buffer, wanted: Set<number>, values: Map<number, Value>, setGlobal: (s: string[]) => void): void {
  let p = buf.readUInt16LE(2);
  while (p + 8 <= buf.length) {
    const type = buf.readUInt16LE(p);
    const headerSize = buf.readUInt16LE(p + 2);
    const size = buf.readUInt32LE(p + 4);
    if (size < 8 || p + size > buf.length) break;
    if (type === RES_STRING_POOL) setGlobal(readStringPool(buf, p, headerSize));
    else if (type === RES_TABLE_PACKAGE) scanPackage(buf, p, headerSize, size, wanted, values);
    p += size;
  }
}

function scanPackage(buf: Buffer, start: number, headerSize: number, size: number, wanted: Set<number>, values: Map<number, Value>): void {
  const pkgId = buf.readUInt32LE(start + 8);
  let p = start + headerSize;
  while (p + 8 <= start + size) {
    const type = buf.readUInt16LE(p);
    const hSize = buf.readUInt16LE(p + 2);
    const cSize = buf.readUInt32LE(p + 4);
    if (cSize < 8 || p + cSize > start + size) break;
    if (type === RES_TABLE_TYPE) scanType(buf, p, hSize, cSize, pkgId, wanted, values);
    p += cSize;
  }
}

function scanType(
  buf: Buffer,
  start: number,
  headerSize: number,
  size: number,
  pkgId: number,
  wanted: Set<number>,
  values: Map<number, Value>,
): void {
  const typeId = buf[start + 8]!;
  const flags = buf[start + 9]!;
  const entryCount = buf.readUInt32LE(start + 12);
  const entriesStart = start + buf.readUInt32LE(start + 16);
  // ResTable_config starts at +20; language is two bytes at config offset 8.
  const lang = buf.toString("latin1", start + 28, start + 30);
  const rank = lang === "\0\0" ? 0 : lang === "en" ? 1 : 2;

  const offsets = start + headerSize;
  const visit = (index: number, offset: number) => {
    const id = ((pkgId & 0xff) << 24) | (typeId << 16) | index;
    const resId = id >>> 0;
    if (!wanted.has(resId)) return;
    const prev = values.get(resId);
    if (prev && prev.rank <= rank) return;
    const e = entriesStart + offset;
    if (e + 8 > start + size) return;
    const entryFlags = buf.readUInt16LE(e + 2);
    if (entryFlags & ENTRY_COMPACT) {
      values.set(resId, { dataType: entryFlags >> 8, data: buf.readUInt32LE(e + 4), rank });
      return;
    }
    if (entryFlags & ENTRY_COMPLEX) return;
    const entrySize = buf.readUInt16LE(e);
    const v = e + entrySize;
    if (v + 8 > start + size) return;
    values.set(resId, { dataType: buf[v + 3]!, data: buf.readUInt32LE(v + 4), rank });
  };

  if (flags & FLAG_SPARSE) {
    for (let i = 0; i < entryCount; i++) visit(buf.readUInt16LE(offsets + i * 4), buf.readUInt16LE(offsets + i * 4 + 2) * 4);
  } else if (flags & FLAG_OFFSET16) {
    for (let i = 0; i < entryCount; i++) {
      const o = buf.readUInt16LE(offsets + i * 2);
      if (o !== 0xffff) visit(i, o * 4);
    }
  } else {
    for (let i = 0; i < entryCount; i++) {
      const o = buf.readUInt32LE(offsets + i * 4);
      if (o !== NO_ENTRY) visit(i, o);
    }
  }
}
