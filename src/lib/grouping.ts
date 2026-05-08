import type { Row } from "./parse";

export type FilterOp =
  | "preenchido"
  | "vazio"
  | "igual a"
  | "diferente de"
  | "contem"
  | "nao contem";

export interface Filter {
  id: string;
  column: string;
  op: FilterOp;
  value: string;
}

const norm = (v: string) => (v ?? "").trim().toLowerCase();

export function applyFilters(rows: Row[], filters: Filter[]): Row[] {
  if (!filters.length) return rows;
  return rows.filter((r) =>
    filters.every((f) => {
      if (!f.column) return true;
      const v = norm(r[f.column] ?? "");
      const tv = norm(f.value);
      switch (f.op) {
        case "preenchido":
          return v.length > 0;
        case "vazio":
          return v.length === 0;
        case "igual a":
          return v === tv;
        case "diferente de":
          return v !== tv;
        case "contem":
          return v.includes(tv);
        case "nao contem":
          return !v.includes(tv);
      }
    }),
  );
}

export interface GroupedRow {
  key: string;
  values: Record<string, string>; // group columns
  concat: Record<string, string>; // concatenated columns
  quantity: number;
  ids: string[];
  rawRows: Row[];
}

export type ConcatStrategy = "all" | "unique" | "first" | "last" | "min" | "max" | "count";

export function groupRows(
  rows: Row[],
  groupBy: string[],
  concatCols: string[] = [],
  concatStrategy: Record<string, ConcatStrategy> = {},
  idCol = "ID",
): GroupedRow[] {
  if (!groupBy.length) return [];
  const map = new Map<string, GroupedRow>();
  for (const r of rows) {
    const values: Record<string, string> = {};
    for (const c of groupBy) values[c] = r[c] ?? "";
    const key = groupBy.map((c) => values[c]).join("\u0001");
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        values,
        concat: {},
        quantity: 0,
        ids: [],
        rawRows: [],
      };
      for (const c of concatCols) g.concat[c] = "";
      map.set(key, g);
    }
    g.quantity += 1;
    g.rawRows.push(r);
    if (r[idCol]) g.ids.push(r[idCol]);
  }
  for (const g of map.values()) {
    for (const c of concatCols) {
      const strategy = concatStrategy[c] ?? "unique";
      const all: string[] = [];
      for (const r of g.rawRows) {
        const v = (r[c] ?? "").trim();
        if (v) all.push(v);
      }
      if (strategy === "count") {
        g.concat[c] = String(all.length);
      } else if (strategy === "first") {
        g.concat[c] = all[0] ?? "";
      } else if (strategy === "last") {
        g.concat[c] = all[all.length - 1] ?? "";
      } else if (strategy === "min") {
        g.concat[c] = all.slice().sort()[0] ?? "";
      } else if (strategy === "max") {
        g.concat[c] = all.slice().sort().reverse()[0] ?? "";
      } else if (strategy === "all") {
        g.concat[c] = all.join(", ");
      } else {
        g.concat[c] = Array.from(new Set(all)).join(", ");
      }
    }
  }
  return Array.from(map.values());
}

// Visual rule: for a given common-key (keyColumns), the compareColumns must
// have a single distinct value across all rows sharing that key. If any
// compareColumn diverges, the key is "inconsistent" and groups whose rawRows
// fall under that key get highlighted.
export interface VisualRule {
  id: string;
  name?: string;
  keyColumns: string[]; // parametro(s) comum(ns) usados como chave
  compareColumns: string[]; // parametros que devem ser iguais para a mesma chave
  color: string;
}

// Legacy shape support
interface LegacyVisualRule { id: string; column?: string; color: string; name?: string }

export function normalizeRule(r: VisualRule | LegacyVisualRule): VisualRule {
  const anyR = r as VisualRule & LegacyVisualRule;
  if (!anyR.keyColumns || !anyR.compareColumns) {
    return {
      id: anyR.id,
      name: anyR.name,
      color: anyR.color,
      keyColumns: [],
      compareColumns: anyR.column ? [anyR.column] : [],
    };
  }
  return anyR;
}

export function computeInconsistentKeys(rule: VisualRule, rows: Row[]): Set<string> {
  const bad = new Set<string>();
  if (!rule.keyColumns.length || !rule.compareColumns.length) return bad;
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const k = buildKey(rule.keyColumns, r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }
  for (const [k, grp] of groups) {
    for (const c of rule.compareColumns) {
      const set = new Set<string>();
      for (const r of grp) {
        const v = (r[c] ?? "").trim().toLowerCase();
        if (v) set.add(v);
      }
      if (set.size > 1) {
        bad.add(k);
        break;
      }
    }
  }
  return bad;
}

export function ruleMatchesGroup(
  rule: VisualRule,
  g: GroupedRow,
  badKeys: Set<string>,
): boolean {
  if (!rule.keyColumns.length || !rule.compareColumns.length) return false;
  for (const r of g.rawRows) {
    const k = buildKey(rule.keyColumns, r);
    if (badKeys.has(k)) return true;
  }
  return false;
}

// === Consolidated list ===

export interface ConsolidationConfig {
  referenceFile: string;
  fileColumn: string; // usually "Nome do arquivo"
  keyColumns: string[];
  paramColumns: string[];
  idCol?: string;
}

export interface ReferenceItem {
  key: string;
  keyValues: Record<string, string>;
  params: Record<string, string>; // canonical value per param
  quantity: number;
  ids: string[];
}

export type DivergenceStatus = "Conforme" | "Divergente" | "Faltando" | "Extra";

export interface DivergenceRow {
  file: string;
  key: string;
  keyValues: Record<string, string>;
  status: DivergenceStatus;
  diffs: Record<string, { ref: string; found: string }>;
  ids: string[];
  quantity: number;
}

export interface ConsolidationResult {
  reference: ReferenceItem[];
  divergencesByFile: Record<string, DivergenceRow[]>;
  summary: { file: string; conformes: number; divergentes: number; faltando: number; extra: number }[];
}

const buildKey = (cols: string[], r: Row) =>
  cols.map((c) => (r[c] ?? "").trim()).join("\u0001");

const canonical = (rows: Row[], col: string): string => {
  const set = new Set<string>();
  for (const r of rows) {
    const v = (r[col] ?? "").trim();
    if (v) set.add(v);
  }
  if (set.size === 0) return "";
  // Pick most frequent
  const counts = new Map<string, number>();
  for (const r of rows) {
    const v = (r[col] ?? "").trim();
    if (!v) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  let best = "";
  let bestN = -1;
  for (const [v, n] of counts) {
    if (n > bestN) {
      best = v;
      bestN = n;
    }
  }
  return best;
};

const eqVal = (a: string, b: string) =>
  (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

export function buildConsolidation(
  rows: Row[],
  cfg: ConsolidationConfig,
): ConsolidationResult {
  const idCol = cfg.idCol ?? "ID";
  const refRows = rows.filter((r) => r[cfg.fileColumn] === cfg.referenceFile);

  // Build reference map keyed by composite key
  const refMap = new Map<string, ReferenceItem>();
  const refGroupRows = new Map<string, Row[]>();
  for (const r of refRows) {
    const key = buildKey(cfg.keyColumns, r);
    if (!refGroupRows.has(key)) refGroupRows.set(key, []);
    refGroupRows.get(key)!.push(r);
  }
  for (const [key, grp] of refGroupRows) {
    const keyValues: Record<string, string> = {};
    for (const c of cfg.keyColumns) keyValues[c] = (grp[0][c] ?? "").trim();
    const params: Record<string, string> = {};
    for (const c of cfg.paramColumns) params[c] = canonical(grp, c);
    refMap.set(key, {
      key,
      keyValues,
      params,
      quantity: grp.length,
      ids: grp.map((r) => r[idCol]).filter(Boolean),
    });
  }

  // Process other files
  const filesSet = new Set<string>();
  for (const r of rows) {
    const f = r[cfg.fileColumn];
    if (f && f !== cfg.referenceFile) filesSet.add(f);
  }

  const divergencesByFile: Record<string, DivergenceRow[]> = {};
  const summary: ConsolidationResult["summary"] = [];

  for (const file of filesSet) {
    const fileRows = rows.filter((r) => r[cfg.fileColumn] === file);
    const fileGroups = new Map<string, Row[]>();
    for (const r of fileRows) {
      const key = buildKey(cfg.keyColumns, r);
      if (!fileGroups.has(key)) fileGroups.set(key, []);
      fileGroups.get(key)!.push(r);
    }

    const out: DivergenceRow[] = [];
    let conformes = 0,
      divergentes = 0,
      faltando = 0,
      extra = 0;

    // Keys from reference
    for (const [key, ref] of refMap) {
      const grp = fileGroups.get(key);
      if (!grp) {
        faltando++;
        out.push({
          file,
          key,
          keyValues: ref.keyValues,
          status: "Faltando",
          diffs: {},
          ids: [],
          quantity: 0,
        });
        continue;
      }
      const diffs: Record<string, { ref: string; found: string }> = {};
      for (const c of cfg.paramColumns) {
        const found = canonical(grp, c);
        if (!eqVal(ref.params[c] ?? "", found)) {
          diffs[c] = { ref: ref.params[c] ?? "", found };
        }
      }
      const keyValues: Record<string, string> = {};
      for (const c of cfg.keyColumns) keyValues[c] = (grp[0][c] ?? "").trim();
      const status: DivergenceStatus =
        Object.keys(diffs).length > 0 ? "Divergente" : "Conforme";
      if (status === "Conforme") conformes++;
      else divergentes++;
      out.push({
        file,
        key,
        keyValues,
        status,
        diffs,
        ids: grp.map((r) => r[idCol]).filter(Boolean),
        quantity: grp.length,
      });
    }
    // Extra keys (in file, not in reference)
    for (const [key, grp] of fileGroups) {
      if (refMap.has(key)) continue;
      const keyValues: Record<string, string> = {};
      for (const c of cfg.keyColumns) keyValues[c] = (grp[0][c] ?? "").trim();
      extra++;
      out.push({
        file,
        key,
        keyValues,
        status: "Extra",
        diffs: {},
        ids: grp.map((r) => r[idCol]).filter(Boolean),
        quantity: grp.length,
      });
    }
    divergencesByFile[file] = out;
    summary.push({ file, conformes, divergentes, faltando, extra });
  }

  return {
    reference: Array.from(refMap.values()),
    divergencesByFile,
    summary,
  };
}

// === Auditoria BIM ===

export interface AuditRule {
  id: string;
  name: string;
  groupBy: string[]; // common parameters that should be equal
  compareCols: string[]; // params that should be consistent within group
}

export interface AuditFinding {
  ruleId: string;
  ruleName: string;
  groupKey: string;
  groupValues: Record<string, string>;
  inconsistentColumn: string;
  values: string[];
  ids: string[];
}

export function runAudit(rows: Row[], rules: AuditRule[], idCol = "ID"): AuditFinding[] {
  const findings: AuditFinding[] = [];
  for (const rule of rules) {
    if (!rule.groupBy.length || !rule.compareCols.length) continue;
    const groups = new Map<string, Row[]>();
    for (const r of rows) {
      const key = buildKey(rule.groupBy, r);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }
    for (const [key, grp] of groups) {
      for (const c of rule.compareCols) {
        const distinct = new Set<string>();
        for (const r of grp) {
          const v = (r[c] ?? "").trim();
          if (v) distinct.add(v);
        }
        if (distinct.size > 1) {
          const groupValues: Record<string, string> = {};
          for (const k of rule.groupBy) groupValues[k] = (grp[0][k] ?? "").trim();
          findings.push({
            ruleId: rule.id,
            ruleName: rule.name,
            groupKey: key,
            groupValues,
            inconsistentColumn: c,
            values: Array.from(distinct),
            ids: grp.map((r) => r[idCol]).filter(Boolean),
          });
        }
      }
    }
  }
  return findings;
}
