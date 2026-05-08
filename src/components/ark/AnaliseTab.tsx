import { useMemo, useState } from "react";
import { Plus, X, Copy, ArrowUp, ArrowDown, Save, Trash2, AlertTriangle, Info as InfoIcon } from "lucide-react";
import { useArk, type ConcatStrategy } from "@/lib/store";
import {
  applyFilters,
  evaluateRuleOnGroups,
  filterRowsByVisualRules,
  groupRows,
  ruleMatchesGroup,
  type VisualRule,
} from "@/lib/grouping";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { exportXLSX } from "@/lib/export";
import { toast } from "sonner";

const RULE_COLORS = ["#fee2e2", "#fef3c7", "#dcfce7", "#dbeafe", "#f3e8ff", "#ffedd5"];

const STRATEGIES: { value: ConcatStrategy; label: string }[] = [
  { value: "unique", label: "Valores únicos" },
  { value: "all", label: "Todos os valores" },
  { value: "first", label: "Primeiro" },
  { value: "last", label: "Último" },
  { value: "min", label: "Menor (a→z)" },
  { value: "max", label: "Maior (z→a)" },
  { value: "count", label: "Contagem" },
];

export function AnaliseTab() {
  const dataset = useArk((s) => s.dataset);
  const filters = useArk((s) => s.filters);
  const onlyRuleMatches = useArk((s) => s.onlyRuleMatches);
  const setOnlyRuleMatches = useArk((s) => s.setOnlyRuleMatches);
  const groupBy = useArk((s) => s.groupBy);
  const setGroupBy = useArk((s) => s.setGroupBy);
  const concatCols = useArk((s) => s.concatCols);
  const setConcatCols = useArk((s) => s.setConcatCols);
  const concatStrategy = useArk((s) => s.concatStrategy);
  const setConcatStrategy = useArk((s) => s.setConcatStrategy);
  const visualRules = useArk((s) => s.visualRules);
  const setVisualRules = useArk((s) => s.setVisualRules);
  const focusParam = useArk((s) => s.focusParam);
  const setFocusParam = useArk((s) => s.setFocusParam);
  const searchValue = useArk((s) => s.searchValue);
  const setSearchValue = useArk((s) => s.setSearchValue);
  const pageSize = useArk((s) => s.pageSize);
  const setPageSize = useArk((s) => s.setPageSize);

  const rulePresets = useArk((s) => s.rulePresets);
  const saveRulePreset = useArk((s) => s.saveRulePreset);
  const loadRulePreset = useArk((s) => s.loadRulePreset);
  const deleteRulePreset = useArk((s) => s.deleteRulePreset);

  const groupingPresets = useArk((s) => s.groupingPresets);
  const saveGroupingPreset = useArk((s) => s.saveGroupingPreset);
  const loadGroupingPreset = useArk((s) => s.loadGroupingPreset);
  const deleteGroupingPreset = useArk((s) => s.deleteGroupingPreset);

  const [page, setPage] = useState(0);

  const cols = dataset?.columns ?? [];
  const rows = dataset?.rows ?? [];
  const filtered = useMemo(() => applyFilters(rows, filters), [rows, filters]);

  const searched = useMemo(() => {
    if (!searchValue.trim()) return filtered;
    const s = searchValue.toLowerCase();
    if (focusParam) {
      return filtered.filter((r) => (r[focusParam] ?? "").toLowerCase().includes(s));
    }
    return filtered.filter((r) =>
      cols.some((c) => (r[c] ?? "").toLowerCase().includes(s)),
    );
  }, [filtered, searchValue, focusParam, cols]);

  const ruleFiltered = useMemo(
    () => (onlyRuleMatches ? filterRowsByVisualRules(searched, visualRules) : searched),
    [searched, visualRules, onlyRuleMatches],
  );

  const groups = useMemo(
    () => groupRows(ruleFiltered, groupBy, concatCols, concatStrategy),
    [ruleFiltered, groupBy, concatCols, concatStrategy],
  );

  // Pre-compute rule evaluation on the SEARCHED base (not ruleFiltered) so the
  // toggle "show only matches" doesn't change which keys count as comparable.
  const evalsPerRule = useMemo(
    () => visualRules.map((r) => evaluateRule(r, searched)),
    [visualRules, searched],
  );

  // Pre-compute matching keys per rule from the same base.
  const badKeysPerRule = useMemo(
    () =>
      visualRules.map((rule, idx) => {
        const evals = evalsPerRule[idx];
        const wantInc = (rule.applyWhen ?? "inconsistent") === "inconsistent";
        const out = new Set<string>();
        for (const [k, ev] of evals) {
          if (!ev.comparable) continue;
          if (wantInc ? ev.inconsistent : !ev.inconsistent) out.add(k);
        }
        return out;
      }),
    [visualRules, evalsPerRule],
  );

  // Live diagnostics per rule (only comparable keys count).
  const ruleStats = useMemo(
    () =>
      visualRules.map((r, idx) => {
        const keyCols = r.keyColumns ?? [];
        const cmpCols = r.compareColumns ?? [];
        if (!keyCols.length || !cmpCols.length) {
          return { totalKeys: 0, divergent: 0, consistent: 0, matched: 0, avgRows: 0 };
        }
        const evals = evalsPerRule[idx];
        let divergent = 0;
        let consistent = 0;
        let matched = 0;
        let totalRows = 0;
        let comparableKeys = 0;
        const wantInc = (r.applyWhen ?? "inconsistent") === "inconsistent";
        for (const ev of evals.values()) {
          if (!ev.comparable) continue;
          comparableKeys++;
          if (ev.inconsistent) divergent++;
          else consistent++;
          if (wantInc ? ev.inconsistent : !ev.inconsistent) matched++;
          totalRows += ev.rowsCount;
        }
        const avgRows = comparableKeys ? totalRows / comparableKeys : 0;
        return { totalKeys: comparableKeys, divergent, consistent, matched, avgRows };
      }),
    [visualRules, evalsPerRule],
  );

  const start = page * pageSize;
  const pageGroups = groups.slice(start, start + pageSize);
  const totalPages = Math.max(1, Math.ceil(groups.length / pageSize));

  const visibleCols = cols;
  // Always show every grouping column in the table — hiding them by focusParam
  // breaks the visual logic of "same Type Mark, different Model = new row".
  const groupVisible = groupBy;

  const addGroup = () => {
    const next = visibleCols.find((c) => !groupBy.includes(c));
    if (next) setGroupBy([...groupBy, next]);
  };
  const updGroup = (i: number, v: string) => {
    const arr = [...groupBy];
    arr[i] = v;
    setGroupBy(arr);
  };
  const rmGroup = (i: number) => setGroupBy(groupBy.filter((_, j) => j !== i));

  const addConcat = () => {
    const next = visibleCols.find((c) => !concatCols.includes(c) && !groupBy.includes(c));
    if (next) setConcatCols([...concatCols, next]);
  };
  const rmConcat = (c: string) => {
    setConcatCols(concatCols.filter((x) => x !== c));
    const ns = { ...concatStrategy };
    delete ns[c];
    setConcatStrategy(ns);
  };
  const updateConcatCol = (oldC: string, newC: string) => {
    setConcatCols(concatCols.map((x) => (x === oldC ? newC : x)));
    if (concatStrategy[oldC]) {
      const ns = { ...concatStrategy };
      ns[newC] = ns[oldC];
      delete ns[oldC];
      setConcatStrategy(ns);
    }
  };
  const setStrategy = (c: string, s: ConcatStrategy) =>
    setConcatStrategy({ ...concatStrategy, [c]: s });

  const addRule = () => {
    setVisualRules([
      ...visualRules,
      {
        id: crypto.randomUUID(),
        name: `Regra ${visualRules.length + 1}`,
        keyColumns: cols.includes("Nome do arquivo") ? [] : [],
        compareColumns: [],
        color: RULE_COLORS[visualRules.length % RULE_COLORS.length],
      },
    ]);
  };
  const updRule = (id: string, patch: Partial<VisualRule>) =>
    setVisualRules(visualRules.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const rmRule = (id: string) => setVisualRules(visualRules.filter((r) => r.id !== id));
  const moveRule = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= visualRules.length) return;
    const arr = [...visualRules];
    [arr[i], arr[j]] = [arr[j], arr[i]];
    setVisualRules(arr);
  };

  const exportFiltered = () => {
    if (!filtered.length) return toast.error("Nada para exportar");
    exportXLSX("arkbim-filtrado.xlsx", [
      { name: "Filtrado", rows: filtered, columns: visibleCols },
    ]);
  };

  const askAndSave = (label: string, fn: (n: string) => void) => {
    const name = window.prompt(`Nome do preset de ${label}:`);
    if (name?.trim()) {
      fn(name.trim());
      toast.success("Preset salvo");
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Linhas totais" value={rows.length} />
        <Kpi label="Após filtros" value={filtered.length} />
        <Kpi label="Colunas visíveis" value={visibleCols.length} />
        <Kpi label="Regras ativas" value={visualRules.length} />
      </div>

      {/* Visual rules */}
      <Section
        title="Regras visuais de comparação"
        subtitle="A primeira regra tem prioridade. Cada regra define a chave (parâmetro comum) e os parâmetros que devem ser iguais para essa chave."
        action={
          <div className="flex flex-wrap gap-2">
            <PresetMenu
              label="Regras"
              presets={rulePresets}
              onSave={() => askAndSave("regras", saveRulePreset)}
              onLoad={loadRulePreset}
              onDelete={deleteRulePreset}
            />
            <Button size="sm" variant="outline" onClick={addRule}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Regra
            </Button>
          </div>
        }
      >
        {visualRules.length === 0 && (
          <p className="text-xs text-muted-foreground">Nenhuma regra ativa.</p>
        )}
        <div className="space-y-2">
          {visualRules.map((r, i) => {
            const stats = ruleStats[i] ?? { totalKeys: 0, divergent: 0, consistent: 0, matched: 0, avgRows: 0 };
            const noKey = !(r.keyColumns?.length);
            const noCmp = !(r.compareColumns?.length);
            const keyHasFile = (r.keyColumns ?? []).includes("Nome do arquivo");
            const keyIsolatesPerFile =
              keyHasFile && stats.totalKeys > 0 && stats.avgRows < 1.5;
            return (
            <div
              key={r.id}
              className="rounded-md border p-3"
              style={{ background: r.color }}
            >
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-background/70 px-2 py-0.5 text-[10px] font-semibold">
                  #{i + 1}
                </span>
                <Input
                  value={r.name ?? ""}
                  placeholder="Nome da regra"
                  onChange={(e) => updRule(r.id, { name: e.target.value })}
                  className="h-7 max-w-xs bg-background/70 text-xs"
                />
                <input
                  type="color"
                  value={r.color.startsWith("#") ? r.color : "#fee2e2"}
                  onChange={(e) => updRule(r.id, { color: e.target.value })}
                  className="h-7 w-7 cursor-pointer rounded border"
                />
                <div className="ml-auto flex gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => moveRule(i, -1)}
                    disabled={i === 0}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => moveRule(i, 1)}
                    disabled={i === visualRules.length - 1}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => rmRule(r.id)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <ColumnMultiPicker
                  label="Chave (o que identifica o MESMO item)"
                  cols={cols}
                  value={r.keyColumns}
                  onChange={(v) => updRule(r.id, { keyColumns: v })}
                />
                <ColumnMultiPicker
                  label="Devem ser iguais (entre as linhas que compartilham a chave)"
                  cols={cols}
                  value={r.compareColumns}
                  onChange={(v) => updRule(r.id, { compareColumns: v })}
                />
              </div>
              <p className="mt-1 flex items-start gap-1 text-[10px] text-muted-foreground">
                <InfoIcon className="mt-[2px] h-3 w-3 shrink-0" />
                <span>
                  Ex.: <strong>Chave</strong> = Type Mark; <strong>Devem ser iguais</strong> = Model, Manufacturer, Description.
                  A regra acende quando o mesmo Type Mark aparece em arquivos diferentes com Model/Manufacturer divergente.
                </span>
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <label className="text-[11px] font-medium text-muted-foreground">
                  Pintar quando:
                </label>
                <Select
                  value={r.applyWhen ?? "inconsistent"}
                  onValueChange={(v) =>
                    updRule(r.id, { applyWhen: v as "inconsistent" | "consistent" })
                  }
                >
                  <SelectTrigger className="h-7 w-[280px] bg-background/70 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inconsistent">
                      Houver divergência (valores diferem)
                    </SelectItem>
                    <SelectItem value="consistent">
                      Tudo for igual (valores coincidem)
                    </SelectItem>
                  </SelectContent>
                </Select>
                <label className="ml-2 text-[11px] font-medium text-muted-foreground">
                  Critério:
                </label>
                <Select
                  value={r.matchMode ?? "any"}
                  onValueChange={(v) =>
                    updRule(r.id, { matchMode: v as "any" | "all" })
                  }
                >
                  <SelectTrigger className="h-7 w-[260px] bg-background/70 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">
                      Qualquer parâmetro divergente conta
                    </SelectItem>
                    <SelectItem value="all">
                      Apenas se TODOS divergirem
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Live mini-stats */}
              <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
                <span className="rounded bg-background/70 px-1.5 py-0.5">
                  Chaves: <strong>{stats.totalKeys}</strong>
                </span>
                <span className="rounded bg-background/70 px-1.5 py-0.5">
                  Divergentes: <strong>{stats.divergent}</strong>
                </span>
                <span className="rounded bg-background/70 px-1.5 py-0.5">
                  Consistentes: <strong>{stats.consistent}</strong>
                </span>
                <span className="rounded bg-background/70 px-1.5 py-0.5">
                  Aplica em: <strong>{stats.matched}</strong>
                </span>
                <span className="rounded bg-background/70 px-1.5 py-0.5 text-muted-foreground">
                  Linhas/chave (médio): {stats.avgRows.toFixed(1)}
                </span>
              </div>

              {/* Inline alerts */}
              {(noKey || noCmp) && (
                <div className="mt-2 flex items-start gap-1.5 rounded border border-destructive/40 bg-destructive/10 p-2 text-[11px] text-destructive">
                  <AlertTriangle className="mt-[1px] h-3.5 w-3.5 shrink-0" />
                  <span>
                    Regra incompleta: defina ao menos uma coluna em <strong>Chave</strong> e em <strong>Devem ser iguais</strong>.
                  </span>
                </div>
              )}
              {!noKey && !noCmp && keyIsolatesPerFile && (
                <div className="mt-2 flex items-start gap-1.5 rounded border border-yellow-400 bg-yellow-50 p-2 text-[11px] text-yellow-900">
                  <AlertTriangle className="mt-[1px] h-3.5 w-3.5 shrink-0" />
                  <span>
                    Atenção: usar <strong>Nome do arquivo</strong> como chave isola cada arquivo em
                    grupos separados (média de {stats.avgRows.toFixed(1)} linha por chave), então linhas de
                    arquivos diferentes nunca são comparadas. Provavelmente você quis colocar
                    <strong> Nome do arquivo</strong> em <em>Devem ser iguais</em> e algo como
                    <strong> Type Mark</strong> em <em>Chave</em>.
                  </span>
                </div>
              )}
              {!noKey && !noCmp && stats.totalKeys > 0 && stats.matched === 0 && !keyIsolatesPerFile && (
                <div className="mt-2 flex items-start gap-1.5 rounded border bg-background/70 p-2 text-[11px] text-muted-foreground">
                  <InfoIcon className="mt-[1px] h-3.5 w-3.5 shrink-0" />
                  <span>
                    A regra não casou com nenhuma linha. Revise a configuração de
                    <em> Pintar quando</em> e <em>Critério</em> ou as colunas escolhidas.
                  </span>
                </div>
              )}
            </div>
          );})}
        </div>
      </Section>

      {/* Search + focus */}
      <div className="grid gap-3 rounded-lg border bg-card p-3 md:grid-cols-[1fr_2fr_auto]">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Focar parâmetro</label>
          <Select value={focusParam || "_all"} onValueChange={(v) => setFocusParam(v === "_all" ? "" : v)}>
            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">Todos os parâmetros</SelectItem>
              {cols.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Buscar valor</label>
          <Input
            placeholder="Filtrar linhas pelo parâmetro escolhido"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Linhas por página</label>
          <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(0); }}>
            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[25, 50, 100, 250, 500].map((n) => (
                <SelectItem key={n} value={String(n)}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Grouping */}
      <Section
        title="Agrupamento"
        subtitle={`${groups.length.toLocaleString("pt-BR")} grupos em ${ruleFiltered.length.toLocaleString("pt-BR")} linhas${onlyRuleMatches ? " (filtradas pelas regras)" : " filtradas"}.`}
        action={
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 rounded-md border bg-background px-2 py-1 text-xs">
              <Switch
                checked={onlyRuleMatches}
                onCheckedChange={setOnlyRuleMatches}
                disabled={!visualRules.length}
              />
              <span>Mostrar somente itens das regras visuais</span>
            </label>
            <PresetMenu
              label="Agrupamento"
              presets={groupingPresets}
              onSave={() => askAndSave("agrupamento", saveGroupingPreset)}
              onLoad={loadGroupingPreset}
              onDelete={deleteGroupingPreset}
            />
            <Button size="sm" variant="outline" onClick={() => setGroupBy([])}>
              Limpar
            </Button>
            <Button size="sm" variant="outline" onClick={exportFiltered}>
              Exportar filtrado
            </Button>
          </div>
        }
      >
        <div className="flex flex-wrap items-end gap-2">
          {groupBy.map((g, i) => (
            <div key={i} className="flex items-end gap-1">
              <div>
                <label className="mb-1 block text-xs text-muted-foreground">
                  {i === 0 ? "Agrupar por" : "Depois por"}
                </label>
                <Select value={g} onValueChange={(v) => updGroup(i, v)}>
                  <SelectTrigger className="h-9 w-[220px] text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {cols.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button size="icon" variant="ghost" onClick={() => rmGroup(i)} className="h-9 w-9">
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={addGroup}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Nível
          </Button>
        </div>

        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">Concatenar dados</h4>
            <Button size="sm" variant="outline" onClick={addConcat}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Coluna
            </Button>
          </div>
          {!concatCols.length && (
            <span className="text-xs text-muted-foreground">Sem colunas concatenadas.</span>
          )}
          <div className="space-y-2">
            {concatCols.map((c) => (
              <div
                key={c}
                className="flex flex-wrap items-end gap-2 rounded-md border bg-background p-2"
              >
                <div>
                  <label className="mb-1 block text-[10px] text-muted-foreground">Coluna</label>
                  <Select value={c} onValueChange={(v) => updateConcatCol(c, v)}>
                    <SelectTrigger className="h-8 w-[200px] text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {cols.map((x) => (
                        <SelectItem key={x} value={x}>{x}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] text-muted-foreground">Dado a concatenar</label>
                  <Select
                    value={concatStrategy[c] ?? "unique"}
                    onValueChange={(v) => setStrategy(c, v as ConcatStrategy)}
                  >
                    <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STRATEGIES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => rmConcat(c)}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        {/* Groups table */}
        <div className="mt-4 overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {groupVisible.map((c) => (
                  <TableHead key={c}>{c}</TableHead>
                ))}
                {concatCols.map((c) => (
                  <TableHead key={c}>{c}</TableHead>
                ))}
                <TableHead className="text-right">Quantidade</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageGroups.map((g) => {
                let bg: string | undefined;
                let why: string | undefined;
                let keyRowsCount: number | undefined;
                for (let idx = 0; idx < visualRules.length; idx++) {
                  if (ruleMatchesGroup(visualRules[idx], g, badKeysPerRule[idx])) {
                    bg = visualRules[idx].color;
                    const rule = visualRules[idx];
                    const evals = evalsPerRule[idx];
                    const keyCols = rule.keyColumns ?? [];
                    let matchedKey = "";
                    for (const r of g.rawRows) {
                      const k = keyCols.map((c) => (r[c] ?? "").trim()).join("\u0001");
                      if (badKeysPerRule[idx].has(k)) { matchedKey = k; break; }
                    }
                    const ev = matchedKey ? evals.get(matchedKey) : undefined;
                    if (ev) {
                      keyRowsCount = ev.rowsCount;
                      const keyDesc = keyCols
                        .map((c) => `${c}="${ev.keyValues[c] ?? ""}"`)
                        .join(", ");
                      const isInc = (rule.applyWhen ?? "inconsistent") === "inconsistent";
                      const header = isInc
                        ? `Regra "${rule.name ?? "#" + (idx + 1)}" — chave ${keyDesc}\n${ev.rowsCount} linhas em ${ev.files.length} arquivo(s): ${ev.files.join(", ")}`
                        : `Regra "${rule.name ?? "#" + (idx + 1)}" — chave ${keyDesc}\n${ev.rowsCount} linhas, todos os parâmetros conferem.`;
                      const diffs = Object.entries(ev.diffByColumn);
                      const body = diffs.length
                        ? "\nDivergências:\n" +
                          diffs
                            .map(([c, vals]) => `  • ${c}: ${vals.join(" | ")}`)
                            .join("\n")
                        : "";
                      why = header + body + `\n\nObs.: esta linha agrupada tem qtd ${g.quantity}; a regra compara TODAS as ${ev.rowsCount} linhas brutas que compartilham a chave.`;
                    }
                    break;
                  }
                }
                return (
                  <TableRow
                    key={g.key}
                    style={bg ? { background: bg } : undefined}
                    title={why}
                    className={why ? "cursor-help" : undefined}
                  >
                    {groupVisible.map((c) => (
                      <TableCell key={c}>{g.values[c]}</TableCell>
                    ))}
                    {concatCols.map((c) => (
                      <TableCell key={c}>
                        <div className="flex items-start gap-1">
                          <span className="flex-1">{g.concat[c]}</span>
                          {g.concat[c] && (
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(g.concat[c]);
                                toast.success("Copiado");
                              }}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </TableCell>
                    ))}
                    <TableCell className="text-right font-medium">
                      <div className="flex items-center justify-end gap-2">
                        {keyRowsCount !== undefined && (
                          <span
                            className="rounded-full border bg-background/70 px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground"
                            title={`Linhas brutas que compartilham a chave da regra: ${keyRowsCount}`}
                          >
                            chave: {keyRowsCount}
                          </span>
                        )}
                        <span>{g.quantity}</span>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!pageGroups.length && (
                <TableRow>
                  <TableCell
                    colSpan={groupVisible.length + concatCols.length + 1}
                    className="text-center text-sm text-muted-foreground"
                  >
                    {dataset
                      ? "Configure o agrupamento para visualizar."
                      : "Carregue um arquivo CSV ou XLSX."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {groups.length > pageSize && (
          <div className="mt-3 flex items-center justify-end gap-2 text-xs">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>
              Anterior
            </Button>
            <span>Página {page + 1} de {totalPages}</span>
            <Button
              size="sm"
              variant="outline"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              Próxima
            </Button>
          </div>
        )}
      </Section>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value.toLocaleString("pt-BR")}</p>
    </div>
  );
}

function Section({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function ColumnMultiPicker({
  label,
  cols,
  value,
  onChange,
}: {
  label: string;
  cols: string[];
  value: string[] | undefined;
  onChange: (v: string[]) => void;
}) {
  const safeValue = Array.isArray(value) ? value : [];
  const remaining = cols.filter((c) => !safeValue.includes(c));
  return (
    <div className="rounded bg-background/70 p-2">
      <label className="mb-1 block text-[10px] font-medium uppercase text-muted-foreground">
        {label}
      </label>
      <div className="mb-2 flex flex-wrap gap-1">
        {safeValue.length === 0 && (
          <span className="text-[11px] text-muted-foreground">Nenhuma coluna</span>
        )}
        {safeValue.map((c) => (
          <span
            key={c}
            className="inline-flex items-center gap-1 rounded-full border bg-secondary px-2 py-0.5 text-[11px]"
          >
            {c}
            <button onClick={() => onChange(safeValue.filter((x) => x !== c))}>
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <Select value="" onValueChange={(v) => v && onChange([...safeValue, v])}>
        <SelectTrigger className="h-7 text-xs">
          <SelectValue placeholder="Adicionar coluna" />
        </SelectTrigger>
        <SelectContent>
          {remaining.map((c) => (
            <SelectItem key={c} value={c}>{c}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

interface PresetItem { id: string; name: string }
function PresetMenu({
  label,
  presets,
  onSave,
  onLoad,
  onDelete,
}: {
  label: string;
  presets: PresetItem[];
  onSave: () => void;
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <Button size="sm" variant="outline" onClick={onSave}>
        <Save className="mr-1 h-3.5 w-3.5" /> Salvar {label.toLowerCase()}
      </Button>
      {presets.length > 0 && (
        <Select
          value=""
          onValueChange={(v) => {
            if (v.startsWith("del:")) onDelete(v.slice(4));
            else onLoad(v);
          }}
        >
          <SelectTrigger className="h-9 w-[180px] text-xs">
            <SelectValue placeholder={`Carregar ${label.toLowerCase()}`} />
          </SelectTrigger>
          <SelectContent>
            {presets.map((p) => (
              <div key={p.id} className="flex items-center">
                <SelectItem value={p.id} className="flex-1">{p.name}</SelectItem>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onDelete(p.id);
                  }}
                  className="px-2 text-muted-foreground hover:text-destructive"
                  title="Excluir"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
