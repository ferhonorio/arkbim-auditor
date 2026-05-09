import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Dataset, Row } from "./parse";
import type {
  AuditRule,
  ConsolidationConfig,
  Filter,
  ReferenceItem,
  VisualRule,
} from "./grouping";
import type {
  ComponentList,
  ConsolidationMode,
  ConsolidatePlan,
  MeasureMode,
} from "./component-lists";
import {
  commitConsolidation,
  planConsolidation,
  migrateComponentList,
  DEFAULT_KEY_COLUMN,
  DEFAULT_FLOOR_COLUMN,
} from "./component-lists";

export interface CreateListOpts {
  name: string;
  keyColumn?: string;
  floorColumn?: string;
  fileColumn?: string;
  measureMode?: MeasureMode;
  areaColumn?: string;
}

export interface ConsolidatedSnapshot {
  reference: ReferenceItem[];
  cfg: ConsolidationConfig;
  savedAt: number;
}

export interface SavedPreset<T> {
  id: string;
  name: string;
  data: T;
  createdAt: number;
}

export interface GroupingPreset {
  groupBy: string[];
  concatCols: string[];
  concatStrategy: Record<string, ConcatStrategy>;
}

export type ConcatStrategy = "all" | "unique" | "first" | "last" | "min" | "max" | "count";

interface ArkState {
  dataset: Dataset | null;
  setDataset: (d: Dataset | null) => void;

  filters: Filter[];
  setFilters: (f: Filter[]) => void;

  hiddenColumns: string[];
  setHiddenColumns: (c: string[]) => void;

  groupBy: string[];
  setGroupBy: (g: string[]) => void;

  concatCols: string[];
  setConcatCols: (c: string[]) => void;

  concatStrategy: Record<string, ConcatStrategy>;
  setConcatStrategy: (s: Record<string, ConcatStrategy>) => void;

  visualRules: VisualRule[];
  setVisualRules: (v: VisualRule[]) => void;

  focusParam: string;
  setFocusParam: (s: string) => void;

  searchValue: string;
  setSearchValue: (s: string) => void;

  pageSize: number;
  setPageSize: (n: number) => void;

  onlyRuleMatches: boolean;
  setOnlyRuleMatches: (b: boolean) => void;

  auditRules: AuditRule[];
  setAuditRules: (r: AuditRule[]) => void;

  consolidationConfig: Partial<ConsolidationConfig>;
  setConsolidationConfig: (c: Partial<ConsolidationConfig>) => void;

  consolidatedSnapshot: ConsolidatedSnapshot | null;
  saveConsolidatedSnapshot: (s: ConsolidatedSnapshot) => void;
  clearConsolidatedSnapshot: () => void;

  // Component lists (consolidação multi-pavimento)
  componentLists: ComponentList[];
  activeComponentListId: string | null;
  setActiveComponentList: (id: string | null) => void;
  createComponentList: (opts: CreateListOpts | string) => string;
  duplicateComponentList: (id: string) => string | null;
  renameComponentList: (id: string, name: string) => void;
  deleteComponentList: (id: string) => void;
  updateComponentList: (id: string, patch: Partial<ComponentList>) => void;
  setColumnAlias: (id: string, column: string, alias: string) => void;
  setColumnWidth: (id: string, column: string, width: number) => void;
  applyConsolidation: (
    id: string,
    plan: ConsolidatePlan,
    mode: ConsolidationMode,
  ) => { added: number; updated: number; skipped: number; newFiles: string[] } | null;
  removeListItem: (id: string, key: string) => void;
  clearListItems: (id: string) => void;

  // Row selection (for consolidation)
  selectedRowIds: string[];
  setSelectedRowIds: (ids: string[]) => void;
  clearSelectedRowIds: () => void;

  // Saved presets
  filterPresets: SavedPreset<Filter[]>[];
  rulePresets: SavedPreset<VisualRule[]>[];
  groupingPresets: SavedPreset<GroupingPreset>[];
  saveFilterPreset: (name: string) => void;
  loadFilterPreset: (id: string) => void;
  deleteFilterPreset: (id: string) => void;
  saveRulePreset: (name: string) => void;
  loadRulePreset: (id: string) => void;
  deleteRulePreset: (id: string) => void;
  saveGroupingPreset: (name: string) => void;
  loadGroupingPreset: (id: string) => void;
  deleteGroupingPreset: (id: string) => void;
}

export const useArk = create<ArkState>()(
  persist(
    (set, get) => ({
      dataset: null,
      setDataset: (d) => set({ dataset: d }),

      filters: [],
      setFilters: (filters) => set({ filters }),

      hiddenColumns: [],
      setHiddenColumns: (hiddenColumns) => set({ hiddenColumns }),

      groupBy: [],
      setGroupBy: (groupBy) => set({ groupBy }),

      concatCols: [],
      setConcatCols: (concatCols) => set({ concatCols }),

      concatStrategy: {},
      setConcatStrategy: (concatStrategy) => set({ concatStrategy }),

      visualRules: [],
      setVisualRules: (visualRules) => set({ visualRules }),

      focusParam: "",
      setFocusParam: (focusParam) => set({ focusParam }),

      searchValue: "",
      setSearchValue: (searchValue) => set({ searchValue }),

      pageSize: 50,
      setPageSize: (pageSize) => set({ pageSize }),

      onlyRuleMatches: false,
      setOnlyRuleMatches: (onlyRuleMatches) => set({ onlyRuleMatches }),

      auditRules: [],
      setAuditRules: (auditRules) => set({ auditRules }),

      consolidationConfig: {
        fileColumn: "Nome do arquivo",
        keyColumns: ["Type Mark"],
        paramColumns: ["Description", "Manufacturer", "URL"],
      },
      setConsolidationConfig: (c) =>
        set((s) => ({ consolidationConfig: { ...s.consolidationConfig, ...c } })),

      consolidatedSnapshot: null,
      saveConsolidatedSnapshot: (snap) => set({ consolidatedSnapshot: snap }),
      clearConsolidatedSnapshot: () => set({ consolidatedSnapshot: null }),

      componentLists: [],
      activeComponentListId: null,
      setActiveComponentList: (id) => set({ activeComponentListId: id }),
      createComponentList: (input) => {
        const opts: CreateListOpts =
          typeof input === "string" ? { name: input } : input;
        const id = crypto.randomUUID();
        const now = Date.now();
        const fileColumn = opts.fileColumn || DEFAULT_FLOOR_COLUMN;
        const list: ComponentList = {
          id,
          name: (opts.name || "").trim() || "Nova categoria",
          fileColumn,
          idCol: "ID",
          keyColumn: opts.keyColumn || DEFAULT_KEY_COLUMN,
          floorColumn: opts.floorColumn || fileColumn,
          measureMode: opts.measureMode || "count",
          areaColumn: opts.areaColumn,
          columnAliases: {},
          columnWidths: {},
          items: [],
          sourceFiles: [],
          createdAt: now,
          updatedAt: now,
        };
        set((s) => ({
          componentLists: [...s.componentLists, list],
          activeComponentListId: id,
        }));
        return id;
      },
      duplicateComponentList: (id) => {
        const src = get().componentLists.find((l) => l.id === id);
        if (!src) return null;
        const newId = crypto.randomUUID();
        const now = Date.now();
        const copy: ComponentList = {
          ...src,
          id: newId,
          name: `${src.name} (cópia)`,
          createdAt: now,
          updatedAt: now,
        };
        set((s) => ({
          componentLists: [...s.componentLists, copy],
          activeComponentListId: newId,
        }));
        return newId;
      },
      renameComponentList: (id, name) =>
        set((s) => ({
          componentLists: s.componentLists.map((l) =>
            l.id === id ? { ...l, name, updatedAt: Date.now() } : l,
          ),
        })),
      deleteComponentList: (id) =>
        set((s) => ({
          componentLists: s.componentLists.filter((l) => l.id !== id),
          activeComponentListId:
            s.activeComponentListId === id ? null : s.activeComponentListId,
        })),
      updateComponentList: (id, patch) =>
        set((s) => ({
          componentLists: s.componentLists.map((l) =>
            l.id === id ? { ...l, ...patch, updatedAt: Date.now() } : l,
          ),
        })),
      setColumnAlias: (id, column, alias) =>
        set((s) => ({
          componentLists: s.componentLists.map((l) => {
            if (l.id !== id) return l;
            const aliases = { ...l.columnAliases };
            if (alias.trim()) aliases[column] = alias.trim();
            else delete aliases[column];
            return { ...l, columnAliases: aliases, updatedAt: Date.now() };
          }),
        })),
      setColumnWidth: (id, column, width) =>
        set((s) => ({
          componentLists: s.componentLists.map((l) => {
            if (l.id !== id) return l;
            const widths = { ...(l.columnWidths ?? {}) };
            if (width > 0) widths[column] = Math.round(width);
            else delete widths[column];
            return { ...l, columnWidths: widths, updatedAt: Date.now() };
          }),
        })),
      applyConsolidation: (id, plan, mode) => {
        const state = get();
        const list = state.componentLists.find((l) => l.id === id);
        if (!list) return null;
        const outcome = commitConsolidation(list, plan, mode);
        const sourceFiles = Array.from(
          new Set([...list.sourceFiles, ...outcome.newFiles]),
        );
        set((s) => ({
          componentLists: s.componentLists.map((l) =>
            l.id === id
              ? { ...l, items: outcome.items, sourceFiles, updatedAt: Date.now() }
              : l,
          ),
        }));
        return {
          added: outcome.added,
          updated: outcome.updated,
          skipped: outcome.skipped,
          newFiles: outcome.newFiles,
        };
      },
      removeListItem: (id, key) =>
        set((s) => ({
          componentLists: s.componentLists.map((l) =>
            l.id === id
              ? {
                  ...l,
                  items: l.items.filter((i) => i.key !== key),
                  updatedAt: Date.now(),
                }
              : l,
          ),
        })),
      clearListItems: (id) =>
        set((s) => ({
          componentLists: s.componentLists.map((l) =>
            l.id === id
              ? { ...l, items: [], sourceFiles: [], updatedAt: Date.now() }
              : l,
          ),
        })),

      selectedRowIds: [],
      setSelectedRowIds: (ids) => set({ selectedRowIds: ids }),
      clearSelectedRowIds: () => set({ selectedRowIds: [] }),

      filterPresets: [],
      rulePresets: [],
      groupingPresets: [],
      saveFilterPreset: (name) =>
        set((s) => ({
          filterPresets: [
            ...s.filterPresets,
            { id: crypto.randomUUID(), name, data: s.filters, createdAt: Date.now() },
          ],
        })),
      loadFilterPreset: (id) => {
        const p = get().filterPresets.find((x) => x.id === id);
        if (p) set({ filters: p.data });
      },
      deleteFilterPreset: (id) =>
        set((s) => ({ filterPresets: s.filterPresets.filter((p) => p.id !== id) })),

      saveRulePreset: (name) =>
        set((s) => ({
          rulePresets: [
            ...s.rulePresets,
            { id: crypto.randomUUID(), name, data: s.visualRules, createdAt: Date.now() },
          ],
        })),
      loadRulePreset: (id) => {
        const p = get().rulePresets.find((x) => x.id === id);
        if (p) set({ visualRules: p.data });
      },
      deleteRulePreset: (id) =>
        set((s) => ({ rulePresets: s.rulePresets.filter((p) => p.id !== id) })),

      saveGroupingPreset: (name) =>
        set((s) => ({
          groupingPresets: [
            ...s.groupingPresets,
            {
              id: crypto.randomUUID(),
              name,
              data: {
                groupBy: s.groupBy,
                concatCols: s.concatCols,
                concatStrategy: s.concatStrategy,
              },
              createdAt: Date.now(),
            },
          ],
        })),
      loadGroupingPreset: (id) => {
        const p = get().groupingPresets.find((x) => x.id === id);
        if (p)
          set({
            groupBy: p.data.groupBy,
            concatCols: p.data.concatCols,
            concatStrategy: p.data.concatStrategy ?? {},
          });
      },
      deleteGroupingPreset: (id) =>
        set((s) => ({ groupingPresets: s.groupingPresets.filter((p) => p.id !== id) })),
    }),
    {
      name: "arkbim-state",
      partialize: (s) => ({
        filters: s.filters,
        hiddenColumns: s.hiddenColumns,
        groupBy: s.groupBy,
        concatCols: s.concatCols,
        concatStrategy: s.concatStrategy,
        visualRules: s.visualRules,
        focusParam: s.focusParam,
        pageSize: s.pageSize,
        auditRules: s.auditRules,
        consolidationConfig: s.consolidationConfig,
        consolidatedSnapshot: s.consolidatedSnapshot,
        onlyRuleMatches: s.onlyRuleMatches,
        filterPresets: s.filterPresets,
        rulePresets: s.rulePresets,
        groupingPresets: s.groupingPresets,
        componentLists: s.componentLists,
        activeComponentListId: s.activeComponentListId,
      }),
    },
  ),
);

let lastFile: File | null = null;
export const setLastFile = (f: File | null) => {
  lastFile = f;
};
export const getLastFile = () => lastFile;

export type { Row };
