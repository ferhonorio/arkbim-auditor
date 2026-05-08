import { useEffect, useMemo, useState } from "react";
import { useArk } from "@/lib/store";
import {
  RULES_SCHEMA_VERSION,
  STORE_VERSION,
  clearLogs,
  getLogs,
  subscribeLogs,
  type DiagLog,
} from "@/lib/diagnostics";
import { applyFilters, compareToConsolidated, evaluateRule } from "@/lib/grouping";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

export function DiagnosticoTab() {
  const dataset = useArk((s) => s.dataset);
  const visualRules = useArk((s) => s.visualRules);
  const auditRules = useArk((s) => s.auditRules);
  const filters = useArk((s) => s.filters);
  const filterPresets = useArk((s) => s.filterPresets);
  const rulePresets = useArk((s) => s.rulePresets);
  const groupingPresets = useArk((s) => s.groupingPresets);
  const setVisualRules = useArk((s) => s.setVisualRules);
  const snapshot = useArk((s) => s.consolidatedSnapshot);

  const [logs, setLogs] = useState<DiagLog[]>(getLogs());
  useEffect(() => {
    const unsub = subscribeLogs(() => setLogs(getLogs()));
    return () => {
      unsub();
    };
  }, []);

  const filteredRows = useMemo(
    () => (dataset ? applyFilters(dataset.rows, filters) : []),
    [dataset, filters],
  );

  const consolidatedComp = useMemo(
    () => (snapshot ? compareToConsolidated(filteredRows, snapshot) : null),
    [filteredRows, snapshot],
  );

  // For each visual rule, build an application report: keys evaluated,
  // matched, files involved and inter-file divergences.
  const ruleReports = useMemo(() => {
    return visualRules.map((r) => {
      const keyCols = r.keyColumns ?? [];
      const cmpCols = r.compareColumns ?? [];
      const applyWhen = r.applyWhen ?? "inconsistent";
      if (!keyCols.length || !cmpCols.length) {
        return {
          id: r.id,
          name: r.name ?? "(sem nome)",
          applyWhen,
          totalKeys: 0,
          matched: 0,
          inconsistencies: [] as Array<{
            key: string;
            keyValues: Record<string, string>;
            files: string[];
            diffByColumn: Record<string, string[]>;
          }>,
        };
      }
      const evals = evaluateRule(r, filteredRows);
      const inconsistencies: Array<{
        key: string;
        keyValues: Record<string, string>;
        files: string[];
        diffByColumn: Record<string, string[]>;
      }> = [];
      let matched = 0;
      for (const [k, ev] of evals) {
        const isMatch = applyWhen === "inconsistent" ? ev.inconsistent : !ev.inconsistent;
        if (isMatch) matched++;
        if (ev.inconsistent) {
          inconsistencies.push({
            key: k,
            keyValues: ev.keyValues,
            files: ev.files,
            diffByColumn: ev.diffByColumn,
          });
        }
      }
      return {
        id: r.id,
        name: r.name ?? "(sem nome)",
        applyWhen,
        totalKeys: evals.size,
        matched,
        inconsistencies,
      };
    });
  }, [visualRules, filteredRows]);

  const ruleStatus = visualRules.map((r) => {
    const hasNew = Array.isArray(r.keyColumns) && Array.isArray(r.compareColumns);
    return {
      id: r.id,
      name: r.name ?? "(sem nome)",
      version: hasNew ? RULES_SCHEMA_VERSION : 1,
      ok: hasNew && r.keyColumns.length > 0 && r.compareColumns.length > 0,
      detail: hasNew
        ? `chave: [${r.keyColumns.join(", ")}] · compara: [${r.compareColumns.join(", ")}]`
        : "Formato antigo (sem keyColumns/compareColumns) — recriar a regra.",
    };
  });

  const outdated = ruleStatus.filter((r) => r.version < RULES_SCHEMA_VERSION);

  const migrateRules = () => {
    setVisualRules(
      visualRules.map((r) => ({
        id: r.id,
        name: r.name,
        color: r.color,
        keyColumns: Array.isArray(r.keyColumns) ? r.keyColumns : [],
        compareColumns: Array.isArray(r.compareColumns) ? r.compareColumns : [],
      })),
    );
    toast.success("Regras normalizadas para o formato atual");
  };

  const exportSnapshot = () => {
    const snap = {
      generatedAt: new Date().toISOString(),
      versions: { store: STORE_VERSION, rulesSchema: RULES_SCHEMA_VERSION },
      dataset: dataset
        ? { fileName: dataset.fileName, columns: dataset.columns.length, rows: dataset.rows.length }
        : null,
      counts: {
        filters: filters.length,
        visualRules: visualRules.length,
        auditRules: auditRules.length,
        filterPresets: filterPresets.length,
        rulePresets: rulePresets.length,
        groupingPresets: groupingPresets.length,
      },
      ruleStatus,
      logs,
    };
    const blob = new Blob([JSON.stringify(snap, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `arkbim-diagnostico-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Info label="Versão do app" value={STORE_VERSION} />
        <Info label="Schema de regras" value={`v${RULES_SCHEMA_VERSION}`} />
        <Info label="Regras visuais" value={`${visualRules.length}`} />
        <Info
          label="Regras desatualizadas"
          value={`${outdated.length}`}
          tone={outdated.length ? "destructive" : "ok"}
        />
      </div>

      <div className="rounded-lg border bg-card p-4">
        <h3 className="text-sm font-semibold">Lista Consolidada (oficial)</h3>
        {!snapshot && (
          <p className="mt-1 text-xs text-muted-foreground">
            Nenhuma lista oficial salva. Use a aba <strong>Lista consolidada</strong>.
          </p>
        )}
        {snapshot && consolidatedComp && (
          <>
            <p className="mt-1 text-xs text-muted-foreground">
              Salva em {new Date(snapshot.savedAt).toLocaleString("pt-BR")} ·{" "}
              {snapshot.reference.length} itens · chave [{snapshot.cfg.keyColumns.join(", ")}] · valida [
              {snapshot.cfg.paramColumns.join(", ")}]
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
              <Info label="Conformes" value={String(consolidatedComp.totals.conformes)} />
              <Info label="Divergentes" value={String(consolidatedComp.totals.divergentes)} tone={consolidatedComp.totals.divergentes ? "destructive" : "ok"} />
              <Info label="Faltando" value={String(consolidatedComp.totals.faltando)} tone={consolidatedComp.totals.faltando ? "destructive" : "ok"} />
              <Info label="Extra" value={String(consolidatedComp.totals.extra)} />
            </div>
            {consolidatedComp.summary.length > 0 && (
              <div className="mt-3 overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Arquivo</TableHead>
                      <TableHead className="text-right">Divergentes</TableHead>
                      <TableHead className="text-right">Faltando</TableHead>
                      <TableHead className="text-right">Extra</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {consolidatedComp.summary.map((s) => (
                      <TableRow key={s.file} className={s.divergentes + s.faltando + s.extra > 0 ? "bg-destructive/5" : ""}>
                        <TableCell className="font-medium">{s.file}</TableCell>
                        <TableCell className="text-right">{s.divergentes}</TableCell>
                        <TableCell className="text-right">{s.faltando}</TableCell>
                        <TableCell className="text-right">{s.extra}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}
      </div>

      <div className="rounded-lg border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Regras visuais — formato</h3>
            <p className="text-xs text-muted-foreground">
              Regras em formato anterior podem causar erros. Use "Migrar regras" para
              normalizar.
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={migrateRules} disabled={!visualRules.length}>
              Migrar regras
            </Button>
            <Button size="sm" variant="outline" onClick={exportSnapshot}>
              Exportar diagnóstico (JSON)
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Regra</TableHead>
                <TableHead>Versão</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Detalhe</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ruleStatus.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>
                    <Badge variant={r.version === RULES_SCHEMA_VERSION ? "secondary" : "destructive"}>
                      v{r.version}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {r.ok ? (
                      <Badge variant="secondary">OK</Badge>
                    ) : (
                      <Badge variant="destructive">Incompleta</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.detail}</TableCell>
                </TableRow>
              ))}
              {!ruleStatus.length && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                    Nenhuma regra cadastrada.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <div className="mb-3">
          <h3 className="text-sm font-semibold">
            Aplicação das regras visuais ({ruleReports.length})
          </h3>
          <p className="text-xs text-muted-foreground">
            Como cada regra é avaliada nas linhas filtradas e quais
            inconsistências entre arquivos foram detectadas.
          </p>
        </div>
        <div className="space-y-3">
          {ruleReports.map((rep) => (
            <div key={rep.id} className="rounded-md border bg-background p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">{rep.name}</span>
                <Badge variant="outline" className="text-[10px]">
                  Aplica quando: {rep.applyWhen === "inconsistent" ? "FALSA (divergem)" : "VERDADEIRA (iguais)"}
                </Badge>
                <Badge variant="secondary" className="text-[10px]">
                  Chaves avaliadas: {rep.totalKeys}
                </Badge>
                <Badge variant={rep.matched > 0 ? "destructive" : "secondary"} className="text-[10px]">
                  Aplicada em: {rep.matched}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  Inconsistências: {rep.inconsistencies.length}
                </Badge>
              </div>
              {rep.inconsistencies.length > 0 && (
                <div className="mt-3 overflow-x-auto rounded border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Chave</TableHead>
                        <TableHead>Arquivos</TableHead>
                        <TableHead>Coluna divergente · valores</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rep.inconsistencies.slice(0, 50).map((inc) => (
                        <TableRow key={inc.key} className="bg-destructive/5 align-top">
                          <TableCell className="text-xs">
                            {Object.entries(inc.keyValues)
                              .map(([k, v]) => `${k}: ${v}`)
                              .join(" | ")}
                          </TableCell>
                          <TableCell className="text-xs">
                            <div className="flex flex-wrap gap-1">
                              {inc.files.map((f) => (
                                <Badge key={f} variant="outline" className="text-[10px]">{f}</Badge>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs">
                            <div className="space-y-0.5">
                              {Object.entries(inc.diffByColumn).map(([col, vals]) => (
                                <div key={col}>
                                  <span className="font-medium">{col}:</span> {vals.join(" / ")}
                                </div>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {rep.inconsistencies.length > 50 && (
                    <p className="p-2 text-[10px] text-muted-foreground">
                      Mostrando 50 de {rep.inconsistencies.length} inconsistências.
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
          {!ruleReports.length && (
            <p className="text-xs text-muted-foreground">
              Nenhuma regra cadastrada na aba Análise.
            </p>
          )}
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Logs ({logs.length})</h3>
            <p className="text-xs text-muted-foreground">
              Erros JS, promessas rejeitadas e console.error desta sessão.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={clearLogs}>
            Limpar
          </Button>
        </div>
        <div className="max-h-[420px] space-y-2 overflow-y-auto">
          {logs.map((l) => (
            <div
              key={l.id}
              className={`rounded-md border p-2 text-xs ${
                l.level === "error"
                  ? "border-destructive/40 bg-destructive/5"
                  : l.level === "warn"
                  ? "border-yellow-300 bg-yellow-50"
                  : "bg-background"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-muted-foreground">
                  {new Date(l.at).toLocaleTimeString("pt-BR")} · {l.source}
                </span>
                <Badge variant={l.level === "error" ? "destructive" : "secondary"}>
                  {l.level}
                </Badge>
              </div>
              <p className="mt-1 break-words font-medium">{l.message}</p>
              {l.stack && (
                <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap text-[10px] text-muted-foreground">
                  {l.stack}
                </pre>
              )}
            </div>
          ))}
          {!logs.length && (
            <p className="text-xs text-muted-foreground">Sem logs registrados.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function Info({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "destructive";
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`mt-1 text-2xl font-semibold ${
          tone === "destructive" ? "text-destructive" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}
