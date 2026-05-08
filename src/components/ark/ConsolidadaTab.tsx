import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, X, Download } from "lucide-react";
import { useArk } from "@/lib/store";
import {
  applyFilters,
  buildConsolidation,
  type ConsolidationConfig,
} from "@/lib/grouping";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { exportXLSX } from "@/lib/export";
import { toast } from "sonner";

export function ConsolidadaTab() {
  const dataset = useArk((s) => s.dataset);
  const filters = useArk((s) => s.filters);
  const cfg = useArk((s) => s.consolidationConfig);
  const setCfg = useArk((s) => s.setConsolidationConfig);
  const snapshot = useArk((s) => s.consolidatedSnapshot);
  const saveSnapshot = useArk((s) => s.saveConsolidatedSnapshot);
  const clearSnapshot = useArk((s) => s.clearConsolidatedSnapshot);

  const cols = dataset?.columns ?? [];
  const rows = dataset?.rows ?? [];
  const filtered = useMemo(() => applyFilters(rows, filters), [rows, filters]);

  // Auto-detect file column on mount
  const fileColumn = cfg.fileColumn ?? "Nome do arquivo";
  const fileOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of filtered) {
      const v = r[fileColumn];
      if (v) set.add(v);
    }
    return Array.from(set).sort();
  }, [filtered, fileColumn]);

  const ready =
    !!cfg.referenceFile &&
    !!cfg.keyColumns?.length &&
    !!cfg.paramColumns?.length &&
    !!cfg.fileColumn;

  const result = useMemo(() => {
    if (!ready) return null;
    return buildConsolidation(filtered, cfg as ConsolidationConfig);
  }, [filtered, cfg, ready]);

  const setKeyCols = (arr: string[]) => setCfg({ keyColumns: arr });
  const setParamCols = (arr: string[]) => setCfg({ paramColumns: arr });

  const exportConsolidated = () => {
    if (!result) return;
    const refSheet = result.reference.map((r) => ({
      ...r.keyValues,
      ...r.params,
      Quantidade: r.quantity,
      IDs: r.ids.join(", "),
    }));
    const divSheet: Record<string, string | number>[] = [];
    for (const [file, items] of Object.entries(result.divergencesByFile)) {
      for (const it of items) {
        const diffStr = Object.entries(it.diffs)
          .map(([k, v]) => `${k}: "${v.ref}" -> "${v.found}"`)
          .join(" | ");
        divSheet.push({
          "Nome do arquivo": file,
          ...it.keyValues,
          Status: it.status,
          Quantidade: it.quantity,
          Divergencias: diffStr,
          IDs: it.ids.join(", "),
        });
      }
    }
    exportXLSX("arkbim-consolidado.xlsx", [
      { name: "Referencia aprovada", rows: refSheet },
      { name: "Divergencias", rows: divSheet },
      {
        name: "Resumo",
        rows: result.summary.map((s) => ({
          Arquivo: s.file,
          Conformes: s.conformes,
          Divergentes: s.divergentes,
          Faltando: s.faltando,
          Extra: s.extra,
        })),
      },
    ]);
  };

  const exportPerFile = (file: string) => {
    if (!result) return;
    const items = result.divergencesByFile[file] ?? [];
    const data = items
      .filter((it) => it.status !== "Conforme")
      .map((it) => {
        const diffStr = Object.entries(it.diffs)
          .map(([k, v]) => `${k}: "${v.ref}" -> "${v.found}"`)
          .join(" | ");
        return {
          ...it.keyValues,
          Status: it.status,
          Quantidade: it.quantity,
          Divergencias: diffStr,
          IDs: it.ids.join(", "),
        };
      });
    if (!data.length) return toast.error("Nada divergente neste arquivo");
    exportXLSX(`arkbim-${file.replace(/[^a-z0-9]+/gi, "_")}.xlsx`, [
      { name: "Divergencias", rows: data },
    ]);
  };

  if (!dataset) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
        Carregue um arquivo CSV ou XLSX.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-4">
        <h3 className="text-sm font-semibold">Configuracao da consolidacao</h3>
        <p className="text-xs text-muted-foreground">
          Defina o arquivo de referencia (valores aprovados), as colunas-chave de
          equivalencia e os parametros validados.
        </p>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              Coluna do arquivo (.rvt)
            </label>
            <Select value={fileColumn} onValueChange={(v) => setCfg({ fileColumn: v })}>
              <SelectTrigger className="h-9 text-sm">
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
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              Arquivo de referencia aprovado
            </label>
            <Select
              value={cfg.referenceFile ?? ""}
              onValueChange={(v) => setCfg({ referenceFile: v })}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Selecione um arquivo" />
              </SelectTrigger>
              <SelectContent>
                {fileOptions.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <ColumnPicker
            label="Colunas-chave (definem itens equivalentes)"
            value={cfg.keyColumns ?? []}
            cols={cols}
            onChange={setKeyCols}
            presets={[
              { label: "Type Mark", cols: ["Type Mark"] },
              {
                label: "Type Mark + Subagrupamento padrao",
                cols: ["Type Mark", "Subagrupamento padrao"],
              },
              {
                label: "Type Mark + Agrupamento padrao",
                cols: ["Type Mark", "Agrupamento padrao"],
              },
            ]}
          />
          <ColumnPicker
            label="Parametros validados (devem bater com a referencia)"
            value={cfg.paramColumns ?? []}
            cols={cols}
            onChange={setParamCols}
            presets={[
              {
                label: "Description, Manufacturer, URL",
                cols: ["Description", "Manufacturer", "URL"],
              },
            ]}
          />
        </div>

        {ready && (
          <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
            {snapshot && (
              <span className="mr-auto rounded-full border bg-secondary px-3 py-1 text-xs">
                Lista oficial salva em{" "}
                {new Date(snapshot.savedAt).toLocaleString("pt-BR")} ·{" "}
                {snapshot.reference.length} itens
              </span>
            )}
            {snapshot && (
              <Button size="sm" variant="outline" onClick={() => {
                if (window.confirm("Limpar lista oficial salva?")) {
                  clearSnapshot();
                  toast.success("Lista oficial removida");
                }
              }}>
                Limpar lista oficial
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => {
                if (!result) return;
                saveSnapshot({
                  reference: result.reference,
                  cfg: cfg as ConsolidationConfig,
                  savedAt: Date.now(),
                });
                toast.success("Lista oficial salva. Auditoria e Diagnóstico irão comparar contra ela.");
              }}
            >
              Salvar como lista oficial
            </Button>
            <Button size="sm" variant="outline" onClick={exportConsolidated}>
              <Download className="mr-1 h-3.5 w-3.5" />
              Exportar XLSX consolidado
            </Button>
          </div>
        )}
      </div>

      {result && (
        <>
          <div className="rounded-lg border bg-card p-4">
            <h3 className="text-sm font-semibold">
              Lista consolidada (referencia: {cfg.referenceFile})
            </h3>
            <p className="mb-2 text-xs text-muted-foreground">
              {result.reference.length} itens unicos.
            </p>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    {(cfg.keyColumns ?? []).map((c) => (
                      <TableHead key={c}>{c}</TableHead>
                    ))}
                    {(cfg.paramColumns ?? []).map((c) => (
                      <TableHead key={c}>{c}</TableHead>
                    ))}
                    <TableHead className="text-right">Qtd</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.reference.slice(0, 200).map((r) => (
                    <TableRow key={r.key}>
                      {(cfg.keyColumns ?? []).map((c) => (
                        <TableCell key={c}>{r.keyValues[c]}</TableCell>
                      ))}
                      {(cfg.paramColumns ?? []).map((c) => (
                        <TableCell key={c}>{r.params[c]}</TableCell>
                      ))}
                      <TableCell className="text-right font-medium">{r.quantity}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {result.reference.length > 200 && (
              <p className="mt-2 text-xs text-muted-foreground">
                Exibindo 200 de {result.reference.length}. Use Exportar para o conjunto completo.
              </p>
            )}
          </div>

          <div className="rounded-lg border bg-card p-4">
            <h3 className="mb-3 text-sm font-semibold">Divergencias por arquivo</h3>
            <div className="space-y-2">
              {Object.entries(result.divergencesByFile).map(([file, items]) => (
                <FileSection
                  key={file}
                  file={file}
                  items={items}
                  keyCols={cfg.keyColumns ?? []}
                  paramCols={cfg.paramColumns ?? []}
                  onExport={() => exportPerFile(file)}
                />
              ))}
              {!Object.keys(result.divergencesByFile).length && (
                <p className="text-sm text-muted-foreground">
                  Nenhum outro arquivo encontrado para comparar.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function FileSection({
  file,
  items,
  keyCols,
  paramCols,
  onExport,
}: {
  file: string;
  items: ReturnType<typeof buildConsolidation>["divergencesByFile"][string];
  keyCols: string[];
  paramCols: string[];
  onExport: () => void;
}) {
  const [open, setOpen] = useState(false);
  const counts = items.reduce(
    (a, it) => {
      a[it.status] = (a[it.status] ?? 0) + 1;
      return a;
    },
    {} as Record<string, number>,
  );
  const divergent = items.filter((i) => i.status !== "Conforme");

  return (
    <div className="rounded-md border">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-2 p-3 text-left hover:bg-accent/40"
      >
        <div className="flex items-center gap-2">
          {open ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          <span className="text-sm font-medium">{file}</span>
        </div>
        <div className="flex items-center gap-2">
          {counts.Conforme > 0 && (
            <Badge variant="secondary">{counts.Conforme} conformes</Badge>
          )}
          {counts.Divergente > 0 && (
            <Badge variant="destructive">{counts.Divergente} divergentes</Badge>
          )}
          {counts.Faltando > 0 && (
            <Badge className="bg-amber-500">{counts.Faltando} faltando</Badge>
          )}
          {counts.Extra > 0 && <Badge className="bg-blue-500">{counts.Extra} extra</Badge>}
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              onExport();
            }}
          >
            <Download className="h-3.5 w-3.5" />
          </Button>
        </div>
      </button>
      {open && (
        <div className="overflow-x-auto border-t">
          <Table>
            <TableHeader>
              <TableRow>
                {keyCols.map((c) => (
                  <TableHead key={c}>{c}</TableHead>
                ))}
                <TableHead>Status</TableHead>
                {paramCols.map((c) => (
                  <TableHead key={c}>{c}</TableHead>
                ))}
                <TableHead>IDs</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {divergent.map((it, i) => (
                <TableRow
                  key={i}
                  className={
                    it.status === "Divergente"
                      ? "bg-destructive/5"
                      : it.status === "Faltando"
                        ? "bg-amber-50"
                        : "bg-blue-50"
                  }
                >
                  {keyCols.map((c) => (
                    <TableCell key={c}>{it.keyValues[c]}</TableCell>
                  ))}
                  <TableCell>
                    <Badge
                      variant={it.status === "Divergente" ? "destructive" : "secondary"}
                    >
                      {it.status}
                    </Badge>
                  </TableCell>
                  {paramCols.map((c) => {
                    const d = it.diffs[c];
                    if (!d) return <TableCell key={c} className="text-muted-foreground">—</TableCell>;
                    return (
                      <TableCell key={c} className="text-xs">
                        <div>
                          <span className="text-muted-foreground">ref:</span> {d.ref || "(vazio)"}
                        </div>
                        <div className="font-medium text-destructive">
                          <span className="text-muted-foreground">found:</span>{" "}
                          {d.found || "(vazio)"}
                        </div>
                      </TableCell>
                    );
                  })}
                  <TableCell>
                    {it.ids.length > 0 && (
                      <button
                        className="text-xs text-primary hover:underline"
                        onClick={() => {
                          navigator.clipboard.writeText(it.ids.join(","));
                          toast.success("IDs copiados");
                        }}
                      >
                        {it.ids.length} IDs
                      </button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!divergent.length && (
                <TableRow>
                  <TableCell
                    colSpan={keyCols.length + paramCols.length + 2}
                    className="text-center text-sm text-muted-foreground"
                  >
                    Tudo conforme com a referencia.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function ColumnPicker({
  label,
  value,
  cols,
  onChange,
  presets,
}: {
  label: string;
  value: string[];
  cols: string[];
  onChange: (v: string[]) => void;
  presets?: { label: string; cols: string[] }[];
}) {
  const [add, setAdd] = useState("");
  const remaining = cols.filter((c) => !value.includes(c));
  return (
    <div>
      <label className="mb-1 block text-xs text-muted-foreground">{label}</label>
      <div className="flex flex-wrap gap-1">
        {value.map((c) => (
          <span
            key={c}
            className="inline-flex items-center gap-1 rounded-full border bg-secondary px-2 py-0.5 text-xs"
          >
            {c}
            <button onClick={() => onChange(value.filter((x) => x !== c))}>
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {!value.length && (
          <span className="text-xs text-muted-foreground">Nenhuma selecionada.</span>
        )}
      </div>
      <div className="mt-2 flex gap-2">
        <Select
          value={add}
          onValueChange={(v) => {
            onChange([...value, v]);
            setAdd("");
          }}
        >
          <SelectTrigger className="h-8 flex-1 text-xs">
            <SelectValue placeholder="Adicionar coluna" />
          </SelectTrigger>
          <SelectContent>
            {remaining.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {presets && presets.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {presets.map((p) => (
            <button
              key={p.label}
              onClick={() => onChange(p.cols.filter((c) => cols.includes(c)))}
              className="rounded-full border px-2 py-0.5 text-xs hover:bg-accent"
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
