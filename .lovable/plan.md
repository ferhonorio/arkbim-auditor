Plano para deixar a análise visual lógica e enxuta:

1. Separar a base da regra visual da base exibida
- A regra visual será calculada sempre sobre as linhas filtradas por filtros/busca, antes do toggle “Mostrar somente itens das regras visuais”.
- O toggle só reduzirá a tabela depois que as chaves divergentes já forem identificadas.
- Isso evita reavaliar a regra em cima de uma lista já filtrada e gerar comportamentos confusos.

2. Corrigir o agrupamento para refletir os níveis definidos
- Quando o usuário agrupar por `Type Mark` e depois por `Description`, a tabela será ordenada hierarquicamente por esses campos.
- Assim, se o `Type Mark 24` tiver duas `Description` diferentes, as duas linhas aparecerão próximas uma da outra:

```text
Type Mark | Description A | Quantidade
24        | ... A         | 1
24        | ... B         | 1
```

3. Aplicar regra visual por chave comum, não pela linha agrupada isolada
- Para uma regra com chave `Type Mark` e comparação `Description`, o sistema irá:
  - encontrar todas as linhas brutas com o mesmo `Type Mark`;
  - só comparar se existirem pelo menos 2 linhas com essa chave;
  - marcar como divergente se houver mais de um valor real em `Description`;
  - aplicar a cor em todas as linhas agrupadas que pertencem a essa chave.
- Portanto, uma linha agrupada com `Quantidade = 1` poderá ficar pintada se ela representa uma das variações de um `Type Mark` que existe em outras linhas com outra descrição.

4. Melhorar a leitura da tabela
- Manter `Quantidade` como quantidade daquele agrupamento exato.
- Adicionar um indicador enxuto de comparação da regra, por exemplo “Linhas na chave”, para mostrar quantas linhas brutas existem para aquele `Type Mark` dentro da regra.
- Isso deixará claro quando uma linha com quantidade 1 está sendo comparada com outras linhas da mesma chave.

5. Ajustar diagnósticos das regras
- Os contadores “Chaves”, “Divergentes”, “Consistentes” e “Aplica em” passarão a ignorar chaves não comparáveis, ou seja, chaves com apenas 1 linha.
- Assim, um `Type Mark` único na lista inteira nunca será contado como consistente/divergente nem receberá regra visual.

Arquivos a alterar:
- `src/lib/grouping.ts`: tornar a avaliação, contagem e ordenação de agrupamentos mais previsível.
- `src/components/ark/AnaliseTab.tsx`: usar a base correta para regras, ordenar/mostrar agrupamentos de forma hierárquica e exibir o indicador de linhas comparadas.