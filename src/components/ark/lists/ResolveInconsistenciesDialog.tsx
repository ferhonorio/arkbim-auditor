import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useArk } from "@/lib/store";
import { evaluateRule, type RuleKeyEval, type VisualRule } from "@/lib/grouping";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  rule: VisualRule;
}

interface RowState {
  // chosen value per column for this key
  picks: Record<string, string>;
}

export function ResolveInconsistenciesDialog({ open, onOpenChange, rule }: Props) {
  const dataset = useArk((s) => s.dataset);
  const apply = useArk((s) => s.applyDatasetResolutions);

  const evals = useMemo(() => {
    if (!dataset) return new Map<string, RuleKeyEval>();
    return evaluateRule(rule, dataset.rows);
  }, [dataset, rule]);

  const inconsistentKeys = useMemo(
    () => Array.from(evals.entries()).filter(([, ev]) => ev.comparable && ev.inconsistent),
    [evals],
  );

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [state, setState] = useState<Record<string, RowState>>({});

  const toggle = (k: string) => {
    setExpanded((p) => {
      const n = new Set(p);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  };

  const setPick = (key: string, col: string, value: string) =>
    setState((s) => ({
      ...s,
      [key]: { picks: { ...(s[key]?.picks ?? {}), [col]: value } },
    }));

  const submit = () => {
    const resolutions: Array<{
      keyValues: Record<string, string>;
      column: string;
      value: string;
    }> = [];
    for (const [key, ev] of inconsistentKeys) {
      const picks = state[key]?.picks ?? {};
      for (const [col, val] of Object.entries(picks)) {
        if (val === "" || val == null) continue;
        resolutions.push({ keyValues: ev.keyValues, column: col, value: val });
      }
    }
    if (resolutions.length === 0) {
      toast.error("Marque ao menos um valor verdadeiro");
      return;
    }
    const changed = apply(rule.keyColumns, resolutions);
    toast.success(`${changed} linha(s) atualizada(s)`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Resolver inconsistências — {rule.name ?? "Regra"}</DialogTitle>
          <DialogDescription>
            Para cada chave divergente, escolha o valor verdadeiro de cada coluna.
            Aplica diretamente nas linhas do dataset (em memória) antes de
            consolidar.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[55vh] space-y-1 overflow-auto rounded border p-2">
          {inconsistentKeys.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhuma chave divergente para esta regra.
            </p>
          )}
          {inconsistentKeys.map(([k, ev]) => {
            const open2 = expanded.has(k);
            const keyDesc = rule.keyColumns
              .map((c) => `${c}="${ev.keyValues[c] ?? ""}"`)
              .join(", ");
            return (
              <div key={k} className="rounded border bg-background">
                <button
                  type="button"
                  onClick={() => toggle(k)}
                  className="flex w-full items-center gap-2 p-2 text-left text-xs hover:bg-muted"
                >
                  {open2 ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                  <span className="font-medium">{keyDesc}</span>
                  <Badge variant="secondary" className="ml-auto text-[10px]">
                    {ev.rowsCount} linhas · {Object.keys(ev.diffByColumn).length} divergências
                  </Badge>
                </button>
                {open2 && (
                  <div className="space-y-2 border-t p-2">
                    {Object.entries(ev.diffByColumn).map(([col, vals]) => {
                      const current = state[k]?.picks?.[col] ?? "";
                      const isCustom = current && !vals.includes(current);
                      return (
                        <div key={col} className="space-y-1">
                          <div className="text-[11px] font-semibold text-muted-foreground">
                            {col}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {vals.map((v) => (
                              <label
                                key={v}
                                className={`flex cursor-pointer items-center gap-1 rounded border px-2 py-1 text-xs ${
                                  current === v
                                    ? "border-primary bg-primary/10 font-medium"
                                    : "hover:bg-muted"
                                }`}
                              >
                                <input
                                  type="radio"
                                  name={`${k}-${col}`}
                                  checked={current === v}
                                  onChange={() => setPick(k, col, v)}
                                  className="h-3 w-3"
                                />
                                {v}
                              </label>
                            ))}
                            <Input
                              placeholder="outro valor…"
                              value={isCustom ? current : ""}
                              onChange={(e) => setPick(k, col, e.target.value)}
                              className="h-7 w-40 text-xs"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit}>Aplicar e atualizar dataset</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
