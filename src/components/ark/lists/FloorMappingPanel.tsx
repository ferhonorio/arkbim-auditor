import { useMemo, useState } from "react";
import { useArk } from "@/lib/store";
import {
  type ComponentList,
  aggregateFloors,
  displayFloor,
  getFloorSource,
} from "@/lib/component-lists";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Props {
  list: ComponentList;
}

export function FloorMappingPanel({ list }: Props) {
  const dataset = useArk((s) => s.dataset);
  const setAlias = useArk((s) => s.setFloorAlias);
  const removeFloor = useArk((s) => s.removeFloorFromList);

  const aliases = list.floorAliases ?? {};

  const aggregates = useMemo(() => aggregateFloors(list), [list]);

  const rawValues = useMemo(() => {
    const set = new Set<string>(aggregates.map((a) => a.floorSource));
    for (const k of Object.keys(aliases)) set.add(k);
    if (
      dataset &&
      list.floorColumn &&
      dataset.columns.includes(list.floorColumn)
    ) {
      for (const r of dataset.rows) {
        const v = (r[list.floorColumn] ?? "").trim();
        if (v) set.add(v);
      }
    }
    return Array.from(set).sort();
  }, [aggregates, aliases, dataset, list.floorColumn]);

  const aggMap = useMemo(() => {
    const m = new Map<string, (typeof aggregates)[number]>();
    for (const a of aggregates) m.set(a.floorSource, a);
    return m;
  }, [aggregates]);

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<{
    source: string;
    candidatesToDrop: string[]; // safe to drop (no edits, no comments)
    keptForEdit: string[]; // protected by manual edit
    keptForComments: string[]; // has open comments
  } | null>(null);
  const [dropEmpty, setDropEmpty] = useState(true);

  const valueOf = (raw: string) =>
    drafts[raw] !== undefined ? drafts[raw] : aliases[raw] ?? "";

  const save = (raw: string) => {
    setAlias(list.id, raw, valueOf(raw));
    setDrafts((d) => {
      const n = { ...d };
      delete n[raw];
      return n;
    });
  };

  const askRemove = async (source: string) => {
    // Compute which items are exclusive to this floor source.
    const exclusive: string[] = [];
    for (const i of list.items) {
      const sources = new Set(i.occurrences.map((o) => getFloorSource(o)));
      if (sources.has(source) && sources.size === 1) exclusive.push(i.key);
    }
    // Partition exclusive by manual-edit protection / open comments.
    const keptForEdit: string[] = [];
    const candidates: string[] = [];
    for (const k of exclusive) {
      const item = list.items.find((i) => i.key === k);
      if (!item) continue;
      const hasEdits =
        item.editedKey ||
        item.manuallyEditedAt ||
        (item.editedParams && Object.keys(item.editedParams).length > 0);
      if (hasEdits) keptForEdit.push(k);
      else candidates.push(k);
    }
    // Best-effort: check open comments for the candidate keys.
    let keptForComments: string[] = [];
    let safeCandidates = candidates;
    try {
      const { fetchOpenCommentSummaryByItem } = await import("@/lib/comments");
      const summary = await fetchOpenCommentSummaryByItem(list.id);
      keptForComments = candidates.filter((k) => (summary.get(k)?.count ?? 0) > 0);
      safeCandidates = candidates.filter((k) => !keptForComments.includes(k));
    } catch {
      // If comments check fails, be conservative — keep them all zeroed.
      keptForComments = candidates;
      safeCandidates = [];
    }
    setConfirm({
      source,
      candidatesToDrop: safeCandidates,
      keptForEdit,
      keptForComments,
    });
    setDropEmpty(true);
  };

  const doRemove = () => {
    if (!confirm) return;
    const dropKeys = dropEmpty ? confirm.candidatesToDrop : [];
    const out = removeFloor(list.id, confirm.source, { dropKeys });
    if (!out) {
      toast.error("Falha ao remover pavimento");
      return;
    }
    toast.success(
      `Pavimento removido — ${out.itemsAffected} item(ns) afetado(s) · ${out.itemsRemoved} removido(s) · ${out.itemsKeptZeroed} mantido(s) zerado(s) · qtd ${out.quantityRemoved}`,
    );
    setConfirm(null);
  };

  return (
    <div className="space-y-2 rounded-md border bg-card p-3">
      <div>
        <h4 className="text-sm font-semibold">Pavimentos</h4>
        <p className="text-[11px] text-muted-foreground">
          Cada linha mostra o <strong>nome amigável</strong> em destaque e a{" "}
          <strong>identidade técnica</strong> (origem) abaixo. O nome amigável é
          usado apenas para exibição/exportação — a identidade técnica nunca
          muda. Coluna de origem: <strong>{list.floorColumn}</strong>.
        </p>
      </div>
      {rawValues.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nenhum valor de pavimento detectado ainda.
        </p>
      ) : (
        <div className="max-h-[420px] space-y-1 overflow-auto">
          {rawValues.map((raw) => {
            const a = aggMap.get(raw);
            const friendly = valueOf(raw) || displayFloor(list, raw);
            return (
              <div
                key={raw}
                className="flex items-start gap-2 rounded border bg-background p-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {friendly || (
                        <em className="text-muted-foreground">(sem alias)</em>
                      )}
                    </span>
                    {a && (
                      <>
                        <Badge variant="secondary" className="text-[10px]">
                          {a.itemCount} itens
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {a.totalQuantity.toLocaleString("pt-BR")}{" "}
                          {list.measureMode === "area" ? "m²" : "un"}
                        </Badge>
                      </>
                    )}
                  </div>
                  <div
                    className="mt-0.5 truncate text-[10px] text-muted-foreground"
                    title={raw}
                  >
                    origem: {raw}
                  </div>
                  <div className="mt-1 flex items-center gap-1">
                    <Input
                      value={valueOf(raw)}
                      placeholder="Nome amigável"
                      onChange={(e) =>
                        setDrafts((d) => ({ ...d, [raw]: e.target.value }))
                      }
                      onBlur={() => save(raw)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          save(raw);
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                      className="h-7 max-w-xs text-xs"
                    />
                  </div>
                </div>
                {a && a.itemCount > 0 && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive"
                    title="Remover dados deste pavimento"
                    onClick={() => askRemove(raw)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <AlertDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remover dados do pavimento{" "}
              <em>{confirm ? displayFloor(list, confirm.source) : ""}</em>?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Origem técnica: <strong>{confirm?.source}</strong>.
              <br />
              <br />
              Itens exclusivos deste pavimento serão zerados. Você pode opcionalmente
              remover os itens que ficarem totalmente vazios — porém{" "}
              <strong>itens com edições manuais ou comentários abertos</strong>{" "}
              nunca são removidos automaticamente.
              <ul className="mt-2 list-inside list-disc text-xs">
                <li>
                  {confirm?.candidatesToDrop.length ?? 0} item(ns) candidato(s) a
                  remoção
                </li>
                <li>
                  {confirm?.keptForEdit.length ?? 0} mantido(s) por edição manual
                </li>
                <li>
                  {confirm?.keptForComments.length ?? 0} mantido(s) por
                  comentários abertos
                </li>
              </ul>
              <label className="mt-3 flex items-center gap-2 text-xs">
                <Checkbox
                  checked={dropEmpty}
                  onCheckedChange={(v) => setDropEmpty(v === true)}
                />
                <span>
                  Remover os {confirm?.candidatesToDrop.length ?? 0} item(ns)
                  seguros que ficarem sem pavimento
                </span>
              </label>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={doRemove}
            >
              Remover pavimento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
