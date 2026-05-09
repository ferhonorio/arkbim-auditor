import type { Row } from "./parse";

export const DEFAULT_KEY_COLUMN = "Type Mark";
export const DEFAULT_FLOOR_COLUMN = "Nome do arquivo";
/** @deprecated Use list.keyColumn. Kept for retrocompat with old imports. */
export const KEY_COLUMN = DEFAULT_KEY_COLUMN;

export type MeasureMode = "count" | "area";

export interface FileOccurrence {
  floor: string; // value of floorColumn
  file: string; // source file (Nome do arquivo)
  quantity: number; // count OR sum of area
  ids: string[];
}

export interface ConsolidatedItem {
  key: string;
  params: Record<string, string>;
  columns: string[];
  occurrences: FileOccurrence[];
  totalQuantity: number;
  firstSeenAt: number;
  lastUpdatedAt: number;
}

export interface ConsolidationSnapshot {
  items: ConsolidatedItem[];
  sourceFiles: string[];
  savedAt: number;
  summary: { added: number; updated: number; skipped: number };
}

export interface ComponentList {
  id: string;
  name: string;
  icon?: string;
  fileColumn: string; // typically "Nome do arquivo"
  idCol: string;
  keyColumn: string;
  floorColumn: string;
  measureMode: MeasureMode;
  areaColumn?: string;
  columnAliases: Record<string, string>;
  columnWidths?: Record<string, number>;
  /** Map raw floor value (typically file name) to a friendly floor label. */
  floorAliases?: Record<string, string>;
  items: ConsolidatedItem[];
  sourceFiles: string[];
  createdAt: number;
  updatedAt: number;
  lastSnapshot?: ConsolidationSnapshot;
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
  invalidArea: number;
  newFiles: string[];
}

export function parseLocaleNumber(raw: string | undefined | null): number {
  if (raw == null) return NaN;
  let s = String(raw).trim();
  if (!s) return NaN;
  // Strip units like "m²", spaces
  s = s.replace(/[^\d,.\-+eE]/g, "");
  if (!s) return NaN;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    // Assume "1.234,56" → comma is decimal
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
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
  const keyCol = list.keyColumn || DEFAULT_KEY_COLUMN;
  const floorCol = list.floorColumn || list.fileColumn;
  const fileCol = list.fileColumn;
  const paramCols = columns.filter(
    (c) =>
      c &&
      c !== keyCol &&
      c !== fileCol &&
      c !== floorCol &&
      c !== list.areaColumn,
  );
  const buckets = new Map<string, Row[]>();
  let invalid = 0;
  for (const r of rows) {
    const k = (r[keyCol] ?? "").trim();
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
  let invalidArea = 0;

  const preview: ConsolidatedItem[] = [];
  const newItems: ConsolidatedItem[] = [];
  const conflicts: ConflictReport[] = [];
  const unchanged: ConsolidatedItem[] = [];

  for (const [key, grp] of buckets) {
    const params: Record<string, string> = {};
    for (const c of paramCols) params[c] = canonical(grp, c);

    // Group by floor + file to preserve provenance
    const byFloorFile = new Map<string, { floor: string; file: string; rows: Row[] }>();
    const aliases = list.floorAliases ?? {};
    for (const r of grp) {
      const rawFloor = (r[floorCol] ?? "").trim() || "(sem pavimento)";
      const floor = aliases[rawFloor] || rawFloor;
      const file = (r[fileCol] ?? "").trim() || "(sem arquivo)";
      const k = `${floor}\u0001${file}`;
      if (!byFloorFile.has(k)) byFloorFile.set(k, { floor, file, rows: [] });
      byFloorFile.get(k)!.rows.push(r);
      if (!knownFiles.has(file)) newFiles.add(file);
    }

    const occurrences: FileOccurrence[] = Array.from(byFloorFile.values()).map(
      ({ floor, file, rows: rs }) => {
        let quantity: number;
        if (list.measureMode === "area" && list.areaColumn) {
          let sum = 0;
          for (const r of rs) {
            const n = parseLocaleNumber(r[list.areaColumn]);
            if (Number.isFinite(n) && n > 0) sum += n;
            else invalidArea++;
          }
          quantity = Math.round(sum * 1000) / 1000;
        } else {
          quantity = rs.length;
        }
        return {
          floor,
          file,
          quantity,
          ids: rs.map((r) => r[list.idCol]).filter(Boolean),
        };
      },
    ).sort((a, b) =>
      a.floor.localeCompare(b.floor) || a.file.localeCompare(b.file),
    );

    const item: ConsolidatedItem = {
      key,
      params,
      columns: paramCols,
      occurrences,
      totalQuantity: Math.round(occurrences.reduce((s, o) => s + o.quantity, 0) * 1000) / 1000,
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
    invalidArea,
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

  const occKey = (o: FileOccurrence) => `${o.floor}\u0001${o.file}`;

  const mergeOccurrences = (prev: ConsolidatedItem, next: ConsolidatedItem) => {
    const byKey = new Map(prev.occurrences.map((o) => [occKey(o), o]));
    for (const o of next.occurrences) byKey.set(occKey(o), o);
    const occurrences = Array.from(byKey.values()).sort(
      (a, b) => a.floor.localeCompare(b.floor) || a.file.localeCompare(b.file),
    );
    return {
      occurrences,
      totalQuantity:
        Math.round(occurrences.reduce((s, o) => s + o.quantity, 0) * 1000) / 1000,
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
      map.set(item.key, {
        ...prev,
        ...occ,
        columns: mergeColumns(prev.columns, item.columns),
        lastUpdatedAt: now,
      });
      skipped++;
    } else {
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

/** Migration helper: ensure new fields exist on persisted lists. */
export function migrateComponentList(l: Partial<ComponentList> & { id: string; name: string }): ComponentList {
  const fileColumn = l.fileColumn || DEFAULT_FLOOR_COLUMN;
  const occMigrated = (l.items ?? []).map((i) => ({
    ...i,
    occurrences: (i.occurrences ?? []).map((o: FileOccurrence | { file: string; quantity: number; ids: string[] }) => ({
      floor: ("floor" in o && o.floor) ? o.floor : (o as { file: string }).file,
      file: o.file,
      quantity: o.quantity,
      ids: o.ids ?? [],
    })),
    columns: i.columns ?? [],
  }));
  return {
    id: l.id,
    name: l.name,
    icon: l.icon,
    fileColumn,
    idCol: l.idCol || "ID",
    keyColumn: l.keyColumn || DEFAULT_KEY_COLUMN,
    floorColumn: l.floorColumn || fileColumn,
    measureMode: l.measureMode || "count",
    areaColumn: l.areaColumn,
    columnAliases: l.columnAliases ?? {},
    columnWidths: l.columnWidths ?? {},
    floorAliases: l.floorAliases ?? {},
    items: occMigrated,
    sourceFiles: l.sourceFiles ?? [],
    createdAt: l.createdAt ?? Date.now(),
    updatedAt: l.updatedAt ?? Date.now(),
    lastSnapshot: l.lastSnapshot,
  };
}
