# Template C — Orçamento em PDF único (Projeto Básico)

Handoff do Cowork para o Claude Code. Implemente os 4 pontos abaixo em
`scripts/importar_orcamento.py` e valide com o dry-run das 07 Praças.
Não toque no app Promav nem no schema `public`. Não rode dois `--commit` ao
mesmo tempo (UniqueViolation em `localidades`).

## Contexto (o que o diagnóstico revelou)

O arquivo `orcamentos/<07 Praças>/PROJ.BASICO CONST. DE 07 PRAÇAS - MAPP6219_ass.pdf`
(90 págs, 38 MB) é **um PDF único** com tudo junto: memorial + planilha orçamentária
(págs ~13–17) + memória de cálculo + **composições unitárias** (págs ~47–89) + curva ABC.

Por dentro a planilha é **Template A** (mesmo layout da Praça). Ex. pág. 16:

```
6.4 · C1947 · PONTO ELÉTRICO · SEINFRA · PT · 91,00 · R$264,15(s/BDI) · R$61,86(BDI) · R$326,01(c/BDI) · R$29.666,91
```

Valores esperados (para conferência do dry-run):

- VALOR ORÇAMENTO (s/BDI): **R$ 785.959,25**
- VALOR TOTAL (c/BDI): **R$ 970.001,70**
- VALOR BDI TOTAL: **R$ 184.042,45**
- **BDI: 23,42 %**
- Área: "ÁREA DA PRAÇA CENTRAL **270,36 m²** por unidade" × "**07 praças**" → **1.892,52 m²**
- Custo/m² esperado ≈ **R$ 415/m²** (s/BDI) ou ≈ **R$ 512/m²** (c/BDI)

**Armadilha:** as composições unitárias (págs 47–89) têm linhas de *insumo*
(`00011267 ARRUELA LISA…`, `93681 EXECUÇÃO…`, `I0840 CONECTOR…`) que, se varridas
como itens, poluem a planilha. Precisam ser descartadas.

## Os 4 ajustes

### 1. Detecção de PDF único (em `montar()`)

Se não achar arquivo de planilha separado (nenhum PDF casando com
`PLANILHA` / `P.SERVIÇOS` / `ORÇAMENTO`), e houver um único PDF na pasta
(ou um casando com `PROJ.BASICO` / `PROJETO BASICO` / `BASICO`, ou simplesmente
o maior PDF), **use esse mesmo arquivo como planilha, resumo e memorial**.
Marque `fonte_dado = 'orcamento_pdf_unico'` e `template = 'C'`.

### 2. Filtro de item na `parse_planilha` (isola planilha × composições)

No teste que classifica uma linha como *item*, exija que a coluna ITEM seja um
**EAP com ponto**:

```python
DOT_EAP = re.compile(r"^\d+(\.\d+)+$")   # 2.1, 6.4, 4.1.1 — pelo menos um ponto
...
it = (c[0] or "").strip()
qtd = num(c[5])
if qtd is not None and (c[3] or c[4]) and DOT_EAP.match(it):
    itens.append(...)          # item da planilha sintética
elif EAP_RE.match(it):
    etapas.append(...)         # macro/sub-etapa (1, 6, 6.1 …)
```

Isso mantém os itens da planilha (sempre `X.Y`/`X.Y.Z`) e **descarta** os insumos
das composições (`00011267`, `93681` — sem ponto) e cabeçalhos mesclados
(`4.1. C3179 ESC` — tem espaço, não casa). **Seguro para Templates A e B**
(os itens da Praça já são todos pontuados; a pavimentação usa `parse_servicos`).

### 3. `parse_resumo` multi-página

Hoje lê só a página 1. No PDF único o RESUMO fica numa página interna. Varra as
páginas (junte o texto de todas, ou pare ao achar `VALOR ORÇAMENTO`) e aplique as
regex existentes de VALOR ORÇAMENTO / VALOR BDI TOTAL / VALOR TOTAL / BDI.
Nota: há duas ocorrências quase iguais (…25 e …34); fique com a que acompanha o
`VALOR BDI TOTAL: R$ 184.042,45` (a íntegra, não a arredondada). Para
arquivos separados (Praça/pavimentação) o resumo continua na pág. 1 → sem regressão.

### 4. Área — flag `--area` (override) + auto opcional

Adicione `--area <valor>` no argparse e propague até o `montar()`; se informado,
usa esse valor e ignora a extração automática. É a saída robusta para casos
"por unidade × quantidade".

Auto opcional (tente, mas caia no `--area` se falhar): detectar o padrão
`ÁREA … (\d[\d.,]*) m² por unidade … QUANTIDADE DE PRAÇAS (\d+)` e multiplicar
→ 270,36 × 7 = 1.892,52. Mantenha os fallbacks já existentes (`área de X m²`,
tabela de vias).

## Como validar

```bash
# dry-run (sem gravar). Se a área automática não sair, force:
python scripts/importar_orcamento.py "orcamentos/<pasta 07 Praças>" --area 1892.52
```

Confira no dry-run: **VALOR ORÇAMENTO 785.959,25**, **VALOR TOTAL 970.001,70**,
**BDI 23,42 %**, itens vindos só da planilha (sem `00011267`/`93681`),
custo/m² ≈ **415** (s/BDI). Só então rode com `--commit`.
Depois: registre o resultado em `build-check-log.md` para o Cowork revisar.

## Pendência à parte (não relacionada ao Template C)

Rodar `npm run migrate` (aplica a **008** — custo/m² usa orçado quando não há
realizado) e dar F5, para o Painel/Acervo mostrarem custo/m² da Praça (~R$ 372)
e das pavimentações (~R$ 110/107). A coluna do Acervo já foi renomeada para
"Custo" e cai no orçado quando não há realizado.
