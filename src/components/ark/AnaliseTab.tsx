import { useMemo, useState } from "react";
import { Plus, X, Copy, Trash2 } from "lucide-react";
import { useArk } from "@/lib/store";
import {
  applyFilters,
  groupRows,
  ruleMatches,
  type VisualRule,
} from "@/lib/grouping";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { exportXLSX } from "@/lib/export";
import { toast } from "sonner";

const RULE_COLORS = [
  "#fee2e2",
  "#fef3c7",
  "#dcfce7",
  "#dbeafe",
  "#f3e8ff",
  "#ffedd5",
];

export function AnaliseTab() {
  const dataset = useArk((s) => s.dataset);
  const filters = useArk((s) => s.filters);
  const hiddenColumns = useArk((s) => s.hiddenColumns);
  const groupBy = useArk((s) => s.groupBy);
  const setGroupBy = useArk((s) => s.setGroupBy);
  const concatCols = useArk((s) => s.concatCols);
  const setConcatCols = useArk((s) => s.setConcatCols);
  const visualRules = useArk((s) => s.visualRules);
  const setVisualRules = useArk((s) => s.setVisualRules);
  const focusParam = useArk((s) => s.focusParam);
  const setFocusParam = useArk((s) => s.setFocusParam);
  const searchValue = useArk((s) => s.searchValue);
  const setSearchValue = useArk((s) => s.setSearchValue);
  const pageSize = useArk((s) => s.pageSize);
  const setPageSize = useArk((s) => s.setPageSize);

  const [page, setPage] = useState(0);

  const cols = dataset?.columns ?? [];
  const rows = dataset?.rows ?? [];
  const filtered = useMemo(() => applyFilters(rows, filters), [rows, filters]);

  const searched = useMemo(() => {
    if (!searchValue.trim()) return filtered;
    const s = searchValue.toLowerCase();
    if (focusParam) {
      return filtered.filter((r) => (r[focusParam] ?? "").toLowerCase().includes(s));
    }
    return filtered.filter((r) =>
      cols.some((c) => (r[c] ?? "").toLowerCase().includes(s)),
    );
  }, [filtered, searchValue, focusParam, cols]);

  const groups = useMemo(
    () => groupRows(searched, groupBy, concatCols),
    [searched, groupBy, concatCols],
  );

  const start = page * pageSize;
  const pageGroups = groups.slice(start, start + pageSize);
  const totalPages = Math.max(1, Math.ceil(groups.length / pageSize));

  const visibleCols = cols.filter((c) => !hiddenColumns.includes(c));
  const groupVisible = groupBy.filter(
    (c) => !focusParam || c === focusParam || c === "Nome do arquivo",
  );

  const addGroup = () => {
    const next = visibleCols.find((c) => !groupBy.includes(c));
    if (next) setGroupBy([...groupBy, next]);
  };
  const updGroup = (i: number, v: string) => {
    const arr = [...groupBy];
    arr[i] = v;
    setGroupBy(arr);
  };
  const rmGroup = (i: number) => setGroupBy(groupBy.filter((_, j) => j !== i));

  const addConcat = () => {
    const next = visibleCols.find((c) => !concatCols.includes(c) && !groupBy.includes(c));
    if (next) setConcatCols([...concatCols, next]);
  };
  const rmConcat = (c: string) => setConcatCols(concatCols.filter((x) => x !== c));

  const addRule = () => {
    const col = visibleCols[0];
    if (!col) return;
    setVisualRules([
      ...visualRules,
      {
        id: crypto.randomUUID(),
        column: col,
        color: RULE_COLORS[visualRules.length % RULE_COLORS.length],
      },
    ]);
  };
  const updRule = (id: string, patch: Partial<VisualRule>) =>
    setVisualRules(visualRules.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const rmRule = (id: string) => setVisualRules(visualRules.filter((r) => r.id !== id));

  const exportFiltered = () => {
    if (!filtered.length) return toast.error("Nada para exportar");
    exportXLSX("arkbim-filtrado.xlsx", [
      { name: "Filtrado", rows: filtered, columns: visibleCols },
    ]);
  };

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Linhas totais" value={rows.length} />
        <Kpi label="Apos filtros" value={filtered.length} />
        <Kpi label="Colunas visiveis" value={visibleCols.length} />
        <Kpi label="Regras ativas" value={visualRules.length} />
      </div>

      {/* Visual rules */}
      <Section
        title="Regras visuais de comparacao"
        subtitle="Destacam grupos com mais de um valor distinto na coluna escolhida."
        action={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={addRule}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Regra
            </Button>
          </div>
        }
      >
        {visualRules.length === 0 && (
          <p className="text-xs text-muted-foreground">Nenhuma regra ativa.</p>
        )}
        <div className="grid gap-2 md:grid-cols-2">
          {visualRules.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-2 rounded-md border p-2"
              style={{ background: r.color }}
            >
              <Select value={r.column} onValueChange={(v) => updRule(r.id, { column: v })}>
                <SelectTrigger className="h-8 flex-1 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {cols.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input
                type="color"
                value={r.color.startsWith("#") ? r.color : "#fee2e2"}
                onChange={(e) => updRule(r.id, { color: e.target.value })}
                className="h-7 w-7 cursor-pointer rounded border"
              />
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => rmRule(r.id)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      </Section>

      {/* Search + focus */}
      <div className="grid gap-3 rounded-lg border bg-card p-3 md:grid-cols-[1fr_2fr_auto]">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Focar parametro</label>
          <Select value={focusParam || "_all"} onValueChange={(v) => setFocusParam(v === "_all" ? "" : v)}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">Todos os parametros</SelectItem>
              {cols.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Buscar valor</label>
          <Input
            placeholder="Filtrar linhas pelo parametro escolhido"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Linhas por pagina</label>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => {
              setPageSize(Number(v));
              setPage(0);
            }}
          >
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[25, 50, 100, 250, 500].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Grouping */}
      <Section
        title="Agrupamento"
        subtitle={`${groups.length.toLocaleString("pt-BR")} grupos encontrados em ${searched.length.toLocaleString("pt-BR")} linhas filtradas.`}
        action={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setGroupBy([])}>
              Limpar agrupamento
            </Button>
            <Button size="sm" variant="outline" onClick={exportFiltered}>
              Exportar filtrado
            </Button>
          </div>
        }
      >
        <div className="flex flex-wrap items-end gap-2">
          {groupBy.map((g, i) => (
            <div key={i} className="flex items-end gap-1">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">
                  {i === 0 ? "Agrupar por" : "Depois por"}
                </label>
                <Select value={g} onValueChange={(v) => updGroup(i, v)}>
                  <SelectTrigger className="h-9 w-[220px] text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {cols.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button size="icon" variant="ghost" onClick={() => rmGroup(i)} className="h-9 w-9">
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={addGroup}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Nivel
          </Button>
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">Concatenar dados</h4>
            <Button size="sm" variant="outline" onClick={addConcat}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Coluna
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {concatCols.map((c) => (
              <span
                key={c}
                className="inline-flex items-center gap-1 rounded-full border bg-secondary px-3 py-1 text-xs"
              >
                {c}
                <button onClick={() => rmConcat(c)}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {!concatCols.length && (
              <span className="text-xs text-muted-foreground">
                Sem colunas concatenadas.
              </span>
            )}
          </div>
        </div>

        {/* Groups table */}
        <div className="mt-4 overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {groupVisible.map((c) => (
                  <TableHead key={c}>{c}</TableHead>
                ))}
                {concatCols.map((c) => (
                  <TableHead key={c}>{c}</TableHead>
                ))}
                <TableHead className="text-right">Quantidade</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageGroups.map((g) => {
                const matched = visualRules.find((r) => ruleMatches(r, g));
                return (
                  <TableRow key={g.key} style={matched ? { background: matched.color } : undefined}>
                    {groupVisible.map((c) => (
                      <TableCell key={c}>{g.values[c]}</TableCell>
                    ))}
                    {concatCols.map((c) => (
                      <TableCell key={c}>
                        <div className="flex items-start gap-1">
                          <span className="flex-1">{g.concat[c]}</span>
                          {g.concat[c] && (
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(g.concat[c]);
                                toast.success("Copiado");
                              }}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </TableCell>
                    ))}
                    <TableCell className="text-right font-medium">{g.quantity}</TableCell>
                  </TableRow>
                );
              })}
              {!pageGroups.length && (
                <TableRow>
                  <TableCell
                    colSpan={groupVisible.length + concatCols.length + 1}
                    className="text-center text-sm text-muted-foreground"
                  >
                    {dataset
                      ? "Configure o agrupamento para visualizar."
                      : "Carregue um arquivo CSV ou XLSX."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {groups.length > pageSize && (
          <div className="mt-3 flex items-center justify-end gap-2 text-xs">
            <Button
              size="sm"
              variant="outline"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
            >
              Anterior
            </Button>
            <span>
              Pagina {page + 1} de {totalPages}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              Proxima
            </Button>
          </div>
        )}
      </Section>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value.toLocaleString("pt-BR")}</p>
    </div>
  );
}

function Section({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}
