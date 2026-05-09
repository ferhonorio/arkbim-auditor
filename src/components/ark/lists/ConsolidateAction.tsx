import { useMemo, useState } from "react";
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
import { useArk } from "@/lib/store";
import {
  KEY_COLUMN,
  planConsolidation,
  type ConsolidatePlan,
} from "@/lib/component-lists";
import type { Row } from "@/lib/parse";

interface Props {
  rows: Row[];
  columns: string[]; // visible columns from grouping
}

export function ConsolidateAction({ rows, columns }: Props) {
  const lists = useArk((s) => s.componentLists);
  const createList = useArk((s) => s.createComponentList);
  const apply = useArk((s) => s.applyConsolidation);

  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string>("");
  const [plan, setPlan] = useState<ConsolidatePlan | null>(null);
  const [conflictOpen, setConflictOpen] = useState(false);

  const dataset = useArk((s) => s.dataset);
  const hasKey = !!dataset?.columns.includes(KEY_COLUMN);

  const effectiveCols = useMemo(() => {
    const set = new Set<string>();
    for (const c of columns) if (c) set.add(c);
    set.add(KEY_COLUMN);
    return Array.from(set);
  }, [columns]);

  const run = (listId: string) => {
    const list = lists.find((l) => l.id === listId);
    if (!list) return;
    if (!hasKey) {
      toast.error(`Coluna "${KEY_COLUMN}" não existe no dataset`);
      return;
    }
    if (!rows.length) {
      toast.error("Nenhuma linha filtrada para consolidar");
      return;
    }
    const p = planConsolidation(rows, effectiveCols, list);
    if (p.preview.length === 0) {
      toast.error(
        p.invalidRows
          ? `Nenhum ${KEY_COLUMN} válido (${p.invalidRows} linhas ignoradas)`
          : "Nenhum item para consolidar",
      );
      return;
    }
    if (p.conflicts.length === 0) {
      const out = apply(list.id, p, "overwrite");
      const msg = `${list.name}: ${out?.added ?? 0} novo(s)${
        p.invalidRows ? ` · ${p.invalidRows} linha(s) sem ${KEY_COLUMN}` : ""
      }`;
      toast.success(msg);
      setOpen(false);
      return;
    }
    setPlan(p);
    setSelected(list.id);
    setOpen(false);
    setConflictOpen(true);
  };

  const handleNew = () => {
    const name = window.prompt("Nome da nova categoria:");
    if (!name?.trim()) return;
    const id = createList(name.trim());
    run(id);
  };

  const commit = (mode: "overwrite" | "only-new") => {
    if (!plan || !selected) return;
    const list = lists.find((l) => l.id === selected);
    const out = apply(selected, plan, mode);
    if (!out) return;
    const parts = [
      `${out.added} novo(s)`,
      mode === "overwrite" ? `${out.updated} sobrescrito(s)` : `${out.skipped} mantido(s)`,
    ];
    toast.success(`${list?.name}: ${parts.join(" · ")}`);
    setConflictOpen(false);
    setPlan(null);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <Button size="sm" variant="default" onClick={() => setOpen(true)}>
          <Layers className="mr-1 h-3.5 w-3.5" />
          Consolidar dados filtrados
        </Button>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Consolidar em uma categoria</DialogTitle>
            <DialogDescription>
              Os dados filtrados ({rows.length} linha(s)) serão consolidados usando{" "}
              <strong>{KEY_COLUMN}</strong> como chave única. Colunas salvas:{" "}
              {effectiveCols.length}.
            </DialogDescription>
          </DialogHeader>
          {lists.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma categoria criada ainda. Crie uma agora:
            </p>
          ) : (
            <div className="space-y-2">
              <label className="text-xs font-medium">Categoria de destino</label>
              <Select value={selected} onValueChange={setSelected}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolha uma categoria…" />
                </SelectTrigger>
                <SelectContent>
                  {lists.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name} ({l.items.length} itens)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleNew}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Nova categoria
            </Button>
            <Button disabled={!selected} onClick={() => run(selected)}>
              Consolidar
            </Button>
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
          {plan && plan.conflicts.length > 0 && (
            <div className="max-h-[50vh] overflow-auto rounded border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{KEY_COLUMN}</TableHead>
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
