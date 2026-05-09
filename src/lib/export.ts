import * as XLSX from "xlsx";

type AnyRow = Record<string, string | number | null | undefined>;

export interface SheetSpec {
  name: string;
  rows: AnyRow[];
  columns?: string[];
  /** Optional footer row (e.g., "Total"). Rendered after the data rows. */
  footer?: AnyRow;
}

function sanitizeSheetName(name: string): string {
  return name.replace(/[\\/?*[\]:]/g, "-").slice(0, 31) || "Sheet";
}

function colWidthsFromRows(columns: string[], rows: AnyRow[]): { wch: number }[] {
  return columns.map((c) => {
    let max = c.length;
    for (const r of rows) {
      const v = r[c];
      if (v == null) continue;
      const len = String(v).length;
      if (len > max) max = len;
    }
    return { wch: Math.min(60, Math.max(8, max + 2)) };
  });
}

/**
 * Plain XLSX export (kept for compatibility).
 */
export function exportXLSX(filename: string, sheets: SheetSpec[]) {
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();
  for (const s of sheets) {
    const cols = s.columns ?? (s.rows[0] ? Object.keys(s.rows[0]) : []);
    const data = s.rows.map((r) => {
      const o: Record<string, string | number> = {};
      for (const c of cols) o[c] = (r[c] ?? "") as string | number;
      return o;
    });
    const ws = XLSX.utils.json_to_sheet(data, { header: cols });
    let name = sanitizeSheetName(s.name);
    let i = 2;
    while (used.has(name)) name = sanitizeSheetName(`${s.name} (${i++})`);
    used.add(name);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  XLSX.writeFile(wb, filename);
}

/**
 * Friendlier XLSX export — sets column widths, autofilter and frozen header row.
 * NOTE: cell styling (fills/fonts) is not applied because the community xlsx
 * build doesn't write style records; we focus on layout cues that DO export.
 */
export function exportXLSXStyled(filename: string, sheets: SheetSpec[]) {
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();
  for (const s of sheets) {
    const cols = s.columns ?? (s.rows[0] ? Object.keys(s.rows[0]) : []);
    const allRows = s.footer ? [...s.rows, s.footer] : s.rows;
    const data = allRows.map((r) => {
      const o: Record<string, string | number> = {};
      for (const c of cols) o[c] = (r[c] ?? "") as string | number;
      return o;
    });
    const ws = XLSX.utils.json_to_sheet(data, { header: cols });
    ws["!cols"] = colWidthsFromRows(cols, allRows);
    if (cols.length && allRows.length) {
      const lastCol = XLSX.utils.encode_col(cols.length - 1);
      const lastRow = allRows.length + 1;
      ws["!autofilter"] = { ref: `A1:${lastCol}${lastRow}` };
    }
    // Freeze header row
    ws["!freeze"] = { xSplit: "0", ySplit: "1", topLeftCell: "A2", activePane: "bottomLeft", state: "frozen" } as never;
    let name = sanitizeSheetName(s.name);
    let i = 2;
    while (used.has(name)) name = sanitizeSheetName(`${s.name} (${i++})`);
    used.add(name);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  XLSX.writeFile(wb, filename);
}

/**
 * CSV export — UTF-8 with BOM and `;` separator (Excel pt-BR friendly).
 */
export function exportCSV(filename: string, rows: AnyRow[], columns?: string[]) {
  const cols = columns ?? (rows[0] ? Object.keys(rows[0]) : []);
  const escape = (val: unknown) => {
    if (val == null) return "";
    const s = String(val);
    if (/[;"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines: string[] = [];
  lines.push(cols.map(escape).join(";"));
  for (const r of rows) lines.push(cols.map((c) => escape(r[c])).join(";"));
  const csv = "\uFEFF" + lines.join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
