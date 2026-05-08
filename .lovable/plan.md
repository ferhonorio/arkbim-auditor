## Mudanças solicitadas

### 1. Remover painel "Colunas" (visibilidade)
- Remover `<ColumnsPanel />` de `src/routes/index.tsx` e excluir o arquivo `src/components/ark/ColumnsPanel.tsx`.
- Manter `hiddenColumns` no store por compatibilidade (não-quebrante), mas todas as views passam a usar `cols` direto (sem filtro de hidden) — atualizar `AnaliseTab` para definir `visibleCols = cols`.

### 2. Filtro liga/desliga "Apenas linhas das regras visuais"
- Adicionar no `AnaliseTab`, ao lado do cabeçalho do bloco "Agrupamento", um `Switch` "Mostrar apenas itens das regras ativas".
- Estado local + persistido (`onlyRuleMatches: boolean` no store).
- Quando ligado: filtrar `searched` antes de agrupar — manter apenas linhas cuja chave (segundo qualquer regra ativa, respeitando `applyWhen`) esteja nos `matchingKeys` daquela regra. Implementação: iterar regras → para cada linha, computar `buildKey(rule.keyColumns, row)` e checar se está em `badKeysPerRule[i]`. Se nenhuma regra ativa → manter tudo (com aviso).
- Mostrar contador "X linhas correspondem às regras".

### 3. Reordenar abas + Lista Consolidada como base de verdade
- Reordenar `TabsList` em `src/routes/index.tsx`: **Análise → Lista Consolidada → Auditoria BIM → Diagnóstico**.
- Tornar a Lista Consolidada **persistente**: introduzir no store `consolidatedSnapshot: { reference: ReferenceItem[]; cfg: ConsolidationConfig; savedAt: number } | null`.
  - Em `ConsolidadaTab`, adicionar botões **"Salvar como lista oficial"** (congela o `result.reference` atual) e **"Limpar lista oficial"**.
  - Mostrar badge "Lista oficial salva em DD/MM/YYYY HH:mm" quando existir.
- **Auditoria BIM**: nova seção "Conformidade com a Lista Consolidada".
  - Para cada linha filtrada, calcular a chave usando `consolidatedSnapshot.cfg.keyColumns`.
  - Reportar três grupos: `Faltando` (chaves da lista oficial sem ocorrência), `Extra` (chaves nos arquivos que não existem na lista), `Divergente` (parâmetros validados diferem do canônico salvo).
  - Tabela "Inconsistências por arquivo vs Lista Consolidada" com colunas: Arquivo, Status, Chave, Coluna, Esperado, Encontrado.
  - Manter as regras de auditoria atuais como seção secundária.
- **Diagnóstico**: nova seção "Conformidade com Lista Consolidada" com resumo (total itens oficiais, divergentes, faltando, extra) e link mental para os arquivos afetados. Mostrar também "Lista oficial: salva/não salva" e versão.

### Arquivos alterados
- `src/routes/index.tsx` — remover `ColumnsPanel`, reordenar tabs.
- `src/components/ark/ColumnsPanel.tsx` — excluir.
- `src/lib/store.ts` — adicionar `onlyRuleMatches` + setter; `consolidatedSnapshot` + `saveConsolidatedSnapshot`/`clearConsolidatedSnapshot`; persistir ambos.
- `src/lib/grouping.ts` — adicionar helper `filterRowsByVisualRules(rows, rules)` e `compareToConsolidated(rows, snapshot)` retornando `{ faltando, extra, divergente }` por arquivo.
- `src/components/ark/AnaliseTab.tsx` — switch + filtragem; remover uso de `hiddenColumns`.
- `src/components/ark/ConsolidadaTab.tsx` — botões salvar/limpar snapshot, badge.
- `src/components/ark/AuditoriaTab.tsx` — nova seção comparativa.
- `src/components/ark/DiagnosticoTab.tsx` — nova seção do snapshot.

### Detalhes técnicos
- A comparação contra Lista Consolidada usa o `cfg` salvo com o snapshot (não o atual em edição), para que a lista oficial seja imutável até o usuário salvar de novo.
- "Apenas linhas das regras ativas" não altera filtros/agrupamento salvos — é uma view-time toggle.
- Persistência via `zustand/persist` já configurada; basta incluir os novos campos no `partialize`.
