## Objetivo

Corrigir o descasamento entre a intenção do usuário e o comportamento das regras visuais, sem mudar a matemática (que está correta), tornando a UI auto-explicativa, alertando configurações sem sentido e expondo um diagnóstico ao vivo por regra.

## 1. Renomear e re-explicar os campos da regra (`AnaliseTab.tsx`)

- Renomear "Parâmetro(s) comum(ns) — chave" para **"Chave (o que identifica o MESMO item)"** com tooltip:
  *"Linhas que tiverem os mesmos valores nesta(s) coluna(s) serão comparadas entre si. Use aqui o identificador do item (ex.: Type Mark), não o que diferencia (ex.: Nome do arquivo)."*
- Renomear "Parâmetros comparados" para **"Devem ser iguais (entre as linhas que compartilham a chave)"**.
- Adicionar exemplo embutido em texto pequeno abaixo do bloco da regra:
  *"Ex.: Chave = Type Mark; Devem ser iguais = Model, Manufacturer, Description. A regra acende quando o mesmo Type Mark aparece em arquivos diferentes com Model/Manufacturer divergente."*
- Renomear "Aplicar quando comparação for" → **"Pintar quando"** com opções:
  - "Houver divergência (qualquer parâmetro difere)" — `inconsistent`
  - "Tudo for igual" — `consistent`

## 2. Validações e alertas inline

Em `AnaliseTab.tsx`, para cada regra calcular:
- `keyOnlyOnePerGroup`: se `Nome do arquivo` ∈ `keyColumns` e cada grupo tiver tipicamente 1 linha → mostrar alerta amarelo:
  *"Atenção: usar 'Nome do arquivo' como chave isola cada arquivo em grupos separados, então linhas de arquivos diferentes nunca serão comparadas. Provavelmente você quis colocar 'Nome do arquivo' como parâmetro comparado, e algo como 'Type Mark' como chave."*
- `noCompareCols` ou `noKeyCols` → alerta vermelho "Regra incompleta".

## 3. Diagnóstico ao vivo por regra

Abaixo de cada regra, mostrar mini-stats (em tempo real, baseado em `evaluateRule`):
- Total de chaves distintas
- Quantas têm divergência
- Quantas estão consistentes
- Quantas linhas casam com a regra (segundo o `applyWhen` atual)

Isso deixa óbvio quando a regra "não pega nada" porque foi mal configurada.

## 4. Modo de combinação dos compareColumns (opcional, baixo custo)

Adicionar select extra **"Critério"** com:
- "Qualquer parâmetro divergente conta" (atual — OR para inconsistent)
- "Apenas se TODOS divergirem" (novo)

Implementação: novo campo `matchMode: "any" | "all"` em `VisualRule`. Em `evaluateRule`, contar quantos compareColumns têm `set.size > 1`; `inconsistent` vira `count >= 1` (any) ou `count === cmpCols.length` (all). Default `any` para preservar comportamento.

## 5. Replicar a mesma renomeação em `DiagnosticoTab.tsx`

Onde a seção "Aplicação das regras visuais" descreve as regras, usar os mesmos rótulos novos para coerência.

## Arquivos afetados

- `src/components/ark/AnaliseTab.tsx` — labels, tooltips, alertas, mini-stats por regra, select de critério.
- `src/lib/grouping.ts` — adicionar `matchMode` a `VisualRule` e respeitá-lo em `evaluateRule`.
- `src/components/ark/DiagnosticoTab.tsx` — atualizar labels.
- `src/lib/store.ts` — nada (campo opcional, sem migração).

## Fora de escopo

Não alteramos `runAudit`, `compareToConsolidated`, nem `filterRowsByVisualRules` — eles continuam corretos, só passam a se beneficiar de regras melhor configuradas.
