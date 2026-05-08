import type { Row } from "./parse";

export const KEY_COLUMN = "Type Mark";

export interface FileOccurrence {
  file: string;
  quantity: number;
  ids: string[];
}

export interface ConsolidatedItem {
  key: string; // Type Mark value
  params: Record<string, string>;
  columns: string[]; // columns saved when item was last consolidated
  occurrences: FileOccurrence[];
  totalQuantity: number;
  firstSeenAt: number;
  lastUpdatedAt: number;
}

export interface ComponentList {
  id: string;
  name: string; // category name
  icon?: string;
  fileColumn: string;
  idCol: string;
  columnAliases: Record<string, string>;
  items: ConsolidatedItem[];
  sourceFiles: string[];
  createdAt: number;
  updatedAt: number;
}

export type ConsolidationMode = "overwrite" | "only-new";

export interface ConflictReport {
  typeMark: string;
  existing: Record<string, string>;
  incoming: Record<string, string>;
  differingCols: string[];
}

export interface ConsolidatePlan {
  preview: ConsolidatedItem[];
  newItems: ConsolidatedItem[];
  conflicts: ConflictReport[];
  unchanged: ConsolidatedItem[];
  invalidRows: number;
  newFiles: string[];
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

export function planConsolidation(
  rows: Row[],
  columns: string[],
  list: ComponentList,
): ConsolidatePlan {
  // Param columns: everything from `columns` except Type Mark and the file column
  const paramCols = columns.filter(
    (c) => c && c !== KEY_COLUMN && c !== list.fileColumn,
  );
  const buckets = new Map<string, Row[]>();
  let invalid = 0;
  for (const r of rows) {
    const k = (r[KEY_COLUMN] ?? "").trim();
    if (!k) {
      invalid++;
      continue;
    }
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(r);
  }

  const now = Date.now();
  const existingByKey = new Map(list.items.map((i) => [i.key, i]));
  const knownFiles = new Set(list.sourceFiles);
  const newFiles = new Set<string>();

  const preview: ConsolidatedItem[] = [];
  const newItems: ConsolidatedItem[] = [];
  const conflicts: ConflictReport[] = [];
  const unchanged: ConsolidatedItem[] = [];

  for (const [key, grp] of buckets) {
    const params: Record<string, string> = {};
    for (const c of paramCols) params[c] = canonical(grp, c);

    const byFile = new Map<string, Row[]>();
    for (const r of grp) {
      const f = (r[list.fileColumn] ?? "").trim() || "(sem arquivo)";
      if (!byFile.has(f)) byFile.set(f, []);
      byFile.get(f)!.push(r);
    }
    for (const f of byFile.keys()) if (!knownFiles.has(f)) newFiles.add(f);
    const occurrences: FileOccurrence[] = Array.from(byFile, ([file, rs]) => ({
      file,
      quantity: rs.length,
      ids: rs.map((r) => r[list.idCol]).filter(Boolean),
    })).sort((a, b) => a.file.localeCompare(b.file));

    const item: ConsolidatedItem = {
      key,
      params,
      columns: paramCols,
      occurrences,
      totalQuantity: occurrences.reduce((s, o) => s + o.quantity, 0),
      firstSeenAt: now,
      lastUpdatedAt: now,
    };
    preview.push(item);

    const prev = existingByKey.get(key);
    if (!prev) {
      newItems.push(item);
    } else {
      const differing: string[] = [];
      for (const c of paramCols) {
        const v = item.params[c] ?? "";
        const old = prev.params[c] ?? "";
        if (v && old && v !== old) differing.push(c);
      }
      if (differing.length) {
        conflicts.push({
          typeMark: key,
          existing: prev.params,
          incoming: item.params,
          differingCols: differing,
        });
      } else {
        unchanged.push(item);
      }
    }
  }

  preview.sort((a, b) =>
    a.key.localeCompare(b.key, undefined, { numeric: true, sensitivity: "base" }),
  );

  return {
    preview,
    newItems,
    conflicts,
    unchanged,
    invalidRows: invalid,
    newFiles: Array.from(newFiles),
  };
}

export interface CommitOutcome {
  items: ConsolidatedItem[];
  added: number;
  updated: number;
  skipped: number;
  newFiles: string[];
}

export function commitConsolidation(
  list: ComponentList,
  plan: ConsolidatePlan,
  mode: ConsolidationMode,
): CommitOutcome {
  const map = new Map(list.items.map((i) => [i.key, { ...i }]));
  const now = Date.now();
  let added = 0;
  let updated = 0;
  let skipped = 0;

  const mergeOccurrences = (prev: ConsolidatedItem, next: ConsolidatedItem) => {
    const byFile = new Map(prev.occurrences.map((o) => [o.file, o]));
    for (const o of next.occurrences) byFile.set(o.file, o);
    const occurrences = Array.from(byFile.values()).sort((a, b) =>
      a.file.localeCompare(b.file),
    );
    return {
      occurrences,
      totalQuantity: occurrences.reduce((s, o) => s + o.quantity, 0),
    };
  };

  const mergeColumns = (a: string[], b: string[]) =>
    Array.from(new Set([...a, ...b]));

  for (const item of plan.preview) {
    const prev = map.get(item.key);
    if (!prev) {
      map.set(item.key, item);
      added++;
      continue;
    }
    const occ = mergeOccurrences(prev, item);
    if (mode === "only-new") {
      // keep params untouched, but always update occurrences history
      map.set(item.key, {
        ...prev,
        ...occ,
        columns: mergeColumns(prev.columns, item.columns),
        lastUpdatedAt: now,
      });
      skipped++;
    } else {
      // overwrite params (only for differing/incoming non-empty values)
      const params = { ...prev.params };
      for (const c of item.columns) {
        const v = item.params[c];
        if (v) params[c] = v;
      }
      map.set(item.key, {
        ...prev,
        params,
        columns: mergeColumns(prev.columns, item.columns),
        ...occ,
        lastUpdatedAt: now,
      });
      updated++;
    }
  }

  return {
    items: Array.from(map.values()),
    added,
    updated,
    skipped,
    newFiles: plan.newFiles,
  };
}
