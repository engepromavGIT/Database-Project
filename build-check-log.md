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
