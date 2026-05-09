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
import { ChevronDown, ChevronRight, Check } from "lucide-react";
import { useArk } from "@/lib/store";
import { evaluateRule, type RuleKeyEval, type VisualRule } from "@/lib/grouping";
import type { Row } from "@/lib/parse";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  rule: VisualRule;
  /** Rows already filtered (filtros + agrupamento). Defaults to full dataset. */
  rows?: Row[];
  /** Optional label describing active scope (filters/grouping) for context. */
  scopeLabel?: string;
}

interface Variant {
  signature: string;
  values: Record<string, string>; // value per compareColumn
  count: number;
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

  // Group by FIRST key column value
  const firstKeyCol = rule.keyColumns[0] ?? "";
  const groupedByFirst = useMemo(() => {
    const map = new Map<string, Array<[string, RuleKeyEval]>>();
    for (const entry of inconsistentKeys) {
      const fk = entry[1].keyValues[firstKeyCol] ?? "";
      if (!map.has(fk)) map.set(fk, []);
      map.get(fk)!.push(entry);
    }
    return Array.from(map.entries()).sort((a, b) =>
      a[0].localeCompare(b[0], undefined, { numeric: true, sensitivity: "base" }),
    );
  }, [inconsistentKeys, firstKeyCol]);

  // Compute variants per inconsistent key from the dataset rows
  const variantsByKey = useMemo(() => {
    const out = new Map<string, Variant[]>();
    if (!dataset) return out;
    const cmp = rule.compareColumns;
    const keyCols = rule.keyColumns;
    const buildKey = (r: Row) => keyCols.map((c) => (r[c] ?? "").trim()).join("\u0001");
    const rowsByKey = new Map<string, Row[]>();
    for (const r of dataset.rows) {
      const k = buildKey(r);
      if (!evals.get(k)?.inconsistent) continue;
      if (!rowsByKey.has(k)) rowsByKey.set(k, []);
      rowsByKey.get(k)!.push(r);
    }
    for (const [k, rows] of rowsByKey) {
      const map = new Map<string, Variant>();
      for (const r of rows) {
        const values: Record<string, string> = {};
        for (const c of cmp) values[c] = (r[c] ?? "").trim();
        const sig = cmp.map((c) => values[c]).join("\u0001");
        const prev = map.get(sig);
        if (prev) prev.count++;
        else map.set(sig, { signature: sig, values, count: 1 });
      }
      out.set(
        k,
        Array.from(map.values()).sort((a, b) => b.count - a.count),
      );
    }
    return out;
  }, [dataset, evals, rule]);

  // expanded outer (first-key) groups + inner subkeys
  const [expandedFirst, setExpandedFirst] = useState<Set<string>>(new Set());
  const [picks, setPicks] = useState<Record<string, Record<string, string>>>({});

  const toggleFirst = (k: string) =>
    setExpandedFirst((p) => {
      const n = new Set(p);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  const setVariant = (key: string, variant: Variant) =>
    setPicks((s) => ({ ...s, [key]: { ...variant.values } }));

  const setPick = (key: string, col: string, value: string) =>
    setPicks((s) => ({ ...s, [key]: { ...(s[key] ?? {}), [col]: value } }));

  const variantSignature = (vals: Record<string, string> | undefined) =>
    rule.compareColumns.map((c) => vals?.[c] ?? "").join("\u0001");

  const submit = () => {
    const resolutions: Array<{
      keyValues: Record<string, string>;
      column: string;
      value: string;
    }> = [];
    for (const [key, ev] of inconsistentKeys) {
      const cur = picks[key] ?? {};
      for (const [col, val] of Object.entries(cur)) {
        if (val === "" || val == null) continue;
        resolutions.push({ keyValues: ev.keyValues, column: col, value: val });
      }
    }
    if (resolutions.length === 0) {
      toast.error("Selecione a linha verdadeira de ao menos uma chave");
      return;
    }
    const changed = apply(rule.keyColumns, resolutions);
    toast.success(`${changed} linha(s) atualizada(s)`);
    onOpenChange(false);
  };

  const otherKeyCols = rule.keyColumns.slice(1);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Resolver inconsistências — {rule.name ?? "Regra"}</DialogTitle>
          <DialogDescription>
            Agrupado por <strong>{firstKeyCol || "(chave)"}</strong>. Para cada
            chave divergente, selecione a linha cujos valores devem prevalecer.
            Você pode editar células individuais se quiser misturar valores.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-2 overflow-auto rounded border p-2">
          {groupedByFirst.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhuma chave divergente para esta regra.
            </p>
          )}
          {groupedByFirst.map(([firstVal, subs]) => {
            const open2 = expandedFirst.has(firstVal);
            return (
              <div key={firstVal} className="rounded border bg-background">
                <button
                  type="button"
                  onClick={() => toggleFirst(firstVal)}
                  className="flex w-full items-center gap-2 p-2 text-left text-sm hover:bg-muted"
                >
                  {open2 ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  <span className="font-semibold">
                    {firstKeyCol}={firstVal === "" ? <em className="text-muted-foreground">(vazio)</em> : `"${firstVal}"`}
                  </span>
                  <Badge variant="secondary" className="ml-auto text-[10px]">
                    {subs.length} chave{subs.length > 1 ? "s" : ""} divergente{subs.length > 1 ? "s" : ""}
                  </Badge>
                </button>

                {open2 && (
                  <div className="space-y-3 border-t p-3">
                    {subs.map(([k, ev]) => {
                      const variants = variantsByKey.get(k) ?? [];
                      const currentSig = variantSignature(picks[k]);
                      const subLabel = otherKeyCols.length
                        ? otherKeyCols
                            .map((c) => `${c}="${ev.keyValues[c] ?? ""}"`)
                            .join(" · ")
                        : `${ev.rowsCount} linhas`;
                      return (
                        <div key={k} className="space-y-2 rounded border bg-muted/30 p-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-xs font-medium">{subLabel}</div>
                            <Badge variant="outline" className="text-[10px]">
                              {ev.rowsCount} linhas · {variants.length} variantes
                            </Badge>
                          </div>

                          {/* Variant table */}
                          <div className="overflow-x-auto rounded border bg-background">
                            <table className="w-full text-xs">
                              <thead className="bg-muted/50">
                                <tr>
                                  <th className="w-10 p-1.5 text-left">Usar</th>
                                  {rule.compareColumns.map((c) => (
                                    <th key={c} className="p-1.5 text-left font-semibold">
                                      {c}
                                    </th>
                                  ))}
                                  <th className="w-16 p-1.5 text-right">Linhas</th>
                                </tr>
                              </thead>
                              <tbody>
                                {variants.map((v) => {
                                  const isSel = v.signature === currentSig;
                                  return (
                                    <tr
                                      key={v.signature}
                                      onClick={() => setVariant(k, v)}
                                      className={`cursor-pointer border-t hover:bg-muted/40 ${
                                        isSel ? "bg-primary/10" : ""
                                      }`}
                                    >
                                      <td className="p-1.5">
                                        <div
                                          className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                                            isSel
                                              ? "border-primary bg-primary text-primary-foreground"
                                              : "border-muted-foreground/40"
                                          }`}
                                        >
                                          {isSel && <Check className="h-3 w-3" />}
                                        </div>
                                      </td>
                                      {rule.compareColumns.map((c) => {
                                        const isDiff = (ev.diffByColumn[c]?.length ?? 0) > 0;
                                        return (
                                          <td
                                            key={c}
                                            className={`p-1.5 ${
                                              isDiff ? "font-medium" : "text-muted-foreground"
                                            }`}
                                          >
                                            {v.values[c] || (
                                              <span className="text-muted-foreground/60">—</span>
                                            )}
                                          </td>
                                        );
                                      })}
                                      <td className="p-1.5 text-right tabular-nums">
                                        {v.count}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>

                          {/* Optional fine-tune row: per-column override */}
                          {picks[k] && (
                            <details className="text-[11px]">
                              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                                Ajustar valores manualmente
                              </summary>
                              <div className="mt-2 grid grid-cols-2 gap-2">
                                {rule.compareColumns.map((c) => (
                                  <label key={c} className="flex flex-col gap-0.5">
                                    <span className="text-muted-foreground">{c}</span>
                                    <Input
                                      value={picks[k]?.[c] ?? ""}
                                      onChange={(e) => setPick(k, c, e.target.value)}
                                      className="h-7 text-xs"
                                    />
                                  </label>
                                ))}
                              </div>
                            </details>
                          )}
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit}>Aplicar e atualizar dataset</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
