import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { useArk } from "@/lib/store";
import { applyFilters, runAudit, type AuditRule } from "@/lib/grouping";
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
import { exportXLSX } from "@/lib/export";
import { toast } from "sonner";

export function AuditoriaTab() {
  const dataset = useArk((s) => s.dataset);
  const filters = useArk((s) => s.filters);
  const rules = useArk((s) => s.auditRules);
  const setRules = useArk((s) => s.setAuditRules);

  const cols = dataset?.columns ?? [];
  const rows = dataset?.rows ?? [];
  const filtered = useMemo(() => applyFilters(rows, filters), [rows, filters]);

  const findings = useMemo(() => runAudit(filtered, rules), [filtered, rules]);

  const ensureDefault = () => {
    if (rules.length) return;
    const has = (c: string) => cols.includes(c);
    setRules([
      {
        id: crypto.randomUUID(),
        name: "Consistencia por arquivo + Type Mark",
        groupBy: ["Nome do arquivo", "Type Mark"].filter(has),
        compareCols: ["Description", "Manufacturer", "URL"].filter(has),
      },
    ]);
  };

  const addRule = () =>
    setRules([
      ...rules,
      {
        id: crypto.randomUUID(),
        name: `Regra ${rules.length + 1}`,
        groupBy: [],
        compareCols: [],
      },
    ]);
  const updRule = (id: string, patch: Partial<AuditRule>) =>
    setRules(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const rmRule = (id: string) => setRules(rules.filter((r) => r.id !== id));

  const exportFindings = () => {
    if (!findings.length) return toast.error("Nada para exportar");
    const data = findings.map((f) => ({
      Regra: f.ruleName,
      Coluna: f.inconsistentColumn,
      ...f.groupValues,
      Arquivos: f.files.join(", "),
      "Valores por arquivo": Object.entries(f.valuesByFile)
        .map(([file, vals]) => `${file}: ${vals.join(" | ")}`)
        .join("  ||  "),
      Valores: f.values.join(", "),
      IDs: f.ids.join(", "),
    }));
    exportXLSX("arkbim-auditoria.xlsx", [{ name: "Auditoria", rows: data }]);
  };

  const fileSummary = useMemo(() => {
    const map = new Map<string, { findings: number; rules: Set<string> }>();
    for (const f of findings) {
      for (const file of f.files) {
        if (!map.has(file)) map.set(file, { findings: 0, rules: new Set() });
        const e = map.get(file)!;
        e.findings += 1;
        e.rules.add(f.ruleName);
      }
    }
    return Array.from(map.entries())
      .map(([file, v]) => ({ file, findings: v.findings, rules: Array.from(v.rules) }))
      .sort((a, b) => b.findings - a.findings);
  }, [findings]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-lg border bg-card p-4">
        <div>
          <h3 className="text-sm font-semibold">Regras de auditoria BIM</h3>
          <p className="text-xs text-muted-foreground">
            Para cada grupo definido pelos parametros comuns, cada parametro de comparacao
            deve ter um unico valor distinto. Caso contrario, o grupo aparece como
            inconsistente.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={ensureDefault}>
            Regra padrao
          </Button>
          <Button size="sm" onClick={addRule}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Regra
          </Button>
          <Button size="sm" variant="outline" onClick={exportFindings}>
            Exportar auditoria
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {rules.map((r) => (
          <div key={r.id} className="rounded-lg border bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <Input
                value={r.name}
                onChange={(e) => updRule(r.id, { name: e.target.value })}
                className="h-8 max-w-md text-sm font-medium"
              />
              <Button size="icon" variant="ghost" onClick={() => rmRule(r.id)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <ColumnPicker
                label="Parametros comuns (chave)"
                value={r.groupBy}
                cols={cols}
                onChange={(v) => updRule(r.id, { groupBy: v })}
              />
              <ColumnPicker
                label="Parametros validados (devem ser iguais)"
                value={r.compareCols}
                cols={cols}
                onChange={(v) => updRule(r.id, { compareCols: v })}
              />
            </div>
          </div>
        ))}
        {!rules.length && (
          <p className="text-sm text-muted-foreground">
            Nenhuma regra. Use "Regra padrao" para comecar.
          </p>
        )}
      </div>

      <div className="rounded-lg border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">
            Inconsistencias encontradas ({findings.length})
          </h3>
        </div>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Regra</TableHead>
                <TableHead>Chave</TableHead>
                <TableHead>Coluna</TableHead>
                <TableHead>Valores distintos</TableHead>
                <TableHead>IDs do Revit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {findings.map((f, i) => (
                <TableRow key={i} className="bg-destructive/5">
                  <TableCell>
                    <Badge variant="destructive">{f.ruleName}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">
                    {Object.entries(f.groupValues)
                      .map(([k, v]) => `${k}: ${v}`)
                      .join(" | ")}
                  </TableCell>
                  <TableCell className="font-medium">{f.inconsistentColumn}</TableCell>
                  <TableCell className="text-xs">{f.values.join(" / ")}</TableCell>
                  <TableCell>
                    <button
                      className="text-xs text-primary hover:underline"
                      onClick={() => {
                        navigator.clipboard.writeText(f.ids.join(","));
                        toast.success("IDs copiados");
                      }}
                    >
                      {f.ids.length} IDs (copiar)
                    </button>
                  </TableCell>
                </TableRow>
              ))}
              {!findings.length && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                    Nenhuma inconsistencia.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

function ColumnPicker({
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
  const [add, setAdd] = useState("");
  const remaining = cols.filter((c) => !value.includes(c));
  return (
    <div>
      <label className="mb-1 block text-xs text-muted-foreground">{label}</label>
      <div className="flex flex-wrap gap-1">
        {value.map((c) => (
          <span
            key={c}
            className="inline-flex items-center gap-1 rounded-full border bg-secondary px-2 py-0.5 text-xs"
          >
            {c}
            <button onClick={() => onChange(value.filter((x) => x !== c))}>
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="mt-2">
        <Select
          value={add}
          onValueChange={(v) => {
            onChange([...value, v]);
            setAdd("");
          }}
        >
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
    </div>
  );
}
