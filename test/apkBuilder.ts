import { deflateRawSync } from "node:zlib";

// Builds tiny but well-formed APK pieces (binary XML, DEX string tables, resources.arsc, zip) so
// the Android reader can be tested without shipping a real APK.

export interface XmlNode {
  name: string;
  /** Strings are stored as strings; numbers as ints; booleans as booleans; "@0x…" as references. */
  attrs?: Record<string, string | number | boolean>;
  children?: XmlNode[];
}

function chunk(type: number, headerSize: number, header: Buffer, body: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt16LE(type, 0);
  head.writeUInt16LE(headerSize, 2);
  head.writeUInt32LE(8 + header.length + body.length, 4);
  return Buffer.concat([head, header, body]);
}

function stringPool(strings: string[]): Buffer {
  const offsets = Buffer.alloc(strings.length * 4);
  const data: Buffer[] = [];
  let at = 0;
  strings.forEach((s, i) => {
    offsets.writeUInt32LE(at, i * 4);
    const b = Buffer.alloc(2 + s.length * 2 + 2);
    b.writeUInt16LE(s.length, 0);
    b.write(s, 2, "utf16le");
    data.push(b);
    at += b.length;
  });
  let body = Buffer.concat([offsets, ...data]);
  if (body.length % 4) body = Buffer.concat([body, Buffer.alloc(4 - (body.length % 4))]);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(strings.length, 0);
  header.writeUInt32LE(0, 4); // styles
  header.writeUInt32LE(0, 8); // UTF-16
  header.writeUInt32LE(28 + offsets.length, 12);
  header.writeUInt32LE(0, 16);
  return chunk(0x0001, 28, header, body);
}

export function buildAxml(root: XmlNode): Buffer {
  const strings: string[] = [];
  const idx = (s: string) => {
    let i = strings.indexOf(s);
    if (i < 0) i = strings.push(s) - 1;
    return i;
  };
  const nodes: Buffer[] = [];
  const walk = (n: XmlNode) => {
    const attrs = Object.entries(n.attrs ?? {});
    const ext = Buffer.alloc(20 + attrs.length * 20);
    ext.writeUInt32LE(0xffffffff, 0);
    ext.writeUInt32LE(idx(n.name), 4);
    ext.writeUInt16LE(20, 8);
    ext.writeUInt16LE(20, 10);
    ext.writeUInt16LE(attrs.length, 12);
    attrs.forEach(([key, value], i) => {
      const a = 20 + i * 20;
      ext.writeUInt32LE(0xffffffff, a);
      ext.writeUInt32LE(idx(key), a + 4);
      ext.writeUInt16LE(8, a + 12);
      if (typeof value === "string" && value.startsWith("@0x")) {
        ext.writeUInt32LE(0xffffffff, a + 8);
        ext.writeUInt8(0x01, a + 15);
        ext.writeUInt32LE(Number.parseInt(value.slice(3), 16), a + 16);
      } else if (typeof value === "string") {
        ext.writeUInt32LE(idx(value), a + 8);
        ext.writeUInt8(0x03, a + 15);
        ext.writeUInt32LE(idx(value), a + 16);
      } else {
        ext.writeUInt32LE(0xffffffff, a + 8);
        ext.writeUInt8(typeof value === "boolean" ? 0x12 : 0x10, a + 15);
        ext.writeUInt32LE(typeof value === "boolean" ? (value ? 0xffffffff : 0) : value, a + 16);
      }
    });
    const line = Buffer.alloc(8);
    line.writeUInt32LE(0xffffffff, 4);
    nodes.push(chunk(0x0102, 16, line, ext));
    (n.children ?? []).forEach(walk);
    const end = Buffer.alloc(8);
    end.writeUInt32LE(0xffffffff, 0);
    end.writeUInt32LE(idx(n.name), 4);
    nodes.push(chunk(0x0103, 16, line, end));
  };
  walk(root);
  return chunk(0x0003, 8, Buffer.alloc(0), Buffer.concat([stringPool(strings), ...nodes]));
}

export function buildDex(classes: string[], literals: string[]): Buffer {
  const strings = [...new Set([...classes.map((c) => `L${c.replaceAll(".", "/")};`), ...literals])].sort();
  const header = Buffer.alloc(0x70);
  header.write("dex\n035\0", 0, "latin1");
  const stringIdsOff = 0x70;
  const typeIdsOff = stringIdsOff + strings.length * 4;
  const dataOff = typeIdsOff + classes.length * 4;
  const ids = Buffer.alloc(strings.length * 4);
  const data: Buffer[] = [];
  let at = dataOff;
  strings.forEach((s, i) => {
    ids.writeUInt32LE(at, i * 4);
    const bytes = Buffer.from(s, "utf8");
    const item = Buffer.concat([Buffer.from([s.length & 0x7f]), bytes, Buffer.from([0])]);
    data.push(item);
    at += item.length;
  });
  const types = Buffer.alloc(classes.length * 4);
  classes.forEach((c, i) => types.writeUInt32LE(strings.indexOf(`L${c.replaceAll(".", "/")};`), i * 4));
  header.writeUInt32LE(strings.length, 0x38);
  header.writeUInt32LE(stringIdsOff, 0x3c);
  header.writeUInt32LE(classes.length, 0x40);
  header.writeUInt32LE(typeIdsOff, 0x44);
  return Buffer.concat([header, ids, types, ...data]);
}

/** A resources.arsc with string resources in package 0x7f, type 1, in the default config. */
export function buildArsc(values: string[]): Buffer {
  const pkgHeader = Buffer.alloc(280);
  pkgHeader.writeUInt32LE(0x7f, 0);
  const typeHeader = Buffer.alloc(76);
  typeHeader.writeUInt8(1, 0); // type id
  typeHeader.writeUInt32LE(values.length, 4);
  typeHeader.writeUInt32LE(84 + values.length * 4, 8); // entriesStart
  typeHeader.writeUInt32LE(64, 12); // config size; all-zero config = default
  const offsets = Buffer.alloc(values.length * 4);
  const entries = Buffer.alloc(values.length * 16);
  values.forEach((_, i) => {
    offsets.writeUInt32LE(i * 16, i * 4);
    entries.writeUInt16LE(8, i * 16);
    entries.writeUInt16LE(8, i * 16 + 8);
    entries.writeUInt8(0x03, i * 16 + 11);
    entries.writeUInt32LE(i, i * 16 + 12);
  });
  const type = chunk(0x0201, 84, typeHeader, Buffer.concat([offsets, entries]));
  const pkg = chunk(0x0200, 288, pkgHeader, Buffer.concat([stringPool([]), stringPool([]), type]));
  const tableHeader = Buffer.alloc(4);
  tableHeader.writeUInt32LE(1, 0);
  return chunk(0x0002, 12, tableHeader, Buffer.concat([stringPool(values), pkg]));
}

export function buildZip(files: Record<string, Buffer>): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBuf = Buffer.from(name, "utf8");
    const deflate = content.length > 64;
    const data = deflate ? deflateRawSync(content) : content;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(deflate ? 8 : 0, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, data);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(deflate ? 8 : 0, 10);
    cd.writeUInt32LE(data.length, 20);
    cd.writeUInt32LE(content.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const cdBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(files).length, 8);
  eocd.writeUInt16LE(Object.keys(files).length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cdBuf, eocd]);
}
