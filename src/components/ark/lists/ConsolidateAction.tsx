import { useEffect, useMemo, useState } from "react";
import { Layers, Plus, Lock } from "lucide-react";
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
  type MeasureMode,
} from "@/lib/component-lists";
import type { Row } from "@/lib/parse";

interface Props {
  rows: Row[];
  columns: string[];
  selectedCount: number;
  onConsolidated?: () => void;
}

export function ConsolidateAction({
  rows,
  columns,
  selectedCount,
  onConsolidated,
}: Props) {
  const lists = useArk((s) => s.componentLists);
  const createList = useArk((s) => s.createComponentList);
  const apply = useArk((s) => s.applyConsolidation);
  const dataset = useArk((s) => s.dataset);

  const datasetCols = dataset?.columns ?? [];

  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedListId, setSelectedListId] = useState<string>("");
  const [plan, setPlan] = useState<ConsolidatePlan | null>(null);
  const [conflictOpen, setConflictOpen] = useState(false);

  // New-category form state
  const [newName, setNewName] = useState("");
  const [newKey, setNewKey] = useState<string>(DEFAULT_KEY_COLUMN);
  const [newFloor, setNewFloor] = useState<string>(DEFAULT_FLOOR_COLUMN);
  const [newMode, setNewMode] = useState<MeasureMode>("count");
  const [newAreaCol, setNewAreaCol] = useState<string>("");

  useEffect(() => {
    if (!createOpen) return;
    // Smart defaults based on dataset cols
    if (datasetCols.includes(DEFAULT_KEY_COLUMN)) setNewKey(DEFAULT_KEY_COLUMN);
    else if (datasetCols.includes("Marca de Tipo")) setNewKey("Marca de Tipo");
    else setNewKey(datasetCols[0] ?? "");
    setNewFloor(
      datasetCols.includes(DEFAULT_FLOOR_COLUMN)
        ? DEFAULT_FLOOR_COLUMN
        : datasetCols[0] ?? "",
    );
  }, [createOpen, datasetCols]);

  const runWithList = (listId: string) => {
    const list = lists.find((l) => l.id === listId);
    if (!list) return;
    if (!datasetCols.includes(list.keyColumn)) {
      toast.error(`Coluna chave "${list.keyColumn}" não existe no dataset atual`);
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
    const effectiveCols = Array.from(
      new Set([list.keyColumn, list.floorColumn, list.fileColumn, ...columns]),
    );
    const p = planConsolidation(rows, effectiveCols, list);
    if (p.preview.length === 0) {
      toast.error(
        p.invalidRows
          ? `Nenhum ${list.keyColumn} válido (${p.invalidRows} linhas ignoradas)`
          : "Nenhum item para consolidar",
      );
      return;
    }
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

  const handleCreate = () => {
    if (!newName.trim()) {
      toast.error("Informe o nome da categoria");
      return;
    }
    if (!newKey || !datasetCols.includes(newKey)) {
      toast.error("Coluna chave inválida");
      return;
    }
    if (!newFloor || !datasetCols.includes(newFloor)) {
      toast.error("Coluna de pavimento inválida");
      return;
    }
    if (newMode === "area" && (!newAreaCol || !datasetCols.includes(newAreaCol))) {
      toast.error("Selecione a coluna de área (m²)");
      return;
    }
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

  const activeList = lists.find((l) => l.id === selectedListId);
  const sourceLabel = selectedCount > 0
    ? `${selectedCount} selecionado(s)`
    : `todos os ${rows.length} filtrados`;

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
              {sourceLabel} serão consolidadas. Cada categoria define a coluna
              chave, a coluna de pavimento e o modo de medida.
            </DialogDescription>
          </DialogHeader>
          {lists.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma categoria criada ainda. Crie uma agora.
            </p>
          ) : (
            <div className="space-y-2">
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
              {activeList && (
                <div className="rounded border bg-muted/40 p-2 text-[11px] text-muted-foreground">
                  <Lock className="mr-1 inline h-3 w-3" />
                  Chave: <strong>{activeList.keyColumn}</strong> · Pavimento:{" "}
                  <strong>{activeList.floorColumn}</strong> · Modo:{" "}
                  <strong>
                    {activeList.measureMode === "area"
                      ? `por área (${activeList.areaColumn})`
                      : "por item"}
                  </strong>
                </div>
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
              Defina o esquema da categoria. Estes campos ficam fixos para evitar
              dados inconsistentes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Nome (ex.: Portas, Mobiliário)</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Portas"
                autoFocus
              />
            </div>
            <div>
              <Label className="text-xs">
                Coluna chave (identificador único do item)
              </Label>
              <Select value={newKey} onValueChange={setNewKey}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {datasetCols.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Coluna de pavimento</Label>
              <Select value={newFloor} onValueChange={setNewFloor}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {datasetCols.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
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
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate}>Criar e consolidar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                          <Badge variant="outline" className="text-[10px]">
                            {col}
                          </Badge>
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
            <Button variant="outline" onClick={() => setConflictOpen(false)}>
              Cancelar
            </Button>
            <Button variant="secondary" onClick={() => commit("only-new")}>
              Apenas novos
            </Button>
            <Button onClick={() => commit("overwrite")}>Sobrepor</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
