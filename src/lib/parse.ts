import Papa from "papaparse";
import * as XLSX from "xlsx";

export type Row = Record<string, string>;

export interface Dataset {
  fileName: string;
  columns: string[];
  rows: Row[];
}

/**
 * Decodifica bytes tentando UTF-8 (estrito) e, se falhar, recai para
 * windows-1252 (Latin1) — comum em arquivos exportados no Windows/Excel BR.
 */
function decodeSmart(buf: ArrayBuffer): string {
  try {
    const t = new TextDecoder("utf-8", { fatal: true }).decode(buf);
    return t.replace(/^\uFEFF/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(buf).replace(/^\uFEFF/, "");
  }
}

/**
 * Corrige mojibake comum (UTF-8 lido como Latin1): "Ã©" -> "é", "Ã§" -> "ç",
 * "Ã£" -> "ã", "Â°" -> "°", etc. Heurística segura: só aplica quando
 * encontra padrões típicos e a reinterpretação resulta em UTF-8 válido.
 */
const MOJIBAKE_RE = /Ã[\u0080-\u00BF]|Â[\u0080-\u00BF]|â\u0080[\u0090-\u009F]/;
export function fixMojibake(s: string): string {
  if (!s || !MOJIBAKE_RE.test(s)) return s;
  try {
    const bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c > 0xff) return s; // não é Latin1 puro, aborta
      bytes[i] = c;
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return s;
  }
}

const normalize = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  return fixMojibake(String(v)).trim();
};

export async function parseFile(file: File): Promise<Dataset> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  const buf = await file.arrayBuffer();

  if (ext === "csv") {
    const text = decodeSmart(buf);
    const res = Papa.parse<Record<string, unknown>>(text, {
      header: true,
      skipEmptyLines: true,
    });
    const rawCols = res.meta.fields ?? [];
    const columns = rawCols.map(fixMojibake);
    const rows: Row[] = res.data.map((r) => {
      const out: Row = {};
      rawCols.forEach((c, i) => (out[columns[i]] = normalize(r[c])));
      return out;
    });
    return { fileName: file.name, columns, rows };
  }

  // XLSX
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });
  const columns: string[] = [];
  const seen = new Set<string>();
  for (const r of json) {
    for (const k of Object.keys(r)) {
      if (!seen.has(k)) {
        seen.add(k);
        columns.push(k);
      }
    }
  }
  const rows: Row[] = json.map((r) => {
    const out: Row = {};
    for (const c of columns) out[c] = normalize(r[c]);
    return out;
  });
  return { fileName: file.name, columns, rows };
}
