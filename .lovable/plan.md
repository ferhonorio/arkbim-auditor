## Objetivo

Tornar a consolidação flexível e robusta: chave configurável, subgrupos por pavimento, modo quantidade vs. área, seleção por checkbox e colunas redimensionáveis.

## 1. Chave configurável (não mais hardcoded "Type Mark")

`src/lib/component-lists.ts`
- Remover `KEY_COLUMN` constante. `ComponentList` ganha `keyColumn: string` (default "Type Mark", mas editável).
- `planConsolidation(rows, columns, list, opts)` passa a ler `list.keyColumn`.
- Migração no `persist.onRehydrate`: listas antigas recebem `keyColumn = "Type Mark"`.

`AnaliseTab` / `ConsolidateAction.tsx`
- No diálogo de consolidação, primeiro passo: **Selecionar coluna chave** (Select com `dataset.columns`, default = "Type Mark" se existir, senão "Marca de Tipo", senão primeira). Para listas existentes, o valor é travado (mostra qual é) e só pode ser trocado em "Editar categoria".
- Validação: a coluna escolhida precisa existir nas linhas filtradas; senão toast de erro.

## 2. Subgrupos por pavimento (coluna configurável)

`ComponentList` ganha `floorColumn: string` (default = `fileColumn` = "Nome do arquivo"). Pode ser qualquer coluna do dataset (ex.: "Level", "Pavimento").

`ConsolidatedItem` — o agregado por pavimento já existe via `occurrences`, mas hoje a chave é `file`. Reestruturar:

```text
occurrences: Array<{
  floor: string;          // valor da floorColumn
  file: string;           // arquivo de origem (referência)
  quantity: number;       // contagem OU soma de área
  ids: string[];
}>
```

Acumulação em `commitConsolidation`: chave do mapa = `floor|file` para preservar histórico de re-consolidações do mesmo pavimento vindo de arquivo diferente.

`ListsTab` (`CategoryTable`)
- Linha expansível agrupa `occurrences` por `floor` → mostra subtotal por pavimento e arquivos contribuintes.
- Filtro lateral "Pavimento" passa a filtrar pela `floorColumn`.

No diálogo de consolidação: Select "Coluna de pavimento" (default "Nome do arquivo"). Travado para listas já existentes (editável em "Editar categoria").

## 3. Modo de quantificação: por item vs. por área

`ComponentList` ganha:
- `measureMode: "count" | "area"` (default `"count"`)
- `areaColumn?: string` — exigido quando `measureMode = "area"`
- `unit: "un" | "m²"` derivada do modo

`planConsolidation`:
- `count`: `quantity = grupo.length` (comportamento atual).
- `area`: `quantity = soma de Number(parseLocaleNumber(r[areaColumn]))` por pavimento. Linhas com área inválida/zero são contadas em `invalidRows` separadamente (`invalidArea`). Helper `parseLocaleNumber` aceita `"1.234,56"` e `"1234.56"`.

`ConsolidateAction.tsx` — adicionar no diálogo:
```text
Modo: ( ) Por item   ( ) Por área (m²)
   └─ se "Por área": Select "Coluna de área" (numérica)
```

Mostrar no preview a unidade correta (`un` / `m²`) e total agregado.

`CategoryTable` — coluna "Qtd" vira "Qtd (un)" ou "Área (m²)" conforme `measureMode`. Subtotais por pavimento idem. Exportação XLSX inclui a unidade no header.

Mudar `measureMode` ou `areaColumn` em uma lista existente: bloquear (toast: "para alterar o modo, crie nova categoria") — evita misturar unidades.

## 4. Seleção por checkbox antes de consolidar

`AnaliseTab`
- Adicionar coluna fixa de checkbox no início da tabela de resultados filtrados.
- Cabeçalho com checkbox "selecionar todos / página".
- Estado `selectedRowIds: Set<string>` no slice do AnaliseTab (chave = `idCol` da linha).
- Botão "Consolidar dados filtrados" passa a usar:
  - se houver seleção → apenas linhas selecionadas;
  - se nada selecionado → todas as linhas filtradas (comportamento atual), com hint no botão ("3 selecionados" / "todos os 248 filtrados").
- `ConsolidateAction` recebe `rows` já resolvidas conforme regra acima.
- Limpar seleção após consolidação bem-sucedida.

## 5. Colunas redimensionáveis na ListsTab

`CategoryTable` (e opcionalmente na pré-visualização do AnaliseTab)
- Implementar resize manual sem libs externas: handle `<div>` absoluto na borda direita de cada `<th>`, drag atualiza `colWidths: Record<string, number>` mantido em estado local + persistido por categoria em `ComponentList.columnWidths: Record<string, number>`.
- `<table>` com `table-layout: fixed`; cada `<th>`/`<td>` recebe `style={{ width: colWidths[col] ?? defaultWidth }}`.
- Duplo-clique no handle = auto-fit (largura do header + 24px).
- Persistência via Zustand `persist` (já em uso).

## Arquivos afetados

Modificados:
- `src/lib/component-lists.ts` — novos campos (`keyColumn`, `floorColumn`, `measureMode`, `areaColumn`), ocurrences com `floor`, `parseLocaleNumber`, plan/commit ajustados.
- `src/lib/store.ts` — actions: `createComponentList(opts)`, `updateListSchema(listId, partial)`, `setSelectedRows`, `clearSelection`. Migração no rehydrate.
- `src/components/ark/AnaliseTab.tsx` — coluna de checkbox, contador de seleção, passa rows resolvidas para ConsolidateAction.
- `src/components/ark/lists/ConsolidateAction.tsx` — diálogo com 3 novos campos (chave, pavimento, modo+coluna de área) ao criar categoria; ao consolidar em existente mostra-os como read-only.
- `src/components/ark/ListsTab.tsx` — subgrupos por pavimento na linha expansível, unidade dinâmica, filtro por pavimento usa `floorColumn`.
- Novo: `src/components/ark/lists/ResizableTable.tsx` (ou hook `useColumnResize`) reutilizável.

## Regras-chave

- Listas existentes mantêm: `keyColumn="Type Mark"`, `floorColumn="Nome do arquivo"`, `measureMode="count"`. Tudo retrocompatível.
- Modo (`count`/`area`) e `keyColumn` são definidos na criação da categoria e travados depois (muda → cria nova categoria).
- `floorColumn` pode ser editado posteriormente (re-agrupa `occurrences` na próxima consolidação).
- Seleção zero = consolida todos os filtrados (sem fricção quando o usuário só quer tudo).
- Larguras de coluna persistidas por categoria.

## Validação manual

1. Subir arquivo com coluna "Marca de Tipo" (português) → criar categoria escolhendo essa coluna como chave → confirmar consolidação.
2. Criar categoria "Pisos" com modo "área" e coluna "Área" → conferir que totais por pavimento somam em m².
3. Marcar 3 linhas via checkbox → "Consolidar" deve mostrar "3 selecionados" e gravar só esses.
4. Expandir item na ListsTab → ver subtotais por pavimento.
5. Arrastar borda da coluna → largura persiste após reload.
