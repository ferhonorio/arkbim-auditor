import { useMemo, useState } from "react";
import { Copy, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type { ComponentList, ConsolidatedItem } from "@/lib/component-lists";

interface Props {
  lists: ComponentList[];
  initialId?: string;
  onClose: () => void;
}

export function PresentationView({ lists, initialId, onClose }: Props) {
  const [active, setActive] = useState<string>(initialId ?? lists[0]?.id ?? "");

  if (!lists.length) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
        Nenhuma categoria para apresentar.
        <div className="mt-3">
          <Button variant="outline" size="sm" onClick={onClose}>
            Sair do modo apresentação
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            Lista consolidada — apresentação
          </h2>
          <p className="text-xs text-muted-foreground">
            Visualização limpa e somente leitura para validação com cliente.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={onClose}>
          <X className="mr-1 h-3.5 w-3.5" /> Sair do modo apresentação
        </Button>
      </div>

      <Tabs value={active} onValueChange={setActive}>
        <TabsList className="flex h-auto flex-wrap justify-start gap-1 bg-muted/50 p-1">
          {lists.map((l) => (
            <TabsTrigger key={l.id} value={l.id} className="gap-2">
              {l.name}
              <Badge variant="secondary" className="text-[10px]">
                {l.items.length}
              </Badge>
            </TabsTrigger>
          ))}
        </TabsList>

        {lists.map((l) => (
          <TabsContent key={l.id} value={l.id} className="mt-4">
            <CategoryPresentation list={l} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function CategoryPresentation({ list }: { list: ComponentList }) {
  const [floor, setFloor] = useState<string>("__all__");

  const allFloors = useMemo(() => {
    const set = new Set<string>();
    for (const i of list.items)
      for (const o of i.occurrences) set.add(o.floorSource || o.floor || "");
    return Array.from(set).sort();
  }, [list.items]);

  const allColumns = useMemo(() => {
    const set = new Set<string>();
    for (const i of list.items) for (const c of i.columns) set.add(c);
    return Array.from(set);
  }, [list.items]);

  const unit = list.measureMode === "area" ? "m²" : "un";
  const fmtQty = (n: number) =>
    list.measureMode === "area"
      ? n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })
      : n.toLocaleString("pt-BR");

  // Filter + recompute totals based on floor selection
  const visibleRows = useMemo(() => {
    const out: { item: ConsolidatedItem; total: number }[] = [];
    for (const i of list.items) {
      if (floor === "__all__") {
        out.push({ item: i, total: i.totalQuantity });
      } else {
        const occs = i.occurrences.filter((o) => o.floor === floor);
        if (!occs.length) continue;
        const total =
          Math.round(occs.reduce((s, o) => s + o.quantity, 0) * 1000) / 1000;
        out.push({ item: i, total });
      }
    }
    return out.sort((a, b) =>
      a.item.key.localeCompare(b.item.key, undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    );
  }, [list.items, floor]);

  const headerLabel = (col: string) => list.columnAliases[col] || col;
  const totalSum =
    Math.round(visibleRows.reduce((s, r) => s + r.total, 0) * 1000) / 1000;

  const handleCopy = async () => {
    const headers = [
      headerLabel(list.keyColumn),
      ...allColumns.map(headerLabel),
      `Total (${unit})`,
    ];
    const lines: string[] = [];
    lines.push(headers.join("\t"));
    for (const { item, total } of visibleRows) {
      const cells = [
        item.key,
        ...allColumns.map((c) => (item.params[c] ?? "").replace(/[\t\n\r]/g, " ")),
        fmtQty(total),
      ];
      lines.push(cells.join("\t"));
    }
    const tsv = lines.join("\n");

    const html =
      `<table border="1" cellspacing="0" cellpadding="4">` +
      `<thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>` +
      `<tbody>` +
      visibleRows
        .map(
          ({ item, total }) =>
            `<tr><td>${escapeHtml(item.key)}</td>` +
            allColumns
              .map((c) => `<td>${escapeHtml(item.params[c] ?? "")}</td>`)
              .join("") +
            `<td align="right">${escapeHtml(fmtQty(total))}</td></tr>`,
        )
        .join("") +
      `</tbody></table>`;

    try {
      if (
        typeof ClipboardItem !== "undefined" &&
        navigator.clipboard &&
        "write" in navigator.clipboard
      ) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/plain": new Blob([tsv], { type: "text/plain" }),
            "text/html": new Blob([html], { type: "text/html" }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(tsv);
      }
      toast.success("Lista copiada — cole no Excel (Ctrl+V)");
    } catch {
      toast.error("Não foi possível copiar — selecione manualmente");
    }
  };

  return (
    <div className="space-y-3 rounded-lg border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-xl font-semibold">{list.name}</h3>
          <p className="text-xs text-muted-foreground">
            {visibleRows.length} itens · {allFloors.length} pavimentos · chave{" "}
            <strong>{headerLabel(list.keyColumn)}</strong>
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground">
              Pavimento
            </label>
            <Select value={floor} onValueChange={setFloor}>
              <SelectTrigger className="h-9 w-64 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Lista geral (todos)</SelectItem>
                {allFloors.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleCopy} size="sm">
            <Copy className="mr-1 h-3.5 w-3.5" /> Copiar lista
          </Button>
        </div>
      </div>

      <div className="overflow-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/60">
            <tr>
              <th className="border-b px-3 py-2 text-left font-semibold">
                {headerLabel(list.keyColumn)}
              </th>
              {allColumns.map((c) => (
                <th
                  key={c}
                  className="border-b px-3 py-2 text-left font-semibold"
                >
                  {headerLabel(c)}
                </th>
              ))}
              <th className="border-b px-3 py-2 text-right font-semibold">
                Total ({unit})
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map(({ item, total }, idx) => (
              <tr
                key={item.key}
                className={idx % 2 === 0 ? "bg-background" : "bg-muted/20"}
              >
                <td className="px-3 py-2 font-medium">{item.key}</td>
                {allColumns.map((c) => (
                  <td key={c} className="px-3 py-2 text-foreground/80">
                    {item.params[c] ?? ""}
                  </td>
                ))}
                <td className="px-3 py-2 text-right font-mono">
                  {fmtQty(total)}
                </td>
              </tr>
            ))}
            {!visibleRows.length && (
              <tr>
                <td
                  colSpan={allColumns.length + 2}
                  className="px-3 py-6 text-center text-xs text-muted-foreground"
                >
                  Nenhum item neste pavimento.
                </td>
              </tr>
            )}
          </tbody>
          {visibleRows.length > 0 && (
            <tfoot>
              <tr className="bg-muted/40">
                <td
                  colSpan={allColumns.length + 1}
                  className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  Total geral
                </td>
                <td className="px-3 py-2 text-right font-mono font-semibold">
                  {fmtQty(totalSum)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
