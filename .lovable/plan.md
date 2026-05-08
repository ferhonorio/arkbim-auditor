## Objetivo

Reformular a aba "Consolidada" para se tornar um **gerenciador de listas de componentes** (Portas, Mobiliário, Peças hidrosanitárias, etc.). Cada lista é um catálogo persistente, alimentado a partir do dataset carregado por meio de filtros + parâmetros configuráveis, com suporte a múltiplos arquivos/pavimentos e consolidações incrementais.

## 1. Modelo de dados (lib/store + lib/grouping)

### Conceito: `ComponentList`
Uma lista consolidada (ex.: "Portas") com:
- `id`, `name` (editável), `icon` opcional, `createdAt`, `updatedAt`
- `filters: Filter[]` — filtros de inclusão (mesmo modelo do painel atual)
- `excludeFilters: Filter[]` — filtros de exclusão
- `keyColumns: string[]` — chave de identidade do item (ex.: `Type Mark`)
- `paramColumns: string[]` — parâmetros levados para a lista (ex.: `Description`, `Model`, `Width`, `Height`)
- `fileColumn: string` — coluna de pavimento/arquivo (default `Nome do arquivo`)
- `columnAliases: Record<string,string>` — renomeação visual estilo Power BI (não altera origem)
- `items: ConsolidatedItem[]` — itens persistidos
- `sourceFingerprints: string[]` — registro dos arquivos já consolidados (para detectar novos)

### Conceito: `ConsolidatedItem`
- `key` (hash das `keyColumns`)
- `keyValues: Record<string,string>`
- `params: Record<string,string>` (valor canônico por parâmetro)
- `occurrences: { file: string; quantity: number; ids: string[] }[]` — quantidade por pavimento/arquivo
- `totalQuantity` (derivado da soma)
- `firstSeenAt`, `lastUpdatedAt`

### Store
Adicionar em `useArk`:
- `componentLists: ComponentList[]`
- `activeComponentListId: string | null`
- ações: `createList`, `renameList`, `deleteList`, `duplicateList`, `updateListConfig`, `setColumnAlias`, `consolidateIntoList(listId, mode)`, `removeItemFromList`

Persistência via `persist` (mesmo padrão atual). Cuidado com volume: opcional armazenar só `items` resumidos.

## 2. Fluxo de consolidação

1. Usuário abre a aba "Listas Consolidadas".
2. **Sidebar esquerda**: lista de "componentes" salvos (Portas, Janelas, Mobiliário…) + botão "Nova lista".
3. Ao criar/editar lista:
   - **Passo 1 — Filtros de inclusão**: igual ao painel de filtros (coluna, operador, valor; múltiplos).
   - **Passo 2 — Filtros de exclusão**: mesmo modelo, mas removendo do conjunto.
   - **Passo 3 — Coluna-chave (identidade do item)**: 1+ colunas.
   - **Passo 4 — Parâmetros consolidados**: colunas que vão aparecer na lista (independem dos filtros). Reordenáveis (drag).
   - **Passo 5 — Coluna de arquivo/pavimento**: select.
4. Pré-visualização ao vivo do que será consolidado, mostrando: total de linhas após filtros, nº de itens únicos, conflitos de parâmetros (quando o mesmo `key` tem `param` divergente entre arquivos — escolher canônico = mais frequente; sinalizar).
5. Botão **"Consolidar"** abre modal de modo:
   - **Mesclar/atualizar** — atualiza itens existentes e adiciona novos
   - **Substituir** — sobrescreve valores em conflito
   - **Apenas novos** — ignora itens já existentes na lista, grava só os inéditos
   - **Ignorar conflitos** — atualiza só `occurrences`, mantém `params` antigos

## 3. Re-consolidação ao subir novos arquivos

- Cada `ComponentList` guarda os `Nome do arquivo` já processados.
- Quando o `dataset` muda (novo upload), detectar arquivos novos comparando com `sourceFingerprints`.
- Banner no topo da aba: "Detectamos N pavimentos novos. Consolidar nas listas existentes?" com a mesma escolha de modo acima, podendo selecionar quais listas atualizar.

## 4. Visualização da lista consolidada

Layout limpo, leve, voltado a usuários não técnicos:

```text
┌─────────────────────────────────────────────────────────────────┐
│  Portas                              [Editar] [Exportar] [Nova] │
│  124 itens · 8 pavimentos · atualizado 08/05/2026               │
├─────────────────────────────────────────────────────────────────┤
│  🔎 buscar…   [coluna ▾]  [pavimento ▾]                         │
├──────┬──────────────┬─────────┬──────┬──────┬─────┬─────────────┤
│ ID   │ Descrição ✎  │ Modelo  │ Larg │ Alt  │ Qtd │ Pavimentos  │
├──────┼──────────────┼─────────┼──────┼──────┼─────┼─────────────┤
│ P027 │ Porta giro…  │ Freijó  │  80  │ 190  │  4  │ Pav1·Pav2   │
│ P076 │ Porta apoio  │ PIM-C3  │  90  │ 210  │  2  │ Pav1        │
└──────┴──────────────┴─────────┴──────┴──────┴─────┴─────────────┘
```

- Cabeçalhos clicáveis: **duplo-clique renomeia** (alias por coluna). Ícone ✎ sutil ao hover. Restaurar nome original via menu de contexto.
- Coluna **Pavimentos** mostra chips dos arquivos; tooltip exibe quantidade por pavimento.
- Linha expansível: detalha `occurrences` (arquivo → qtd → IDs) e divergências de parâmetros entre arquivos.
- Filtros locais (busca, por pavimento, por coluna).
- Exportar XLSX da lista (uma aba por lista).

## 5. Componentes / Arquivos

Novos:
- `src/lib/component-lists.ts` — tipos `ComponentList`, `ConsolidatedItem`, função `consolidateRows(rows, cfg, existingItems, mode)`.
- `src/components/ark/lists/ComponentListsTab.tsx` — orquestrador (sidebar + conteúdo).
- `src/components/ark/lists/ListSidebar.tsx`
- `src/components/ark/lists/ListEditor.tsx` — wizard/edição (filtros, exclusão, chave, parâmetros, coluna de arquivo).
- `src/components/ark/lists/ListPreview.tsx` — pré-visualização antes de consolidar.
- `src/components/ark/lists/ConsolidatedListView.tsx` — tabela final com renomeação de colunas.
- `src/components/ark/lists/NewFilesBanner.tsx` — alerta de novos pavimentos.
- `src/components/ark/lists/ConsolidateModeDialog.tsx` — escolha do modo.

Modificados:
- `src/lib/store.ts` — novo slice `componentLists`.
- `src/lib/grouping.ts` — reaproveitar `applyFilters` (já compatível) e adicionar `applyExcludeFilters` (negação do `applyFilters`).
- Substituir/renomear a aba atual `ConsolidadaTab.tsx` pelo novo orquestrador (manter o `buildConsolidation` antigo como utilitário caso seja útil para diff por arquivo dentro do detalhe do item).

## 6. Decisões de UX importantes

- Filtros para "separar componentes" e parâmetros levados para a lista são **independentes** (atende à necessidade do `agrupamento padrão` ser filtro mas não coluna).
- Renomeação de coluna é apenas visual (`columnAliases`), nunca altera `paramColumns`.
- Itens da lista nunca são perdidos automaticamente; remoções só por ação explícita ou pelo modo "Substituir".
- Quantidade total = soma das quantidades por arquivo, sempre derivada de `occurrences`.

## 7. Validação

- Criar lista "Portas" filtrando `Agrupamento padrão = Portas`, chave `Type Mark`, parâmetros `Description, Model, Width, Height`. Conferir que `Agrupamento padrão` **não** vira coluna da lista.
- Adicionar exclusão `Description contém "PROVISÓRIA"` e ver itens sumirem.
- Renomear "Description" → "Descrição"; recarregar a página e confirmar persistência.
- Subir novo arquivo (novo pavimento), aceitar consolidação no modo "Mesclar"; conferir que `occurrences` ganha entrada nova e `totalQuantity` aumenta.
- Repetir consolidação no modo "Apenas novos" e confirmar que itens existentes ficam intactos.
- Criar segunda lista "Pisos" com chave/params diferentes e validar isolamento.
