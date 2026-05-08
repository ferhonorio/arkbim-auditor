import { Fragment, useMemo, useState } from "react";
import {
  Plus,
  Trash2,
  Copy,
  Pencil,
  Download,
  Settings,
  X,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { useArk } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import type { Filter, FilterOp } from "@/lib/grouping";
import {
  detectNewFiles,
  previewConsolidation,
  type ComponentList,
  type ConsolidationMode,
} from "@/lib/component-lists";
import { exportXLSX } from "@/lib/export";

const OPS: FilterOp[] = [
  "preenchido",
  "vazio",
  "igual a",
  "diferente de",
  "contem",
  "nao contem",
];

export function ListsTab() {
  const dataset = useArk((s) => s.dataset);
  const lists = useArk((s) => s.componentLists);
  const activeId = useArk((s) => s.activeComponentListId);
  const setActive = useArk((s) => s.setActiveComponentList);
  const createList = useArk((s) => s.createComponentList);
  const deleteList = useArk((s) => s.deleteComponentList);
  const duplicateList = useArk((s) => s.duplicateComponentList);
  const renameList = useArk((s) => s.renameComponentList);

  const [editingId, setEditingId] = useState<string | null>(null);

  const active = lists.find((l) => l.id === activeId) ?? null;

  if (!dataset) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
        Carregue um arquivo CSV ou XLSX para começar a montar listas consolidadas.
      </div>
    );
  }

  const handleCreate = () => {
    const name = window.prompt("Nome da nova lista (ex.: Portas, Mobiliário):");
    if (name?.trim()) {
      const id = createList(name.trim());
      setEditingId(id);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      {/* Sidebar */}
      <aside className="rounded-lg border bg-card p-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Listas</h3>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleCreate}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        {lists.length === 0 && (
          <p className="px-1 py-4 text-center text-xs text-muted-foreground">
            Nenhuma lista ainda.
            <br />
            Crie a primeira clicando em <kbd className="rounded border px-1">+</kbd>.
          </p>
        )}
        <div className="space-y-1">
          {lists.map((l) => (
            <div
              key={l.id}
              className={`group flex items-center gap-1 rounded-md border px-2 py-1.5 text-sm ${
                l.id === activeId ? "border-primary bg-primary/5" : "border-transparent hover:bg-accent"
              }`}
            >
              <button
                onClick={() => setActive(l.id)}
                className="flex-1 truncate text-left"
                title={l.name}
              >
                <div className="truncate font-medium">{l.name}</div>
                <div className="truncate text-[10px] text-muted-foreground">
                  {l.items.length} itens · {l.sourceFiles.length} arquivos
                </div>
              </button>
              <div className="flex opacity-0 group-hover:opacity-100">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  onClick={() => duplicateList(l.id)}
                  title="Duplicar"
                >
                  <Copy className="h-3 w-3" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  onClick={() => {
                    const name = window.prompt("Renomear lista", l.name);
                    if (name?.trim()) renameList(l.id, name.trim());
                  }}
                  title="Renomear"
                >
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 text-destructive"
                  onClick={() => {
                    if (window.confirm(`Excluir a lista "${l.name}"?`)) deleteList(l.id);
                  }}
                  title="Excluir"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* Main panel */}
      <section>
        {!active ? (
          <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
            Selecione uma lista à esquerda ou crie uma nova.
          </div>
        ) : (
          <ListPanel
            list={active}
            isEditing={editingId === active.id}
            onEdit={() => setEditingId(active.id)}
            onCloseEditor={() => setEditingId(null)}
          />
        )}
      </section>
    </div>
  );
}

function ListPanel({
  list,
  isEditing,
  onEdit,
  onCloseEditor,
}: {
  list: ComponentList;
  isEditing: boolean;
  onEdit: () => void;
  onCloseEditor: () => void;
}) {
  const dataset = useArk((s) => s.dataset)!;
  const consolidate = useArk((s) => s.consolidateIntoList);
  const newFiles = useMemo(
    () => detectNewFiles(dataset.rows, list),
    [dataset.rows, list],
  );
  const [showMode, setShowMode] = useState<null | { reason: "manual" | "new-files" }>(
    null,
  );

  const handleConsolidate = (mode: ConsolidationMode) => {
    const r = consolidate(list.id, mode);
    setShowMode(null);
    if (r) {
      toast.success(
        `Consolidado: +${r.added} novos · ${r.updated} atualizados · ${r.unchanged} mantidos`,
      );
    }
  };

  return (
    <div className="space-y-4">
      {newFiles.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
          <div className="flex-1">
            <div className="font-medium">
              {newFiles.length} pavimento(s) novo(s) detectado(s)
            </div>
            <div className="text-xs text-muted-foreground">{newFiles.join(" · ")}</div>
          </div>
          <Button size="sm" onClick={() => setShowMode({ reason: "new-files" })}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
            Consolidar
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-3">
        <div>
          <h2 className="text-base font-semibold">{list.name}</h2>
          <p className="text-xs text-muted-foreground">
            {list.items.length} itens · {list.sourceFiles.length} pavimentos · atualizado{" "}
            {new Date(list.updatedAt).toLocaleString("pt-BR")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={onEdit}>
            <Settings className="mr-1 h-3.5 w-3.5" />
            {isEditing ? "Editando…" : "Configurar"}
          </Button>
          <Button size="sm" onClick={() => setShowMode({ reason: "manual" })}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
            Consolidar
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!list.items.length}
            onClick={() => exportList(list)}
          >
            <Download className="mr-1 h-3.5 w-3.5" />
            Exportar
          </Button>
        </div>
      </div>

      {isEditing && <ListEditor list={list} onClose={onCloseEditor} />}

      <ConsolidatedView list={list} />

      {showMode && (
        <ModeDialog
          onClose={() => setShowMode(null)}
          onChoose={handleConsolidate}
          isFirstRun={list.items.length === 0}
        />
      )}
    </div>
  );
}

function ListEditor({ list, onClose }: { list: ComponentList; onClose: () => void }) {
  const dataset = useArk((s) => s.dataset)!;
  const update = useArk((s) => s.updateComponentList);
  const cols = dataset.columns;

  const setIncludeFilters = (filters: Filter[]) => update(list.id, { filters });
  const setExcludeFilters = (excludeFilters: Filter[]) => update(list.id, { excludeFilters });

  const preview = useMemo(() => previewConsolidation(dataset.rows, list), [dataset.rows, list]);
  const conflictsCount = preview.filter((p) => Object.keys(p.conflicts).length > 0).length;

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Configuração da lista</h3>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <FilterBlock
          title="Filtros de inclusão"
          subtitle="Quais linhas entram nesta lista (ex.: Agrupamento padrão = Portas)"
          filters={list.filters}
          cols={cols}
          onChange={setIncludeFilters}
        />
        <FilterBlock
          title="Filtros de exclusão"
          subtitle="Linhas que correspondem a estas regras são removidas"
          filters={list.excludeFilters}
          cols={cols}
          onChange={setExcludeFilters}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <ColumnsPicker
          label="Colunas-chave (identidade do item)"
          value={list.keyColumns}
          cols={cols}
          onChange={(v) => update(list.id, { keyColumns: v })}
        />
        <ColumnsPicker
          label="Parâmetros consolidados (vão aparecer na lista)"
          value={list.paramColumns}
          cols={cols}
          onChange={(v) => update(list.id, { paramColumns: v })}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">
            Coluna de pavimento / arquivo
          </label>
          <Select
            value={list.fileColumn}
            onValueChange={(v) => update(list.id, { fileColumn: v })}
          >
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
            Coluna de identificador único (opcional)
          </label>
          <Select value={list.idCol} onValueChange={(v) => update(list.id, { idCol: v })}>
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
      </div>

      <div className="rounded-md border bg-background/50 p-3 text-xs">
        <div className="font-medium">Pré-visualização</div>
        <div className="text-muted-foreground">
          {preview.length} item(ns) único(s) ·{" "}
          {preview.reduce((s, p) => s + p.totalQuantity, 0)} unidades totais
          {conflictsCount > 0 && (
            <span className="ml-1 text-amber-600">
              · {conflictsCount} item(ns) com valores divergentes entre arquivos
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterBlock({
  title,
  subtitle,
  filters,
  cols,
  onChange,
}: {
  title: string;
  subtitle: string;
  filters: Filter[];
  cols: string[];
  onChange: (f: Filter[]) => void;
}) {
  const add = () =>
    onChange([
      ...filters,
      { id: crypto.randomUUID(), column: cols[0] ?? "", op: "preenchido", value: "" },
    ]);
  const remove = (id: string) => onChange(filters.filter((f) => f.id !== id));
  const upd = (id: string, patch: Partial<Filter>) =>
    onChange(filters.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  return (
    <div className="rounded-md border bg-background/40 p-3">
      <div className="mb-1 flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold">{title}</div>
          <div className="text-[10px] text-muted-foreground">{subtitle}</div>
        </div>
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={add}>
          <Plus className="h-3 w-3" />
        </Button>
      </div>
      {filters.length === 0 && (
        <p className="text-xs text-muted-foreground">Nenhum.</p>
      )}
      <div className="space-y-2">
        {filters.map((f) => (
          <div key={f.id} className="grid grid-cols-[1fr_auto_1fr_auto] gap-1 text-xs">
            <Select value={f.column} onValueChange={(v) => upd(f.id, { column: v })}>
              <SelectTrigger className="h-7 text-xs">
                <SelectValue placeholder="Coluna" />
              </SelectTrigger>
              <SelectContent>
                {cols.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={f.op}
              onValueChange={(v) => upd(f.id, { op: v as FilterOp })}
            >
              <SelectTrigger className="h-7 w-28 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPS.map((o) => (
                  <SelectItem key={o} value={o}>
                    {o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {f.op !== "preenchido" && f.op !== "vazio" ? (
              <Input
                className="h-7 text-xs"
                value={f.value}
                onChange={(e) => upd(f.id, { value: e.target.value })}
                placeholder="valor"
              />
            ) : (
              <span />
            )}
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={() => remove(f.id)}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ColumnsPicker({
  label,
  value,
  cols,
  onChange,
}: {
  label: string;
  value: string[];
  cols: string[];
  onChange: (v: string[]) => void;
}) {
  const remaining = cols.filter((c) => !value.includes(c));
  return (
    <div>
      <label className="mb-1 block text-xs text-muted-foreground">{label}</label>
      <div className="mb-1 flex min-h-[28px] flex-wrap gap-1">
        {value.map((c, i) => (
          <span
            key={c}
            className="inline-flex items-center gap-1 rounded-full border bg-secondary px-2 py-0.5 text-xs"
          >
            <span className="text-[10px] text-muted-foreground">{i + 1}.</span>
            {c}
            <button onClick={() => onChange(value.filter((x) => x !== c))}>
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {value.length === 0 && (
          <span className="text-xs text-muted-foreground">Nenhuma.</span>
        )}
      </div>
      <Select value="" onValueChange={(v) => onChange([...value, v])}>
        <SelectTrigger className="h-8 text-xs">
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
  );
}

function ConsolidatedView({ list }: { list: ComponentList }) {
  const setAlias = useArk((s) => s.setColumnAlias);
  const removeItem = useArk((s) => s.removeListItem);
  const [search, setSearch] = useState("");
  const [fileFilter, setFileFilter] = useState<string>("__all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const allFiles = useMemo(() => {
    const set = new Set<string>();
    for (const i of list.items) for (const o of i.occurrences) set.add(o.file);
    return Array.from(set).sort();
  }, [list.items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.items.filter((it) => {
      if (fileFilter !== "__all" && !it.occurrences.some((o) => o.file === fileFilter)) {
        return false;
      }
      if (!q) return true;
      const blob = [
        ...Object.values(it.keyValues),
        ...Object.values(it.params),
      ]
        .join(" ")
        .toLowerCase();
      return blob.includes(q);
    });
  }, [list.items, search, fileFilter]);

  const aliasOf = (col: string) => list.columnAliases[col] ?? col;

  const handleRenameCol = (col: string) => {
    const next = window.prompt(
      `Renomear coluna "${col}" (deixe em branco para restaurar):`,
      list.columnAliases[col] ?? "",
    );
    if (next === null) return;
    setAlias(list.id, col, next);
  };

  const toggleRow = (key: string) =>
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  if (list.items.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
        Configure os filtros e parâmetros, depois clique em <strong>Consolidar</strong> para popular a lista.
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <Input
          className="h-8 max-w-xs text-sm"
          placeholder="Buscar…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={fileFilter} onValueChange={setFileFilter}>
          <SelectTrigger className="h-8 w-48 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Todos os pavimentos</SelectItem>
            {allFiles.map((f) => (
              <SelectItem key={f} value={f}>
                {f}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length} de {list.items.length} itens
        </span>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              {list.keyColumns.map((c) => (
                <RenamableHead key={c} col={c} alias={aliasOf(c)} onRename={handleRenameCol} />
              ))}
              {list.paramColumns.map((c) => (
                <RenamableHead key={c} col={c} alias={aliasOf(c)} onRename={handleRenameCol} />
              ))}
              <TableHead className="text-right">Qtd</TableHead>
              <TableHead>Pavimentos</TableHead>
              <TableHead className="w-8"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((it) => {
              const open = expanded.has(it.key);
              return (
                <Fragment key={it.key}>
                  <TableRow className="hover:bg-accent/40">
                    <TableCell>
                      <button onClick={() => toggleRow(it.key)}>
                        {open ? (
                          <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </TableCell>
                    {list.keyColumns.map((c) => (
                      <TableCell key={c} className="font-medium">
                        {it.keyValues[c]}
                      </TableCell>
                    ))}
                    {list.paramColumns.map((c) => (
                      <TableCell key={c}>{it.params[c]}</TableCell>
                    ))}
                    <TableCell className="text-right font-medium">
                      {it.totalQuantity}
                    </TableCell>
                    <TableCell>
                      <TooltipProvider delayDuration={200}>
                        <div className="flex flex-wrap gap-1">
                          {it.occurrences.map((o) => (
                            <Tooltip key={o.file}>
                              <TooltipTrigger asChild>
                                <Badge variant="secondary" className="cursor-default">
                                  {o.file} · {o.quantity}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                {o.quantity} unidade(s){o.ids.length ? ` · ${o.ids.length} IDs` : ""}
                              </TooltipContent>
                            </Tooltip>
                          ))}
                        </div>
                      </TooltipProvider>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          if (window.confirm("Remover este item da lista?"))
                            removeItem(list.id, it.key);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                  {open && (
                    <TableRow className="bg-muted/20">
                      <TableCell />
                      <TableCell
                        colSpan={
                          list.keyColumns.length + list.paramColumns.length + 3
                        }
                      >
                        <div className="space-y-1 text-xs">
                          <div className="font-medium">Detalhes por pavimento</div>
                          {it.occurrences.map((o) => (
                            <div key={o.file} className="flex gap-2">
                              <span className="font-medium">{o.file}</span>
                              <span className="text-muted-foreground">
                                {o.quantity} unidade(s)
                                {o.ids.length ? ` · IDs: ${o.ids.join(", ")}` : ""}
                              </span>
                            </div>
                          ))}
                          <div className="pt-1 text-[10px] text-muted-foreground">
                            Atualizado em{" "}
                            {new Date(it.lastUpdatedAt).toLocaleString("pt-BR")}
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function RenamableHead({
  col,
  alias,
  onRename,
}: {
  col: string;
  alias: string;
  onRename: (col: string) => void;
}) {
  const renamed = alias !== col;
  return (
    <TableHead
      onDoubleClick={() => onRename(col)}
      className="group cursor-pointer select-none"
      title={`Origem: ${col} · duplo-clique para renomear`}
    >
      <span className="inline-flex items-center gap-1">
        {alias}
        {renamed && <span className="text-[9px] text-muted-foreground">({col})</span>}
        <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-50" />
      </span>
    </TableHead>
  );
}

function ModeDialog({
  onClose,
  onChoose,
  isFirstRun,
}: {
  onClose: () => void;
  onChoose: (m: ConsolidationMode) => void;
  isFirstRun: boolean;
}) {
  const opts: { mode: ConsolidationMode; label: string; desc: string }[] = [
    {
      mode: "merge",
      label: "Mesclar / atualizar",
      desc: "Adiciona itens novos e atualiza valores existentes com os mais recentes.",
    },
    {
      mode: "replace",
      label: "Substituir",
      desc: "Sobrescreve completamente os parâmetros dos itens existentes.",
    },
    {
      mode: "only-new",
      label: "Apenas novos",
      desc: "Mantém os itens existentes intactos; grava só itens inéditos.",
    },
    {
      mode: "ignore-conflicts",
      label: "Ignorar conflitos",
      desc: "Atualiza apenas a contagem por pavimento; preserva os parâmetros antigos.",
    },
  ];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Como consolidar os dados?</DialogTitle>
          <DialogDescription>
            {isFirstRun
              ? "Esta é a primeira consolidação — qualquer modo apenas adicionará os itens."
              : "Escolha como tratar itens já existentes na lista."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          {opts.map((o) => (
            <button
              key={o.mode}
              onClick={() => onChoose(o.mode)}
              className="rounded-md border p-3 text-left hover:border-primary hover:bg-primary/5"
            >
              <div className="text-sm font-medium">{o.label}</div>
              <div className="text-xs text-muted-foreground">{o.desc}</div>
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function exportList(list: ComponentList) {
  if (!list.items.length) return;
  const aliasOf = (c: string) => list.columnAliases[c] ?? c;
  const cols = [
    ...list.keyColumns.map(aliasOf),
    ...list.paramColumns.map(aliasOf),
    "Quantidade",
    "Pavimentos",
    "IDs",
  ];
  const rows = list.items.map((it) => {
    const r: Record<string, string | number> = {};
    for (const c of list.keyColumns) r[aliasOf(c)] = it.keyValues[c] ?? "";
    for (const c of list.paramColumns) r[aliasOf(c)] = it.params[c] ?? "";
    r["Quantidade"] = it.totalQuantity;
    r["Pavimentos"] = it.occurrences.map((o) => `${o.file} (${o.quantity})`).join(" · ");
    r["IDs"] = it.occurrences.flatMap((o) => o.ids).join(", ");
    return r;
  });
  exportXLSX(`${list.name.replace(/[^a-z0-9]+/gi, "_")}.xlsx`, [
    { name: list.name.slice(0, 31) || "Lista", rows, columns: cols },
  ]);
}
