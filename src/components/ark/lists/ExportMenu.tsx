import { Download, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { exportXLSXStyled, exportCSV, type SheetSpec } from "@/lib/export";
import type { ComponentList, ConsolidatedItem } from "@/lib/component-lists";

interface Props {
  /** Currently active list (used by single-category exports). */
  list: ComponentList;
  /** All lists (used by "all categories" export). */
  allLists: ComponentList[];
  /** Items currently visible (after search/floor filter). */
  filteredItems: ConsolidatedItem[];
  /** Total per item respecting current floor filter (defaults to totalQuantity). */
  totalForItem?: (item: ConsolidatedItem) => number;
}

function unitOf(l: ComponentList) {
  return l.measureMode === "area" ? "m²" : "un";
}
function fmtQty(l: ComponentList, n: number) {
  return l.measureMode === "area"
    ? n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })
    : n.toLocaleString("pt-BR");
}
function allColumnsOf(items: ConsolidatedItem[]) {
  const set = new Set<string>();
  for (const i of items) for (const c of i.columns) set.add(c);
  return Array.from(set);
}
function headerLabel(l: ComponentList, c: string) {
  return l.columnAliases[c] || c;
}

function rowsForItems(
  l: ComponentList,
  items: ConsolidatedItem[],
  cols: string[],
  totalFn: (i: ConsolidatedItem) => number,
) {
  const unit = unitOf(l);
  return items.map((i) => {
    const r: Record<string, string | number> = {
      [headerLabel(l, l.keyColumn)]: i.key,
    };
    for (const c of cols) r[headerLabel(l, c)] = i.params[c] ?? "";
    r[`Total (${unit})`] = totalFn(i);
    const byFloor = new Map<string, number>();
    for (const o of i.occurrences) {
      byFloor.set(o.floor, (byFloor.get(o.floor) ?? 0) + o.quantity);
    }
    r["Pavimentos"] = Array.from(byFloor, ([f, q]) => `${f} (${fmtQty(l, q)})`).join(
      " · ",
    );
    return r;
  });
}

function makeSheet(
  l: ComponentList,
  items: ConsolidatedItem[],
  totalFn: (i: ConsolidatedItem) => number,
  sheetName?: string,
): SheetSpec {
  const cols = allColumnsOf(items);
  const unit = unitOf(l);
  const headerCols = [
    headerLabel(l, l.keyColumn),
    ...cols.map((c) => headerLabel(l, c)),
    `Total (${unit})`,
    "Pavimentos",
  ];
  const rows = rowsForItems(l, items, cols, totalFn);
  const totalSum =
    Math.round(items.reduce((s, i) => s + totalFn(i), 0) * 1000) / 1000;
  const footer: Record<string, string | number> = {
    [headerLabel(l, l.keyColumn)]: "TOTAL",
  };
  for (const c of cols) footer[headerLabel(l, c)] = "";
  footer[`Total (${unit})`] = totalSum;
  footer["Pavimentos"] = "";
  return { name: sheetName ?? l.name, rows, columns: headerCols, footer };
}

export function ExportMenu({ list, allLists, filteredItems, totalForItem }: Props) {
  const totalFn = totalForItem ?? ((i: ConsolidatedItem) => i.totalQuantity);

  const exportCurrent = () => {
    if (!filteredItems.length) return toast.error("Nada para exportar");
    exportXLSXStyled(`${list.name}.xlsx`, [makeSheet(list, filteredItems, totalFn)]);
    toast.success("XLSX gerado");
  };

  const exportByFloor = () => {
    if (!filteredItems.length) return toast.error("Nada para exportar");
    const floors = Array.from(
      new Set(filteredItems.flatMap((i) => i.occurrences.map((o) => o.floor))),
    ).sort();
    if (!floors.length) return toast.error("Sem pavimentos");

    // Resumo (matriz Item × Pavimento)
    const resumoCols = [
      headerLabel(list, list.keyColumn),
      ...floors,
      `Total (${unitOf(list)})`,
    ];
    const resumoRows = filteredItems.map((i) => {
      const r: Record<string, string | number> = {
        [headerLabel(list, list.keyColumn)]: i.key,
      };
      let sum = 0;
      for (const f of floors) {
        const q = i.occurrences
          .filter((o) => o.floor === f)
          .reduce((s, o) => s + o.quantity, 0);
        r[f] = q ? Math.round(q * 1000) / 1000 : "";
        sum += q;
      }
      r[`Total (${unitOf(list)})`] = Math.round(sum * 1000) / 1000;
      return r;
    });

    const sheets: SheetSpec[] = [
      { name: "Resumo", rows: resumoRows, columns: resumoCols },
    ];
    for (const f of floors) {
      const items = filteredItems
        .map((i) => {
          const occs = i.occurrences.filter((o) => o.floor === f);
          if (!occs.length) return null;
          return { ...i, occurrences: occs };
        })
        .filter(Boolean) as ConsolidatedItem[];
      sheets.push(
        makeSheet(
          list,
          items,
          (i) =>
            Math.round(
              i.occurrences.reduce((s, o) => s + o.quantity, 0) * 1000,
            ) / 1000,
          f,
        ),
      );
    }
    exportXLSXStyled(`${list.name} - por pavimento.xlsx`, sheets);
    toast.success(`XLSX por pavimento (${floors.length} abas)`);
  };

  const exportAll = () => {
    if (!allLists.length) return toast.error("Sem categorias");
    const sheets: SheetSpec[] = [];
    const resumoRows = allLists.map((l) => {
      const floors = new Set<string>();
      let total = 0;
      for (const i of l.items) {
        for (const o of i.occurrences) floors.add(o.floor);
        total += i.totalQuantity;
      }
      return {
        Categoria: l.name,
        Itens: l.items.length,
        Pavimentos: floors.size,
        Unidade: unitOf(l),
        Total: Math.round(total * 1000) / 1000,
      };
    });
    sheets.push({
      name: "Resumo",
      rows: resumoRows,
      columns: ["Categoria", "Itens", "Pavimentos", "Unidade", "Total"],
    });
    for (const l of allLists) {
      if (!l.items.length) continue;
      sheets.push(makeSheet(l, l.items, (i) => i.totalQuantity));
    }
    exportXLSXStyled(`Listas consolidadas.xlsx`, sheets);
    toast.success(`XLSX gerado (${allLists.length} categorias)`);
  };

  const exportCsv = () => {
    if (!filteredItems.length) return toast.error("Nada para exportar");
    const sheet = makeSheet(list, filteredItems, totalFn);
    const rows = sheet.footer ? [...sheet.rows, sheet.footer] : sheet.rows;
    exportCSV(`${list.name}.csv`, rows, sheet.columns);
    toast.success("CSV (UTF-8) gerado");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline">
          <Download className="mr-1 h-3.5 w-3.5" /> Exportar
          <ChevronDown className="ml-1 h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel>XLSX formatado</DropdownMenuLabel>
        <DropdownMenuItem onClick={exportCurrent}>
          Categoria atual (uma aba)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportByFloor}>
          Categoria atual — uma aba por pavimento
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportAll}>
          Todas as categorias (uma aba cada)
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>CSV</DropdownMenuLabel>
        <DropdownMenuItem onClick={exportCsv}>
          CSV UTF-8 (categoria atual)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
