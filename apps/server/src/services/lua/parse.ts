/**
 * Минимальный парсер Lua-таблиц в формате WoW SavedVariables:
 *   Name = { ["key"] = value, [1] = value, value, ... }
 * Поддерживает строки ("…" с escape), числа, true/false/nil, вложенные таблицы, комментарии `--`.
 * Результат: объект { Name: value, ... }. Таблицы → объекты (ключи-строки) либо массивы,
 * если все ключи — последовательные числа 1..n (или без ключей).
 */

export type LuaValue = string | number | boolean | null | LuaValue[] | { [k: string]: LuaValue };

export function parseSavedVariables(src: string): Record<string, LuaValue> {
  const p = new Parser(src);
  const out: Record<string, LuaValue> = {};
  p.skipWs();
  while (!p.eof()) {
    const name = p.readIdent();
    p.skipWs();
    p.expect("=");
    p.skipWs();
    out[name] = p.readValue();
    p.skipWs();
  }
  return out;
}

class Parser {
  private i = 0;
  constructor(private readonly s: string) {}

  eof(): boolean {
    return this.i >= this.s.length;
  }

  skipWs(): void {
    for (;;) {
      while (this.i < this.s.length && /\s/.test(this.s[this.i]!)) this.i++;
      if (this.s.startsWith("--", this.i)) {
        // блочный комментарий --[[ ... ]] или строчный
        if (this.s.startsWith("--[[", this.i)) {
          const end = this.s.indexOf("]]", this.i + 4);
          this.i = end < 0 ? this.s.length : end + 2;
        } else {
          const nl = this.s.indexOf("\n", this.i);
          this.i = nl < 0 ? this.s.length : nl + 1;
        }
        continue;
      }
      break;
    }
  }

  expect(ch: string): void {
    if (this.s[this.i] !== ch) throw new Error(`Lua parse: ожидался '${ch}' на позиции ${this.i}, найден '${this.s.slice(this.i, this.i + 20)}'`);
    this.i++;
  }

  readIdent(): string {
    const m = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(this.s.slice(this.i));
    if (!m) throw new Error(`Lua parse: ожидался идентификатор на позиции ${this.i}`);
    this.i += m[0].length;
    return m[0];
  }

  readValue(): LuaValue {
    const c = this.s[this.i];
    if (c === "{") return this.readTable();
    if (c === '"') return this.readString();
    if (c === "'") return this.readString("'");
    if (this.s.startsWith("[[", this.i)) return this.readLongString();
    if (this.s.startsWith("true", this.i)) {
      this.i += 4;
      return true;
    }
    if (this.s.startsWith("false", this.i)) {
      this.i += 5;
      return false;
    }
    if (this.s.startsWith("nil", this.i)) {
      this.i += 3;
      return null;
    }
    const m = /^-?(?:0x[0-9a-fA-F]+|\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?|inf|nan)/.exec(this.s.slice(this.i));
    if (m) {
      this.i += m[0].length;
      if (m[0].endsWith("inf")) return m[0].startsWith("-") ? -Infinity : Infinity;
      if (m[0].endsWith("nan")) return NaN;
      return Number(m[0]);
    }
    throw new Error(`Lua parse: неожиданный символ '${c}' на позиции ${this.i}`);
  }

  readString(q = '"'): string {
    this.expect(q);
    let out = "";
    while (this.i < this.s.length) {
      const c = this.s[this.i]!;
      if (c === q) {
        this.i++;
        return out;
      }
      if (c === "\\") {
        const n = this.s[this.i + 1]!;
        this.i += 2;
        switch (n) {
          case "n": out += "\n"; break;
          case "t": out += "\t"; break;
          case "r": out += "\r"; break;
          case "\\": out += "\\"; break;
          case '"': out += '"'; break;
          case "'": out += "'"; break;
          case "\n": out += "\n"; break;
          default: {
            // \ddd
            const d = /^\d{1,3}/.exec(this.s.slice(this.i - 1));
            if (d) {
              out += String.fromCharCode(Number(d[0]));
              this.i += d[0].length - 1;
            } else out += n;
          }
        }
        continue;
      }
      out += c;
      this.i++;
    }
    throw new Error("Lua parse: незакрытая строка");
  }

  readLongString(): string {
    const end = this.s.indexOf("]]", this.i + 2);
    if (end < 0) throw new Error("Lua parse: незакрытая длинная строка");
    const v = this.s.slice(this.i + 2, end);
    this.i = end + 2;
    return v;
  }

  readTable(): LuaValue {
    this.expect("{");
    const obj: Record<string, LuaValue> = {};
    const arr: LuaValue[] = [];
    let arrayOnly = true;
    let autoIndex = 1;
    for (;;) {
      this.skipWs();
      const c = this.s[this.i];
      if (c === "}") {
        this.i++;
        break;
      }
      if (c === "[") {
        this.i++;
        this.skipWs();
        const key = this.readValue();
        this.skipWs();
        this.expect("]");
        this.skipWs();
        this.expect("=");
        this.skipWs();
        const val = this.readValue();
        if (typeof key === "number" && key === autoIndex && arrayOnly) {
          arr.push(val);
          autoIndex++;
        } else {
          arrayOnly = false;
          obj[String(key)] = val;
        }
      } else if (/[A-Za-z_]/.test(c ?? "")) {
        // ident = value  (или голое значение true/false/nil)
        const save = this.i;
        const ident = this.readIdent();
        this.skipWs();
        if (this.s[this.i] === "=") {
          this.i++;
          this.skipWs();
          const val = this.readValue();
          arrayOnly = false;
          obj[ident] = val;
        } else {
          this.i = save;
          const val = this.readValue();
          arr.push(val);
          autoIndex++;
        }
      } else {
        const val = this.readValue();
        arr.push(val);
        autoIndex++;
      }
      this.skipWs();
      if (this.s[this.i] === "," || this.s[this.i] === ";") this.i++;
    }
    if (arrayOnly && Object.keys(obj).length === 0) return arr;
    // смешанная таблица: числовые ключи в объект
    arr.forEach((v, idx) => (obj[String(idx + 1)] = v));
    return obj;
  }
}

/** Сериализация JS → Lua-литерал (для генерации db.lua). */
export function toLua(value: unknown, indent = 0): string {
  const pad = "  ".repeat(indent);
  if (value === null || value === undefined) return "nil";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "0";
  if (typeof value === "string") return luaString(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "{}";
    return `{ ${value.map((v) => toLua(v, indent + 1)).join(", ")} }`;
  }
  const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined && v !== null);
  if (entries.length === 0) return "{}";
  const lines = entries.map(([k, v]) => {
    const key = /^\d+$/.test(k) ? `[${k}]` : /^[A-Za-z_][A-Za-z0-9_]*$/.test(k) ? k : `[${luaString(k)}]`;
    return `${pad}  ${key} = ${toLua(v, indent + 1)},`;
  });
  return `{\n${lines.join("\n")}\n${pad}}`;
}

export function luaString(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "")}"`;
}
