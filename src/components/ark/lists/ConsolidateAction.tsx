import { useEffect, useMemo, useState } from "react";
import { Layers, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useArk, type CreateListOpts } from "@/lib/store";
import {
  DEFAULT_KEY_COLUMN,
  DEFAULT_FLOOR_COLUMN,
  planConsolidation,
  type ConsolidatePlan,
  type ConsolidatedItem,
  type MeasureMode,
} from "@/lib/component-lists";
import type { Row } from "@/lib/parse";
import { ColumnMappingDialog } from "./ColumnMappingDialog";

interface Props {
  rows: Row[];
  columns: string[];
  selectedCount: number;
  /** Schema override coming from the AnaliseTab quick selectors. */
  defaultKeyColumn?: string;
  defaultFloorColumn?: string;
  onConsolidated?: () => void;
}

export function ConsolidateAction({
  rows,
  columns,
  selectedCount,
  defaultKeyColumn,
  defaultFloorColumn,
  onConsolidated,
}: Props) {
  const lists = useArk((s) => s.componentLists);
  const createList = useArk((s) => s.createComponentList);
  const updateList = useArk((s) => s.updateComponentList);
  const apply = useArk((s) => s.applyConsolidation);
  const dataset = useArk((s) => s.dataset);

  const datasetCols = dataset?.columns ?? [];

  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedListId, setSelectedListId] = useState<string>("");

  // Per-run schema override
  const [keyOverride, setKeyOverride] = useState<string>("");
  const [floorOverride, setFloorOverride] = useState<string>("");
  const [persistSchema, setPersistSchema] = useState(false);

  // Mapping step
  const [mapOpen, setMapOpen] = useState(false);
  const [pendingPlan, setPendingPlan] = useState<ConsolidatePlan | null>(null);
  const [pendingListId, setPendingListId] = useState<string>("");

  const [plan, setPlan] = useState<ConsolidatePlan | null>(null);
  const [conflictOpen, setConflictOpen] = useState(false);

  // New-category form state
  const [newName, setNewName] = useState("");
  const [newKey, setNewKey] = useState<string>(DEFAULT_KEY_COLUMN);
  const [newFloor, setNewFloor] = useState<string>(DEFAULT_FLOOR_COLUMN);
  const [newMode, setNewMode] = useState<MeasureMode>("count");
  const [newAreaCol, setNewAreaCol] = useState<string>("");

  const activeList = lists.find((l) => l.id === selectedListId);

  // Sync overrides when list changes / dialog opens
  useEffect(() => {
    if (!open) return;
    if (activeList) {
      setKeyOverride(activeList.keyColumn);
      setFloorOverride(activeList.floorColumn);
    } else {
      setKeyOverride(defaultKeyColumn || DEFAULT_KEY_COLUMN);
      setFloorOverride(defaultFloorColumn || DEFAULT_FLOOR_COLUMN);
    }
    setPersistSchema(false);
  }, [open, activeList, defaultKeyColumn, defaultFloorColumn]);

  useEffect(() => {
    if (!createOpen) return;
    if (datasetCols.includes(defaultKeyColumn || "")) setNewKey(defaultKeyColumn!);
    else if (datasetCols.includes(DEFAULT_KEY_COLUMN)) setNewKey(DEFAULT_KEY_COLUMN);
    else if (datasetCols.includes("Marca de Tipo")) setNewKey("Marca de Tipo");
    else setNewKey(datasetCols[0] ?? "");
    setNewFloor(
      datasetCols.includes(defaultFloorColumn || "")
        ? defaultFloorColumn!
        : datasetCols.includes(DEFAULT_FLOOR_COLUMN)
          ? DEFAULT_FLOOR_COLUMN
          : datasetCols[0] ?? "",
    );
  }, [createOpen, datasetCols, defaultKeyColumn, defaultFloorColumn]);

  const runWithList = (listId: string) => {
    const list = lists.find((l) => l.id === listId);
    if (!list) return;

    const effectiveKey = keyOverride || list.keyColumn;
    const effectiveFloor = floorOverride || list.floorColumn;

    if (!datasetCols.includes(effectiveKey)) {
      toast.error(`Coluna chave "${effectiveKey}" não existe no dataset atual`);
      return;
    }
    if (!datasetCols.includes(effectiveFloor)) {
      toast.error(`Coluna de pavimento "${effectiveFloor}" não existe`);
      return;
    }
    if (list.measureMode === "area" && (!list.areaColumn || !datasetCols.includes(list.areaColumn))) {
      toast.error(`Coluna de área "${list.areaColumn ?? "?"}" não existe`);
      return;
    }
    if (!rows.length) {
      toast.error("Nenhuma linha para consolidar");
      return;
    }

    if (persistSchema && (effectiveKey !== list.keyColumn || effectiveFloor !== list.floorColumn)) {
      updateList(list.id, { keyColumn: effectiveKey, floorColumn: effectiveFloor });
    }

    const effectiveList = { ...list, keyColumn: effectiveKey, floorColumn: effectiveFloor };
    const effectiveCols = Array.from(
      new Set([effectiveKey, effectiveFloor, list.fileColumn, ...columns]),
    );
    const p = planConsolidation(rows, effectiveCols, effectiveList);
    if (p.preview.length === 0) {
      toast.error(
        p.invalidRows
          ? `Nenhum ${effectiveKey} válido (${p.invalidRows} linhas ignoradas)`
          : "Nenhum item para consolidar",
      );
      return;
    }

    // Step: column mapping. Only when the list already has items AND incoming
    // columns introduce names that don't exist in the list.
    if (list.items.length > 0) {
      const existing = new Set<string>();
      for (const i of list.items) for (const c of i.columns) existing.add(c);
      const incoming = new Set<string>();
      for (const it of p.preview) for (const c of it.columns) incoming.add(c);
      const newOnes = Array.from(incoming).filter((c) => !existing.has(c));
      if (newOnes.length > 0 && Array.from(existing).length > 0) {
        setPendingPlan(p);
        setPendingListId(list.id);
        setOpen(false);
        setMapOpen(true);
        return;
      }
    }

    proceed(list, p);
  };

  const proceed = (list: ReturnType<typeof lists.find>, p: ConsolidatePlan) => {
    if (!list) return;
    if (p.conflicts.length === 0) {
      const out = apply(list.id, p, "overwrite");
      const unit = list.measureMode === "area" ? "m²" : "un";
      toast.success(
        `${list.name}: ${out?.added ?? 0} novo(s) · total ${p.preview.reduce((s, i) => s + i.totalQuantity, 0).toFixed(list.measureMode === "area" ? 2 : 0)} ${unit}` +
          (p.invalidRows ? ` · ${p.invalidRows} sem chave` : "") +
          (p.invalidArea ? ` · ${p.invalidArea} sem área` : ""),
      );
      setOpen(false);
      onConsolidated?.();
      return;
    }
    setPlan(p);
    setSelectedListId(list.id);
    setOpen(false);
    setConflictOpen(true);
  };

  const applyMappingAndProceed = (mapping: Record<string, string | null>) => {
    if (!pendingPlan || !pendingListId) return;
    const list = lists.find((l) => l.id === pendingListId);
    if (!list) return;
    const remap = (it: ConsolidatedItem): ConsolidatedItem => {
      const params: Record<string, string> = {};
      const cols: string[] = [];
      for (const c of it.columns) {
        const dst = mapping[c];
        if (dst === null || dst === undefined) continue;
        params[dst] = it.params[c] ?? "";
        if (!cols.includes(dst)) cols.push(dst);
      }
      return { ...it, params, columns: cols };
    };
    const p: ConsolidatePlan = {
      ...pendingPlan,
      preview: pendingPlan.preview.map(remap),
      newItems: pendingPlan.newItems.map(remap),
    };
    setMapOpen(false);
    setPendingPlan(null);
    proceed(list, p);
  };

  const handleCreate = () => {
    if (!newName.trim()) return toast.error("Informe o nome da categoria");
    if (!newKey || !datasetCols.includes(newKey)) return toast.error("Coluna chave inválida");
    if (!newFloor || !datasetCols.includes(newFloor)) return toast.error("Coluna de pavimento inválida");
    if (newMode === "area" && (!newAreaCol || !datasetCols.includes(newAreaCol)))
      return toast.error("Selecione a coluna de área (m²)");
    const opts: CreateListOpts = {
      name: newName.trim(),
      keyColumn: newKey,
      floorColumn: newFloor,
      measureMode: newMode,
      areaColumn: newMode === "area" ? newAreaCol : undefined,
    };
    const id = createList(opts);
    setCreateOpen(false);
    setOpen(false);
    setNewName("");
    setSelectedListId(id);
    setKeyOverride(newKey);
    setFloorOverride(newFloor);
    runWithList(id);
  };

  const commit = (mode: "overwrite" | "only-new") => {
    if (!plan || !selectedListId) return;
    const list = lists.find((l) => l.id === selectedListId);
    const out = apply(selectedListId, plan, mode);
    if (!out) return;
    const parts = [
      `${out.added} novo(s)`,
      mode === "overwrite" ? `${out.updated} sobrescrito(s)` : `${out.skipped} mantido(s)`,
    ];
    toast.success(`${list?.name}: ${parts.join(" · ")}`);
    setConflictOpen(false);
    setPlan(null);
    onConsolidated?.();
  };

  const sourceLabel =
    selectedCount > 0
      ? `${selectedCount} selecionado(s)`
      : `todos os ${rows.length} filtrados`;

  // Pending columns for mapping dialog
  const pendingExisting = useMemo(() => {
    if (!pendingListId) return [] as string[];
    const list = lists.find((l) => l.id === pendingListId);
    if (!list) return [];
    const set = new Set<string>();
    for (const i of list.items) for (const c of i.columns) set.add(c);
    return Array.from(set);
  }, [pendingListId, lists]);
  const pendingIncoming = useMemo(() => {
    if (!pendingPlan) return [] as string[];
    const set = new Set<string>();
    for (const it of pendingPlan.preview) for (const c of it.columns) set.add(c);
    return Array.from(set);
  }, [pendingPlan]);

  return (
    <>
      <Button size="sm" variant="default" onClick={() => setOpen(true)}>
        <Layers className="mr-1 h-3.5 w-3.5" />
        Consolidar ({sourceLabel})
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Consolidar em uma categoria</DialogTitle>
            <DialogDescription>
              {sourceLabel} serão consolidadas. Confirme a coluna chave e a coluna
              de pavimento antes de prosseguir.
            </DialogDescription>
          </DialogHeader>
          {lists.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma categoria criada ainda. Crie uma agora.
            </p>
          ) : (
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Categoria de destino</Label>
                <Select value={selectedListId} onValueChange={setSelectedListId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha uma categoria…" />
                  </SelectTrigger>
                  <SelectContent>
                    {lists.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name} · {l.items.length} itens · chave: {l.keyColumn} ·{" "}
                        {l.measureMode === "area" ? "m²" : "un"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <div>
                  <Label className="text-xs">Coluna chave</Label>
                  <Select value={keyOverride} onValueChange={setKeyOverride}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {datasetCols.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Coluna de pavimento</Label>
                  <Select value={floorOverride} onValueChange={setFloorOverride}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {datasetCols.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {activeList &&
                (keyOverride !== activeList.keyColumn ||
                  floorOverride !== activeList.floorColumn) && (
                  <label className="flex items-start gap-2 rounded border bg-muted/40 p-2 text-[11px]">
                    <Checkbox
                      checked={persistSchema}
                      onCheckedChange={(v) => setPersistSchema(!!v)}
                    />
                    <span>
                      Atualizar esquema da categoria <strong>{activeList.name}</strong>{" "}
                      com chave <strong>{keyOverride}</strong> e pavimento{" "}
                      <strong>{floorOverride}</strong>.
                    </span>
                  </label>
                )}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Nova categoria
            </Button>
            <Button
              disabled={!selectedListId}
              onClick={() => runWithList(selectedListId)}
            >
              Consolidar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova categoria</DialogTitle>
            <DialogDescription>
              Defina o esquema da categoria. Modo (item/área) fica fixo após a
              criação. Chave e pavimento podem ser alterados depois.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Nome (ex.: LI_00_MOBILIARIO)</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Portas"
                autoFocus
              />
            </div>
            <div>
              <Label className="text-xs">Coluna chave</Label>
              <Select value={newKey} onValueChange={setNewKey}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {datasetCols.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Coluna de pavimento</Label>
              <Select value={newFloor} onValueChange={setNewFloor}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {datasetCols.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Modo de medida</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={newMode === "count" ? "default" : "outline"}
                  onClick={() => setNewMode("count")}
                >
                  Por item (un)
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={newMode === "area" ? "default" : "outline"}
                  onClick={() => setNewMode("area")}
                >
                  Por área (m²)
                </Button>
              </div>
            </div>
            {newMode === "area" && (
              <div>
                <Label className="text-xs">Coluna de área (numérica, m²)</Label>
                <Select value={newAreaCol} onValueChange={setNewAreaCol}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione…" />
                  </SelectTrigger>
                  <SelectContent>
                    {datasetCols.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate}>Criar e consolidar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ColumnMappingDialog
        open={mapOpen}
        onOpenChange={setMapOpen}
        incomingColumns={pendingIncoming}
        existingColumns={pendingExisting}
        onConfirm={applyMappingAndProceed}
      />

      <Dialog open={conflictOpen} onOpenChange={setConflictOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Conflitos detectados</DialogTitle>
            <DialogDescription>
              {plan?.newItems.length ?? 0} item(ns) novo(s) ·{" "}
              {plan?.conflicts.length ?? 0} já existem com valores diferentes.
              Escolha como resolver.
            </DialogDescription>
          </DialogHeader>
          {plan && plan.conflicts.length > 0 && activeList && (
            <div className="max-h-[50vh] overflow-auto rounded border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{activeList.keyColumn}</TableHead>
                    <TableHead>Coluna</TableHead>
                    <TableHead>Atual</TableHead>
                    <TableHead>Novo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plan.conflicts.flatMap((c) =>
                    c.differingCols.map((col) => (
                      <TableRow key={`${c.typeMark}::${col}`}>
                        <TableCell className="font-medium">{c.typeMark}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">{col}</Badge>
                        </TableCell>
                        <TableCell className="text-xs">{c.existing[col] || "—"}</TableCell>
                        <TableCell className="text-xs font-medium">
                          {c.incoming[col] || "—"}
                        </TableCell>
                      </TableRow>
                    )),
                  )}
                </TableBody>
              </Table>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConflictOpen(false)}>Cancelar</Button>
            <Button variant="secondary" onClick={() => commit("only-new")}>Apenas novos</Button>
            <Button onClick={() => commit("overwrite")}>Sobrepor</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
