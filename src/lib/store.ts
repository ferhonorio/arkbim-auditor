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
        filterPresets: s.filterPresets,
        rulePresets: s.rulePresets,
        groupingPresets: s.groupingPresets,
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
