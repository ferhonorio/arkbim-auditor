## Objetivo

Tornar o ciclo de consolidação mais flexível e seguro: definir/sobrescrever esquema (chave + pavimento) na hora de consolidar, mapear nomes de pavimentos a partir do arquivo, renomear colunas/itens na lista, conferir associação de colunas antes de gravar, desfazer a última consolidação e resolver inconsistências antes de consolidar.

---

## 1. Painel "Esquema da consolidação" ao lado do botão Consolidar

`src/components/ark/AnaliseTab.tsx` + `ConsolidateAction.tsx`
- Ao lado do botão **Consolidar** mostrar dois selects compactos: **Coluna chave** e **Coluna de pavimento**, populados com `dataset.columns`. Defaults inteligentes: "Type Mark" / "Marca de Tipo" / primeira; "Nome do arquivo" / "Pavimento" / primeira.
- Ao escolher categoria existente no diálogo, os selects aparecem **pré-preenchidos com o esquema da categoria** mas **editáveis**. Se o usuário alterar, marcar checkbox "Atualizar esquema da categoria" (default off → consolidar uma vez com esquema novo; on → grava `keyColumn`/`floorColumn` na categoria via `updateComponentList`).
- Para nova categoria, o diálogo já recebe esses valores em vez de exigir reseleção.
- Validação: ambos precisam existir em `dataset.columns` — toast de erro caso contrário.

## 2. Mapeamento "arquivo → nome do pavimento"

Novo conceito `floorAliases: Record<string, string>` por categoria (ex.: `"MO-0101.00-8210-190-NGX-0000.rvt"` → `"PAVIMENTO TÉRREO"`).

`src/lib/component-lists.ts`
- `ComponentList` ganha `floorAliases?: Record<string, string>`.
- Em `planConsolidation`, ao calcular `floor`, aplicar: `floor = list.floorAliases?.[rawFromFloorCol] ?? rawFromFloorCol`. Assim a regra serve para qualquer coluna escolhida como pavimento (não só "Nome do arquivo").
- `migrateComponentList` inicializa `floorAliases: {}`.

UI: nova aba/expansor **"Pavimentos"** em `ListsTab` (CategoryView) listando todos os valores distintos da `floorColumn` já vistos em `occurrences` + valores presentes no dataset atual. Cada linha: `valor original → input "Nome amigável"`. Salvar via `updateComponentList`. Botão "Aplicar agora" reescreve os `occurrences.floor` existentes usando o novo mapa (recalculo simples no store).

Também expor um link "Mapear pavimentos" no diálogo de consolidação após detectar pavimentos novos no preview.

## 3. Renomear colunas e células na lista consolidada

`src/components/ark/ListsTab.tsx`
- **Headers (já existe via `setColumnAlias`)**: manter, mas **bloquear** o rename do header da `keyColumn` (botão de renomear oculto/desabilitado quando `col === list.keyColumn`).
- **Células da coluna chave**: read-only.
- **Demais células**: duplo-clique troca para `<Input>` inline; on blur/Enter salva via novo action `updateItemParam(listId, key, column, value)`. Atualiza `item.params[col]` e `item.lastUpdatedAt`.
- **Renomear o valor da chave** (caso o usuário queira corrigir typo de Type Mark): permitir só por menu de contexto explícito ("Renomear chave…") com confirmação, pois isso muda `item.key`. Action `renameItemKey(listId, oldKey, newKey)`: rejeita se `newKey` já existe (toast); senão atualiza chave e timestamps.

## 4. Verificação de associação de colunas antes de gravar

`ConsolidateAction.tsx` — entre `planConsolidation` e o commit, abrir um diálogo intermediário **"Conferir mapeamento"** quando a categoria já tem itens E o dataset traz colunas novas/diferentes:
- Tabela: `Coluna do dataset` ↔ `Coluna na lista` (Select com colunas já presentes em `list.items[*].columns` + opção "(criar nova)" + opção "(ignorar)").
- Sugestão automática por nome igual / case-insensitive / aliases conhecidos.
- Aplicado via remap das chaves de `params` dentro do `plan.preview` antes de chamar `applyConsolidation`.
- Se não houver colunas novas/divergentes, pular o passo silenciosamente.

## 5. Desfazer última consolidação

`src/lib/store.ts`
- Em `applyConsolidation`, antes do `commit`, salvar snapshot na própria lista: `lastSnapshot?: { items, sourceFiles, savedAt, summary: { added, updated, skipped } }`. Apenas o último (sem histórico).
- Novo action `undoLastConsolidation(listId)` que restaura `items`/`sourceFiles` a partir de `lastSnapshot` e limpa o snapshot.
- `migrateComponentList` aceita `lastSnapshot` opcional.

UI em `ListsTab` (CategoryView, header da categoria): botão **"Desfazer última consolidação"** com tooltip mostrando `summary` e `savedAt`. Disabled se `!lastSnapshot`. Toast confirmando reversão.

## 6. Resolver inconsistências no painel de agrupamento

`src/components/ark/AnaliseTab.tsx`
- Para cada **regra visual** com `applyWhen="inconsistent"`, agregar os grupos cujas chaves estão em `badKeysPerRule[i]`. Botão por regra: **"Resolver inconsistências (N)"** abre um diálogo `ResolveInconsistenciesDialog` (novo arquivo `src/components/ark/lists/ResolveInconsistenciesDialog.tsx`).
- Diálogo: lista de chaves divergentes; cada chave expande para mostrar, por `compareColumn` divergente, os valores observados (com contagem de linhas) + radio "verdadeiro" + campo livre "outro valor". Botão "Aplicar a todas as linhas dessa chave".
- Aplicação: novo action `applyResolutions(resolutions)` no store que muta `dataset.rows` — para cada `(key, col, value)`, percorre as linhas onde a chave bate (usando `keyColumns` da regra) e seta `r[col] = value`. Marca `dataset.updatedAt`.
- Após resolver, as regras revaliam automaticamente (memos). Toast com contagem de linhas atualizadas.
- Atalho: a partir do diálogo, botão "Consolidar agora" reaproveita o fluxo existente.

## Arquivos afetados

Modificados:
- `src/lib/component-lists.ts` — `floorAliases`, plan aplica alias no `floor`, `migrateComponentList`.
- `src/lib/store.ts` — `lastSnapshot` + `undoLastConsolidation`, `updateItemParam`, `renameItemKey`, `applyResolutions`, persistência de `floorAliases`.
- `src/components/ark/AnaliseTab.tsx` — selects de chave/pavimento ao lado do Consolidar; botão "Resolver inconsistências" por regra.
- `src/components/ark/lists/ConsolidateAction.tsx` — esquema editável + checkbox "atualizar esquema", passo "Conferir mapeamento", link "Mapear pavimentos".
- `src/components/ark/ListsTab.tsx` — bloqueio do rename na key column, edição inline de células, rename de key via menu, painel de mapeamento de pavimentos, botão "Desfazer última consolidação".

Novos:
- `src/components/ark/lists/FloorMappingPanel.tsx` — gerencia `floorAliases`.
- `src/components/ark/lists/ColumnMappingDialog.tsx` — passo "Conferir mapeamento".
- `src/components/ark/lists/ResolveInconsistenciesDialog.tsx` — fluxo do item 6.

## Regras-chave

- Esquema da categoria continua persistente, mas pode ser sobrescrito a cada consolidação (opt-in para gravar).
- `floorAliases` é puro mapeamento de exibição/agrupamento, não muda o `file` original.
- Edição inline nunca toca a `keyColumn` (exceto via "Renomear chave" explícito).
- Undo cobre só a última operação, sem histórico — mensagem clara.
- Resolução de inconsistência altera o dataset em memória; o usuário ainda decide quando consolidar.

## Validação manual

1. Trocar "Coluna chave" no botão Consolidar para "Marca de Tipo" sem editar a categoria → consolida uma vez; ativar checkbox → categoria passa a usar "Marca de Tipo".
2. Mapear `MO-0101...rvt` → `PAVIMENTO TÉRREO`; reabrir lista → subgrupos mostram nome amigável.
3. Duplo-clique numa célula de "Description" → editar → persiste; tentar editar célula da chave → bloqueado.
4. Subir arquivo com coluna "Descrição" em vez de "Description" → diálogo de mapeamento sugere a associação.
5. Consolidar; clicar "Desfazer" → lista volta exatamente ao estado anterior.
6. Em uma regra com 5 chaves divergentes em "Manufacturer" → escolher valor verdadeiro por chave → as linhas são atualizadas e a regra deixa de acender.
