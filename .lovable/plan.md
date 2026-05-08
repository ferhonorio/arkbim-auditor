
# ArkBIM Validação de dados

Sistema web para importar exports CSV/XLSX do Autodesk Construction Cloud, agrupar/filtrar dados, auditar inconsistências entre pavimentos (arquivos `.rvt`) e gerar uma **Lista Consolidada** a partir de um arquivo de referência aprovado.

## Layout geral

Header fixo com título "ArkBIM — Validação de dados", nome do arquivo carregado, e botões globais (Exportar auditoria, Exportar filtrado, Exportar consolidado).

Sidebar esquerda recolhível com:
- Upload (clique ou drag-and-drop) de CSV/XLSX
- Botão "Recarregar dados do anexo" (mantém filtros, colunas, regras, agrupamento)
- Painel **Filtros** (coluna + operador + valor, múltiplos, com `+`/`-`)
- Painel **Colunas** (busca, checkboxes, "Mostrar tudo")

Conteúdo principal em 3 abas:
1. **Análise e agrupamento** (paridade com o protótipo)
2. **Auditoria BIM** (regras de inconsistência)
3. **Lista Consolidada** (novo — comparação contra arquivo de referência)

## Aba 1 — Análise e agrupamento

Replicando o protótipo enviado:

- KPIs no topo: Linhas totais, Após filtros, Colunas visíveis, Regras ativas
- **Regras visuais de comparação**: arrastar atributos para criar regras que pintam linhas inconsistentes; cada regra tem cor própria
- **Foco de parâmetro** + busca por valor + seletor de linhas/página
- **Agrupamento** dinâmico por N colunas (botão `+`), com coluna automática **Quantidade** somando itens idênticos
- **Concatenar dados**: reúne valores diferentes na mesma célula separados por vírgula, com botão copiar
- Ao escolher um parâmetro de foco, demais parâmetros somem da tabela quando não correspondem
- Colunas redimensionáveis pela borda direita do cabeçalho
- Paginação

## Aba 2 — Auditoria BIM

- Agrupamento padrão por **Nome do arquivo + Type Mark + Description + Manufacturer**
- Editor de regras com atributos arrastáveis: parâmetros "comuns" (devem ser iguais) e "de comparação" (devem diferir)
- Coluna **Status** indica qual regra falhou
- Coluna **IDs** lista IDs do Revit envolvidos, separados por vírgula (colável no Revit para seleção em lote)
- Botão Exportar auditoria (XLSX)

## Aba 3 — Lista Consolidada (novo módulo)

O fluxo central pedido:

**Passo 1 — Definir referência**
- Dropdown "Arquivo de referência aprovado" listando todos os valores únicos de `Nome do arquivo` (ex.: `MO-0101.00-8210-190-NGX-0000.rvt`)

**Passo 2 — Definir chave de equivalência** (configurável)
- Multi-select de colunas-chave; presets rápidos:
  - Type Mark
  - Type Mark + Subagrupamento padrão
  - Type Mark + Agrupamento padrão
- Padrão inicial: `Type Mark`

**Passo 3 — Definir parâmetros validados** (configurável)
- Multi-select de colunas a comparar; preset rápido: `Description, Manufacturer, URL`

**Passo 4 — Resultado em duas visões**

a) **Tabela "Lista Consolidada (referência aprovada)"**
- Uma linha por chave única do arquivo de referência
- Colunas: chave + parâmetros validados + Quantidade na referência

b) **Tabela "Divergências por arquivo"**
- Uma seção colapsável por arquivo `.rvt` (exceto o de referência)
- Para cada chave presente: status `Conforme` / `Divergente` / `Faltando` / `Extra`
- Linhas divergentes destacadas em vermelho, mostrando `valor referência → valor encontrado` por parâmetro
- Coluna IDs do Revit dos elementos divergentes (vírgula-separados)

**Passo 5 — Exportações**
- **Exportar XLSX consolidado**: aba `Referência aprovada`, aba `Divergências por arquivo`, aba `Resumo` (contagem por arquivo)
- **Exportar relatório por arquivo .rvt**: um XLSX por arquivo divergente, focado nos IDs para seleção em lote

## Premissas de comparação

- Comparação **case-insensitive**, ignorando espaços nas pontas
- Valores vazios tratados como `N/A`
- Quando a chave existe na referência mas não em outro arquivo → marcado como **Faltando**
- Quando existe em outro arquivo mas não na referência → marcado como **Extra**

## Detalhes técnicos

- TanStack Start + React, Tailwind v4, shadcn/ui (Tabs, Table, Select, Dialog, Collapsible, Checkbox, Button, Badge)
- Parsing client-side: `papaparse` (CSV) e `xlsx` / `exceljs` (XLSX leitura e escrita)
- Estado global da sessão via Zustand (arquivo bruto, filtros, colunas visíveis, regras, agrupamento, referência, chaves, parâmetros)
- Persistência local em `localStorage` para "Recarregar dados do anexo" e manter configuração entre reloads
- Sem backend nesta versão — tudo roda no navegador (arquivos BIM podem conter dados sensíveis; processamento local é vantagem)
- Estruturas: `Row`, `GroupNode`, `AuditRule`, `ConsolidationConfig`, `DivergenceReport`
- Performance: agrupamentos memoizados; paginação de 50/100/250/500; virtualização opcional em tabelas grandes (`@tanstack/react-virtual`) se a lista de linhas passar de ~5k

## Idioma

Toda a UI em **português brasileiro**, mantendo a terminologia já usada no protótipo (Agrupar por, Subagrupamento padrão, Type Mark, Nome do arquivo, Auditoria BIM, etc.).
