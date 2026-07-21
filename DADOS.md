# DADOS.md — carga de dados reais (índices + obras)

Runbook para tirar o módulo do "placeholder" e colocá-lo para valer. O módulo **está em produção**;
hoje o acervo tem **0 obras** e a série SINAPI é **sintética (tudo 100 → fator ≈ 1)**. As duas cargas
abaixo são o que faz a atualização monetária e a estimativa passarem a refletir a realidade.

> **Onde você faz isto:** na aba **Cadastros** (índices) e **Importar** (obras) do módulo **em
> produção** — ou seja, os dados entram no banco real. As duas telas têm **prévia (dry-run)** antes
> de gravar, então dá para conferir sem risco. Se quiser ensaiar, pode colar primeiro no ambiente de
> **dev** (rodando local com o `.env` da dev) e só depois repetir em produção.

---

## 1. Série de índices SINAPI/INCC — o maior destravamento

A atualização monetária (RF-D01) e a estimativa paramétrica trazem os custos das obras da data-base
delas para a data-base do alvo multiplicando pelo **fator** = valor do índice no mês-alvo ÷ valor no
mês da obra. Com a série toda em 100, esse fator é sempre 1 (nada é atualizado). Carregar os valores
reais resolve isso.

### O nome do índice importa

O estimador e a atualização usam, por padrão, o índice de nome **exatamente `SINAPI`** (maiúsculas).
Use esse nome para a série principal. Pode cadastrar também `INCC`, `SICRO` etc. — eles aparecem no
seletor da atualização monetária, mas o **default é `SINAPI`**.

### De onde vêm os valores

- **SINAPI** — publicado mensalmente pela Caixa (relatórios de "Índice" / custos por m²; use a série
  do seu estado, ex.: CE). Pegue o **número-índice mensal** (não a variação %).
- **INCC** — publicado pela FGV.

O que importa para o cálculo é a **razão entre os meses**, então a base do índice não muda o
resultado — só carregue os valores mensais de forma consistente. Não invente números; use a série
oficial.

### Quais meses carregar

No mínimo: os **meses da data-base das obras** do acervo **e** os meses-alvo que você vai estimar. O
ideal é uma **série mensal contínua** cobrindo o período (se faltar o mês exato, o fator daquele par
fica indefinido e não atualiza).

### Como colar (aba Cadastros → "Importar série de índices em lote")

1. Escolha o **índice padrão** = `SINAPI` (ou informe o índice inline em cada linha).
2. Cole a série. **Três formatos aceitos** (separador `;`, TAB ou espaços; decimal com vírgula ou
   ponto; linhas `#...` e cabeçalhos são ignorados):

   | Formato | Exemplo de linha |
   |---|---|
   | Competência + valor | `2024-01 100,50` · `01/2024;100.5` |
   | 3 colunas (ano, mês, valor) | `2024 01 100,50` |
   | Matriz anual (ano + até 12 meses, de Jan) | `2024 100,5 101,2 101,9 …` |

   *(Índice inline no começo sobrescreve o padrão: `SICRO 2024-03 250`.)*

3. **Pré-visualizar** (dry-run): confira o total de pontos, a amostra e os erros — **nada é gravado**.
4. **Importar**: grava de forma **transacional** (tudo-ou-nada) e **idempotente** — recolar o mesmo
   mês atualiza o valor, não duplica. Teto de 6.000 pontos por lote (décadas de série mensal cabem).

Exemplo de bloco para colar (**números ilustrativos — troque pelos reais**):

```
# SINAPI-CE, número-índice mensal (EXEMPLO)
2024-01 100,00
2024-02 100,80
2024-03 101,45
2025-01 108,20
2026-01 114,90
```

---

## 2. Obras — cada obra melhora a estimativa

O estimador paramétrico só fica bom com acervo. Com 4 obras a confiança era "Baixa"; cada obra nova
sobe. Há dois caminhos, conforme a origem do dado.

### Caminho A — CSV/Excel (aba Importar): rápido, para dados tabulares

Monte uma planilha com uma linha por obra. O importador reconhece estes cabeçalhos (nome flexível —
maiúsc./minúsc. e acentos são normalizados):

| Campo | Cabeçalhos aceitos | Obrigatório |
|---|---|---|
| Código | `codigo`, `cod`, `code` | **sim** |
| Nome | `nome`, `obra`, `descricao` | **sim** |
| Tipo de obra | `tipo`, `tipoobra` | não |
| Padrão | `padrao`, `acabamento` | não |
| Município / UF | `municipio`/`cidade` · `uf`/`estado` | não |
| Área (m²) | `area`, `aream2`, `m2` | recomendado |
| Custo orçado | `custoorcado`, `orcado`, `orcamento` | recomendado |
| Custo real | `custoreal`, `realizado` | se houver |
| Início / Fim reais | `datainicio`/`inicio` · `datafim`/`fim` | p/ prazo |
| Data-base do custo | `database`, `mesbase` | recomendado |
| Elegível p/ referência | `elegivel`, `referencia` | não |

Passo: aba **Importar** → selecione o arquivo → **prévia** (marca linhas inválidas e diz quais já
existem) → confirme. É **idempotente por código** (RF-C04): reimportar **atualiza** a obra, não
duplica, e preserva os campos editados à mão (cliente, status).

> **Área e data-base fazem a diferença:** sem área não há custo/m² (base da estimativa); sem
> data-base a atualização monetária não tem de/para. Preencha os dois sempre que possível.

### Caminho B — ETL de PDF (`scripts/importar_orcamento.py`): os orçamentos PROMAV

Para os orçamentos reais em PDF (com EAP, itens e anexos), use o ETL — ele detecta os templates A/B/C.
Roda **na sua máquina** (não no Render), apontando para o banco de **produção**:

```bash
pip install -r scripts/requirements.txt          # 1ª vez
# .env com a DATABASE_URL da PRODUÇÃO (senha nova) — e confirme com `npm run sonda`
python scripts/importar_orcamento.py "orcamentos/<pasta-do-projeto>"            # dry-run
python scripts/importar_orcamento.py "orcamentos/<pasta-do-projeto>" --commit   # grava
```

O dry-run mostra EAP, itens e a conferência de totais antes de gravar; é **idempotente** (pula obra já
existente; `--force` recarrega). Anexos grandes vão por conexão direta do Neon (já resolvido).

> **Elegibilidade e o pool de estimativa:** obras com **custo por item** (Template A / manual com
> itens) entram no pool de referências da estimativa paramétrica. As de macro-etapa sem preço unitário
> entram como referência de custo/m² (migration 007). Confira a flag "Elegível" no Acervo.

---

## 3. Conferir que a carga surtiu efeito

Depois de carregar:

- **Índices:** abra uma obra → painel **Atualização monetária** → escolha `SINAPI` e uma data-base
  alvo → o **fator deve sair diferente de 1** (antes era sempre 1,0).
- **Obras/estimativa:** aba **Estimativa** → gere uma paramétrica → a **confiança** deve subir à
  medida que o acervo cresce, e o ranking de análogas deve fazer sentido.
- **Sanidade rápida (opcional, leitura):** `npm run sonda` mostra a contagem de obras; para os índices,
  um `SELECT indice, count(*) FROM orcamento.indices_economicos GROUP BY indice` confirma o que entrou.

## Ordem sugerida

1. **Carregar a série SINAPI real** (aba Cadastros) — poucos minutos, destrava a atualização monetária.
2. **Carregar os orçamentos** — CSV para o histórico tabular; ETL para os PDFs PROMAV.
3. **Conferir** (seção 3) e seguir alimentando: com o módulo no ar, cada obra já melhora a estimativa
   para quem está usando.
