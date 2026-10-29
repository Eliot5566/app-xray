// Walks Python pickle opcodes without executing them and lists the callables the pickle would
// import when loaded (GLOBAL, INST, STACK_GLOBAL). Loading a pickle runs those callables, which is
// how malicious model files run code.

export interface PickleScan {
  /** "module.name" for every import, in order of first appearance. */
  imports: string[];
  /** Set when the walk stopped early, e.g. on an unknown opcode. */
  error: string | null;
  /** How many pickles were walked (legacy torch files hold several back to back). */
  pickles: number;
}

// Opcode argument shapes. "line" = newline-terminated; "lines2" = two lines; a number = fixed
// bytes; "len1"/"len4"/"len8" = length-prefixed payload.
type Arg = number | "line" | "lines2" | "len1" | "len4" | "len8";
const OPS: Record<number, Arg> = {};
const def = (codes: string | number[], arg: Arg) => {
  for (const c of typeof codes === "string" ? [...codes].map((ch) => ch.charCodeAt(0)) : codes) OPS[c] = arg;
};
def("(.012NQRabde}lost)u]o", 0); // MARK STOP POP POP_MARK DUP NONE BINPERSID REDUCE APPEND BUILD DICT APPENDS EMPTY_DICT LIST OBJ SETITEM TUPLE EMPTY_TUPLE SETITEMS EMPTY_LIST
def("FILPSVgp", "line"); // FLOAT INT LONG PERSID STRING UNICODE GET PUT
def("ci", "lines2"); // GLOBAL INST
def("J", 4); // BININT
def("K", 1); // BININT1
def("M", 2); // BININT2
def("G", 8); // BINFLOAT
def("h", 1); // BINGET
def("q", 1); // BINPUT
def("jr", 4); // LONG_BINGET LONG_BINPUT
def("TXB", "len4"); // BINSTRING BINUNICODE BINBYTES
def("UC", "len1"); // SHORT_BINSTRING SHORT_BINBYTES
def([0x80], 1); // PROTO
def([0x81, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8f, 0x90, 0x91, 0x92, 0x93, 0x94, 0x97, 0x98], 0);
def([0x82], 1); // EXT1
def([0x83], 2); // EXT2
def([0x84], 4); // EXT4
def([0x8a], "len1"); // LONG1
def([0x8b], "len4"); // LONG4
def([0x8c], "len1"); // SHORT_BINUNICODE
def([0x8d, 0x8e, 0x96], "len8"); // BINUNICODE8 BINBYTES8 BYTEARRAY8
def([0x95], 8); // FRAME

const STRING_OPS = new Set([0x8c, 0x58, 0x8d, 0x55, 0x54, 0x56, 0x53]);
const STOP = 0x2e;

export function scanPickle(buf: Buffer, maxPickles = 8): PickleScan {
  const imports: string[] = [];
  const seen = new Set<string>();
  const add = (mod: string, name: string) => {
    const full = `${mod}.${name}`;
    if (!seen.has(full)) {
      seen.add(full);
      imports.push(full);
    }
  };
  let p = 0;
  let pickles = 0;
  try {
    while (p < buf.length && pickles < maxPickles) {
      // Only walk data that looks like a pickle (protocol 2+ header, or protocol 0/1 opcodes).
      if (pickles > 0 && buf[p] !== 0x80) break;
      pickles++;
      // Recent string pushes and memoized strings, enough to resolve STACK_GLOBAL's operands.
      const stack: Array<string | null> = [];
      const memo = new Map<number, string | null>();
      let memoNext = 0;
      for (;;) {
        if (p >= buf.length) throw new Error("pickle ends without STOP");
        const op = buf[p++]!;
        const arg = OPS[op];
        if (arg === undefined) throw new Error(`unknown opcode 0x${op.toString(16)} at byte ${p - 1}`);
        let payload: Buffer | null = null;
        if (typeof arg === "number") {
          payload = buf.subarray(p, p + arg);
          p += arg;
        } else if (arg === "line" || arg === "lines2") {
          const end1 = buf.indexOf(0x0a, p);
          if (end1 < 0) throw new Error("unterminated line argument");
          if (arg === "lines2") {
            const end2 = buf.indexOf(0x0a, end1 + 1);
            if (end2 < 0) throw new Error("unterminated line argument");
            const mod = buf.toString("utf8", p, end1);
            const name = buf.toString("utf8", end1 + 1, end2);
            add(mod, name);
            p = end2 + 1;
            stack.push(null);
            continue;
          }
          payload = buf.subarray(p, end1);
          p = end1 + 1;
        } else {
          const size = arg === "len1" ? 1 : arg === "len4" ? 4 : 8;
          if (p + size > buf.length) throw new Error("truncated length");
          const n = size === 1 ? buf[p]! : size === 4 ? buf.readUInt32LE(p) : Number(buf.readBigUInt64LE(p));
          p += size;
          if (p + n > buf.length) throw new Error("truncated payload");
          payload = buf.subarray(p, p + n);
          p += n;
        }
        if (p > buf.length) throw new Error("truncated argument");

        if (STRING_OPS.has(op)) {
          let s = payload!.toString("utf8");
          if (op === 0x53) s = s.replace(/^['"]|['"]$/g, ""); // STRING is a quoted repr
          stack.push(s);
        } else if (op === 0x93) {
          const name = stack.pop();
          const mod = stack.pop();
          add(mod ?? "?", name ?? "?");
          stack.push(null);
        } else if (op === 0x94) {
          memo.set(memoNext++, stack.at(-1) ?? null);
        } else if (op === 0x71 || op === 0x72) {
          memo.set(op === 0x71 ? payload![0]! : payload!.readUInt32LE(0), stack.at(-1) ?? null);
        } else if (op === 0x70) {
          memo.set(Number(payload!.toString("latin1")), stack.at(-1) ?? null);
        } else if (op === 0x68 || op === 0x6a) {
          stack.push(memo.get(op === 0x68 ? payload![0]! : payload!.readUInt32LE(0)) ?? null);
        } else if (op === 0x67) {
          stack.push(memo.get(Number(payload!.toString("latin1"))) ?? null);
        } else if (op === STOP) {
          break;
        } else if (op !== 0x80 && op !== 0x95) {
          stack.push(null);
        }
        if (stack.length > 64) stack.splice(0, stack.length - 64);
      }
    }
    return { imports, error: null, pickles };
  } catch (err) {
    return { imports, error: err instanceof Error ? err.message : String(err), pickles };
  }
}

// Imports that run commands, load code, touch files or the network. Matching picklescan's
// notion of "dangerous globals".
const DANGEROUS: Array<[string, string | "*"]> = [
  ["builtins", "eval"],
  ["builtins", "exec"],
  ["builtins", "compile"],
  ["builtins", "open"],
  ["builtins", "getattr"],
  ["builtins", "__import__"],
  ["builtins", "breakpoint"],
  ["__builtin__", "*"],
  ["os", "*"],
  ["posix", "*"],
  ["nt", "*"],
  ["subprocess", "*"],
  ["sys", "*"],
  ["socket", "*"],
  ["shutil", "*"],
  ["runpy", "*"],
  ["webbrowser", "*"],
  ["pty", "*"],
  ["commands", "*"],
  ["requests", "*"],
  ["urllib", "*"],
  ["urllib.request", "*"],
  ["httplib", "*"],
  ["http.client", "*"],
  ["aiohttp", "*"],
  ["asyncio", "*"],
  ["pickle", "*"],
  ["_pickle", "*"],
  ["dill", "*"],
  ["marshal", "*"],
  ["types", "*"],
  ["code", "*"],
  ["importlib", "*"],
  ["ctypes", "*"],
  ["pdb", "*"],
  ["bdb", "*"],
  ["operator", "attrgetter"],
  ["operator", "methodcaller"],
  ["functools", "partial"],
  ["torch", "load"],
  ["torch.serialization", "load"],
  ["numpy.testing._private.utils", "*"],
];

// What ordinary PyTorch, NumPy and scikit-learn checkpoints import.
const SAFE_PREFIXES = [
  "collections.OrderedDict",
  "collections.defaultdict",
  "torch._utils._rebuild_",
  "torch._tensor._rebuild_",
  "torch.nn.",
  "torch.serialization._get_layout",
  "torch.device",
  "torch.Size",
  "torch._C._nn",
  "numpy.core.multiarray._reconstruct",
  "numpy._core.multiarray._reconstruct",
  "numpy.core.multiarray.scalar",
  "numpy._core.multiarray.scalar",
  "numpy.dtype",
  "numpy.ndarray",
  "numpy.random._pickle.",
  "_codecs.encode",
  "builtins.set",
  "builtins.frozenset",
  "builtins.slice",
  "builtins.bytearray",
  "builtins.complex",
  "__builtin__.set",
];
const TORCH_DTYPE = /^torch\.(?:[A-Za-z]*Storage|float\d*|bfloat16|half|double|int\d*|uint\d*|bool|long|complex\d*|qint\d+|quint\d+(?:x\d+)?|float8_\w+)$/;

export type ImportRisk = "dangerous" | "unexpected" | "safe";

export function classifyImport(full: string): ImportRisk {
  const dot = full.lastIndexOf(".");
  const mod = full.slice(0, dot);
  const name = full.slice(dot + 1);
  if (DANGEROUS.some(([m, n]) => (mod === m || mod.startsWith(`${m}.`) && n === "*") && (n === "*" || n === name))) return "dangerous";
  if (SAFE_PREFIXES.some((s) => full.startsWith(s)) || TORCH_DTYPE.test(full)) return "safe";
  return "unexpected";
}
