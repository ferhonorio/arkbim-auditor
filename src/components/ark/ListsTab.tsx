import { Fragment, useMemo, useRef, useState, useEffect } from "react";
import {
  Plus,
  Trash2,
  Pencil,
  ChevronDown,
  ChevronRight,
  FolderOpen,
  Search as SearchIcon,
  Undo2,
  Map as MapIcon,
  Presentation,
  Copy,
  Check,
  Share2,
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
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import type { ComponentList, ConsolidatedItem } from "@/lib/component-lists";
import { FloorMappingPanel } from "@/components/ark/lists/FloorMappingPanel";
import { PresentationView } from "@/components/ark/lists/PresentationView";
import { ExportMenu } from "@/components/ark/lists/ExportMenu";
import { ShareLinksDialog } from "@/components/ark/lists/ShareLinksDialog";
import { ItemCommentsPopover } from "@/components/ark/lists/ItemCommentsPopover";
import {
  fetchOpenCommentSummaryByItem,
  type ItemCommentSummary,
} from "@/lib/comments";

const DEFAULT_COL_WIDTH = 160;
const KEY_COL_WIDTH = 90;
const QTY_COL_WIDTH = 80;

/** Per-column-name default width heuristic (PT-BR + EN). */
function defaultWidthFor(col: string): number {
  const n = col.toLowerCase();
  if (n === "id" || n === "type mark" || n === "tipo" || n === "código" || n === "codigo") return 90;
  if (n.includes("qtd") || n.includes("quant") || n.includes("área") || n.includes("area")) return 80;
  if (n.includes("descri")) return 320;
  if (n.includes("url") || n.includes("link")) return 200;
  if (n.includes("modelo") || n.includes("fabric") || n.includes("marca") || n.includes("manuf")) return 160;
  if (n.includes("nome do arquivo") || n.includes("file")) return 200;
  return DEFAULT_COL_WIDTH;
}

export function ListsTab({
  readOnly = false,
  canComment = false,
}: { readOnly?: boolean; canComment?: boolean } = {}) {
  const lists = useArk((s) => s.componentLists);
  const activeId = useArk((s) => s.activeComponentListId);
  const setActive = useArk((s) => s.setActiveComponentList);
  const createList = useArk((s) => s.createComponentList);
  const renameList = useArk((s) => s.renameComponentList);
  const deleteList = useArk((s) => s.deleteComponentList);
  const setColumnAlias = useArk((s) => s.setColumnAlias);
  const setColumnWidth = useArk((s) => s.setColumnWidth);
  const removeItem = useArk((s) => s.removeListItem);
  const clearItems = useArk((s) => s.clearListItems);
  const updateItemParam = useArk((s) => s.updateItemParam);
  const renameItemKey = useArk((s) => s.renameItemKey);
  const undoLast = useArk((s) => s.undoLastConsolidation);

  const active = lists.find((l) => l.id === activeId) ?? lists[0] ?? null;
  const [presentation, setPresentation] = useState(false);

  const handleCreate = () => {
    const name = window.prompt(
      "Nome da categoria (ex.: Portas, Janelas):\n\nDica: para configurar coluna chave, pavimento e modo (item/área), crie a categoria pela aba Análise → Consolidar.",
    );
    if (!name?.trim()) return;
    createList(name.trim());
    toast.success(`Categoria "${name.trim()}" criada com defaults (Type Mark / Nome do arquivo / por item)`);
  };

  if (presentation) {
    return (
      <div className="flex h-[calc(100vh-160px)] flex-col gap-4 overflow-auto">
        <PresentationView
          lists={lists}
          initialId={active?.id}
          onClose={() => setPresentation(false)}
        />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-160px)] gap-4">
      <aside className="flex w-64 shrink-0 flex-col gap-2 rounded-lg border bg-card p-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Categorias</h3>
          {!readOnly && (
            <Button size="sm" variant="outline" onClick={handleCreate}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Nova
            </Button>
          )}
        </div>
        {lists.length === 0 && (
          <p className="text-xs text-muted-foreground">
            {readOnly
              ? "Nenhuma categoria disponível."
              : "Nenhuma categoria ainda. Crie uma e consolide dados pela aba Análise."}
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
              <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
                {l.keyColumn} · {l.measureMode === "area" ? "m²" : "un"}
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
            allLists={lists}
            readOnly={readOnly}
            canComment={canComment}
            onPresent={() => setPresentation(true)}
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
            onSetWidth={(col, w) => setColumnWidth(active.id, col, w)}
            onRemoveItem={(key) => removeItem(active.id, key)}
            onUpdateParam={(key, col, val) => updateItemParam(active.id, key, col, val)}
            onRenameKey={(oldK, newK) => {
              const ok = renameItemKey(active.id, oldK, newK);
              if (!ok) toast.error("Chave inválida ou já existe");
              else toast.success("Chave renomeada");
              return ok;
            }}
            onUndo={() => {
              const ok = undoLast(active.id);
              if (ok) toast.success("Última consolidação desfeita");
              else toast.error("Nada para desfazer");
            }}
          />
        )}
      </main>
    </div>
  );
}

function CategoryView({
  list,
  allLists,
  readOnly,
  canComment,
  onPresent,
  onRename,
  onDelete,
  onClear,
  onSetAlias,
  onSetWidth,
  onRemoveItem,
  onUpdateParam,
  onRenameKey,
  onUndo,
}: {
  list: ComponentList;
  allLists: ComponentList[];
  readOnly: boolean;
  canComment: boolean;
  onPresent: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onClear: () => void;
  onSetAlias: (col: string, alias: string) => void;
  onSetWidth: (col: string, width: number) => void;
  onRemoveItem: (key: string) => void;
  onUpdateParam: (key: string, col: string, val: string) => void;
  onRenameKey: (oldKey: string, newKey: string) => boolean;
  onUndo: () => void;
}) {
  const [search, setSearch] = useState("");
  const [floor, setFloor] = useState<string>("__all__");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showFloorMap, setShowFloorMap] = useState(false);
  const [editing, setEditing] = useState<{ key: string; col: string } | null>(null);
  const [editVal, setEditVal] = useState("");

  const unit = list.measureMode === "area" ? "m²" : "un";
  const qtyHeader = list.measureMode === "area" ? "Área (m²)" : "Qtd (un)";

  const fmtQty = (n: number) =>
    list.measureMode === "area"
      ? n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })
      : n.toLocaleString("pt-BR");

  const allColumns = useMemo(() => {
    const set = new Set<string>();
    for (const i of list.items) for (const c of i.columns) set.add(c);
    return Array.from(set);
  }, [list.items]);

  const allFloors = useMemo(() => {
    const set = new Set<string>();
    for (const i of list.items) for (const o of i.occurrences) set.add(o.floor);
    return Array.from(set).sort();
  }, [list.items]);

  const filteredItems = useMemo(() => {
    const s = search.trim().toLowerCase();
    return list.items.filter((i) => {
      if (floor !== "__all__" && !i.occurrences.some((o) => o.floor === floor)) {
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
  const colWidth = (col: string, fallback?: number) =>
    list.columnWidths?.[col] ?? fallback ?? defaultWidthFor(col);

  const handleRename = () => {
    const name = window.prompt("Renomear categoria:", list.name);
    if (name?.trim()) onRename(name.trim());
  };

  const handleHeaderRename = (col: string) => {
    const cur = list.columnAliases[col] || "";
    const isKey = col === list.keyColumn;
    const next = window.prompt(
      isKey
        ? `Renomear cabeçalho da coluna chave "${col}" (apenas máscara visual — o nome interno continua "${col}"):`
        : `Renomear coluna "${col}":`,
      cur,
    );
    if (next === null) return;
    onSetAlias(col, next.trim());
  };

  const handleRenameKey = (oldKey: string) => {
    const next = window.prompt(`Renomear ${list.keyColumn} (chave):`, oldKey);
    if (next == null) return;
    const t = next.trim();
    if (!t || t === oldKey) return;
    onRenameKey(oldKey, t);
  };

  const startEdit = (key: string, col: string, value: string) => {
    if (col === list.keyColumn) return;
    setEditing({ key, col });
    setEditVal(value);
  };
  const commitEdit = () => {
    if (!editing) return;
    onUpdateParam(editing.key, editing.col, editVal);
    setEditing(null);
    toast.success("Atualizado");
  };

  const [confirmUndo, setConfirmUndo] = useState(false);
  const [shareScope, setShareScope] = useState<"all" | "category" | null>(null);
  const [commentSummaries, setCommentSummaries] = useState<Map<string, ItemCommentSummary>>(
    new Map(),
  );

  useEffect(() => {
    if (!canComment) return;
    let alive = true;
    fetchOpenCommentSummaryByItem(list.id).then((m) => {
      if (alive) setCommentSummaries(m);
    });
    return () => {
      alive = false;
    };
  }, [canComment, list.id, list.updatedAt]);

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
            {!readOnly && (
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={handleRename}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {list.items.length} itens · {allFloors.length} pavimentos · chave:{" "}
            <strong>{list.keyColumn}</strong> · pavimento:{" "}
            <strong>{list.floorColumn}</strong> · modo:{" "}
            <strong>
              {list.measureMode === "area" ? `por área (${list.areaColumn})` : "por item"}
            </strong>{" "}
            · atualizado {new Date(list.updatedAt).toLocaleString("pt-BR")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={onPresent}
          >
            <Presentation className="mr-1 h-3.5 w-3.5" /> Modo apresentação
          </Button>
          {!readOnly && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShareScope("category")}
                title="Gerar link público desta categoria"
              >
                <Share2 className="mr-1 h-3.5 w-3.5" /> Compartilhar
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShareScope("all")}
                title="Gerar link público de todas as listas"
              >
                <Share2 className="mr-1 h-3.5 w-3.5" /> Compartilhar tudo
              </Button>
            </>
          )}
          {!readOnly && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfirmUndo(true)}
              disabled={!list.lastSnapshot}
              title={
                list.lastSnapshot
                  ? `Reverte ${list.lastSnapshot.summary.added} novo(s) / ${list.lastSnapshot.summary.updated} sobrescrito(s) — ${new Date(list.lastSnapshot.savedAt).toLocaleString("pt-BR")}`
                  : "Nada para desfazer"
              }
            >
              <Undo2 className="mr-1 h-3.5 w-3.5" /> Desfazer última
            </Button>
          )}
          {!readOnly && (
            <Button
              size="sm"
              variant={showFloorMap ? "default" : "outline"}
              onClick={() => setShowFloorMap((v) => !v)}
            >
              <MapIcon className="mr-1 h-3.5 w-3.5" /> Pavimentos
            </Button>
          )}
          <ExportMenu
            list={list}
            allLists={allLists}
            filteredItems={filteredItems}
            totalForItem={(i) => {
              if (floor === "__all__") return i.totalQuantity;
              const occs = i.occurrences.filter((o) => o.floor === floor);
              return Math.round(occs.reduce((s, o) => s + o.quantity, 0) * 1000) / 1000;
            }}
          />
          {!readOnly && (
            <Button size="sm" variant="outline" onClick={onClear}>
              Limpar lista
            </Button>
          )}
          {!readOnly && (
            <Button size="sm" variant="destructive" onClick={onDelete}>
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Excluir categoria
            </Button>
          )}
        </div>
      </div>

      {showFloorMap && <FloorMappingPanel list={list} />}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <SearchIcon className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Buscar ${list.keyColumn} ou parâmetro…`}
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
          <strong>Consolidar</strong> selecionando esta categoria.
        </div>
      ) : (
        <div className="overflow-auto rounded-md border">
          <table
            className="w-full caption-bottom text-sm"
            style={{ tableLayout: "fixed" }}
          >
            <colgroup>
              <col style={{ width: 32 }} />
              <col style={{ width: colWidth(list.keyColumn, KEY_COL_WIDTH) }} />
              {allColumns.map((c) => (
                <col key={c} style={{ width: colWidth(c) }} />
              ))}
              <col style={{ width: colWidth("__qty__", QTY_COL_WIDTH) }} />
              <col style={{ width: 72 }} />
            </colgroup>
            <thead className="border-b">
              <tr>
                <th />
                <ResizableTh
                  label={headerLabel(list.keyColumn)}
                  origin={list.keyColumn}
                  width={colWidth(list.keyColumn, KEY_COL_WIDTH)}
                  onResize={(w) => onSetWidth(list.keyColumn, w)}
                  onRename={readOnly ? undefined : () => handleHeaderRename(list.keyColumn)}
                  bold
                />
                {allColumns.map((c) => (
                  <ResizableTh
                    key={c}
                    label={headerLabel(c)}
                    origin={c}
                    width={colWidth(c)}
                    onResize={(w) => onSetWidth(c, w)}
                    onRename={readOnly ? undefined : () => handleHeaderRename(c)}
                  />
                ))}
                <ResizableTh
                  label={qtyHeader}
                  origin="__qty__"
                  width={colWidth("__qty__", QTY_COL_WIDTH)}
                  onResize={(w) => onSetWidth("__qty__", w)}
                  align="right"
                />
                <th />
              </tr>
            </thead>
            <tbody className="[&_tr:last-child]:border-0">
              {filteredItems.map((i) => {
                const open = expanded.has(i.key);
                return (
                  <Fragment key={i.key}>
                    <tr className="border-b transition-colors hover:bg-muted/50">
                      <td className="p-1">
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
                      </td>
                      <td
                        className="group/cell truncate p-2 align-middle font-medium"
                        title={readOnly ? i.key : "Duplo-clique para renomear chave"}
                        onDoubleClick={readOnly ? undefined : () => handleRenameKey(i.key)}
                      >
                        <CopyableContent value={i.key}>{i.key}</CopyableContent>
                      </td>
                      {allColumns.map((c) => {
                        const isEditing = !readOnly && editing?.key === i.key && editing.col === c;
                        const value = i.params[c] ?? "";
                        return (
                          <td
                            key={c}
                            className="group/cell truncate p-1 align-middle text-xs"
                            title={value}
                            onDoubleClick={
                              readOnly ? undefined : () => startEdit(i.key, c, value)
                            }
                          >
                            {isEditing ? (
                              <Input
                                autoFocus
                                value={editVal}
                                onChange={(e) => setEditVal(e.target.value)}
                                onBlur={commitEdit}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") commitEdit();
                                  else if (e.key === "Escape") setEditing(null);
                                }}
                                className="h-6 text-xs"
                              />
                            ) : (
                              <CopyableContent value={value}>
                                <span className="block truncate p-1">{value}</span>
                              </CopyableContent>
                            )}
                          </td>
                        );
                      })}
                      <td className="p-2 text-right font-mono text-xs">
                        {fmtQty(i.totalQuantity)}
                      </td>
                      <td className="p-1">
                        <div className="flex items-center justify-end gap-0.5">
                          {canComment && (
                            <ItemCommentsPopover
                              listId={list.id}
                              itemKey={i.key}
                              canComment={canComment}
                              canModerate={!readOnly}
                            />
                          )}
                          {!readOnly && (
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
                          )}
                        </div>
                      </td>
                    </tr>
                    {open && (
                      <tr className="bg-muted/30">
                        <td />
                        <td colSpan={allColumns.length + 3} className="p-3">
                          <FloorBreakdown item={i} fmt={fmtQty} unit={unit} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ShareLinksDialog
        open={shareScope !== null}
        onOpenChange={(o) => !o && setShareScope(null)}
        scope={shareScope ?? "category"}
        listId={shareScope === "category" ? list.id : undefined}
        listName={list.name}
      />

      <AlertDialog open={confirmUndo} onOpenChange={setConfirmUndo}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desfazer última consolidação?</AlertDialogTitle>
            <AlertDialogDescription>
              Categoria <strong>{list.name}</strong>.{" "}
              {list.lastSnapshot ? (
                <>
                  Reverte {list.lastSnapshot.summary.added} novo(s),{" "}
                  {list.lastSnapshot.summary.updated} sobrescrito(s),{" "}
                  {list.lastSnapshot.summary.skipped} mantido(s) — salvo em{" "}
                  {new Date(list.lastSnapshot.savedAt).toLocaleString("pt-BR")}.
                </>
              ) : null}
              <br />
              <strong className="text-destructive">
                Esta ação não pode ser revertida.
              </strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                onUndo();
                setConfirmUndo(false);
              }}
            >
              Sim, desfazer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function FloorBreakdown({
  item,
  fmt,
  unit,
}: {
  item: ConsolidatedItem;
  fmt: (n: number) => string;
  unit: string;
}) {
  const grouped = useMemo(() => {
    const m = new Map<string, { quantity: number; files: { file: string; quantity: number; ids: string[] }[] }>();
    for (const o of item.occurrences) {
      if (!m.has(o.floor)) m.set(o.floor, { quantity: 0, files: [] });
      const g = m.get(o.floor)!;
      g.quantity += o.quantity;
      g.files.push({ file: o.file, quantity: o.quantity, ids: o.ids });
    }
    return Array.from(m, ([floor, v]) => ({ floor, ...v })).sort((a, b) =>
      a.floor.localeCompare(b.floor),
    );
  }, [item]);

  return (
    <div className="space-y-2 text-xs">
      <div className="font-semibold">Subgrupos por pavimento</div>
      <div className="grid gap-2 md:grid-cols-2">
        {grouped.map((g) => (
          <div key={g.floor} className="rounded border bg-background p-2">
            <div className="flex items-center justify-between font-medium">
              <span>{g.floor}</span>
              <span className="font-mono">{fmt(g.quantity)} {unit}</span>
            </div>
            <ul className="mt-1 space-y-0.5 text-[10px] text-muted-foreground">
              {g.files.map((f) => (
                <li key={f.file} className="flex justify-between gap-2">
                  <span className="truncate">{f.file}</span>
                  <span className="shrink-0 font-mono">{fmt(f.quantity)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResizableTh({
  label,
  origin,
  width,
  onResize,
  onRename,
  bold,
  align,
}: {
  label: string;
  origin: string;
  width: number;
  onResize: (w: number) => void;
  onRename?: () => void;
  bold?: boolean;
  align?: "right";
}) {
  const ref = useRef<HTMLTableCellElement>(null);
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef(0);
  const startWRef = useRef(0);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - startXRef.current;
      const w = Math.max(60, startWRef.current + dx);
      onResize(w);
    };
    const onUp = () => setDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, onResize]);

  return (
    <th
      ref={ref}
      className={`group relative h-10 select-none truncate px-2 align-middle text-left text-muted-foreground ${
        bold ? "font-semibold text-foreground" : "font-medium"
      } ${align === "right" ? "text-right" : ""}`}
      title={onRename ? `Duplo-clique para renomear (origem: ${origin})` : undefined}
      onDoubleClick={onRename}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {onRename && (
          <Pencil className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-50" />
        )}
      </span>
      <span
        onMouseDown={(e) => {
          e.preventDefault();
          startXRef.current = e.clientX;
          startWRef.current = width;
          setDragging(true);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onResize(DEFAULT_COL_WIDTH);
        }}
        className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize bg-transparent hover:bg-primary/30"
        title="Arrastar para redimensionar · duplo-clique para padrão"
      />
    </th>
  );
}

function CopyableContent({
  value,
  children,
}: {
  value: string;
  children: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };

  return (
    <span className="relative flex min-w-0 items-center gap-1">
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {value && (
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copiar valor"
          title={copied ? "Copiado!" : "Copiar"}
          className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus:opacity-100 group-hover/cell:opacity-100"
        >
          {copied ? (
            <Check className="h-3 w-3 text-emerald-600" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </button>
      )}
    </span>
  );
}

export default ListsTab;
