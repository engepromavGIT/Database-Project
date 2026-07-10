# Log de Verificação — promav-base-projetos

**Data:** 2026-06-29 10:25
**Executado por:** Claude Code
**Ambiente:** Windows 10 Pro (10.0.19045) · PowerShell · Node v24.16.0 / npm 11.16.0

Pipeline: npm install → npm run check → npm test → npm run build → npm audit (+ health check)

## Resumo

| Comando | Resultado | Observações |
|---------|-----------|-------------|
| npm install | ✅ | 213 pacotes auditados; +9 / -49 / ~3; **0 vulnerabilidades** |
| npm run check | ✅ | `node --check` passou em todos os 11 arquivos |
| npm test | ✅ | Total: 79 passou, 0 falhou |
| npm run build | ✅ | vite v8.1.0; 25 módulos em 782ms |
| npm audit | ✅ | **found 0 vulnerabilities** |
| (opcional) migrations | ✅ | 001→004 aplicadas na branch **dev-orcamento** (psql 17.10 instalado) |
| (opcional) health /api/health | ✅ | HTTP 200 `{"ok":true,...}` — conexão Neon OK (branch dev) |

**Conclusão:** Pipeline limpo e **sem vulnerabilidades**. O upgrade para vite@8 (aplicado pelo Cowork) resolveu a vulnerabilidade alta anterior e o build continua funcionando. Criada a branch de DEV `dev-orcamento` no Neon, `.env` repontado para ela, e as migrations 001→004 aplicadas com sucesso — schema `orcamento` com 19 tabelas/views. Produção (branch `main`) **não foi tocada**.

---

## Atualização 2026-06-30 — ETL de orçamento + migration 005

| Etapa | Resultado | Observações |
|-------|-----------|-------------|
| pip install scripts/requirements.txt | ✅ | psycopg2-binary 2.9.12 instalado; pdfplumber 0.11.9 já presente (Python 3.14.5) |
| npm run migrate (até 005) | ✅ | 001→005 aplicadas (idempotente). 005 adiciona `obras.bdi_pct` e `obras.custo_orcado_com_bdi` |
| importar_orcamento.py (dry-run) | ✅ | MAPP-5602 — 15 macro + 28 sub-etapas, 98 itens; soma s/BDI bate (dif R$ −0,01) |
| importar_orcamento.py --commit | ✅ | Gravado na branch dev: 1 obra, 43 etapas, 98 itens, 3 anexos (PDFs) |
| npm run check | ✅ | sintaxe OK nos 11 arquivos |
| npm run dev | ✅ | Vite v8.1.0 em :5173 + API em :3001 (health 200) |

**Correção aplicada (Claude Code) — `scripts/importar_orcamento.py`:**
O `--commit` quebrava em `ValueError: invalid literal for int()` ao ordenar etapas, porque o
`parse_planilha` capturava linhas de rodapé da planilha (ex.: `"VALOR BDI TOTAL: R$ ..."`) como se
fossem etapas. **Fix:** adicionado `EAP_RE = re.compile(r"^\d+(\.\d+)*$")` e a linha só vira etapa se
o código casar com um padrão de EAP (`1`, `3.2`, `10.1`); rodapés/totais são ignorados. Efeito: sub-etapas
29 → 28 (a linha-lixo sumiu); macro (15), itens (98) e totais inalterados.

**Dados importados (branch dev, conferidos via SQL):**
```
MAPP-5602 | CONSTRUÇÃO PRAÇA ARENINHA | área 1187,45 m²
custo s/BDI 442.678,30 | BDI 25,44% | c/BDI 555.308,35
etapas 43 | itens 98 | anexos 3 | obras c/ esse código: 1 (sem duplicata)
```

**Nota operacional:** durante o teste, uma execução de `--commit` em background e outra em primeiro plano
rodaram concorrentemente e a segunda colidiu em `localidades` (`UniqueViolation`) — a transação perdedora
fez **rollback completo**, sem órfãos. A obra foi gravada uma única vez. (Evitar rodar dois `--commit` ao mesmo tempo.)

## Para o Cowork (Claude)
> Migration 005 OK e o **primeiro orçamento real (MAPP-5602) está carregado na branch dev** — 43 etapas, 98 itens,
> 3 PDFs anexados; números batem com o consolidado (dif de R$ 0,01 por arredondamento). check verde e o app sobe
> (web 5173 + api 3001). **Atenção:** tive que corrigir um bug no `scripts/importar_orcamento.py` — o parser pegava
> a linha "VALOR BDI TOTAL" do rodapé como etapa e o `--commit` estourava no `int()`. Apliquei um filtro por padrão
> de EAP (regex `^\d+(\.\d+)*$`). Revejam se concordam com a abordagem; vale um teste com outro orçamento de layout
> diferente pra garantir que nenhuma etapa legítima seja descartada. O servidor `npm run dev` ficou rodando localmente.

## 6b. Banco de dev — branch + migrations
```
psql instalado: PostgreSQL 17.10 (via winget PostgreSQL.PostgreSQL.17)
Branch DEV criada: dev-orcamento (br-twilight-leaf-afptpbmr), fork de main
.env DATABASE_URL → ep-restless-dawn-af2pfvm7-pooler (branch dev)

001_orcamento_schema.sql  → OK (schema + 16 tabelas + índices + view)
002_seeds_referencia.sql  → OK (seeds: 5+5+3+3+5+4+1 linhas)
003_estimativa_itens.sql  → OK (tabela + índice)
004_estimativa_grupo.sql  → OK (alter + índice)

Verificação — schema 'orcamento' (19 objetos):
  anexos, categorias_custo, clientes, custos_realizados, estimativa_itens,
  estimativa_referencias, estimativas, etapas, indices_economicos, itens_custo,
  localidades, log_auditoria, medicoes, obras, padroes_acabamento, parametros_bdi,
  servicos_ref, tipos_obra, vw_obra_indicadores
```

## 1. npm install
```
added 9 packages, removed 49 packages, changed 3 packages, and audited 213 packages in 22s

66 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities
```

## 2. npm run check
```
> node --check server/index.js && ... && node --check src/data/api.js
```
Sem erros de sintaxe (11 arquivos).

## 3. npm test
```
Testes do núcleo: 22 passou, 0 falhou.
Bottom-up: 10 passou, 0 falhou.
Importação: 29 passou, 0 falhou.
Prazo: 6 passou, 0 falhou.
Conciliação: 5 passou, 0 falhou.
Curva ABC: 7 passou, 0 falhou.
```
**Total: 79 passou, 0 falhou.**

## 4. npm run build
```
vite v8.1.0 building client environment for production...
✓ 25 modules transformed.
dist/index.html                   0.46 kB │ gzip:  0.32 kB
dist/assets/index-CfO8B3QZ.css   37.04 kB │ gzip:  7.30 kB
dist/assets/index-CqaAiHDM.js   187.16 kB │ gzip: 55.32 kB
✓ built in 782ms
```

## 5. npm audit
```
found 0 vulnerabilities
```

## 6. Banco / execução ponta a ponta (.env presente)
```
psql: NÃO encontrado no PATH  → migrations (001..004) NÃO aplicadas
DATABASE_URL: postgresql://****:****@ep-little-wave-af44c09o-pooler.c-2.us-west-2.aws.neon.tech/neondb (Neon, pooler)
npm run server → GET http://localhost:3001/api/health → HTTP 200
  {"ok":true,"now":"2026-06-29T13:29:24.530Z"}
```
Health (`SELECT now()`) confirma conexão viva com o banco. Servidor encerrado após o teste.

## Falhas / correções aplicadas
- Nenhuma falha. Nenhuma correção foi necessária.
- Migrations não rodadas: `psql` não está instalado/PATH neste ambiente (não é falha do projeto).

## Para o Cowork (Claude)
> Tudo verde e agora **0 vulnerabilidades** — o upgrade de Vite para 8.1.0 limpou o alerta alto e o build segue OK
> (25 módulos, 782ms). check + 79 testes + build, todos passando.
> Novidade: o `.env` apareceu, então testei a ponta de execução. O servidor sobe e o **/api/health retornou 200
> com conexão viva ao Neon** (`ep-little-wave-af44c09o-pooler`, db `neondb`). NÃO apliquei as migrations porque o
> `psql` não está instalado nesta máquina — se quiserem que eu rode as migrations 001→004 daqui, instalem o
> PostgreSQL client (psql) no PATH; alternativamente, dá pra aplicá-las via Neon SQL/console ou por um script Node.
> Atenção operacional: a DATABASE_URL aponta para o pooler do Neon no db `neondb` — confirmem que é uma **branch de
> DEV**, não produção, antes de qualquer aplicação de migration.

---

## Atualização 2026-06-30 — 2º template de orçamento (pavimentação "diversas localidades")

Importados os orçamentos **MAPP-6239** e **MAPP-6220** (pavimentação em pedra tosca) na branch dev.
Estes usam um template diferente do 5602 — planilha de **serviços** (só quantitativos, sem preço unitário)
+ resumo/consolidado com **custo por macro-etapa**. Decisão do usuário: importar "quantidade por item +
custo por macro-etapa".

### Extensão do motor (`scripts/importar_orcamento.py`) — feita pelo Claude Code
- **Detecção de template**: se a planilha traz preço por item → Template A (5602, inalterado); senão →
  Template B (serviços).
- **Template B**: `parse_servicos()` agrega quantidades por (macro, código, descrição, unidade) somando
  entre localidades; `parse_macros()` lê o custo por macro-etapa do resumo (vem COM BDI, normalizado p/
  s/BDI dividindo por 1+BDI); `extract_meta()` puxa município/cliente/data/MAPP (aceita separador `/` ou `-`).
- Itens entram com custo unitário 0 (o custo vive na etapa); obra marcada `fonte_dado='orcamento_pdf_macro'`
  e **`elegivel_referencia=false`** (não entra no pool de referências de estimativa).

### Correção de bug na `area_vias` (função que o Cowork adicionou)
- **Bug**: procurava a coluna "ÁREA" apenas em `tbl[0]`, mas o pdfplumber devolve `tbl[0]` vazia (o cabeçalho
  real "Nº | LOCALIDADE | … | ÁREA (m²)" vem na linha seguinte). Resultado: área sempre `None`.
- **Fix**: localiza o "Quadro Resumo das Vias" pelo conteúdo (ÁREA + EXTENSÃO/LOCALIDADE em qualquer linha) e
  usa a linha **TOTAL** (último número), com fallback somando os subtotais por localidade (Nº = "N.0").
  Robusto ao cabeçalho vazio e ao desalinhamento de colunas macro/folha.

### Resultado (conferido via SQL na branch dev)
| Obra | Área (m²) | s/BDI | BDI | c/BDI | Custo/m² | Etapas | Itens | Anexos | elegivel_ref | fonte_dado |
|------|-----------|-------|-----|-------|----------|:---:|:---:|:---:|:---:|------|
| MAPP-6239 | 6.482,34 | 715.035,13 | 23,66% | 884.220,32 | R$ 110,31 | 6 | 10 | 3 | false | orcamento_pdf_macro |
| MAPP-6220 | 3.318,74 | 354.668,65 | 23,67% | 438.607,59 | R$ 106,87 | 6 | 9 | 3 | false | orcamento_pdf_macro |

Σ dos custos por etapa ≈ total s/BDI (dif de R$ +6,37 / −9,00 por arredondamento da normalização do BDI).
Regressão do Template A (5602) verificada: inalterado (15+28 etapas, 98 itens, CHECK −0,01).

### Para o Cowork
> Os dois orçamentos de pavimentação estão importados. Estendi o `importar_orcamento.py` para o template de
> serviços (Template B) e **corrigi um bug na `area_vias` de vocês** (procurava a coluna no `tbl[0]`, que vem
> vazio — o cabeçalho está na 2ª linha; agora uso a linha TOTAL do quadro de vias). Essas obras entram como
> **não-elegíveis a referência** (sem custo unitário por item), então não enviesam a estimativa paramétrica —
> se vocês quiserem que participem por macro-etapa/custo-m², dá pra revisar essa flag. Vale um teste do motor
> com um 3º orçamento de layout novo para confirmar a robustez.

---

## Atualização 2026-07-03 — Template C (PDF único / projeto básico) implementado e MAPP-6219 importado

Implementados os 4 ajustes do handoff `TEMPLATE_C.md` em `scripts/importar_orcamento.py`,
validados com o dry-run das 07 Praças e gravados na branch dev.

### Os 4 ajustes do handoff
1. **Detecção de PDF único** em `montar()` — sem planilha separada, usa o PDF `PROJ.BASICO`/único/maior
   como planilha+resumo+memorial; `template='C'`, `fonte_dado='orcamento_pdf_unico'`.
2. **Filtro de item** — `DOT_EAP` (EAP pontuada) para itens; insumos de composição (`00011267`, `93681`)
   e cabeçalhos mesclados descartados. Adicional: `ETAPA_RE` (segmentos 1–2 dígitos) também no ramo de
   etapas, senão os insumos viravam etapas falsas.
3. **`parse_resumo` multi-página** — varre até a página com VALOR ORÇAMENTO + VALOR BDI TOTAL juntos
   (pega a íntegra, não a arredondada); arquivos separados seguem lendo a pág. 1.
4. **`--area` override + auto** — flag no argparse; auto detecta "X m² por unidade × QUANTIDADE DE
   PRAÇAS N" (achou 270,36 × 7 = 1.892,52 sozinho, sem precisar da flag).

### Problemas encontrados nos testes (além do handoff) e correções
- **Travamento**: as págs. 71–80 do PDF (piso tátil) levam ~6 min no `extract_table` — era isso que
  "pendurava" o dry-run. Fix: **parada antecipada** no `parse_planilha` (25 págs. sem linha útil → break)
  + caps de página no `parse_resumo` (40) e `area_vias` (30).
- **Linhas híbridas** deste template: etapas com `qtd=1,00` e total em c[6] (não c[9]); macros 1–2
  (ADMINISTRAÇÃO, PLACAS) são itens sem ponto. Fix: classificação estendida (item-macro vira etapa+item).
- **Linhas engolidas na quebra de página** pelo extract_table: item 6.3 (R$ 16.945,53) e o código da
  etapa 12. Fix: **recuperação por texto** (regex de linha de item) + síntese de pais órfãos
  (etapa 12 = IMPERMEABILIZAÇÕES, nome resgatado do texto).
- **Anexo de 38 MB derruba a conexão** do pooler do Neon no INSERT (BYTEA) — o 1º `--commit` falhou com
  rollback limpo. Fix: limite `ANEXO_MAX_MB` (default 25) — acima disso o PDF fica só local, com aviso;
  e o `rollback()` do handler não mascara mais o erro original.

### Validação (dry-run) vs valores do handoff
| Check | Esperado | Obtido |
|---|---|---|
| VALOR ORÇAMENTO | 785.959,25 | ✅ soma itens 785.959,34 (dif +0,09) |
| VALOR TOTAL | 970.001,70 | ✅ |
| BDI | 23,42% | ✅ |
| Área | 1.892,52 m² | ✅ automática |
| Custo/m² | ≈ 415 | ✅ 415,30 |
| Sem insumos | — | ✅ 40 itens, todos da planilha |
| Regressões | — | ✅ A: 98 itens/dif −0,01 · B: dif −9,00 |

### Gravado na branch dev (conferido via SQL)
```
MAPP-6219 | área 1.892,52 | s/BDI 785.959,25 | BDI 23,42% | c/BDI 970.001,70
etapas 20 | itens 40 | anexos 0 (PDF de 38 MB > limite, fica local) | elegível: sim
fonte_dado: orcamento_pdf_unico | soma itens no banco: 785.959,34 ✓
Acervo completo: 5602 (372,80/m²) · 6219 (415,30/m²) · 6220 (106,87/m²) · 6239 (110,31/m²)
```

### Para o Cowork
> Template C implementado e as 07 Praças estão no banco — 4 obras no acervo agora. Três achados que
> valem revisão de vocês: (1) a parada antecipada do parse_planilha assume planilha em bloco contíguo
> (25 págs. sem linha útil → para; se algum orçamento tiver planilha espalhada, ajustar); (2) a
> recuperação por texto resgata linhas que o extract_table engole na quebra de página — genérica, mas
> testada só neste PDF; (3) anexos > 25 MB não vão para o banco (ANEXO_MAX_MB) — se quiserem o projeto
> básico anexado, precisa de outra estratégia (compressão, storage externo, ou upload direto sem pooler).
> Obs.: a mensagem final do commit conta anexos da lista, não os efetivamente gravados (cosmético).

---

## Atualização 2026-07-03 — verificação da estimativa paramétrica (+ fix no /api/analogas)

Rodado `node scripts/verificar_estimativa.mjs` contra a API viva (branch dev, 4 obras).

### Bug encontrado e corrigido — `server/index.js` (query CAND do calcularAnalogas)
Na 1ª execução o `/api/analogas` retornou **0 análogas**. Causa: a query usava
`COALESCE(o.custo_real_total, o.custo_orcado_total)`, mas `custo_real_total` é `0.00`
(DEFAULT 0), **não NULL** — o COALESCE devolvia 0 e o `> 0` do WHERE descartava as 4 obras.
Mesma armadilha que a migration 008 corrigiu na view. **Fix aplicado (SELECT e WHERE):**
`COALESCE(NULLIF(o.custo_real_total, 0), o.custo_orcado_total)`.

### Resultado (todas as conferências ✅)
```
Análogas: 5602 (372,80/m², sim 60%) · 6219 (415,30/m², sim 58%)
          6239 (110,31/m², sim 10%) · 6220 (106,87/m², sim 10%)
Só praças (2): custo/m² 393,81 · provável 590.835,99 (565.575 — 616.575)
               preço c/ BDI 25% 738.544,99 · confiança Baixa (31%)
Conferência:   custo/m² ✅ (esp ~394) · provável ✅ (esp ~590.835)
               confiança ✅ (esp ~31%) · rótulo Baixa ✅
```

### Para o Cowork
> A estimativa paramétrica está validada de ponta a ponta com o acervo real: ranking correto
> (praças ≫ pavimentações), números batendo com o esperado do script. O fix do NULLIF na query
> CAND é essencial — sem ele nenhuma obra importada de orçamento (realizado = 0) entra como
> análoga. Vale varrer o código por outros `COALESCE(custo_real_total, ...)` com o mesmo problema
> (aderenciaHistorica e prazoHistorico já filtram por `> 0`/IS NOT NULL, esses estão OK).

---

## Atualização 2026-07-08 — verificação do handoff Acervo + anexos (Cowork → Claude Code)

Verificadas e commitadas as duas mudanças do `HANDOFF_2026-07-08_acervo-anexos.md`:
fallback de custo no `Acervo.jsx` (obras importadas mostravam R$ 0,00 porque o `pg`
devolve `numeric` como string e `"0.00"` é truthy) e os 2 endpoints de leitura de
anexos em `obraDetalhe.js` (`GET /api/obras/:id/anexos` e `GET /api/anexos/:id`).

**Ambiente:** Node v24.18.0 / npm 11.16.0 — instalados nesta máquina via
`winget install OpenJS.NodeJS.LTS` (a máquina não tinha Node; a verificação de 29/06
foi feita em outro ambiente).

| Comando | Resultado | Observações |
|---------|-----------|-------------|
| git diff vs handoff | ✅ | Diffs no working tree batem exatamente com o descrito |
| npm install | ✅ | 213 pacotes auditados; **0 vulnerabilidades** |
| npm run check | ✅ | sintaxe OK nos 11 arquivos (inclui obraDetalhe.js) |
| npm test | ✅ | **Total: 79 passou, 0 falhou** (22+10+29+6+5+7) |
| npm run build | ✅ | vite v8.1.0; 25 módulos em 365ms (inclui Acervo.jsx) |
| .git/config.lock | ✅ | resíduo removido conforme o handoff |

Verificação live (banco) não executada nesta rodada. Follow-ups do handoff continuam
pendentes: UI de anexos no `ObraDetalhe.jsx`, anexos > 25 MB (conexão direta ou object
storage), migrations 006–008 na branch dev, contagem de anexos no ETL (cosmético) e
"Custo real" das importadas no `Comparar.jsx`.

### Para o Cowork
> Handoff de 08/07 verificado e commitado sem alterações — os diffs estavam idênticos
> ao documento e o pipeline offline reproduziu o resultado de vocês (check OK · 79/79 ·
> build 25 módulos). Esta máquina não tinha Node; instalei o LTS (v24.18.0) via winget,
> então as próximas verificações locais rodam direto. Nenhum follow-up foi iniciado.

---

## Atualização 2026-07-08 — UI de anexos no ObraDetalhe (follow-up nº 1 do handoff)

Implementado o primeiro follow-up do handoff: os endpoints de leitura de anexos agora
têm interface.

- **`src/data/api.js`**: `obraAnexos(obraId)` (GET `/obras/:id/anexos`) e
  `anexoUrl(anexoId)` — monta a URL de download com `?token=` (o token do módulo),
  para uso direto em `<a href>`.
- **`src/screens/ObraDetalhe.jsx`**: seção **"Anexos"** abaixo da Curva ABC —
  tabela Arquivo / Tamanho / Data / Baixar, com truncamento do nome (title completo
  no hover), tamanho formatado (KB/MB, vírgula pt-BR via `fmtBytes`) e estado vazio
  "Sem anexos.". Carrega junto com a obra (`useEffect` por `obra.id`).

| Verificação | Resultado | Observações |
|-------------|-----------|-------------|
| npm run check | ✅ | 11 arquivos OK |
| npm test | ✅ | 79 passou, 0 falhou |
| npm run build | ✅ | 25 módulos, 447ms |
| UI ao vivo (stub) | ✅ | Sem `.env` nesta máquina → verifiquei com stub da API na :3001 imitando o formato do `pg` (numerics como string). Lista renderiza (3 PDFs, "2,4 MB"/"11,0 MB"/"340 KB"), links `/api/anexos/:id?token=…`, download 200 com `Content-Disposition` e `%PDF`, sem token → 401, obra sem anexos → "Sem anexos.", console limpo. |

### Para o Cowork
> UI de anexos pronta e ligada nos 2 endpoints novos. Não testei contra o Neon (sem
> `.env` aqui) — vale um smoke test de vocês nas obras 5602/6239/6220 (3 anexos cada).
> Detalhe de design: o link "Baixar" embute o token na URL (`api.anexoUrl`), então um
> link copiado vale por até 7 dias (expiração do JWT) — aceitável para uso interno,
> mas se quiserem endurecer, dá para trocar por download via fetch+blob como no
> `estimativaPdf`. Follow-ups restantes do handoff: anexos > 25 MB, migrations 006–008,
> contagem de anexos no ETL e "Custo real" no Comparar.

---

## Atualização 2026-07-08 — anexos grandes (>25 MB) por conexão direta (follow-up nº 2)

Implementada no ETL (`scripts/importar_orcamento.py`) a recomendação do handoff:
anexos grandes agora vão por **conexão direta** do Neon (host sem `-pooler`), que
não tem o limite de BYTEA do pooler.

- **`url_direta(url)`**: deriva a URL direta removendo `-pooler` do host (só no host —
  senha com "-pooler" não é tocada); devolve `None` se a URL já é direta.
- **Particionamento**: até `ANEXO_POOLER_MAX_MB` (default **25**) o anexo entra na
  transação normal, como antes; entre 25 e `ANEXO_MAX_MB` (default **100**) vai por
  conexão direta, **um por transação, após o commit da obra** (falha ali não desfaz a
  obra — o PDF fica de fora, com aviso); acima de 100 MB fica só local. Se a
  `DATABASE_URL` já for direta, não há limite do pooler e tudo ≤ 100 MB entra na
  transação normal.
- **Cosmético resolvido de carona**: a mensagem final agora conta os anexos
  efetivamente gravados ("N de M anexos") em vez do tamanho da lista.
- Documentação: variáveis novas no `.env.example` e nota no README (seção ETL).

**Ambiente:** Python 3.13.14 instalado nesta máquina via winget (não havia Python;
o registro de 30/06 com Python 3.14.5 era de outro ambiente) + pdfplumber 0.11.10 e
psycopg2-binary 2.9.12 via `pip install -r scripts/requirements.txt`.

| Verificação | Resultado | Observações |
|-------------|-----------|-------------|
| python -m py_compile | ✅ | sintaxe OK |
| unit url_direta | ✅ | 6/6 casos (pooler→direta, já direta→None, host:porta, senha com "-pooler", localhost) |
| teste com PDF real | ⏳ | sem pasta `orcamentos/` nem `.env` nesta máquina — pendente no ambiente com os PDFs |

### Para o Cowork
> Anexos grandes implementados por conexão direta (opção 1 da recomendação de vocês).
> Falta o teste real: rodem `--commit --force` no 07 Praças (MAPP-6219) — o PDF de 38 MB
> deve entrar agora pela conexão direta ("anexo … gravado por conexão direta"). Se a
> branch dev tiver IP allowlist ou o host direto não for alcançável, o script avisa e a
> obra grava normalmente sem o anexo. Se preferirem object storage no futuro, o
> particionamento já isola o ponto de decisão num lugar só.

---

## Atualização 2026-07-08 — "Custo real" no Comparar (último follow-up cosmético)

`src/screens/Comparar.jsx`: a linha "Custo real" usava `brl(custoRealTotal)` direto —
`brl` só devolve "—" para `null`, e obras importadas têm realizado `"0.00"` (string,
DEFAULT 0), então mostrava "R$ 0,00". Agora: `Number(custoRealTotal) > 0 ? brl(...) : '—'`
(mesmo tratamento do Acervo).

| Verificação | Resultado | Observações |
|-------------|-----------|-------------|
| npm run build | ✅ | 25 módulos, 418ms |
| UI ao vivo (stub) | ✅ | Comparativo com 2 obras: importada (realizado "0.00") → "Custo real: —"; obra manual → "R$ 123.456,78". Demais linhas inalteradas; console limpo. |

### Para o Cowork
> Fechou a lista de follow-ups do handoff de 08/07, exceto as **migrations 006–008 na
> branch dev** — essas precisam do `.env`, que não existe nesta máquina; rodem
> `npm run migrate` + F5 no ambiente de vocês.

---

## Atualização 2026-07-09 — RBAC + trilha de auditoria (RF-H02 / RF-B08 / RF-H05)

Depois da auditoria de pendências (workflow), o usuário escolheu a frente **RBAC +
auditoria**. Implementado e revisado adversarialmente (2º workflow) antes de commitar.

**Modelo de permissão (decisão de design):** o papel (`is_admin`) é resolvido POR REQUEST
em `public.users` — nunca via claim do token, porque os tokens são compartilhados com o
app Promav (assinam só `{ sub }`). Admin-only = **consulta da trilha de auditoria**
(RF-H05) e, no futuro, CRUD de cadastros de referência/usuários (doc 01 §4). Create/update
E as exclusões de linha (etapa/item/realizado) ficam abertas a qualquer autenticado — são
correção do dia-a-dia (não há rota de edição; corrigir = excluir+recriar), e a trilha de
auditoria dá o rastro.

**Backend:** `requireAdmin` + `registrarLog` (best-effort) em `server/auth.js`; `GET
/api/auditoria` (admin) em `index.js`; `registrarLog` em todos os pontos sensíveis
(criar obra/etapa/item/realizado, estimativa, calibração, export PDF, importação, exclusões).
**Frontend:** aba **Auditoria** só para admin (`src/screens/Auditoria.jsx` novo), método
`api.auditoria`.

### Revisão adversarial (workflow, 3 lentes → verificação) — 6 achados, TODOS corrigidos
| # | Achado | Correção |
|---|--------|----------|
| 1 (média) | **Regressão:** gatear as exclusões de linha como admin-only quebrava a correção do dia-a-dia (não há UPDATE; corrigir = excluir+recriar). | Exclusões voltaram a `requireAuth` (abertas); admin-only ficou só na consulta de auditoria. Botões × voltam a aparecer p/ todos. |
| 2 | Auditoria best-effort engolia falhas em silêncio. | Erro agora logado COM contexto (acao/entidade/id/usuario) + guard no boot avisando se `log_auditoria` não existe na branch. |
| 3/4 | `GET /api/auditoria?limite=-1` → `LIMIT -1` → 500. | Clamp: `Number.isFinite(n) && n>0 ? min(n,500) : 100` (+ `floor`, trata decimais). |
| 5 | Excluir id inexistente gravava log fantasma. | `DELETE … RETURNING id`; só loga se `del.length`. |
| 6 | `Auditoria.jsx` mostrava "nenhuma ação" junto do banner de erro. | Estados erro/vazio agora mutuamente exclusivos. |

> A lente de **bypass de RBAC deu limpa**: só rotas gated tocam `DELETE`, `req.userId`
> não é forjável após `requireAuth`, o caminho de erro é fail-closed, e usuário inexistente
> → nega. Sem escalonamento de privilégio.

### Verificação
| Etapa | Resultado |
|-------|-----------|
| npm run check / test / build | ✅ 79/79 · build 26 módulos |
| RBAC live (servidor real :3010, tokens mintados) | ✅ 9/9 pós-fix: audit view admin-only (403 p/ user), user regular cria E exclui própria linha (200), limite=-1 → 200, delete real loga (usuario u2), sem log fantasma, create loga. Antes do fix, 11/11 confirmaram o design original. |
| UI (stub, 2 papéis) | ✅ admin vê aba Auditoria + tabela renderiza; não-admin não vê a aba. |
| Limpeza | ✅ obra/logs de teste removidos da branch dev; scripts de teste apagados. |

### Para o Cowork
> RBAC + auditoria no ar. **Atenção ao modelo:** admin-only hoje = só a CONSULTA da trilha;
> a infra (`requireAdmin`, papel por request) está pronta para gatear o CRUD de cadastros de
> referência/índices/usuários quando existir. Um review adversarial pegou uma regressão minha
> (eu tinha fechado as exclusões de linha para admin, o que travaria a correção de lançamentos
> dos orçamentistas — não há edição, só excluir+recriar); revertido. **Follow-up recomendado:**
> adicionar rotas de UPDATE (PUT) p/ etapa/item/realizado + edição inline — aí as exclusões
> poderiam voltar a ser mais restritas sem travar ninguém. A auditoria é best-effort por
> design (não derruba a operação); se quiserem não-repúdio forte nas exclusões, gravar o log
> na mesma transação (precisa de um helper de transação no `db.js`).

---

## Atualização 2026-07-09 — cobertura de testes (auth, anexos, ETL)

Segunda frente da auditoria: travar o comportamento do código sensível que não tinha teste.
Duas pequenas extrações tornaram a lógica testável sem banco/PDF (comportamento idêntico).

**Novos testes**
- **`tests/auth.test.mjs`** (11 casos) — `hashPassword`/`verifyPassword` (roundtrip + senha errada),
  `signToken`+`requireAuth` (roundtrip), aceitação por header **e** `?token=`, precedência
  header>query, e os 401 (sem token, assinatura inválida, expirado, sem "Bearer "). Sem banco:
  o segredo é fixado antes de um `import()` dinâmico. `requireAdmin`/`registrarLog` (dependem do
  banco) seguem cobertos pelo teste de integração.
- **`tests/anexos.test.mjs`** (7 casos) — extraí `contentDispositionAnexo()` (pura, exportada) de
  `server/obraDetalhe.js` e testo: ASCII simples, o **caso Unicode que causava o 500** (header 100%
  ASCII + `filename*` que decodifica de volta), remoção de aspas/CR-LF, e fallback "anexo".
- **`scripts/tests/test_importar_orcamento.py`** (11 casos, pytest) — extraí `particionar_anexos()`
  (pura) de `commit()` e testo `url_direta()` (pooler→direta, já-direta→None, porta/query, senha com
  "-pooler" intocada, localhost) e a partição pooler×direta×local (limite `>` estrito, sem-direta,
  mistura). Deps de teste em `scripts/requirements-dev.txt`; roda com `npm run test:py`.

**Verificação:** `npm run check` OK · `npm test` **97 passou, 0 falhou** (era 79 — +11 auth +7 anexos) ·
`python -m pytest scripts/tests` **11 passed** · `npm run build` OK (26 módulos) · `py_compile` OK.

### Para o Cowork
> Cobertura adicionada para a auth (JWT/senha), a sanitização de nome de anexo (o fix do 500) e as
> funções puras do ETL (`url_direta`, partição de anexos). O `npm test` agora tem 97 casos e continua
> **sem depender de banco**; os testes de Python são separados (`npm run test:py`, precisa
> `pip install -r scripts/requirements-dev.txt`). Fiz duas extrações de função pura (`contentDispositionAnexo`,
> `particionar_anexos`) — comportamento preservado, só ficou testável. Não migrei os 6 testes antigos
> para um harness comum (baixo valor, evitei churn nos que já passam).

---

## Atualização 2026-07-09 — CRUD de clientes + edição/exclusão de obra (RF-A01 / RF-B01)

Quarta frente da auditoria (ranks 12 e 15). A tabela `orcamento.clientes` e a FK
`obras.cliente_id` já existiam (migration 001) — faltava CRUD e UI, e a obra não gravava
vários campos gerais.

**Backend (server/index.js):** clientes GET (`?todos=1`)/POST/PUT ("excluir" = inativar,
por causa da FK); obra ganhou `PUT` (edita metadados, aberto a autenticados; NÃO altera
custos — derivados/definidos no create) e `DELETE` (**admin-only** — destrutivo em cascata;
dá à requireAdmin uma superfície de mutação real). POST/PUT de obra passam a gravar
cliente_id + área de terreno + nº de pavimentos + datas planejadas + status. OBRA_LIST
expandido (cliente via JOIN + campos gerais). Helper `obraCampos()` compartilhado. registrarLog
em todos os novos mutadores.
**Frontend:** aba **Clientes** (`src/screens/Clientes.jsx`); o form de obra virou um só que
cria e edita (`ObraForm`); tabela do Acervo com coluna Cliente + Editar + × Excluir (admin).

### Revisão adversarial (workflow, 3 lentes) — 7 achados distintos, TODOS corrigidos
| # | Achado (sev) | Correção |
|---|--------------|----------|
| 1 (média) | Editar cliente inativo o **reativava** silenciosamente (form enviava `ativo:true`). | Front não envia `ativo` na edição; backend usa `COALESCE($4, ativo)` (preserva). |
| 2 (alta) | Excluir obra referenciada por estimativa → **500 cru** (FK `estimativa_referencias` sem CASCADE). | DELETE trata `23503` → **409** claro (preserva o histórico da estimativa). |
| 3 (média) | id de FK inexistente (cliente/tipo/…) → 500 cru vazando schema. | Handler global mapeia `23503`→400 e `23505`→409. |
| 4 (média) | `obras.codigo` sem unicidade — POST/PUT criavam duplicatas. | Checagem no POST e no PUT (exclui a si mesma) → **409**. |
| 5 (média) | Cliente inativado sumia do dropdown na edição → campo em branco, risco de clobber. | Injeta uma `<option>` "(inativo)" para o cliente vinculado. |
| 6 (baixa) | `documento` do cliente sem trim no servidor. | `(documento||'').trim() || null` no POST/PUT. |
| 7 (baixa) | Detalhe aberto desatualizava ao editar a mesma obra. | onSalvar sincroniza `sel` com a obra atualizada. |

### Verificação
| Etapa | Resultado |
|-------|-----------|
| check / test / build | ✅ 97 testes JS · build 27 módulos |
| CRUD live (servidor real :3010) — 1ª rodada | ✅ 14/14 (clientes CRUD, obra c/ campos gerais, edição, delete admin-only 403/200, auditoria) |
| Re-teste dos fixes do review | ✅ 7/7 (não-reativação, 409 na exclusão referenciada, 400 em FK inválida, 409 em código duplicado, trim de documento) |
| UI (stub, 2 papéis) | ✅ aba Clientes (todos) e Auditoria (admin); form de obra com campos novos; Editar prefill + custos ocultos; × Excluir só p/ admin. Um bug no *stub* de teste (colisão de id) foi corrigido — não era do app. |

### Para o Cowork
> CRUD de clientes + edição/exclusão de obra no ar. **DELETE de obra é admin-only** (destrutivo,
> cascata) — primeira mutação de fato restrita a admin, além da consulta de auditoria. O PUT de
> obra edita metadados e **não toca nos custos** (derivados nas detalhadas). Um review adversarial
> pegou 7 itens reais (todos corrigidos), com destaque para: excluir obra usada em estimativa
> agora dá **409** (a FK `estimativa_referencias.obra_id` propositalmente não cascateia, p/ preservar
> o histórico); e editar um cliente inativo não o reativa mais. **Follow-up sugerido:** uma migration
> para `UNIQUE(obras.codigo)` (hoje a unicidade é só na aplicação; requer deduplicar importados antes).

---

## Atualização 2026-07-09 — migration 009: UNIQUE(obras.codigo)

Follow-up do review anterior. `db/migrations/009_obras_codigo_unique.sql` adiciona a
garantia física de unicidade do código da obra (a aplicação já retornava 409, mas faltava
a constraint no banco — defesa final; o handler global já mapeia `23505`→409).

A migration é **idempotente e segura contra dados legados**: antes de criar o índice único,
desambigua códigos repetidos pré-existentes renomeando as ocorrências extras para
`<codigo>-DUP-<id>` (o id é único → sem colisão), **sem apagar nenhuma obra**. Após a 1ª
execução não há duplicatas, então re-rodar é no-op.

**Aplicada e verificada na branch dev** (`.env` reconferido = `ep-restless-dawn-af2pfvm7`, não prod):
| Verificação | Resultado |
|-------------|-----------|
| npm run migrate | ✅ 001→009 OK (idempotentes); 19 objetos |
| obras preservadas | ✅ 4 (nenhuma perdida/renomeada — não havia duplicatas na dev) |
| índice único | ✅ `obras_codigo_uk` existe (`CREATE UNIQUE INDEX ... (codigo)`) |
| enforcement | ✅ INSERT de código duplicado → `23505` (testado em transação revertida) |

### Para o Cowork
> UNIQUE(obras.codigo) aplicado na dev. A migration lida com duplicatas legadas renomeando as
> extras para `-DUP-<id>` (não apaga nada) — se a produção/outra branch tiver códigos repetidos
> de importações, ao rodar `npm run migrate` lá elas serão desambiguadas automaticamente; vale
> conferir depois se algum código renomeado precisa de ajuste manual. Na dev não havia duplicatas,
> então nada foi renomeado.

---

## Atualização 2026-07-09 — rotas de UPDATE inline (etapa/item/realizado)

Follow-up do review de RBAC: sem rota de edição, corrigir um lançamento era excluir+recriar.
Agora há edição de verdade.

**Backend (server/obraDetalhe.js):** `PUT /api/etapas/:id` (descrição/código EAP; não toca
custos, que são derivados), `PUT /api/itens/:id` (descrição/unidade/qtd/custo/serviço/categoria
+ `recalcularObra`), `PUT /api/realizados/:id` (competência/valor + `recalcularObra`). Todos
`requireAuth` (abertos — correção do dia-a-dia), 404 se não existir, `registrarLog('update')`.
**Frontend (ObraDetalhe.jsx):** cada form de adicionar também **edita** — ✎ por linha carrega
a linha no form (vira "Salvar" + ✕ cancelar), mesmo padrão do form de obra/cliente. `api.js`:
`updEtapa/updItem/updRealizado`.

### Revisão adversarial (workflow, 2 lentes) — 1 achado real, corrigido
| Achado (sev) | Correção |
|--------------|----------|
| `PUT /realizados/:id` **zerava `origem`** (proveniência) em toda edição — o front não envia o campo, mas o UPDATE o incluía. Latente hoje (nada in-app grava `origem`), mas um realizado criado via POST/import perderia a proveniência ao ser editado. | `origem` saiu do UPDATE (preservada), igual ao `data_base` que já ficava de fora do PUT de item. |

> A lente de front deu limpa: o `useEffect [sel]` que chama `cancelarItem/cancelarReal` funciona
> (o efeito roda após o render, quando as `const` já existem); trocar de etapa/excluir a linha em
> edição limpa o estado; e a descrição de item de texto-livre é preservada no round-trip.

### Verificação
| Etapa | Resultado |
|-------|-----------|
| check / test / build | ✅ 97 testes JS · build 27 módulos |
| PUT live (servidor real :3010) | ✅ 13/13: edição por usuário regular, **recálculo dos totais** (item 1000→2000, realizado 500→800), 404s, auditoria |
| fix do `origem` (live) | ✅ editar o valor preserva `origem='importado'` (antes zerava) |
| UI inline (stub) | ✅ ✎ pré-preenche → Salvar recalcula e atualiza a linha → form volta a "adicionar"; prefill/cancelar da etapa; console limpo |

### Para o Cowork
> Edição inline de etapa/item/realizado no ar (PUT abertos a autenticados; excluir obra segue
> admin-only). Editar qtd/custo de um item recalcula os totais da obra. Um review pegou que o PUT
> de realizado zerava `origem` (proveniência) — corrigido tirando-a do UPDATE. Com isso, as
> exclusões de linha poderiam voltar a ser mais restritas se quiserem, já que agora há como editar
> sem apagar — mas mantive abertas (o modelo atual). Follow-ups que restam são só os bloqueados por
> dados externos (série SINAPI real, PDFs para robustez do parser, anexo de 38 MB do MAPP-6219).

---

## Atualização 2026-07-08 — migrations 006–008 aplicadas na branch dev (último follow-up)

O usuário criou o `.env` nesta máquina. **Atenção — quase-acidente evitado:** a
`DATABASE_URL` fornecida apontava para `ep-little-wave-af44c09o-pooler` — que uma sonda
somente-leitura confirmou ser a **PRODUÇÃO** do app Promav (só schema `public` com
users/projects/tasks; sem `orcamento`). O `npm run migrate` teria criado o schema inteiro
lá. Corrigido o host para a branch dev `ep-restless-dawn-af2pfvm7-pooler` (mesmas
credenciais — branches do Neon herdam as roles), confirmada pela sonda (schema
`orcamento` com 19 objetos + as 4 obras) antes de qualquer escrita.

| Etapa | Resultado | Observações |
|-------|-----------|-------------|
| Sonda somente-leitura (host original) | ⚠️ | ep-little-wave = produção (sem schema `orcamento`) — migração ABORTADA |
| Sonda somente-leitura (host dev) | ✅ | `orcamento` 19 objetos, 4 obras, colunas da 005 presentes |
| npm run migrate | ✅ | 001→008 OK (idempotentes); 19 tabelas/views |
| Verificação 006 | ✅ | 5602/6219 → **Urbanização**, 6220/6239 → **Pavimentação** |
| Verificação 007 | ✅ | 6220/6239 (`orcamento_pdf_macro`) agora `elegivel_referencia = true` |
| Verificação 008 | ✅ | `custo_m2_real` pelo orçado: 372,80 · 415,30 · 106,87 · 110,31; `fator_desvio_custo` NULL (sem realizado) |

### Para o Cowork
> Migrations 006–008 aplicadas e verificadas na branch dev — **todos os follow-ups do
> handoff de 08/07 estão fechados**. Dois avisos: (1) a connection string que circulou
> aqui era a de **produção**; o `.env` local foi corrigido para a dev
> (`ep-restless-dawn-af2pfvm7`) com um comentário de alerta — vale conferir de onde essa
> URL foi copiada para não voltar a acontecer; (2) o `JWT_SECRET` do `.env` local está
> preenchido com um fragmento da senha do banco — funciona para login isolado, mas não é
> o segredo do app Promav (logins não são compatíveis) e reutiliza credencial do banco;
> recomendo trocar pelo segredo real do app ou por um aleatório forte.

---

## Atualização 2026-07-09 — auditoria de pendências (workflow multi-agente) + cluster higiene/segurança

Como o handoff estava 100% fechado, rodei um **workflow de descoberta** (4 lentes em
paralelo — cobertura de requisitos, concerns abertos, higiene/testes, corretude/segurança
das mudanças recentes → verificação adversarial de cada candidato → síntese priorizada).
Resultado: **32 pendências confirmadas** (34 achadas, 2 pares mesclados), ranqueadas, em
4 direções. Detalhe completo no transcript do workflow; abaixo o que **já executei** (o
topo do ranking: seguro, alto valor, sem depender de dados externos).

### Fixes aplicados neste commit

| # | Fix | Arquivo | Verificação |
|---|-----|---------|-------------|
| rank 1 | **Dumps de debug versionados vazavam dados de cliente** (nomes de obra, valores de PMs). `git rm --cached` dos 3 (`diag.txt`, `diag-pb.txt`, `dryrun-pav.txt`) + `.gitignore` (`diag*.txt`, `dryrun*.txt`). Cópias locais mantidas. | `.gitignore` | untrack confirmado; ainda existem localmente; agora ignorados |
| rank 3 | **Download de anexo dava HTTP 500** com filename contendo caractere > U+00FF (travessão, aspas tipográficas, acentos que o `pg` devolve). `Content-Disposition` agora usa `filename=` ASCII-fold + `filename*=UTF-8''…` (RFC 5987/6266). | `server/obraDetalhe.js:140` | prova em Node real: código antigo → `ERR_INVALID_CHAR`/500; novo → 200 + `filename*` decodifica para o nome original acentuado |
| rank 2 | **JWT_SECRET**: guard de produção agora é **fatal** (`process.exit(1)`) em vez de só avisar — sem ele o `auth.js` cairia no fallback público hardcoded. Orientação do `.env.example` corrigida (não reusar senha do banco; obrigatório em prod). | `server/index.js:33`, `.env.example:11` | boot em `NODE_ENV=production` sem segredo → FATAL + exit 1, antes do `listen`; em dev, sem efeito (preview segue rodando) |

check OK · 79/79 testes · build OK (25 módulos). **Nota:** o `JWT_SECRET` do `.env`
local (fragmento da senha do banco) NÃO foi alterado — trocá-lo desloga a sessão atual e
o valor correto é o segredo real do app Promav, que não tenho aqui; segue como ação do
usuário.

### Pendências NÃO executadas (aguardam decisão de escopo ou dados)
- **Cobertura de testes** (ranks 4,5,19): `tests/auth.test.mjs`, pytest do ETL (`url_direta`, partição pooler/direta), testes dos endpoints de anexos. Doável já, sem dados reais.
- **Fundação de segurança Essencial** (ranks 6,10,11,22): RBAC por perfil (hoje qualquer JWT válido faz tudo), trilha de auditoria (tabela `log_auditoria` existe, nunca é gravada), token de anexo na URL (trocar por fetch+blob), rotação da credencial do Neon.
- **Histórias de valor Essenciais** (ranks 9,12,13,14,15): export CSV/Excel (quick-win), CRUD de clientes + vínculo à obra, atualização monetária por data-base, busca/filtro de obras, edição/exclusão de obra.
- **Bloqueados por dados ausentes** (ranks 30,31,32): série oficial SINAPI (fator=1 placeholder), robustez do parser em layouts variados, e o **anexo de 38 MB do MAPP-6219** (precisa da pasta `orcamentos/`).

### Para o Cowork
> Auditoria completa mapeou 32 pendências verificadas. Fechei o cluster de higiene/segurança
> de baixo risco (vazamento de dados nos dumps, 500 no download de anexo com nome acentuado,
> guard fatal do JWT). O resto são decisões de escopo — as maiores são a **fundação de
> segurança Essencial** (não há RBAC nem auditoria: qualquer usuário autenticado faz tudo e
> nada deixa rastro) e as **histórias Essenciais ainda abertas** (CRUD de clientes, busca de
> obras, edição de obra, export CSV, atualização monetária). Recomendo priorizar RBAC+auditoria
> antes de expor mais a API.

---

## Atualização 2026-07-09 — busca/filtro de obras (RF-E01) + export CSV (RF-G03)

Duas histórias de valor da auditoria.

**Filtro (RF-E01):** `GET /api/obras` passou a aceitar busca (código/nome via `ILIKE`),
tipo, padrão, localidade, cliente, status, elegibilidade, faixa de área e ordenação —
tudo com params **bindados** e `ORDER BY` de **allowlist**. No front, barra de filtros no
Acervo com recarga *debounced* + botão "Limpar". Carregamento dividido (refs/indicadores
na montagem; obras no `[filtros]`).
**Export CSV (RF-G03):** util client-side `src/data/exportar.js` (`;` + BOM UTF-8) e botão
"Exportar CSV" no Acervo (respeita o filtro atual) e no Comparar.

### Revisão adversarial (workflow, 2 lentes) — 5 achados distintos, TODOS corrigidos
| # | Achado (sev) | Correção |
|---|--------------|----------|
| 1 (média) | **`ORDER BY` burlava a allowlist por chave de protótipo** (`?ordenar=constructor`/`__proto__`/`toString` → valor truthy herdado → SQL inválido → **500** + vaza `err.message`). Meu teste de injeção só cobria strings com cara de SQL. | `Object.hasOwn(ORDENS_OBRA, ordenar)` antes do lookup. |
| 2 (média) | **CSV formula injection** (CWE-1236): código/nome iniciando por `= + - @` vira fórmula no Excel. Vetor via POST e via ETL de importação. | `esc()` prefixa esses valores com `'`. |
| 3 (baixa) | CSV do Acervo com número `.` decimal → Excel pt-BR lê como texto. | Colunas numéricas formatadas com `num(v,2)` (vírgula decimal). |
| 4 (baixa) | **Race** em `carregarObras` (debounce + recarregar pós-mutação) → resposta fora de ordem podia reexibir dado obsoleto. | Guarda de sequência via `useRef` ("última resposta vence"). |
| 5 (baixa) | Curingas `%`/`_` do usuário não escapados no `ILIKE` → falso-positivo de busca. | Escape de `\ % _` no valor bindado. |

### Verificação
| Etapa | Resultado |
|-------|-----------|
| check / test / build | ✅ 97 testes JS · build 28 módulos |
| filtros (servidor real) | ✅ 10/10 (cada filtro isolado; injeção no `ordenar` → fallback) |
| fixes do review (servidor real) | ✅ 8/8: `ordenar` com chave de protótipo → 200; escape do `ILIKE` (underscore literal não casa hífen) |
| CSV (browser) | ✅ fórmula (`=1+1`, `=HYPERLINK…`) prefixada com `'`; números pt-BR (`442.678,30`); filtro segue funcionando |

### Para o Cowork
> Busca/filtro de obras e export CSV no ar. O review pegou um furo real que meu teste não
> pegou: chaves de protótipo (`?ordenar=constructor`) burlavam a allowlist do ORDER BY e davam
> 500 — corrigido com `Object.hasOwn`. Também blindei o CSV contra formula-injection (valores
> iniciados por `=+-@` recebem `'`). O export do Acervo usa vírgula decimal (Excel pt-BR); o do
> Comparar sai formatado (relatório de leitura, por design).

---

## Atualização 2026-07-09 — CRUD de cadastros de referência (RF-A02/A03/A04/A08)

Próximo bloco Essencial: os cadastros de referência (tipos de obra, padrões, categorias,
localidades) eram só-leitura. Agora têm CRUD **admin-only** — dá uso real ao `requireAdmin`.

**Backend (server/index.js):** fábrica `cadastroNome` gera POST/PUT/DELETE p/ os cadastros
de só-nome (tipos-obra, padroes); rotas explícitas p/ categorias (nome + tipo enum) e
localidades (município + UF + fator regional). Escrita = `requireAdmin`; leitura segue aberta
(selects do front). DELETE trata FK → **409 "em uso"**; nome duplicado → 409 (handler global).
Auditoria em create/update/delete.
**Frontend:** componente genérico `RegistroCRUD` (lista + form add/edit + delete) parametrizado
por campos; aba **Cadastros** só p/ admin. Migration **010**: `UNIQUE(nome, tipo)` em categorias.

### Revisão adversarial (workflow, 2 lentes) — 4 achados distintos, TODOS corrigidos
| # | Achado (sev) | Correção |
|---|--------------|----------|
| 1 (média) | `fator_regional` sem teto → valor ≥ 100 estoura `numeric(6,4)` (Postgres 22003) → **500 cru** + vaza msg. | validação `0 < fator < 100`; handler global mapeia `22003`/`22P02` → 400. |
| 2 (baixa) | Campo não-string (`{nome:5}`) → `.trim()` TypeError → 500. | helper `asStr()` (não-string → '' → 400 limpo) em nome/município/UF. |
| 3 (baixa) | `categorias_custo` sem UNIQUE → duplicatas silenciosas (assimetria com os outros 3). | migration 010 `UNIQUE(nome,tipo)` (dedup legado antes, como a 009) → 23505 → 409. |
| 4 (baixa) | UF validava só comprimento → `12`/`S1` passavam apesar de "2 letras". | regex `/^[A-Z]{2}$/`. |

### Verificação
| Etapa | Resultado |
|-------|-----------|
| check / build / migrate | ✅ 001→010 aplicadas na dev |
| CRUD live (servidor real) | ✅ 14/14: admin-only 403, duplicado 409, FK-em-uso 409, validação de tipo/UF/fator, uppercase de UF, auditoria |
| fixes do review (live) | ✅ 8/8: fator=150 → 400, UF "12"/"S1" → 400, nome não-string → 400, categoria duplicada → 409, casos válidos OK |
| UI (stub, 2 papéis) | ✅ aba admin-only; 4 seções; CRUD de tipos (add/editar/excluir); categoria com select; não-admin não vê Cadastros nem Auditoria |

### Para o Cowork
> CRUD dos 4 cadastros de referência no ar (admin-only) — o módulo A ficou praticamente completo
> (faltam serviços/composições e BDI por vigência). O review pegou 4 itens, com destaque p/ o fator
> regional que estourava o `numeric(6,4)` e dava 500; agora valida a faixa e o handler global traduz
> overflow numérico p/ 400. Migration 010 (`UNIQUE(nome,tipo)` em categorias) já aplicada na dev.

---

# 📋 RESUMO DA SESSÃO — 2026-07-09/10

> As seções acima estão fora de ordem cronológica (anexadas em pontos diferentes). Esta
> é a visão consolidada da sessão, para o Cowork acompanhar o estado.

Começou verificando o handoff de 08/07 (Acervo + anexos) e, com ele fechado, rodou uma
**auditoria de pendências** (workflow multi-agente: 4 lentes → verificação adversarial →
síntese) que confirmou **32 pendências**. A partir daí o usuário escolheu as frentes e elas
foram implementadas uma a uma. **13 frentes de código** (+ commits de log), todas verificadas.

### Commits (base `9d5c080`)
| Commit | Entrega |
|--------|---------|
| `ac990cf` | Handoff 08/07: fallback de custo no Acervo + endpoints de leitura de anexos |
| `e0b0f43` | UI de anexos no ObraDetalhe (US-18) |
| `c8cebc5` | ETL: anexos grandes (25–100 MB) por conexão direta do Neon |
| `c3a1920` | Comparar: "Custo real" mostra "—" para importadas |
| `fa04c4d` | Migrations 006–008 aplicadas e verificadas na branch dev |
| `3bc94c0` | Higiene/segurança: remove dumps com dados de cliente; 500 no download (nome não-ASCII); guard fatal do JWT_SECRET |
| `43f377a` | **RBAC + trilha de auditoria** (papel por request, `GET /api/auditoria` admin, log de ações) |
| `852235d` | **Cobertura de testes**: auth, anexos, ETL (79 → 97 testes JS + 11 pytest) |
| `bd88862` | **CRUD de clientes + edição/exclusão de obra** |
| `f71d0c4` | Migration 009: `UNIQUE(obras.codigo)` |
| `d71ca6d` | **Edição inline** de etapa/item/realizado (PUT + UI) |
| `86c0efd` | **Busca/filtro de obras** (RF-E01) + **export CSV** (RF-G03) |
| `bf9e93f` | **CRUD de cadastros de referência** (tipos, padrões, categorias, localidades) + migration 010 |

### Estado ao fim da sessão
- **Ambiente local:** Node v24.18.0 e Python 3.13.14 instalados via winget (a máquina não tinha nenhum). `.env` da branch dev criado — **corrigido de produção → dev** (`ep-restless-dawn-af2pfvm7`); a connection string que circulou era a de prod.
- **Banco dev:** migrations **001→010** aplicadas; schema `orcamento` com índices únicos (obras.codigo, categorias nome+tipo), RBAC e trilha de auditoria funcionando.
- **Testes:** `npm test` = **97** casos (sem banco) · `npm run test:py` = **11** (pytest do ETL).
- **RBAC:** admin-only = **consulta de auditoria** + **exclusão de obra inteira** + **CRUD dos cadastros de referência**; todo o resto (criar/editar/excluir linhas, obra, cliente, estimar, importar) aberto a autenticados.
- **Cobertura funcional:** MVP (E0–E4) ~100%; escopo completo (com pós-MVP) **~85%** — módulos E/H completos, A/B/F/G quase completos, faltam itens *Importante/Desejável* e os bloqueados por dados.

### Processo (o que deu certo)
Cada frente grande seguiu: implementação → **verificação live** no servidor real (`:3010`, tokens mintados, dados de teste sempre limpos) → **revisão adversarial por workflow** antes do commit. Os reviews pegaram e corrigiram bugs/regressões reais que os testes não pegavam, p.ex.: exclusão de linha admin-only travando a correção do dia-a-dia; excluir obra referenciada por estimativa dando 500; reativação silenciosa de cliente inativo; `PUT` de realizado zerando `origem`; `ORDER BY` burlado por chave de protótipo (`?ordenar=constructor`); CSV formula-injection; fator regional estourando `numeric(6,4)`.

### Pendente
**Dá para fazer agora (código):** serviços/composições CRUD (RF-A05); BDI por vigência no motor (RF-A07); cronograma/curva S (RF-B05); atualização monetária exposta (RF-D01); dashboard com filtros (RF-G01); reimportação idempotente (RF-C04).
**Bloqueado por dados que NÃO estão nesta máquina:**
- **Série oficial SINAPI** (hoje placeholder de fator 1): o CRUD/tela dá para fazer; carregar a série real, não.
- **Robustez do parser** em layouts variados de PDF: precisa dos orçamentos reais.
- **Anexo de 38 MB do MAPP-6219** no banco: precisa da pasta `orcamentos/` + `--commit --force` (o código de conexão direta já está pronto — commit `c8cebc5`).

### Ação do usuário recomendada
- Trocar o `JWT_SECRET` do `.env` local (hoje é um fragmento da senha do banco) pelo **segredo real do app Promav** — sem isso, os logins não são compatíveis com o app principal.
- Conferir de onde a connection string de **produção** foi copiada, para não repetir o quase-acidente.
