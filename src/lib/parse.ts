import Papa from "papaparse";
import * as XLSX from "xlsx";

export type Row = Record<string, string>;

export interface Dataset {
  fileName: string;
  columns: string[];
  rows: Row[];
}

const normalize = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  return String(v).trim();
};

export async function parseFile(file: File): Promise<Dataset> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  const buf = await file.arrayBuffer();

  if (ext === "csv") {
    const text = new TextDecoder("utf-8").decode(buf);
    const res = Papa.parse<Record<string, unknown>>(text, {
      header: true,
      skipEmptyLines: true,
    });
    const columns = res.meta.fields ?? [];
    const rows: Row[] = res.data.map((r) => {
      const out: Row = {};
      for (const c of columns) out[c] = normalize(r[c]);
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
