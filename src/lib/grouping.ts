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
export type VisualRuleApplyWhen = "inconsistent" | "consistent";
export type VisualRuleMatchMode = "any" | "all";

export interface VisualRule {
  id: string;
  name?: string;
  keyColumns: string[]; // parametro(s) comum(ns) usados como chave
  compareColumns: string[]; // parametros que devem ser iguais para a mesma chave
  color: string;
  // "inconsistent" (default): pinta quando a comparacao FALHA (valores divergem)
  // "consistent": pinta quando a comparacao PASSA (valores iguais)
  applyWhen?: VisualRuleApplyWhen;
  // "any" (default): basta UM compareColumn divergir para o grupo ser inconsistente
  // "all": só é inconsistente se TODOS os compareColumns divergirem
  matchMode?: VisualRuleMatchMode;
}

// Returns map of key -> { inconsistent: boolean; files: string[]; rows: Row[] }
export interface RuleKeyEval {
  inconsistent: boolean;
  files: string[];
  rowsCount: number;
  diffByColumn: Record<string, string[]>;
  keyValues: Record<string, string>;
}

export function evaluateRule(
  rule: VisualRule,
  rows: Row[],
  fileColumn = "Nome do arquivo",
): Map<string, RuleKeyEval> {
  const out = new Map<string, RuleKeyEval>();
  const keyCols = rule.keyColumns ?? [];
  const cmpCols = rule.compareColumns ?? [];
  if (!keyCols.length || !cmpCols.length) return out;
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const k = buildKey(keyCols, r);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }
  const matchMode: VisualRuleMatchMode = rule.matchMode ?? "any";
  for (const [k, grp] of groups) {
    const diffByColumn: Record<string, string[]> = {};
    let divergentCount = 0;
    for (const c of cmpCols) {
      const set = new Set<string>();
      for (const r of grp) {
        const v = (r[c] ?? "").trim();
        if (v) set.add(v);
      }
      if (set.size > 1) {
        divergentCount++;
        diffByColumn[c] = Array.from(set);
      }
    }
    const inconsistent =
      matchMode === "all"
        ? divergentCount === cmpCols.length && divergentCount > 0
        : divergentCount > 0;
    const filesSet = new Set<string>();
    for (const r of grp) {
      const f = (r[fileColumn] ?? "").trim();
      if (f) filesSet.add(f);
    }
    const keyValues: Record<string, string> = {};
    for (const c of keyCols) keyValues[c] = (grp[0][c] ?? "").trim();
    out.set(k, {
      inconsistent,
      files: Array.from(filesSet),
      rowsCount: grp.length,
      diffByColumn,
      keyValues,
    });
  }
  return out;
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

// Returns set of keys that "match" the rule for highlighting purposes.
// When applyWhen === "consistent", returns keys that are consistent (no diffs).
// When applyWhen === "inconsistent" (default), returns keys with diffs.
export function computeMatchingKeys(rule: VisualRule, rows: Row[]): Set<string> {
  const out = new Set<string>();
  const evals = evaluateRule(rule, rows);
  const wantInconsistent = (rule.applyWhen ?? "inconsistent") === "inconsistent";
  for (const [k, ev] of evals) {
    if (wantInconsistent ? ev.inconsistent : !ev.inconsistent) out.add(k);
  }
  return out;
}

// Backwards-compatible alias
export const computeInconsistentKeys = computeMatchingKeys;

export function ruleMatchesGroup(
  rule: VisualRule,
  g: GroupedRow,
  matchingKeys: Set<string>,
): boolean {
  const keyCols = rule.keyColumns ?? [];
  const cmpCols = rule.compareColumns ?? [];
  if (!keyCols.length || !cmpCols.length) return false;
  for (const r of g.rawRows) {
    const k = buildKey(keyCols, r);
    if (matchingKeys.has(k)) return true;
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
  files: string[]; // arquivos onde a inconsistencia ocorre
  valuesByFile: Record<string, string[]>; // file -> distinct values
}

export function runAudit(
  rows: Row[],
  rules: AuditRule[],
  idCol = "ID",
  fileColumn = "Nome do arquivo",
): AuditFinding[] {
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
          const valuesByFile: Record<string, string[]> = {};
          for (const r of grp) {
            const f = (r[fileColumn] ?? "").trim() || "(sem arquivo)";
            const v = (r[c] ?? "").trim();
            if (!v) continue;
            if (!valuesByFile[f]) valuesByFile[f] = [];
            if (!valuesByFile[f].includes(v)) valuesByFile[f].push(v);
          }
          findings.push({
            ruleId: rule.id,
            ruleName: rule.name,
            groupKey: key,
            groupValues,
            inconsistentColumn: c,
            values: Array.from(distinct),
            ids: grp.map((r) => r[idCol]).filter(Boolean),
            files: Object.keys(valuesByFile),
            valuesByFile,
          });
        }
      }
    }
  }
  return findings;
}


// === Consolidated comparison (against frozen snapshot) ===

export interface ConsolidatedFinding {
  file: string;
  status: DivergenceStatus;
  key: string;
  keyValues: Record<string, string>;
  column?: string;
  expected?: string;
  found?: string;
  ids: string[];
}

export interface ConsolidatedComparison {
  findings: ConsolidatedFinding[];
  summary: { file: string; conformes: number; divergentes: number; faltando: number; extra: number }[];
  totals: { conformes: number; divergentes: number; faltando: number; extra: number };
}

export function compareToConsolidated(
  rows: Row[],
  snapshot: { reference: ReferenceItem[]; cfg: ConsolidationConfig },
  idCol = "ID",
): ConsolidatedComparison {
  const { cfg, reference } = snapshot;
  const fileColumn = cfg.fileColumn;
  const refMap = new Map<string, ReferenceItem>();
  for (const r of reference) refMap.set(r.key, r);

  const filesSet = new Set<string>();
  for (const r of rows) {
    const f = r[fileColumn];
    if (f) filesSet.add(f);
  }

  const findings: ConsolidatedFinding[] = [];
  const summary: ConsolidatedComparison["summary"] = [];
  const totals = { conformes: 0, divergentes: 0, faltando: 0, extra: 0 };

  for (const file of filesSet) {
    const fileRows = rows.filter((r) => r[fileColumn] === file);
    const groups = new Map<string, Row[]>();
    for (const r of fileRows) {
      const key = buildKey(cfg.keyColumns, r);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }
    let conformes = 0, divergentes = 0, faltando = 0, extra = 0;
    for (const [key, ref] of refMap) {
      const grp = groups.get(key);
      if (!grp) {
        faltando++;
        findings.push({
          file, status: "Faltando", key, keyValues: ref.keyValues, ids: [],
        });
        continue;
      }
      const diffs: Array<[string, string, string]> = [];
      for (const c of cfg.paramColumns) {
        const found = canonical(grp, c);
        if (!eqVal(ref.params[c] ?? "", found)) {
          diffs.push([c, ref.params[c] ?? "", found]);
        }
      }
      if (diffs.length === 0) {
        conformes++;
      } else {
        divergentes++;
        for (const [col, expected, found] of diffs) {
          findings.push({
            file, status: "Divergente", key, keyValues: ref.keyValues,
            column: col, expected, found,
            ids: grp.map((r) => r[idCol]).filter(Boolean),
          });
        }
      }
    }
    for (const [key, grp] of groups) {
      if (refMap.has(key)) continue;
      extra++;
      const keyValues: Record<string, string> = {};
      for (const c of cfg.keyColumns) keyValues[c] = (grp[0][c] ?? "").trim();
      findings.push({
        file, status: "Extra", key, keyValues,
        ids: grp.map((r) => r[idCol]).filter(Boolean),
      });
    }
    summary.push({ file, conformes, divergentes, faltando, extra });
    totals.conformes += conformes;
    totals.divergentes += divergentes;
    totals.faltando += faltando;
    totals.extra += extra;
  }
  return { findings, summary, totals };
}

// Filter rows that match any active visual rule (according to applyWhen).
export function filterRowsByVisualRules(rows: Row[], rules: VisualRule[]): Row[] {
  const active = rules.filter(
    (r) => (r.keyColumns?.length ?? 0) > 0 && (r.compareColumns?.length ?? 0) > 0,
  );
  if (!active.length) return rows;
  const matchingByRule = active.map((r) => ({
    keyCols: r.keyColumns,
    keys: computeMatchingKeys(r, rows),
  }));
  return rows.filter((r) =>
    matchingByRule.some(({ keyCols, keys }) => keys.has(buildKey(keyCols, r))),
  );
}
