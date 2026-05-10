import type { Row } from "./parse";

export const DEFAULT_KEY_COLUMN = "Type Mark";
export const DEFAULT_FLOOR_COLUMN = "Nome do arquivo";
/** @deprecated Use list.keyColumn. Kept for retrocompat with old imports. */
export const KEY_COLUMN = DEFAULT_KEY_COLUMN;

export type MeasureMode = "count" | "area";

export interface FileOccurrence {
  /** Raw value coming from `floorColumn` — TECHNICAL IDENTITY of the floor.
   *  Aliases/friendly names live in `list.floorAliases` and are applied for
   *  display only. Never used as part of any de-dup key. */
  floorSource: string;
  /** @deprecated Mantido somente para leitura de dados antigos. Sempre derive
   *  o display via `displayFloor(list, occ.floorSource)`. */
  floor?: string;
  file: string;
  quantity: number;
  ids: string[];
}

export interface ConsolidatedItem {
  key: string;
  params: Record<string, string>;
  /** Columns marked as edited manually by the user. Protected from overwrite
   *  during reconsolidation (mode "overwrite") and never auto-filled in
   *  "only-new". */
  editedParams?: Record<string, true>;
  /** Whether the key itself was renamed manually. */
  editedKey?: true;
  /** Timestamp of the last manual edit (audit). */
  manuallyEditedAt?: number;
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
  /** Map RAW floor source value → friendly floor label (display only). */
  floorAliases?: Record<string, string>;
  items: ConsolidatedItem[];
  sourceFiles: string[];
  createdAt: number;
  updatedAt: number;
  lastSnapshot?: ConsolidationSnapshot;
  /** Schema-version stamp. v1+ uses `floorSource` as canonical identity. */
  schemaVersion?: number;
}

export const CURRENT_LIST_SCHEMA = 1;

export type ConsolidationMode = "overwrite" | "only-new";

export interface ConflictReport {
  typeMark: string;
  existing: Record<string, string>;
  incoming: Record<string, string>;
  differingCols: string[];
  /** Subset of `differingCols` that will be PROTECTED (not overwritten) because
   *  the user already edited them manually. */
  protectedCols: string[];
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
  s = s.replace(/[^\d,.\-+eE]/g, "");
  if (!s) return NaN;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
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

/** Friendly display name for a floor source, falling back to the raw value. */
export function displayFloor(
  list: Pick<ComponentList, "floorAliases">,
  source: string,
): string {
  const a = list.floorAliases?.[source];
  return (a && a.trim()) || source;
}

/** Read the floor identity from any occurrence shape (handles legacy `floor`). */
export function getFloorSource(o: FileOccurrence): string {
  return o.floorSource || o.floor || "";
}

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

    // Group by RAW floor source + file to preserve technical identity.
    const byFloorFile = new Map<
      string,
      { floorSource: string; file: string; rows: Row[] }
    >();
    for (const r of grp) {
      const floorSource = (r[floorCol] ?? "").trim() || "(sem pavimento)";
      const file = (r[fileCol] ?? "").trim() || "(sem arquivo)";
      const k = `${floorSource}\u0001${file}`;
      if (!byFloorFile.has(k))
        byFloorFile.set(k, { floorSource, file, rows: [] });
      byFloorFile.get(k)!.rows.push(r);
      if (!knownFiles.has(file)) newFiles.add(file);
    }

    const occurrences: FileOccurrence[] = Array.from(byFloorFile.values())
      .map(({ floorSource, file, rows: rs }) => {
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
          floorSource,
          file,
          quantity,
          ids: rs.map((r) => r[list.idCol]).filter(Boolean),
        };
      })
      .sort(
        (a, b) =>
          a.floorSource.localeCompare(b.floorSource) ||
          a.file.localeCompare(b.file),
      );

    const item: ConsolidatedItem = {
      key,
      params,
      columns: paramCols,
      occurrences,
      totalQuantity:
        Math.round(occurrences.reduce((s, o) => s + o.quantity, 0) * 1000) /
        1000,
      firstSeenAt: now,
      lastUpdatedAt: now,
    };
    preview.push(item);

    const prev = existingByKey.get(key);
    if (!prev) {
      newItems.push(item);
    } else {
      const differing: string[] = [];
      const protectedCols: string[] = [];
      for (const c of paramCols) {
        const v = item.params[c] ?? "";
        const old = prev.params[c] ?? "";
        if (v && old && v !== old) {
          differing.push(c);
          if (prev.editedParams?.[c]) protectedCols.push(c);
        }
      }
      if (differing.length) {
        conflicts.push({
          typeMark: key,
          existing: prev.params,
          incoming: item.params,
          differingCols: differing,
          protectedCols,
        });
      } else {
        unchanged.push(item);
      }
    }
  }

  preview.sort((a, b) =>
    a.key.localeCompare(b.key, undefined, {
      numeric: true,
      sensitivity: "base",
    }),
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
  protectedCount: number;
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
  let protectedCount = 0;

  const occKey = (o: FileOccurrence) => `${getFloorSource(o)}\u0001${o.file}`;

  /** Merge incoming occurrences into prev. Same (floorSource,file) pairs are
   *  REPLACED by the incoming version (re-import is the authoritative recount).
   *  This makes partial reconsolidation safe: never duplicates. */
  const mergeOccurrences = (
    prev: ConsolidatedItem,
    next: ConsolidatedItem,
  ) => {
    const byKey = new Map(prev.occurrences.map((o) => [occKey(o), o]));
    for (const o of next.occurrences) byKey.set(occKey(o), o);
    const occurrences = Array.from(byKey.values()).sort(
      (a, b) =>
        getFloorSource(a).localeCompare(getFloorSource(b)) ||
        a.file.localeCompare(b.file),
    );
    return {
      occurrences,
      totalQuantity:
        Math.round(occurrences.reduce((s, o) => s + o.quantity, 0) * 1000) /
        1000,
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
      // Never touches params. Only fills params that were never set before AND
      // not marked as manually edited.
      const params = { ...prev.params };
      const edited = prev.editedParams ?? {};
      for (const c of item.columns) {
        const v = item.params[c];
        if (!v) continue;
        if (edited[c]) continue;
        if (params[c]) continue;
        params[c] = v;
      }
      map.set(item.key, {
        ...prev,
        params,
        ...occ,
        columns: mergeColumns(prev.columns, item.columns),
        lastUpdatedAt: now,
      });
      skipped++;
    } else {
      const params = { ...prev.params };
      const edited = prev.editedParams ?? {};
      for (const c of item.columns) {
        const v = item.params[c];
        if (!v) continue;
        if (edited[c] && params[c]) {
          // Protected: keep manual edit. Count once per column.
          protectedCount++;
          continue;
        }
        params[c] = v;
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
    protectedCount,
    newFiles: plan.newFiles,
  };
}

/** Check whether an item has any manual-edit / protection marker. */
export function isItemProtected(i: ConsolidatedItem): boolean {
  if (i.editedKey) return true;
  if (i.manuallyEditedAt) return true;
  if (i.editedParams && Object.keys(i.editedParams).length > 0) return true;
  return false;
}

export interface RemoveFloorOutcome {
  itemsAffected: number;
  itemsRemoved: number;
  itemsKeptZeroed: number;
  quantityRemoved: number;
  filesRemoved: string[];
}

/** Remove all occurrences whose floorSource matches `floorSource`. Items that
 *  end up with no occurrences are removed ONLY if their key is in `dropKeys`
 *  AND they have no protection markers. Returns a summary. */
export function removeFloorFromListData(
  list: ComponentList,
  floorSource: string,
  opts: { dropKeys?: Set<string> } = {},
): { list: ComponentList; outcome: RemoveFloorOutcome } {
  const dropKeys = opts.dropKeys ?? new Set<string>();
  let itemsAffected = 0;
  let itemsRemoved = 0;
  let itemsKeptZeroed = 0;
  let quantityRemoved = 0;

  const next: ConsolidatedItem[] = [];
  for (const i of list.items) {
    const before = i.occurrences;
    const after = before.filter((o) => getFloorSource(o) !== floorSource);
    if (after.length === before.length) {
      next.push(i);
      continue;
    }
    itemsAffected++;
    for (const o of before) {
      if (getFloorSource(o) === floorSource) quantityRemoved += o.quantity;
    }
    if (after.length === 0) {
      const protectedItem = isItemProtected(i);
      if (!protectedItem && dropKeys.has(i.key)) {
        itemsRemoved++;
        continue;
      }
      itemsKeptZeroed++;
      next.push({
        ...i,
        occurrences: [],
        totalQuantity: 0,
        lastUpdatedAt: Date.now(),
      });
    } else {
      next.push({
        ...i,
        occurrences: after,
        totalQuantity:
          Math.round(after.reduce((s, o) => s + o.quantity, 0) * 1000) / 1000,
        lastUpdatedAt: Date.now(),
      });
    }
  }

  // Recompute sourceFiles based on what remains.
  const stillUsed = new Set<string>();
  for (const i of next) for (const o of i.occurrences) stillUsed.add(o.file);
  const filesRemoved = list.sourceFiles.filter((f) => !stillUsed.has(f));
  const sourceFiles = list.sourceFiles.filter((f) => stillUsed.has(f));

  quantityRemoved = Math.round(quantityRemoved * 1000) / 1000;

  return {
    list: { ...list, items: next, sourceFiles, updatedAt: Date.now() },
    outcome: {
      itemsAffected,
      itemsRemoved,
      itemsKeptZeroed,
      quantityRemoved,
      filesRemoved,
    },
  };
}

/** Aggregate occurrences by `floorSource` for the Pavimentos panel. */
export interface FloorAggregate {
  floorSource: string;
  display: string;
  itemCount: number;
  totalQuantity: number;
}
export function aggregateFloors(list: ComponentList): FloorAggregate[] {
  const m = new Map<string, { count: number; qty: number }>();
  for (const i of list.items) {
    const seen = new Set<string>();
    for (const o of i.occurrences) {
      const src = getFloorSource(o);
      if (!src) continue;
      const cur = m.get(src) ?? { count: 0, qty: 0 };
      cur.qty += o.quantity;
      if (!seen.has(src)) {
        cur.count += 1;
        seen.add(src);
      }
      m.set(src, cur);
    }
  }
  return Array.from(m, ([floorSource, v]) => ({
    floorSource,
    display: displayFloor(list, floorSource),
    itemCount: v.count,
    totalQuantity: Math.round(v.qty * 1000) / 1000,
  })).sort((a, b) => a.display.localeCompare(b.display));
}

/** Migration helper: ensures new fields exist on persisted lists. Idempotent. */
export function migrateComponentList(
  l: Partial<ComponentList> & { id: string; name: string },
): ComponentList {
  const fileColumn = l.fileColumn || DEFAULT_FLOOR_COLUMN;
  const aliases = l.floorAliases ?? {};
  // Reverse map: if a legacy `o.floor` matches an alias VALUE, recover the raw
  // source key. Otherwise treat the legacy `o.floor` as already-source.
  const aliasReverse = new Map<string, string>();
  for (const [src, val] of Object.entries(aliases)) {
    if (val && !aliasReverse.has(val)) aliasReverse.set(val, src);
  }

  const occMigrated = (l.items ?? []).map((i) => {
    const occurrences = (i.occurrences ?? []).map((o) => {
      const anyO = o as Partial<FileOccurrence> & { file?: string };
      let floorSource = anyO.floorSource || "";
      if (!floorSource) {
        const legacyFloor = anyO.floor || "";
        if (legacyFloor && aliasReverse.has(legacyFloor)) {
          floorSource = aliasReverse.get(legacyFloor)!;
        } else {
          floorSource = legacyFloor || anyO.file || "";
        }
      }
      return {
        floorSource,
        file: anyO.file ?? "",
        quantity: anyO.quantity ?? 0,
        ids: anyO.ids ?? [],
      } satisfies FileOccurrence;
    });
    return {
      ...i,
      occurrences,
      columns: i.columns ?? [],
      editedParams: i.editedParams ?? {},
    };
  });

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
    floorAliases: aliases,
    items: occMigrated,
    sourceFiles: l.sourceFiles ?? [],
    createdAt: l.createdAt ?? Date.now(),
    updatedAt: l.updatedAt ?? Date.now(),
    lastSnapshot: l.lastSnapshot,
    schemaVersion: CURRENT_LIST_SCHEMA,
  };
}

/** No-op for new pipeline (aliases are display-only). Kept for compat with
 *  callers that rely on a manual "apply now" button — returns items unchanged
 *  except for re-collapsing same-source duplicates that may exist in legacy
 *  data after migration. */
export function applyFloorAliasesToItems(
  items: ConsolidatedItem[],
  _aliases: Record<string, string>,
): ConsolidatedItem[] {
  return items.map((i) => {
    const map = new Map<string, FileOccurrence>();
    for (const o of i.occurrences) {
      const src = getFloorSource(o);
      const k = `${src}\u0001${o.file}`;
      const prev = map.get(k);
      if (prev) {
        prev.quantity = Math.round((prev.quantity + o.quantity) * 1000) / 1000;
        prev.ids = Array.from(new Set([...prev.ids, ...o.ids]));
      } else {
        map.set(k, {
          floorSource: src,
          file: o.file,
          quantity: o.quantity,
          ids: [...o.ids],
        });
      }
    }
    const occurrences = Array.from(map.values()).sort(
      (a, b) =>
        a.floorSource.localeCompare(b.floorSource) ||
        a.file.localeCompare(b.file),
    );
    return {
      ...i,
      occurrences,
      totalQuantity:
        Math.round(occurrences.reduce((s, o) => s + o.quantity, 0) * 1000) /
        1000,
    };
  });
}
