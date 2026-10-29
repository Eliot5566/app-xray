// Decoder for Android's compiled binary XML (AndroidManifest.xml inside an APK). Returns a plain
// element tree. Attribute names fall back to the resource map, because shrunk or obfuscated APKs
// often blank the names of android:* attributes.

export interface XmlElement {
  name: string;
  attrs: Record<string, string | number | boolean>;
  children: XmlElement[];
}

const RES_STRING_POOL = 0x0001;
const RES_XML = 0x0003;
const RES_XML_START_ELEMENT = 0x0102;
const RES_XML_END_ELEMENT = 0x0103;
const RES_XML_RESOURCE_MAP = 0x0180;

// android:* attribute resource ids, for manifests whose attribute names were stripped.
const ANDROID_ATTRS: Record<number, string> = {
  0x01010003: "name",
  0x01010010: "exported",
  0x0101000f: "debuggable",
  0x01010006: "permission",
  0x0101021b: "versionCode",
  0x0101021c: "versionName",
  0x0101020c: "minSdkVersion",
  0x01010270: "targetSdkVersion",
  0x01010280: "allowBackup",
  0x010104ec: "usesCleartextTraffic",
  0x01010527: "networkSecurityConfig",
  0x01010001: "label",
};

export function parseAxml(buf: Buffer): XmlElement {
  if (buf.readUInt16LE(0) !== RES_XML) throw new Error("not a binary XML document");
  let strings: string[] = [];
  let resourceIds: number[] = [];
  const root: XmlElement = { name: "#document", attrs: {}, children: [] };
  const stack: XmlElement[] = [root];

  let p = buf.readUInt16LE(2);
  while (p + 8 <= buf.length) {
    const type = buf.readUInt16LE(p);
    const headerSize = buf.readUInt16LE(p + 2);
    const size = buf.readUInt32LE(p + 4);
    if (size < 8 || p + size > buf.length) break;
    if (type === RES_STRING_POOL) {
      strings = readStringPool(buf, p, headerSize);
    } else if (type === RES_XML_RESOURCE_MAP) {
      resourceIds = [];
      for (let q = p + headerSize; q + 4 <= p + size; q += 4) resourceIds.push(buf.readUInt32LE(q));
    } else if (type === RES_XML_START_ELEMENT) {
      const ext = p + headerSize;
      const name = strings[buf.readUInt32LE(ext + 4)] ?? "";
      const attrStart = buf.readUInt16LE(ext + 8);
      const attrSize = buf.readUInt16LE(ext + 10);
      const attrCount = buf.readUInt16LE(ext + 12);
      const el: XmlElement = { name, attrs: {}, children: [] };
      for (let i = 0; i < attrCount; i++) {
        const a = ext + attrStart + i * attrSize;
        const nameIdx = buf.readUInt32LE(a + 4);
        const raw = buf.readUInt32LE(a + 8);
        const dataType = buf.readUInt8(a + 15);
        const data = buf.readUInt32LE(a + 16);
        const attrName = strings[nameIdx] || ANDROID_ATTRS[resourceIds[nameIdx] ?? -1] || `attr${nameIdx}`;
        el.attrs[attrName] = typedValue(raw, dataType, data, strings);
      }
      stack.at(-1)!.children.push(el);
      stack.push(el);
    } else if (type === RES_XML_END_ELEMENT) {
      if (stack.length > 1) stack.pop();
    }
    p += size;
  }
  return root.children[0] ?? root;
}

function typedValue(raw: number, dataType: number, data: number, strings: string[]): string | number | boolean {
  if (raw !== 0xffffffff && strings[raw] !== undefined) return strings[raw]!;
  switch (dataType) {
    case 0x03:
      return strings[data] ?? "";
    case 0x10:
      return data | 0;
    case 0x11:
      return data;
    case 0x12:
      return data !== 0;
    case 0x01:
      return `@0x${data.toString(16).padStart(8, "0")}`;
    default:
      return data;
  }
}

export function readStringPool(buf: Buffer, start: number, headerSize: number): string[] {
  const count = buf.readUInt32LE(start + 8);
  const flags = buf.readUInt32LE(start + 16);
  const stringsStart = start + buf.readUInt32LE(start + 20);
  const utf8 = (flags & 0x100) !== 0;
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    let p = stringsStart + buf.readUInt32LE(start + headerSize + i * 4);
    if (utf8) {
      // UTF-16 length, then UTF-8 byte length, each one or two bytes.
      p += buf[p]! & 0x80 ? 2 : 1;
      let len = buf[p]!;
      if (len & 0x80) {
        len = ((len & 0x7f) << 8) | buf[p + 1]!;
        p += 2;
      } else p += 1;
      out.push(buf.toString("utf8", p, p + len));
    } else {
      let len = buf.readUInt16LE(p);
      if (len & 0x8000) {
        len = ((len & 0x7fff) << 16) | buf.readUInt16LE(p + 2);
        p += 4;
      } else p += 2;
      out.push(buf.toString("utf16le", p, p + len * 2));
    }
  }
  return out;
}
