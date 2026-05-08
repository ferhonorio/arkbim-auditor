import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Dataset, Row } from "./parse";
import type {
  AuditRule,
  ConsolidationConfig,
  Filter,
  VisualRule,
} from "./grouping";

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

  visualRules: VisualRule[];
  setVisualRules: (v: VisualRule[]) => void;

  focusParam: string;
  setFocusParam: (s: string) => void;

  searchValue: string;
  setSearchValue: (s: string) => void;

  pageSize: number;
  setPageSize: (n: number) => void;

  auditRules: AuditRule[];
  setAuditRules: (r: AuditRule[]) => void;

  consolidationConfig: Partial<ConsolidationConfig>;
  setConsolidationConfig: (c: Partial<ConsolidationConfig>) => void;
}

export const useArk = create<ArkState>()(
  persist(
    (set) => ({
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

      visualRules: [],
      setVisualRules: (visualRules) => set({ visualRules }),

      focusParam: "",
      setFocusParam: (focusParam) => set({ focusParam }),

      searchValue: "",
      setSearchValue: (searchValue) => set({ searchValue }),

      pageSize: 50,
      setPageSize: (pageSize) => set({ pageSize }),

      auditRules: [],
      setAuditRules: (auditRules) => set({ auditRules }),

      consolidationConfig: {
        fileColumn: "Nome do arquivo",
        keyColumns: ["Type Mark"],
        paramColumns: ["Description", "Manufacturer", "URL"],
      },
      setConsolidationConfig: (c) =>
        set((s) => ({ consolidationConfig: { ...s.consolidationConfig, ...c } })),
    }),
    {
      name: "arkbim-state",
      // Persist everything except the (potentially huge) dataset rows
      partialize: (s) => ({
        filters: s.filters,
        hiddenColumns: s.hiddenColumns,
        groupBy: s.groupBy,
        concatCols: s.concatCols,
        visualRules: s.visualRules,
        focusParam: s.focusParam,
        pageSize: s.pageSize,
        auditRules: s.auditRules,
        consolidationConfig: s.consolidationConfig,
      }),
    },
  ),
);

// Helper: cache the last raw file in IndexedDB-like simple memory
let lastFile: File | null = null;
export const setLastFile = (f: File | null) => {
  lastFile = f;
};
export const getLastFile = () => lastFile;

export type { Row };
