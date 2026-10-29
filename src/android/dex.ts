// Reads the string and type tables of a DEX file: every class the code defines or references, and
// every string literal. Enough to recognize SDKs by package name and find literal addresses,
// without decompiling anything.

export interface DexStrings {
  /** Class names in Java form, e.g. com.google.firebase.analytics.FirebaseAnalytics. */
  classes: string[];
  strings: string[];
}

export function readDex(buf: Buffer): DexStrings {
  if (buf.toString("latin1", 0, 3) !== "dex") throw new Error("not a DEX file");
  const stringCount = buf.readUInt32LE(0x38);
  const stringIdsOff = buf.readUInt32LE(0x3c);
  const typeCount = buf.readUInt32LE(0x40);
  const typeIdsOff = buf.readUInt32LE(0x44);

  const strings: string[] = new Array(stringCount);
  for (let i = 0; i < stringCount; i++) {
    let p = buf.readUInt32LE(stringIdsOff + i * 4);
    // uleb128 UTF-16 length, then modified UTF-8 up to a NUL byte.
    while (buf[p]! & 0x80) p++;
    p++;
    const end = buf.indexOf(0, p);
    strings[i] = buf.toString("utf8", p, end < 0 ? buf.length : end);
  }

  const classes: string[] = [];
  for (let i = 0; i < typeCount; i++) {
    const descriptor = strings[buf.readUInt32LE(typeIdsOff + i * 4)] ?? "";
    if (descriptor.startsWith("L") && descriptor.endsWith(";")) {
      classes.push(descriptor.slice(1, -1).replaceAll("/", "."));
    }
  }
  return { classes, strings };
}
