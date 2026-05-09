## Objetivo

Refatorar o fluxo de listas consolidadas: a aba "Listas" deixa de ter editor de filtros e vira apenas o **catálogo** das categorias consolidadas. A consolidação acontece **dentro da aba "Análise & Agrupamentos"**, usando os dados já filtrados/agrupados ali, com `Type Mark` como chave única por categoria.

## 1. Mudança de modelo (`src/lib/component-lists.ts` + `src/lib/store.ts`)

`ComponentList` é simplificada — passa a ser um **contêiner por categoria**, sem regras próprias:

- Mantém: `id`, `name` (categoria, ex. "Portas"), `icon?`, `columnAliases`, `items`, `sourceFiles`, `createdAt`, `updatedAt`.
- Mantém: `idCol`, `fileColumn` (default `Nome do arquivo`).
- **Remove**: `filters`, `excludeFilters`, `keyColumns`, `paramColumns`. A chave passa a ser fixa = `Type Mark`. As colunas de parâmetros são definidas dinamicamente no momento da consolidação (vindas das colunas atuais visíveis no agrupamento).
- `ConsolidatedItem` ganha `columns: string[]` para registrar quais parâmetros foram salvos (a lista pode acumular parâmetros novos quando uma consolidação futura traz colunas adicionais; valores ausentes ficam vazios).

Nova função pública em `component-lists.ts`:

```text
consolidateFromRows(
  rows: Row[],            // já filtrados, vindos do AnaliseTab
  columns: string[],      // colunas visíveis no agrupamento (= colunas salvas)
  list: ComponentList,
  fileColumn: string,
  idCol: string,
) => {
  preview: ConsolidatedItem[],     // agregados por Type Mark
  conflicts: ConflictReport[],     // type marks que já existem na lista com params diferentes
  newItems: ConsolidatedItem[],    // type marks inéditos
  invalidRows: number,             // sem Type Mark
}
```

`ConflictReport`: `{ typeMark, existing: Record<col,string>, incoming: Record<col,string>, differingCols: string[] }`.

`commitConsolidation(list, preview, mode)` aplica:
- `overwrite` — substitui params dos itens em conflito; mantém histórico de `occurrences`.
- `only-new` — ignora type marks já existentes; grava apenas inéditos.
- (sem mais "merge"/"ignore-conflicts" — escopo enxuto pedido pelo usuário.)

Store actions novas/ajustadas em `useArk`:
- `createComponentList(name)` — só nome/categoria.
- `renameComponentList`, `deleteComponentList`, `duplicateComponentList`.
- `consolidateIntoList(listId, rows, columns, mode)` — empacota as duas funções acima.
- Remove ações ligadas a filtros/keyColumns/paramColumns das listas.

Migração: dados antigos persistidos (com `filters`/`keyColumns`) são lidos uma vez no `persist.onRehydrate` — campos legados são descartados, `items` são preservados.

## 2. `AnaliseTab` — botão "Consolidar na lista…"

Novo bloco no painel de ações (perto de Exportar):

```text
[ Consolidar dados filtrados ▾ ]
   ├─ Selecionar categoria: [ Portas ▾ ]   (lista as ComponentList)
   ├─ + Nova categoria…
   └─ [ Consolidar ]
```

Comportamento:
1. Origem dos dados = `filterRowsByVisualRules(filtered, ...)` (mesma base já mostrada na tabela).
2. Colunas salvas = colunas atualmente exibidas/agrupadas no AnaliseTab (chaves de `groupBy` + `concatCols` + `Type Mark` se ausente).
3. Valida que `Type Mark` existe em `dataset.columns`. Caso contrário, toast de erro.
4. Roda `consolidateFromRows` → se `conflicts.length > 0`, abre **`ConsolidateDialog`**:
   - Mostra: nº de itens novos, nº em conflito (com tabela compacta: type mark + colunas divergentes em destaque).
   - Botões: **Sobrepor (overwrite)** · **Apenas novos (only-new)** · **Cancelar**.
5. Sem conflitos → grava direto e mostra toast "X itens adicionados a Portas".

## 3. `ListsTab` — vira catálogo

Reescrita enxuta:

```text
┌──────────────┬──────────────────────────────────────────────┐
│ Categorias   │  Portas                          [Renomear]  │
│ + Nova       │  124 itens · 8 pavimentos · 08/05/2026       │
│ • Portas  ✓  │ ─────────────────────────────────────────────│
│ • Janelas    │  🔎 buscar…  [pavimento ▾]   [Exportar XLSX] │
│ • Mobiliário │ ─────────────────────────────────────────────│
│              │  Type Mark │ <colunas dinâmicas> │ Qtd │ Pav │
└──────────────┴──────────────────────────────────────────────┘
```

- Sidebar esquerda: lista de categorias + botão "Nova categoria" (modal só com nome).
- Conteúdo: tabela read-only dos `items` da lista ativa, colunas = união de `columns` registradas nos itens.
- Cabeçalhos: duplo-clique renomeia (mantém `columnAliases` Power BI-style).
- Linha expansível mostra `occurrences` (arquivo · qtd · IDs).
- Ações por linha: remover item; ação no topo: limpar lista, exportar XLSX, excluir categoria.
- **Removido** desta aba: editor de filtros, editor de exclusão, seletor de keyColumns/paramColumns, preview de filtros, banner de "novos arquivos" (a consolidação agora é manual a partir do AnaliseTab).

## 4. Componentes / arquivos

Novos:
- `src/components/ark/lists/ConsolidateDialog.tsx` — diálogo de conflito com modos `overwrite` / `only-new`.
- `src/components/ark/lists/CategorySidebar.tsx` — sidebar de categorias.
- `src/components/ark/lists/CategoryTable.tsx` — tabela read-only.
- `src/components/ark/analise/ConsolidateAction.tsx` — botão + popover usado no `AnaliseTab`.

Modificados:
- `src/lib/component-lists.ts` — modelo + funções acima.
- `src/lib/store.ts` — slice e actions.
- `src/components/ark/AnaliseTab.tsx` — adiciona `<ConsolidateAction />` perto do botão Exportar.
- `src/components/ark/ListsTab.tsx` — reescrito como catálogo.

## 5. Regras-chave (resumo)

- Chave única por categoria = `Type Mark` (trim, case-sensitive).
- Linhas sem `Type Mark` são ignoradas e contadas em `invalidRows` (mostrar no toast).
- Quando o mesmo Type Mark aparece várias vezes nos dados filtrados, valor canônico de cada coluna = mais frequente; `occurrences` agrega por arquivo.
- `overwrite` substitui params em conflito; `only-new` mantém os existentes intactos.
- Persistência continua via Zustand `persist`.

## 6. Validação manual

1. Filtrar `Agrupamento padrão = Portas` no AnaliseTab → "Consolidar dados filtrados" → criar categoria "Portas". Confirmar que aparece na aba Listas com as colunas atuais.
2. Mudar `Description` de um Type Mark, refazer consolidação → diálogo deve listar o conflito; testar `Sobrepor` (atualiza) e `Apenas novos` (mantém antigo).
3. Subir novo arquivo (novo pavimento) com Type Marks repetidos → consolidar → `occurrences` ganha entrada, sem duplicar item.
4. Type Mark vazio em algumas linhas → toast informa "N linhas ignoradas (sem Type Mark)".
5. Criar segunda categoria "Janelas" e validar isolamento total entre listas.