import * as XLSX from "xlsx";
import type { Row } from "./parse";

export function exportXLSX(
  filename: string,
  sheets: { name: string; rows: Row[]; columns?: string[] }[],
) {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const cols = s.columns ?? (s.rows[0] ? Object.keys(s.rows[0]) : []);
    const data = s.rows.map((r) => {
      const o: Record<string, string> = {};
      for (const c of cols) o[c] = r[c] ?? "";
      return o;
    });
    const ws = XLSX.utils.json_to_sheet(data, { header: cols });
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  XLSX.writeFile(wb, filename);
}
