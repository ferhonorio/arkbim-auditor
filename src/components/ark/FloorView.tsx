import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, FolderOpen, Copy, FileSpreadsheet } from "lucide-react";
import { useArk } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { ComponentList } from "@/lib/component-lists";
import { exportXLSXStyled, type SheetSpec } from "@/lib/export";

interface CategoryFloorAggregate {
  list: ComponentList;
  items: {
    key: string;
    params: Record<string, string>;
    quantity: number;
    files: { file: string; quantity: number }[];
  }[];
  total: number;
}

function fmtQty(l: ComponentList, n: number) {
  return l.measureMode === "area"
    ? n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })
    : n.toLocaleString("pt-BR");
}

export function FloorView() {
  const lists = useArk((s) => s.componentLists);

  const allFloors = useMemo(() => {
    const set = new Set<string>();
    for (const l of lists)
      for (const i of l.items)
        for (const o of i.occurrences) set.add(o.floor);
    return Array.from(set).sort();
  }, [lists]);

  const [floor, setFloor] = useState<string>(() => allFloors[0] ?? "");
  const [openCats, setOpenCats] = useState<Set<string>>(new Set());

  const aggregates: CategoryFloorAggregate[] = useMemo(() => {
    if (!floor) return [];
    return lists
      .map((l) => {
        const items = l.items
          .map((i) => {
            const occs = i.occurrences.filter((o) => o.floor === floor);
            if (!occs.length) return null;
            const qty = occs.reduce((s, o) => s + o.quantity, 0);
            const files = occs.map((o) => ({ file: o.file, quantity: o.quantity }));
            return { key: i.key, params: i.params, quantity: qty, files };
          })
          .filter((x): x is CategoryFloorAggregate["items"][number] => x !== null);
        const total = items.reduce((s, x) => s + x.quantity, 0);
        return { list: l, items, total };
      })
      .filter((a) => a.items.length > 0);
  }, [lists, floor]);

  const toggleCat = (id: string) => {
    setOpenCats((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const copyAll = async () => {
    const lines: string[] = [`Pavimento: ${floor}`];
    for (const a of aggregates) {
      lines.push("", `# ${a.list.name} — ${fmtQty(a.list, a.total)} ${a.list.measureMode === "area" ? "m²" : "un"}`);
      for (const it of a.items) {
        lines.push(`- ${it.key}: ${fmtQty(a.list, it.quantity)}`);
      }
    }
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      toast.success("Resumo copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const exportLI = () => {
    if (!aggregates.length) return;
    const sheets: SheetSpec[] = aggregates.map((a) => {
      const unit = a.list.measureMode === "area" ? "m²" : "un";
      const keyHeader = (a.list.columnAliases?.[a.list.keyColumn] ?? a.list.keyColumn) || a.list.keyColumn;
      const qtyHeader = `Quantidade (${unit})`;
      const filesHeader = "Arquivos";
      const rows = a.items.map((it) => ({
        [keyHeader]: it.key,
        [qtyHeader]: Number(it.quantity.toFixed(2)),
        [filesHeader]: it.files.map((f) => `${f.file} (${fmtQty(a.list, f.quantity)})`).join(" · "),
      }));
      const footer = {
        [keyHeader]: "Total",
        [qtyHeader]: Number(a.total.toFixed(2)),
        [filesHeader]: "",
      };
      return { name: a.list.name, rows, columns: [keyHeader, qtyHeader, filesHeader], footer };
    });
    const safeFloor = floor.replace(/[\\/?*[\]:]/g, "-");
    const date = new Date().toISOString().slice(0, 10);
    try {
      exportXLSXStyled(`LI_${safeFloor}_${date}.xlsx`, sheets);
      toast.success("LI exportada");
    } catch {
      toast.error("Falha ao exportar LI");
    }
  };

  if (allFloors.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
        Nenhum pavimento disponível. Consolide listas primeiro.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold">Visão por pavimento</h2>
          <p className="text-xs text-muted-foreground">
            Itens agrupados por categoria, para um pavimento específico.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Pavimento</label>
            <Select value={floor} onValueChange={setFloor}>
              <SelectTrigger className="h-8 w-64 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {allFloors.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" onClick={exportLI} disabled={!aggregates.length}>
            <FileSpreadsheet className="mr-1 h-3.5 w-3.5" /> Exportar LI (.xlsx)
          </Button>
          <Button size="sm" variant="outline" onClick={copyAll} disabled={!aggregates.length}>
            <Copy className="mr-1 h-3.5 w-3.5" /> Copiar resumo
          </Button>
        </div>
      </div>

      {aggregates.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nenhum item neste pavimento.
        </div>
      ) : (
        <div className="space-y-2">
          {aggregates.map((a) => {
            const isOpen = openCats.has(a.list.id);
            const unit = a.list.measureMode === "area" ? "m²" : "un";
            return (
              <div key={a.list.id} className="rounded-lg border bg-card">
                <button
                  className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50"
                  onClick={() => toggleCat(a.list.id)}
                >
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  <FolderOpen className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{a.list.name}</span>
                  <Badge variant="secondary" className="ml-1">
                    {a.items.length} itens
                  </Badge>
                  <span className="ml-auto font-mono text-sm">
                    {fmtQty(a.list, a.total)} {unit}
                  </span>
                </button>
                {isOpen && (
                  <div className="border-t">
                    <table className="w-full text-sm">
                      <thead className="border-b bg-muted/30 text-xs text-muted-foreground">
                        <tr>
                          <th className="px-3 py-1.5 text-left">{a.list.keyColumn}</th>
                          <th className="px-3 py-1.5 text-right">Quantidade ({unit})</th>
                          <th className="px-3 py-1.5 text-left">Arquivos</th>
                        </tr>
                      </thead>
                      <tbody>
                        {a.items.map((it) => (
                          <Fragment key={it.key}>
                            <tr className="border-b">
                              <td className="px-3 py-1.5 font-medium">{it.key}</td>
                              <td className="px-3 py-1.5 text-right font-mono">
                                {fmtQty(a.list, it.quantity)}
                              </td>
                              <td className="px-3 py-1.5 text-xs text-muted-foreground">
                                {it.files
                                  .map(
                                    (f) =>
                                      `${f.file} (${fmtQty(a.list, f.quantity)})`,
                                  )
                                  .join(" · ")}
                              </td>
                            </tr>
                          </Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
