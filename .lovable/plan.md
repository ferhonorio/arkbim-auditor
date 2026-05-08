Objetivo
- Fazer a análise visual funcionar de forma lógica: uma regra `Type Mark -> Description` só pode pintar itens quando existir o mesmo `Type Mark` em 2 ou mais linhas brutas com `Description` realmente diferente.
- Fazer o agrupamento seguir exatamente a sequência escolhida pelo usuário, itemizando novas linhas quando um nível posterior divergir.

Plano

1. Corrigir a definição de “item comparável” da regra visual
- Revisar a avaliação da chave comum para garantir que a regra só entre em ação quando houver 2+ linhas brutas para a mesma chave.
- Para `Chave = Type Mark` e `Comparar = Description`, o sistema vai considerar divergência apenas quando o conjunto de `Description` distintas para aquele `Type Mark` tiver mais de 1 valor real.
- Itens órfãos não serão pintados: se houver só uma combinação efetiva para aquele `Type Mark`, a regra não se aplica.

2. Alinhar a marcação visual com o agrupamento exibido
- Garantir que a pintura da linha agrupada use exatamente a mesma base lógica do agrupamento exibido, sem “herdar” divergência de combinações que não deveriam aparecer como comparação válida naquela visão.
- Validar especialmente os casos como `31`, `98` e `B01`, em que hoje a linha aparece única na tabela mas ainda recebe destaque.
- Ajustar o cálculo para que a linha só seja marcada quando existir uma linha-irmã real da mesma chave comum na listagem agrupada correspondente.

3. Corrigir a hierarquia do agrupamento
- Fazer o agrupamento respeitar fielmente a ordem escolhida: `Agrupamento padrão -> Type Mark -> Description`.
- O resultado esperado será:
  - 1 linha por valor único de `Agrupamento padrão` + `Type Mark` + `Description`
  - quando o `Description` divergir dentro do mesmo `Type Mark`, criar novas linhas separadas
  - quando não houver divergência no `Description`, manter uma única linha consolidada com a soma correta.

4. Revisar a ordem e a renderização das colunas da tabela
- Conferir se a tabela está exibindo os campos na mesma ordem do `groupBy` selecionado.
- Corrigir qualquer descompasso entre cabeçalho e valores, porque isso pode estar dificultando a leitura e dando a impressão de divergência incorreta.
- Eliminar ambiguidade visual entre colunas agrupadas e colunas adicionais mostradas na tabela.

5. Ajustar métricas e indicação de comparação
- Manter os contadores de regras considerando apenas chaves comparáveis.
- Revisar o indicador `chave: N` para que ele reflita uma comparação válida e não sugira divergência quando a linha está efetivamente sozinha na visualização agrupada.
- Preservar a `Quantidade` como soma da combinação exata exibida na linha.

Validação
- Testar o cenário do print: `Agrupamento padrão -> Type Mark -> Description` com regra `Chave = Type Mark` e `Comparar = Description`.
- Confirmar que:
  - `Type Mark 99` com duas descriptions vira duas linhas e ambas são destacadas;
  - `Type Mark 31`, `98`, `B01` e similares não ficam destacados se não houver segunda variação válida para comparar;
  - a ordem visual da tabela corresponde exatamente à ordem configurada no agrupamento.

Detalhes técnicos
- Arquivos principais: `src/lib/grouping.ts` e `src/components/ark/AnaliseTab.tsx`.
- A correção será concentrada na relação entre:
  - avaliação das regras visuais por chave comum;
  - montagem dos grupos hierárquicos;
  - aplicação do destaque nas linhas agrupadas renderizadas.