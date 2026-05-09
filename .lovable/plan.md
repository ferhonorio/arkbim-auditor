## Objetivo

Refinar o fluxo de seleção/consolidação e tornar a aba "Listas consolidadas" pronta para apresentar ao cliente: seleção total de filtrados, confirmação ao desfazer, exportações (XLSX formatado e CSV UTF-8) com escopo escolhido, e um modo de visualização elegante com abas por categoria, filtro por pavimento e botão "Copiar lista".

---

## 1. Selecionar todos os filtrados (AnaliseTab)

`src/components/ark/AnaliseTab.tsx`
- Hoje o checkbox do header só seleciona a página atual. Trocar por um controle de 3 estados que opera sobre **todos os grupos filtrados** (`groups` após filtros/regras), não só `pageGroups`:
  - `unchecked` → nenhum dos filtrados selecionado.
  - `indeterminate` → alguns selecionados.
  - `checked` → todos os filtrados selecionados.
- Ao lado do checkbox, adicionar um menu pequeno (ChevronDown) com:
  - **"Selecionar todos os filtrados (N)"**
  - **"Selecionar somente esta página"**
  - **"Inverter seleção"**
  - **"Limpar seleção"**
- Mostrar uma badge sutil "X de N selecionados" perto do botão Consolidar quando `selectedGroupKeys.size > 0`, com link "limpar".
- Comportamento mantém: se houver seleção, `ConsolidateAction` recebe apenas as linhas filtradas dos grupos selecionados (já implementado nas linhas 562–574).

## 2. Confirmar "Desfazer última" (ListsTab)

`src/components/ark/ListsTab.tsx`
- Substituir o `onUndo` direto por um `AlertDialog` (`@/components/ui/alert-dialog`) com:
  - Título: "Desfazer última consolidação?"
  - Descrição mostrando categoria, `summary` (added/updated/skipped) e `savedAt`.
  - Aviso: "Esta ação não pode ser revertida."
  - Botões: "Cancelar" / "Sim, desfazer" (variante destructive).
- Disable se `!list.lastSnapshot`.

## 3. Exportações com escopo (XLSX formatado + CSV UTF-8)

Substituir o botão único "Exportar XLSX" por um `DropdownMenu` "Exportar" com 4 opções:

### 3.1 XLSX — categoria atual (uma aba)
Como hoje, mas formatado:
- Cabeçalho com fundo escuro e fonte branca em negrito, linha congelada (`!freeze`), filtros automáticos (`!autofilter`).
- Largura de colunas calculada a partir do conteúdo (cap em ~60 chars).
- Coluna `Total (un|m²)` com formato numérico pt-BR.
- Linha "Total geral" no rodapé.

### 3.2 XLSX — categoria atual, uma aba por pavimento
- Para cada pavimento de `allFloors`, gerar uma aba contendo só itens com ocorrência naquele pavimento e `Total` recalculado para aquele pavimento.
- Aba inicial "Resumo" com matriz `Item × Pavimento → quantidade`.

### 3.3 XLSX — todas as categorias (uma aba por categoria)
- Itera `componentLists`, gera uma aba por categoria com a mesma formatação.
- Aba "Resumo" lista categorias, contagem, pavimentos, total.

### 3.4 CSV (UTF-8 com BOM)
- Sem formatação. Gerar string CSV com separador `;` (padrão Excel pt-BR), aspas para campos com `;`/`"`/`\n`, prefixar `\uFEFF` para garantir UTF-8 reconhecido pelo Excel.
- Mesmo escopo da exportação XLSX da categoria atual (respeita filtro de pavimento e busca).

`src/lib/export.ts`
- Adicionar `exportXLSXStyled(filename, sheets)` usando `XLSX.utils.aoa_to_sheet` para aplicar `!cols`, `!autofilter`, `!freeze`, e marcar a primeira linha com estilo via `cell.s` (xlsx mantém estilo básico em workbooks novos).
- Adicionar `exportCSV(filename, rows, columns)` com BOM + `;` separador.

## 4. Modo de visualização elegante "Apresentar ao cliente"

Nova aba/visualização dentro de **Listas consolidadas**:
- Adicionar acima da listagem atual um toggle **"Modo apresentação"** (Switch). Quando ligado, esconde edição/colunas técnicas e mostra um layout limpo voltado a validação.

Layout em modo apresentação (`src/components/ark/lists/PresentationView.tsx`, novo):
- Cabeçalho da categoria com nome grande, descrição enxuta (itens, pavimentos).
- **Tabs** (componente `tabs`) com uma aba por categoria (`componentLists`), além de uma aba "Geral" mostrando todas concatenadas.
- Dentro de cada categoria:
  - Filtro por pavimento (Select, idêntico ao atual + opção "Lista geral").
  - Tabela elegante: tipografia maior, zebra striping, sem botões de edição/expansão, colunas: chave + parâmetros visíveis + Total.
  - Quando "Lista geral" selecionada: agrega todas as ocorrências; quando pavimento: filtra ocorrências e recalcula totais para aquele pavimento.
- Botão **"Copiar lista"** no topo da tabela visível:
  - Constrói TSV (tab-separated) da tabela renderizada (cabeçalhos + linhas) e copia para clipboard via `navigator.clipboard.writeText`.
  - Também copia uma versão HTML (`text/html`) usando `ClipboardItem` quando disponível, para colar com formatação no Excel/Google Sheets.
  - Toast: "Lista copiada — cole no Excel (Ctrl+V)".
- Botão "Sair do modo apresentação" volta à visão atual.

## Arquivos afetados

Modificados:
- `src/components/ark/AnaliseTab.tsx` — checkbox tri-estado + menu de seleção em massa, badge de contagem.
- `src/components/ark/ListsTab.tsx` — AlertDialog de undo; dropdown de exportação; toggle de modo apresentação; remove handler antigo `handleExport`.
- `src/lib/export.ts` — `exportXLSXStyled`, `exportCSV` UTF-8 BOM, helper de larguras/estilos.

Novos:
- `src/components/ark/lists/PresentationView.tsx` — visualização elegante com tabs por categoria, filtro por pavimento e botão Copiar lista.
- (Opcional) `src/components/ark/lists/ExportMenu.tsx` — encapsula o dropdown com as 4 opções.

## Regras-chave

- "Selecionar todos" sempre opera sobre o conjunto **filtrado** (regras visuais + filtros + busca), nunca sobre o dataset bruto.
- Confirmação de undo é obrigatória; nada de undo silencioso.
- Toda exportação CSV é UTF-8 com BOM e separador `;`.
- Modo apresentação é **read-only**: não há edição inline, rename, exclusão nem expansão de ocorrências.
- "Copiar lista" copia exatamente o que está visível (respeita filtro de pavimento e tab ativa).

## Validação manual

1. Filtrar Furniture, clicar "Selecionar todos os filtrados" → contador mostra 1006; consolidar usa só esses.
2. Clicar "Desfazer última" → diálogo confirma, depois reverte.
3. Exportar "XLSX por pavimento" → arquivo abre no Excel com uma aba por pavimento + aba Resumo, cabeçalho destacado e filtros automáticos.
4. Exportar CSV → abrir no Excel pt-BR com acentos corretos e colunas separadas.
5. Ligar "Modo apresentação" → ver tabs por categoria, trocar pavimento, clicar "Copiar lista" e colar no Excel formatado.
