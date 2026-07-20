# Handoff (Cowork → Claude Code) — 2026-07-20

Follow-ups da sua revisão do RF-F04/F05. **Um implementado (A), um documentado para decisão (B).**

## A — Faixa de custo com paridade ao prazo ✅ (feito)

O `faixaPrazo` ganhou tratamento robusto (null, `O===P`, `numeric` como string do pg); a **faixa de
custo** seguia montada inline (`brl(o) — brl(p)`) no card e nos cenários, sem esses cuidados. Criei
`faixaCusto(o, p)` em `src/data/format.js`, espelho exato do `faixaPrazo` (com `brl`), e troquei os
dois pontos inline por ele.

Efeito principal (o "furo" do custo que você registrou): quando **todas as análogas têm escore 0**,
`mediaPonderada` devolve null (o **provável some**) mas `percentil` ignora o peso e **O/P sobrevivem**.
Agora a linha "Custo provável" mostra "—" e a **"Faixa de custo (O–P)" carrega o intervalo legítimo**
— igual ao que o F05 fez no prazo. Também trata `O===P` ("R$ x (sem dispersão)", não "R$ x — R$ x") e
`numeric` string do pg.

**Arquivos:** `src/data/format.js` (novo `faixaCusto`), `src/screens/Estimativa.jsx` (card),
`src/screens/Cenarios.jsx` (comparação de versões), `tests/format.test.mjs` (+8 casos).
`package.json` **não** mudou (`format.test.mjs` já estava no `test`).

**Verificação:** `npm run check` OK (16 arquivos) · `npm test` **304 passou, 0 falhou** (Formatadores
32→40) · `npm run build` OK (30 módulos). Repro do bug conferido nas funções puras: com escore 0,
`esperado=null` e `faixaCusto(O,P)` = `R$ 1.102.900,00 — R$ 11.026.100,00` (antes sumia).

### Commit sugerido
```
git add src/data/format.js src/screens/Estimativa.jsx src/screens/Cenarios.jsx \
        tests/format.test.mjs HANDOFF_2026-07-20_faixa-custo.md
git commit -m "RF-F05/custo: faixaCusto (paridade com faixaPrazo) — faixa O–P sobrevive quando provável é null; trata O===P e numeric-string"
git push origin main
```

## B — Ressalva do default em estimativa SALVA: precisa da SUA decisão (não implementei)

O ponto que você levantou: *"a largura da faixa O–P do bottom-up com n=1 é inteiramente derivada do
`desvio = 0,1` assumido"*. Investiguei o alcance real:

- No **card fresco** de bottom-up, a ressalva **já existe** — `aderenciaTexto` imprime
  "±0,1 assumido — desvio não medido" ao lado da faixa. OK.
- Na **estimativa salva** (cenários, lista, PDF, integração), **não há como ressalvar**: a tabela
  `orcamento.estimativas` **não persiste** `n` nem `desvioMedido`. Ao reler do banco, uma faixa O–P
  cujo tamanho é 100% o `±0,1` assumido aparece **sem distinção** de uma faixa medida. Num sistema em
  produção, é exatamente a "confiança fabricada" que o F04 veio combater — só que na leitura.

**Por que não implementei:** corrigir isso exige **persistir o metadado de aderência** (schema +
migration), que é decisão de projeto e é a tarefa que você registrou como sua. Meter migration num
banco de produção por conta própria seria irresponsável.

**Opções (para você/o time decidir):**

1. **Persistir e ressalvar (mais completo).** Migration `014`: colunas
   `aderencia_n int` e `aderencia_desvio_medido bool` em `estimativas` (nullable; retrocompatível).
   Gravar no POST do bottom-up; devolver nos GET; a UI/PDF passam a ressalvar a faixa salva como o
   card já faz. Estimativas antigas ficam com `null` → tratar como "não informado".
2. **Marcar no ato (mais barato, sem schema).** No POST do bottom-up, quando `desvioMedido=false`,
   anexar a ressalva à `descricao` ou a um campo já existente — frágil e polui o texto; não recomendo.
3. **Aceitar como limitação conhecida** e apenas documentar (doc 05 §3.3): a faixa de bottom-up com
   n<2 tem largura assumida. Zero código.

Minha recomendação: **opção 1** quando for mexer no schema de novo, ou **opção 3** por enquanto (o
card fresco já ressalva; o risco só existe na releitura de estimativas bottom-up com n<2 — hoje,
n=0/1 em toda a produção nova). Não é urgente, mas não deve ser esquecido.

## Estado

Backlog de código após isto: **RF-C01/C02** (validação na prévia de importação + PDF na web) e o
**B** acima (decisão pendente). Maior valor segue sendo **dado** (séries SINAPI/INCC reais + mais
orçamentos) — runbook em `DADOS.md`.
