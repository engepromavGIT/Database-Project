# 05 — Regras de Estimativa

Como o sistema transforma o histórico de obras em uma estimativa de **custo** e
**prazo** para um projeto novo. A lógica é sempre a mesma em três passos:

> **1. Normalizar** as obras do acervo para uma base comparável →
> **2. Selecionar e ponderar** as obras análogas →
> **3. Estimar** custo e prazo como uma **faixa** (não um número único), com nível de
> confiança.

---

## 1. Normalização (pré-requisito para comparar)

Obras de épocas, locais e padrões diferentes não são comparáveis "como estão". Antes de
qualquer estimativa, o sistema normaliza:

### 1.1 Atualização monetária (trazer para a data-base)

Cada custo carrega sua `data_base`. Para comparar na mesma moeda do tempo:

```
Valor_atualizado = Valor_histórico × ( Índice(data_base_alvo) / Índice(data_base_origem) )
```

- **Índice:** série **SINAPI** (edificações) / **SICRO** (infraestrutura), cadastrada mês a mês (entidade `INDICE_ECONOMICO`); INCC como alternativa.
- Exemplo: custo de R$ 1.000.000 com índice SINAPI 100 na época e 130 na data-base →
  `1.000.000 × (130/100) = R$ 1.300.000`.

### 1.2 Ajuste por padrão de acabamento, porte e localidade

Mesmo atualizado, o custo/m² varia com:

- **Padrão** (popular/normal/alto): aplicar fator relativo entre padrões (calibrável).
- **Localidade:** aplicar `fator_regional` da `LOCALIDADE` (diferença de preços por região).
- **Porte/escala:** obras muito pequenas ou muito grandes têm custo/m² atípico; tratar
  por faixa de área e/ou como ajuste.

> Todos os fatores são **parâmetros configuráveis** (RNF-15), revisáveis pela engenharia.

### 1.3 Métrica-base: custo por m² normalizado

```
custo_m2_normalizado = custo_total_atualizado_e_ajustado / area_construida_m2
```

É a métrica central para comparar obras e parametrizar estimativas.

---

## 2. Seleção de obras análogas e similaridade

O sistema busca, entre as obras **elegíveis** (RF-B07), aquelas mais parecidas com o
projeto-alvo e atribui um **escore de similaridade** (0 a 1) combinando critérios:

| Critério | Como entra no escore |
|----------|----------------------|
| Tipo de obra | Igualdade (peso alto) |
| Padrão de acabamento | Igualdade/proximidade |
| Área construída | Proximidade (quanto menor a diferença %, maior o escore) |
| Localidade/região | Proximidade |
| Nº de pavimentos | Proximidade |
| Recência | Obras mais recentes pesam um pouco mais |

O escore final é uma **média ponderada** dos critérios (pesos configuráveis). Ele vira o
`peso_similaridade` em `ESTIMATIVA_REFERENCIA` e é usado para ponderar as obras na conta.

---

## 3. Métodos de estimativa

O orçamentista escolhe o método (RF-F02). Recomenda-se usar mais de um e comparar.

### 3.1 Análoga (top-down)

Compara diretamente com 1–N obras muito semelhantes. Rápida, boa quando há um caso quase
idêntico. Custo-alvo ≈ custo/m² normalizado da(s) análoga(s) × área-alvo.

### 3.2 Paramétrica (R$/m²) — método principal do acervo

Usa a **média ponderada** do custo/m² normalizado das obras análogas:

```
custo_m2_estimado = Σ (custo_m2_normalizado_i × peso_i) / Σ peso_i
custo_provável     = custo_m2_estimado × area_alvo
```

Pode ser feita por **etapa da EAP** (custo/m² de fundação, estrutura, acabamento…),
somando depois — mais precisa e já mostra a composição.

### 3.3 Bottom-up (por EAP/composição)

Monta o orçamento item a item a partir das composições de referência (SINAPI/próprias) e
das quantidades do projeto novo. Mais trabalhosa e mais precisa; o histórico entra como
**aderência** (quanto o realizado costuma divergir do orçado por etapa — fator de ajuste).

> **Limitação conhecida — a largura da faixa com menos de 2 obras encerradas.**
> A aderência devolve `fator ± desvio`, e a faixa O–P do bottom-up é
> `custo_direto × (fator ∓ desvio)`. Mas o **desvio só é medido a partir de 2 obras**: abaixo
> disso vem a constante **0,1** (o mesmo default do acervo vazio). Logo, num acervo novo, a
> **largura inteira** da faixa é uma suposição de ±10%, não uma observação — só o `fator` é medido.
>
> Onde isso está sinalizado e onde não está:
> - **Card recém-gerado:** ressalvado. Mostra "±0,1 assumido — desvio não medido" ao lado da faixa.
> - **Estimativa salva** (cenários, lista, PDF, integração): **não ressalvado**. A tabela
>   `orcamento.estimativas` não persiste `n` nem se o desvio foi medido, então ao reler do banco
>   uma faixa assumida é indistinguível de uma medida. O único sinal indireto é o
>   `nivel_confianca_pct` **= 30** (a base), que num bottom-up significa n < 3 — pista de "não
>   calibrado", mas grosseira: não separa n=1 (desvio assumido) de n=2 (medido, porém fraco).
>
> Correção completa, quando o schema for mexido de novo: persistir `aderencia_n` e
> `aderencia_desvio_medido` (nullable, retrocompatível) e ressalvar na leitura como o card faz.
> Enquanto isso, ao comparar bottom-ups salvos, **trate a faixa de qualquer um com confiança 30%
> como largura arbitrada**.

### 3.4 Faixa por 3 pontos (PERT)

Qualquer método acima vira **faixa**. Com otimista (O), mais provável (M) e pessimista (P):

```
Custo_esperado   = (O + 4·M + P) / 6
Desvio_padrão(σ) ≈ (P − O) / 6
```

- **O, M, P** podem vir dos percentis do acervo (ex.: P10, mediana, P90 do custo/m²).
- Faixa de confiança ≈ `esperado ± 1,64·σ` (≈90%) — calibrável.

### 3.5 Regressão (evolução)

Quando houver volume suficiente de obras, ajustar um modelo (ex.: custo em função de área,
padrão, pavimentos, região) para estimar e medir a incerteza estatisticamente. Entra em
fase posterior (ver [roadmap](./06-arquitetura-integracao.md#7-roadmap-de-implantacao)).

---

## 4. Estimativa de prazo

Mesma lógica do custo, usando o **prazo realizado** das obras análogas:

- Indicador-base: **dias/m²** ou prazo por porte/tipo, normalizado.
- Faixa por 3 pontos a partir dos percentis de prazo das análogas.
- Considerar o **desvio histórico de prazo** (RF-D03): se as obras costumam atrasar X%,
  o prazo "provável" já incorpora isso, evitando otimismo sistemático.

---

## 5. Do custo direto ao preço de referência

A estimativa entrega o **custo direto**. Para um preço de referência:

```
preço_referência = custo_direto × (1 + BDI)        (mão de obra já com encargos)
```

BDI e encargos vêm de `PARAMETRO_BDI` por tipo de obra e vigência (RF-F06). O preço final
de proposta segue o processo comercial — está **fora do escopo** (ver [doc 01](./01-visao-escopo.md#32-fora-do-escopo-nesta-fase)).

---

## 6. Nível de confiança

O `nivel_confianca_pct` da estimativa deve refletir, de forma transparente:

- **Quantidade** de obras análogas (poucas → menor confiança).
- **Dispersão** do custo/m² entre elas (alta dispersão → menor confiança / faixa mais larga).
- **Similaridade média** das referências (escores baixos → menor confiança).
- **Recência** dos dados.

Sugestão de leitura para o usuário: *Alta* (muitas análogas, baixa dispersão), *Média*,
*Baixa* (poucas análogas ou muito dispersas) — com a faixa numérica sempre visível.

---

## 7. Calibração contínua (fechar o ciclo)

Quando a obra estimada é executada, vincula-se o **realizado** à estimativa (RF-F08):

```
erro_% = (custo_realizado − custo_provável) / custo_provável
```

Acompanhar o `erro_%` por tipo de obra permite **recalibrar pesos e fatores** e provar a
evolução da precisão (objetivo do [doc 01](./01-visao-escopo.md#2-objetivos-e-indicadores-de-sucesso)).

---

## 8. Exemplo ilustrativo (paramétrico)

Projeto-alvo: obra **comercial**, padrão **normal**, **1.200 m²**, data-base **jun/2026**.

| Obra análoga | Área | Custo hist. | Data-base | Fator SINAPI → jun/26 | Custo atualizado | Custo/m² | Peso similar. |
|--------------|-----:|------------:|:---------:|:--------------------:|-----------------:|---------:|:-------------:|
| A | 1.100 m² | R$ 2,86 mi | jun/24 | 1,10 | R$ 3,15 mi | 2.860/m² | 0,9 |
| B | 1.400 m² | R$ 3,92 mi | jan/25 | 1,06 | R$ 4,16 mi | 2.969/m² | 0,7 |
| C | 900 m²  | R$ 2,30 mi | jun/23 | 1,18 | R$ 2,71 mi | 3.016/m² | 0,5 |

```
custo_m2 ponderado = (2.860·0,9 + 2.969·0,7 + 3.016·0,5) / (0,9+0,7+0,5)
                   ≈ 2.924 /m²
custo_provável ≈ 2.924 × 1.200 ≈ R$ 3,51 mi
```

Faixa (usando P10/mediana/P90 do custo/m² das análogas, por ex. 2.860 / 2.924 / 3.016):

```
O = 2.860×1.200 = 3,43 mi   M = 3,51 mi   P = 3.016×1.200 = 3,62 mi
Custo_esperado (PERT) = (3,43 + 4·3,51 + 3,62)/6 ≈ R$ 3,51 mi
```

> Números do exemplo são **ilustrativos** — servem para mostrar o fluxo de cálculo, não
> são referência de preço.

---

⬅️ Anterior: [04 — Modelo de Dados](./04-modelo-dados.md) · ➡️ Próximo: [06 — Arquitetura, Integração e Roadmap](./06-arquitetura-integracao.md)
