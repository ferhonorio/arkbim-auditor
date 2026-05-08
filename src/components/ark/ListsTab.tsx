import { Fragment, useMemo, useState } from "react";
import {
  Plus,
  Trash2,
  Pencil,
  Download,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  Search as SearchIcon,
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { exportXLSX } from "@/lib/export";
import { KEY_COLUMN, type ComponentList } from "@/lib/component-lists";
import type { Row } from "@/lib/parse";

export function ListsTab() {
  const lists = useArk((s) => s.componentLists);
  const activeId = useArk((s) => s.activeComponentListId);
  const setActive = useArk((s) => s.setActiveComponentList);
  const createList = useArk((s) => s.createComponentList);
  const renameList = useArk((s) => s.renameComponentList);
  const deleteList = useArk((s) => s.deleteComponentList);
  const setColumnAlias = useArk((s) => s.setColumnAlias);
  const removeItem = useArk((s) => s.removeListItem);
  const clearItems = useArk((s) => s.clearListItems);

  const active = lists.find((l) => l.id === activeId) ?? lists[0] ?? null;

  const handleCreate = () => {
    const name = window.prompt("Nome da categoria (ex.: Portas, Janelas, Mobiliário):");
    if (!name?.trim()) return;
    createList(name.trim());
    toast.success(`Categoria "${name.trim()}" criada`);
  };

  return (
    <div className="flex h-[calc(100vh-160px)] gap-4">
      <aside className="flex w-64 shrink-0 flex-col gap-2 rounded-lg border bg-card p-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Categorias</h3>
          <Button size="sm" variant="outline" onClick={handleCreate}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Nova
          </Button>
        </div>
        {lists.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Nenhuma categoria ainda. Crie uma e consolide dados pela aba Análise.
          </p>
        )}
        <div className="flex-1 space-y-1 overflow-auto">
          {lists.map((l) => (
            <button
              key={l.id}
              onClick={() => setActive(l.id)}
              className={`w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                active?.id === l.id
                  ? "bg-primary/10 text-primary font-medium"
                  : "hover:bg-muted"
              }`}
            >
              <div className="flex items-center gap-2">
                <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{l.name}</span>
                <Badge variant="secondary" className="ml-auto text-[10px]">
                  {l.items.length}
                </Badge>
              </div>
            </button>
          ))}
        </div>
      </aside>

      <main className="flex-1 overflow-auto rounded-lg border bg-card p-4">
        {!active ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <FolderOpen className="h-10 w-10" />
            <p className="text-sm">Selecione ou crie uma categoria.</p>
          </div>
        ) : (
          <CategoryView
            list={active}
            onRename={(name) => renameList(active.id, name)}
            onDelete={() => {
              if (window.confirm(`Excluir categoria "${active.name}"?`)) {
                deleteList(active.id);
                toast.success("Categoria excluída");
              }
            }}
            onClear={() => {
              if (window.confirm(`Limpar todos os itens de "${active.name}"?`)) {
                clearItems(active.id);
                toast.success("Lista limpa");
              }
            }}
            onSetAlias={(col, alias) => setColumnAlias(active.id, col, alias)}
            onRemoveItem={(key) => removeItem(active.id, key)}
          />
        )}
      </main>
    </div>
  );
}

function CategoryView({
  list,
  onRename,
  onDelete,
  onClear,
  onSetAlias,
  onRemoveItem,
}: {
  list: ComponentList;
  onRename: (name: string) => void;
  onDelete: () => void;
  onClear: () => void;
  onSetAlias: (col: string, alias: string) => void;
  onRemoveItem: (key: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [floor, setFloor] = useState<string>("__all__");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const allColumns = useMemo(() => {
    const set = new Set<string>();
    for (const i of list.items) for (const c of i.columns) set.add(c);
    return Array.from(set);
  }, [list.items]);

  const allFloors = useMemo(() => {
    const set = new Set<string>();
    for (const i of list.items) for (const o of i.occurrences) set.add(o.file);
    return Array.from(set).sort();
  }, [list.items]);

  const filteredItems = useMemo(() => {
    const s = search.trim().toLowerCase();
    return list.items.filter((i) => {
      if (floor !== "__all__" && !i.occurrences.some((o) => o.file === floor)) {
        return false;
      }
      if (!s) return true;
      if (i.key.toLowerCase().includes(s)) return true;
      for (const c of allColumns) {
        if ((i.params[c] ?? "").toLowerCase().includes(s)) return true;
      }
      return false;
    });
  }, [list.items, search, floor, allColumns]);

  const headerLabel = (col: string) => list.columnAliases[col] || col;

  const handleRename = () => {
    const name = window.prompt("Renomear categoria:", list.name);
    if (name?.trim()) onRename(name.trim());
  };

  const handleHeaderRename = (col: string) => {
    const cur = list.columnAliases[col] || "";
    const next = window.prompt(`Renomear coluna "${col}":`, cur);
    if (next === null) return;
    onSetAlias(col, next.trim());
  };

  const handleExport = () => {
    if (!filteredItems.length) return toast.error("Nada para exportar");
    const rows: Row[] = filteredItems.map((i) => {
      const r: Row = { [KEY_COLUMN]: i.key } as Row;
      for (const c of allColumns) r[c] = i.params[c] ?? "";
      r["Quantidade total"] = String(i.totalQuantity);
      r["Pavimentos"] = i.occurrences.map((o) => `${o.file} (${o.quantity})`).join(" · ");
      return r;
    });
    exportXLSX(`${list.name}.xlsx`, [
      {
        name: list.name.slice(0, 28),
        rows,
        columns: [KEY_COLUMN, ...allColumns, "Quantidade total", "Pavimentos"],
      },
    ]);
  };

  const toggle = (k: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold">{list.name}</h2>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleRename}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {list.items.length} itens · {allFloors.length} pavimentos · atualizado{" "}
            {new Date(list.updatedAt).toLocaleString("pt-BR")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={handleExport}>
            <Download className="mr-1 h-3.5 w-3.5" /> Exportar XLSX
          </Button>
          <Button size="sm" variant="outline" onClick={onClear}>
            Limpar lista
          </Button>
          <Button size="sm" variant="destructive" onClick={onDelete}>
            <Trash2 className="mr-1 h-3.5 w-3.5" /> Excluir categoria
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <SearchIcon className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar Type Mark ou parâmetro…"
            className="h-8 w-72 pl-7 text-xs"
          />
        </div>
        <Select value={floor} onValueChange={setFloor}>
          <SelectTrigger className="h-8 w-56 text-xs">
            <SelectValue placeholder="Pavimento" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos os pavimentos</SelectItem>
            {allFloors.map((f) => (
              <SelectItem key={f} value={f}>
                {f}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {list.items.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          Esta categoria está vazia. Vá até a aba <strong>Análise & Agrupamentos</strong>,
          filtre os dados desejados e use o botão{" "}
          <strong>Consolidar dados filtrados</strong> selecionando esta categoria.
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" />
                <TableHead className="font-semibold">{KEY_COLUMN}</TableHead>
                {allColumns.map((c) => (
                  <TableHead
                    key={c}
                    className="group cursor-pointer select-none whitespace-nowrap"
                    onDoubleClick={() => handleHeaderRename(c)}
                    title={`Duplo-clique para renomear (origem: ${c})`}
                  >
                    <span className="flex items-center gap-1">
                      {headerLabel(c)}
                      <Pencil className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-50" />
                    </span>
                  </TableHead>
                ))}
                <TableHead className="text-right">Qtd</TableHead>
                <TableHead>Pavimentos</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItems.map((i) => {
                const open = expanded.has(i.key);
                return (
                  <Fragment key={i.key}>
                    <TableRow>
                      <TableCell className="p-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => toggle(i.key)}
                        >
                          {open ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </TableCell>
                      <TableCell className="font-medium">{i.key}</TableCell>
                      {allColumns.map((c) => (
                        <TableCell key={c} className="text-xs">
                          {i.params[c] ?? ""}
                        </TableCell>
                      ))}
                      <TableCell className="text-right font-mono text-xs">
                        {i.totalQuantity}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <TooltipProvider>
                            {i.occurrences.map((o) => (
                              <Tooltip key={o.file}>
                                <TooltipTrigger asChild>
                                  <Badge variant="secondary" className="text-[10px]">
                                    {o.file} · {o.quantity}
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <div className="text-xs">
                                    {o.quantity} ocorrência(s)
                                    {o.ids.length > 0 && (
                                      <div className="mt-1 max-w-[280px] truncate text-[10px] opacity-70">
                                        IDs: {o.ids.slice(0, 8).join(", ")}
                                        {o.ids.length > 8 ? "…" : ""}
                                      </div>
                                    )}
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            ))}
                          </TooltipProvider>
                        </div>
                      </TableCell>
                      <TableCell className="p-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-destructive"
                          onClick={() => {
                            if (window.confirm(`Remover "${i.key}" da lista?`))
                              onRemoveItem(i.key);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                    {open && (
                      <TableRow className="bg-muted/30">
                        <TableCell />
                        <TableCell colSpan={allColumns.length + 4}>
                          <div className="space-y-1 py-2 text-xs">
                            <div className="font-semibold">Ocorrências por pavimento</div>
                            {i.occurrences.map((o) => (
                              <div key={o.file} className="flex gap-3">
                                <span className="min-w-[200px] font-medium">{o.file}</span>
                                <span>Qtd: {o.quantity}</span>
                                <span className="text-muted-foreground">
                                  IDs: {o.ids.join(", ") || "—"}
                                </span>
                              </div>
                            ))}
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
      )}
    </div>
  );
}

export default ListsTab;
