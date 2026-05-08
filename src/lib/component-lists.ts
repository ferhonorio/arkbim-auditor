import type { Row } from "./parse";
import { applyFilters, type Filter } from "./grouping";

export interface FileOccurrence {
  file: string;
  quantity: number;
  ids: string[];
}

export interface ConsolidatedItem {
  key: string;
  keyValues: Record<string, string>;
  params: Record<string, string>;
  occurrences: FileOccurrence[];
  totalQuantity: number;
  firstSeenAt: number;
  lastUpdatedAt: number;
}

export interface ComponentList {
  id: string;
  name: string;
  icon?: string;
  filters: Filter[];
  excludeFilters: Filter[];
  keyColumns: string[];
  paramColumns: string[];
  fileColumn: string;
  idCol: string;
  columnAliases: Record<string, string>;
  items: ConsolidatedItem[];
  sourceFiles: string[];
  createdAt: number;
  updatedAt: number;
}

export type ConsolidationMode = "merge" | "replace" | "only-new" | "ignore-conflicts";

const buildKey = (cols: string[], r: Row) =>
  cols.map((c) => (r[c] ?? "").trim()).join("\u0001");

const norm = (v: string) => (v ?? "").trim().toLowerCase();

// Inverse of applyFilters: keep rows that DON'T match any of the exclude filters.
// An exclude filter is a positive condition that, when matched, removes the row.
export function applyExcludeFilters(rows: Row[], excludes: Filter[]): Row[] {
  if (!excludes.length) return rows;
  return rows.filter((r) => {
    // row passes if it does NOT satisfy ANY exclude filter
    for (const f of excludes) {
      if (!f.column) continue;
      const matched = applyFilters([r], [f]).length > 0;
      if (matched) return false;
    }
    return true;
  });
}

export function selectListRows(rows: Row[], list: ComponentList): Row[] {
  let out = applyFilters(rows, list.filters);
  out = applyExcludeFilters(out, list.excludeFilters);
  return out;
}

const canonical = (rows: Row[], col: string): string => {
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

export interface PreviewItem extends ConsolidatedItem {
  conflicts: Record<string, string[]>; // param -> distinct values when >1
}

// Build a "preview" of what a consolidation would produce from rows alone,
// without merging with existing items.
export function previewConsolidation(
  rows: Row[],
  list: ComponentList,
): PreviewItem[] {
  const selected = selectListRows(rows, list);
  const buckets = new Map<string, Row[]>();
  for (const r of selected) {
    const k = buildKey(list.keyColumns, r);
    if (!k.replaceAll("\u0001", "").trim()) continue;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(r);
  }
  const now = Date.now();
  const out: PreviewItem[] = [];
  for (const [key, grp] of buckets) {
    const keyValues: Record<string, string> = {};
    for (const c of list.keyColumns) keyValues[c] = (grp[0][c] ?? "").trim();

    const params: Record<string, string> = {};
    const conflicts: Record<string, string[]> = {};
    for (const c of list.paramColumns) {
      params[c] = canonical(grp, c);
      const distinct = new Set<string>();
      for (const r of grp) {
        const v = (r[c] ?? "").trim();
        if (v) distinct.add(v);
      }
      if (distinct.size > 1) conflicts[c] = Array.from(distinct);
    }

    const byFile = new Map<string, Row[]>();
    for (const r of grp) {
      const f = (r[list.fileColumn] ?? "").trim() || "(sem arquivo)";
      if (!byFile.has(f)) byFile.set(f, []);
      byFile.get(f)!.push(r);
    }
    const occurrences: FileOccurrence[] = Array.from(byFile, ([file, rs]) => ({
      file,
      quantity: rs.length,
      ids: rs.map((r) => r[list.idCol]).filter(Boolean),
    })).sort((a, b) => a.file.localeCompare(b.file));

    out.push({
      key,
      keyValues,
      params,
      occurrences,
      totalQuantity: occurrences.reduce((s, o) => s + o.quantity, 0),
      firstSeenAt: now,
      lastUpdatedAt: now,
      conflicts,
    });
  }
  out.sort((a, b) => {
    for (const c of Object.keys(a.keyValues)) {
      const cmp = (a.keyValues[c] ?? "").localeCompare(b.keyValues[c] ?? "", undefined, {
        numeric: true,
        sensitivity: "base",
      });
      if (cmp !== 0) return cmp;
    }
    return 0;
  });
  return out;
}

export function distinctFiles(rows: Row[], fileColumn: string): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    const f = (r[fileColumn] ?? "").trim();
    if (f) set.add(f);
  }
  return Array.from(set).sort();
}

export interface ConsolidateOutcome {
  items: ConsolidatedItem[];
  added: number;
  updated: number;
  unchanged: number;
  newFiles: string[];
}

// Merge a fresh preview into existing items per the selected mode.
export function consolidateRows(
  rows: Row[],
  list: ComponentList,
  mode: ConsolidationMode,
): ConsolidateOutcome {
  const fresh = previewConsolidation(rows, list);
  const existing = new Map(list.items.map((i) => [i.key, { ...i }]));
  const knownFiles = new Set(list.sourceFiles);
  const seenNewFiles = new Set<string>();
  let added = 0;
  let updated = 0;
  let unchanged = 0;
  const now = Date.now();

  for (const f of fresh) {
    for (const o of f.occurrences) {
      if (!knownFiles.has(o.file)) seenNewFiles.add(o.file);
    }

    const prev = existing.get(f.key);
    if (!prev) {
      // brand new item
      const { conflicts: _c, ...item } = f;
      existing.set(f.key, item);
      added++;
      continue;
    }

    if (mode === "only-new") {
      unchanged++;
      continue;
    }

    // Merge occurrences: replace per-file, preserve other files
    const occByFile = new Map(prev.occurrences.map((o) => [o.file, o]));
    for (const o of f.occurrences) occByFile.set(o.file, o);
    const occurrences = Array.from(occByFile.values()).sort((a, b) =>
      a.file.localeCompare(b.file),
    );

    let params = prev.params;
    if (mode === "merge") {
      // merge: prefer fresh value when present and different
      params = { ...prev.params };
      for (const c of list.paramColumns) {
        const v = f.params[c];
        if (v) params[c] = v;
      }
    } else if (mode === "replace") {
      params = { ...prev.params, ...f.params };
    } else if (mode === "ignore-conflicts") {
      // keep prev params untouched, only refresh occurrences
      params = prev.params;
    }

    existing.set(f.key, {
      ...prev,
      keyValues: f.keyValues,
      params,
      occurrences,
      totalQuantity: occurrences.reduce((s, o) => s + o.quantity, 0),
      lastUpdatedAt: now,
    });
    updated++;
  }

  return {
    items: Array.from(existing.values()),
    added,
    updated,
    unchanged,
    newFiles: Array.from(seenNewFiles),
  };
}

// Detect files in current dataset not yet consolidated into `list`.
export function detectNewFiles(rows: Row[], list: ComponentList): string[] {
  const all = distinctFiles(rows, list.fileColumn);
  const known = new Set(list.sourceFiles);
  return all.filter((f) => !known.has(f));
}
