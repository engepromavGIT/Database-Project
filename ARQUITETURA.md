# ARQUITETURA.md — mapa de arquivos do projeto

Guia de referência do repositório **promav-base-projetos**: o que cada arquivo faz, sua
funcionalidade e com quem está ligado. Complementa a documentação de negócio em [`docs/`](./docs)
(o *porquê*) com o *onde* no código.

---

## Visão geral

Módulo **Base de Projetos (custo e prazo)** do sistema Promav: registra o histórico de obras
concluídas e usa esse acervo para estimar custo e prazo de obras novas.

**Stack:** React + Vite (frontend) · Express + Node (API) · PostgreSQL/Neon (banco) · JWT + bcrypt
(auth) · ETL em Python/pdfplumber (importação de PDF, roda à parte).

**Isolamento:** tudo é gravado no schema **`orcamento`**; a identidade vem de `public.users` (do
app Promav) em **modo somente leitura**. Nenhuma tabela do app é alterada.

### Como uma requisição flui

```
Navegador (React, src/screens/*)
   └─ src/data/api.js  ── fetch /api/... (Bearer token) ──►  server/index.js (Express)
                                                                │  app.use('/api', requireAuth)  ← server/auth.js
                                                                ├─ rotas em index.js
                                                                └─ rotas em obraDetalhe.js (registradas por index.js)
                                                                       │
                                          lógica pura (sem I/O) ◄──────┤  curvaABC · curvaS · produtividade ·
                                          server/*.js, estimativa/*,   │  custoEtapa · estimativa/* · importacao/*
                                          importacao/*                 │
                                                                       ▼
                                                              server/db.js (pool pg) ──► Neon (schema orcamento)
```

### O padrão de camadas (importante para entender o projeto)

O código separa deliberadamente **lógica pura** de **I/O**:

- **Funções puras, testáveis, que "nunca lançam"** — `curvaABC.js`, `curvaS.js`,
  `produtividade.js`, `custoEtapa.js`, tudo em `estimativa/` e `importacao/`. Não tocam banco nem
  rede; recebem dados e devolvem dados. É onde vivem as regras de cálculo, e é o que os testes em
  `tests/` exercitam sem precisar de banco.
- **Rotas (I/O)** — `server/index.js` e `server/obraDetalhe.js`. Fazem as queries, chamam as
  funções puras e montam a resposta HTTP.
- **Infra** — `db.js` (conexão) e `auth.js` (token/permissão).

Esse desenho é o que permite `npm test` rodar **sem banco** (240 casos) e o que a revisão
adversarial usa para atacar as regras isoladamente.

---

## Raiz — configuração e documentação

| Arquivo | Para que serve · funcionalidade | Ligado a |
|---|---|---|
| `package.json` | Manifesto npm: dependências e os **scripts** (`dev`, `server`, `build`, `migrate`, `sonda`, `test`, `test:py`, `check`). | Todo o projeto Node |
| `package-lock.json` | Trava as versões exatas das dependências. | `package.json` |
| `vite.config.js` | Config do Vite: plugin React + **proxy** de `/api` → `http://localhost:3001` em dev. | front (`src/`), API em dev |
| `index.html` | Página raiz da SPA; carrega `src/main.jsx`. | `src/main.jsx` |
| `.env` | Segredos locais (**não versionado**): `DATABASE_URL`, `JWT_SECRET`, `DB_BRANCH_ESPERADA` etc. | `db.js`, `auth.js`, `migrate.mjs` |
| `.env.example` | Modelo do `.env` documentando cada variável. | quem cria o `.env` |
| `.gitignore` | Ignora `node_modules`, `.env`, `dist`, dumps de cliente (`diag*.txt`, `dryrun*.txt`), `__pycache__`. | git |
| `render.yaml` | **Blueprint do Render**: define os serviços de deploy (API Express + site estático). | deploy; ver `PRODUCAO.md` |
| `.claude/launch.json` | Configuração de execução para a ferramenta Claude. | tooling (não é runtime) |
| `.claude/settings.local.json` | Preferências locais da ferramenta Claude (não versionado). | tooling |

### Documentação (a "documentação viva" do projeto)

| Arquivo | Conteúdo |
|---|---|
| `README.md` | Porta de entrada: problema, stack, como rodar, importação, estrutura. |
| `PRODUCAO.md` | Runbook de ida à **produção**: sonda → migração, JWT do Render, rotação da credencial Neon, `render.yaml`. |
| `VERIFICAR.md` | Runbook de verificação (install → check → test → build → audit) que gera o `build-check-log.md`. |
| `build-check-log.md` | **Diário do projeto** entre sessões: cada frente implementada, verificação e recados. É por aqui que o Cowork e o Claude Code se sincronizam. |
| `TEMPLATE_C.md` | Handoff histórico (Cowork → Claude Code) do template C de orçamento em PDF único. |
| `HANDOFF_2026-07-08_acervo-anexos.md` | Handoff: fallback de custo no Acervo + leitura de anexos. |
| `HANDOFF_2026-07-13_d03-d02-b02-b06.md` | Handoff: desvio de prazo, custo/m² por etapa, EAP editável, upload de anexo + revisão adversarial + kit de produção. |
| `docs/01-visao-escopo.md` | Objetivos, escopo, glossário, stakeholders. |
| `docs/02-requisitos-funcionais.md` | Requisitos funcionais (RF-xxx), por módulo. |
| `docs/03-requisitos-nao-funcionais.md` | Desempenho, segurança/LGPD, qualidade (RNF-xxx). |
| `docs/04-modelo-dados.md` | Entidades, relacionamentos, diagrama ER, dicionário de dados. |
| `docs/05-regras-estimativa.md` | Métodos de estimativa, normalização, faixas. |
| `docs/06-arquitetura-integracao.md` | Arquitetura, integração com o app, roadmap de fases. |
| `docs/07-backlog-mvp.md` | Épicos e histórias do MVP, mapeados aos RF. |
| `docs/08-setup-dev.md` | Rodar localmente com uma branch do Neon (sem risco à produção). |

---

## `server/` — backend (API Express)

### Infra e orquestração

| Arquivo | Para que serve · funcionalidade | Ligado a |
|---|---|---|
| `index.js` (≈1.270L) | **Servidor principal.** Monta o Express, CORS, o parser JSON (que pula as rotas binárias), o gate global `requireAuth`, e **quase todas as rotas**: auth, integração (x-api-key), cadastros, clientes, obras, indicadores, dashboard, comparar, conciliar, análogas, estimativas, cenários, PDF, importação, índices, BDI, auditoria. Tem o **handler global de erro** (traduz erros do Postgres em 4xx). | importa `db`, `auth`, `estimativa/*`, `importacao/*`, `obraDetalhe`; consome tudo |
| `db.js` (36L) | **Pool de conexão** Postgres/Neon. Exporta `q(sql, params)` (query→linhas) e `tx(fn)` (transação). Lê `DATABASE_URL`. | usado por index, obraDetalhe, auth, migrate, sonda |
| `auth.js` (61L) | **Autenticação/autorização.** `hashPassword`/`verifyPassword` (bcrypt), `signToken` (JWT `{sub}`), `requireAuth` (aceita header **ou** `?token=`), `requireAdmin` (papel por request lendo `public.users`), `registrarLog` (trilha de auditoria, best-effort). | usa `db.js`; usado por index, obraDetalhe |
| `obraDetalhe.js` (≈420L) | **Rotas do detalhamento de obra**, registradas por `index.js` via `registrarObraDetalhe(app)`: EAP (etapas — CRUD com hierarquia/ordem e guarda de ciclo), itens de custo, custos realizados, curva ABC, curva S/medições, produtividade, **custo por etapa**, e **anexos** (listar/baixar/upload/excluir). Contém os helpers puros `contentDispositionAnexo`, `nomeAnexo`, `mimeSeguro`. | usa `db`, `auth`, `curvaABC`, `curvaS`, `produtividade`, `custoEtapa`, `express.raw` |

### Lógica pura de cálculo (sem banco, testável, "nunca lança")

| Arquivo | Para que serve · funcionalidade | Ligado a |
|---|---|---|
| `curvaABC.js` (23L) | **Curva ABC (RF-D04):** ordena itens por participação no custo e classifica em A/B/C por percentual acumulado. | chamada por `obraDetalhe.js`; testada por `tests/abc` |
| `curvaS.js` (157L) | **Cronograma físico-financeiro / Curva S (RF-B05):** previsto × realizado (previsto linear das datas ou linha de base). | `obraDetalhe.js`; `tests/curvas` |
| `produtividade.js` (73L) | **Indicadores por serviço (RF-D05):** agrega itens por serviço e por **categoria**; deriva R$/m², qtd/m², h/m². | `obraDetalhe.js`; `tests/produtividade` |
| `custoEtapa.js` (137L) | **Custo por etapa (RF-D02)** com roll-up hierárquico pela FK do pai (macro soma as folhas) + **`criaCiclo`** (guarda anti-ciclo da EAP, RF-B02). Travessia **iterativa** (não estoura a pilha). | `obraDetalhe.js`; `tests/custoetapa` |
| `estimativa/normalizacao.js` (41L) | **Atualização monetária** por índice e **custo/m²**; ajuste regional. | `index.js` (análogas, atualização); `tests/estimativa` |
| `estimativa/similaridade.js` (50L) | **Escore de similaridade** [0,1] entre a obra-alvo e cada obra do acervo (pesos configuráveis). | `index.js` (análogas); `tests/estimativa` |
| `estimativa/metodos.js` (115L) | **Motor de estimativa:** média ponderada, percentis, PERT, paramétrica (custo e prazo), bottom-up e nível de confiança. | `index.js` (análogas, estimativas); `tests/estimativa`,`bottomup`,`prazo` |
| `importacao/mapear.js` (109L) | **Mapeamento/validação de planilha** (CSV/Excel): normaliza cabeçalho, converte número/data pt-BR, valida linha. | `index.js` (importar); `conciliar`, `indices`; `tests/importacao` |
| `importacao/conciliar.js` (28L) | **Conciliação SINAPI (RF-C03):** casa serviço por código ou descrição. | usa `mapear`; `index.js` (/conciliar); `tests/conciliar` |
| `importacao/indices.js` (108L) | **Parser de série de índices em lote (RF-A06):** aceita competência / 3 colunas / matriz anual. | usa `mapear`; `index.js` (/indices-economicos/importar); `tests/indices` |

---

## `src/` — frontend (React + Vite)

### Núcleo e utilitários

| Arquivo | Para que serve · funcionalidade | Ligado a |
|---|---|---|
| `main.jsx` (11L) | Ponto de entrada React: monta `<App/>` no `#root`. | `index.html`, `App.jsx` |
| `App.jsx` (126L) | **Shell da aplicação:** tela de login, sessão (token), e a **navegação por abas**. Abas comuns + abas **admin** (Cadastros, Serviços, Auditoria) só para `isAdmin`. | `api.js`, todas as `screens/*` |
| `data/api.js` (220L) | **Cliente único da API.** Um `req()` central (injeta o Bearer, trata 401), o token em `localStorage`, e um método por endpoint. Toda tela conversa com o backend por aqui. | usado por App e todas as screens |
| `data/format.js` (22L) | Formatação pt-BR compartilhada: `brl`, `num`, `pct`, **`desvioPct`** (fator→%), `monthToDate`. | screens |
| `data/exportar.js` (23L) | Exporta linhas para **CSV** (com proteção contra formula-injection) e dispara o download. | `Acervo`, `Comparar` |
| `styles/tokens.css` | **Design tokens** (cores, espaçamentos, raios) — herdados do app Promav. | `kit.css`, todas as telas |
| `styles/kit.css` | Kit de componentes (botões, cards, `control`, chips) sobre os tokens. | telas |

### Telas (`src/screens/`) — uma aba cada

| Arquivo | Para que serve | Principais chamadas de API |
|---|---|---|
| `Dashboard.jsx` (137L) | **Painel** com KPIs (custo/m² médio, desvios de custo e **prazo**) e filtros (RF-G01). | `dashboard`, cadastros p/ os filtros |
| `Acervo.jsx` (322L) | **Acervo de obras:** cadastro/edição/exclusão, busca/filtros, tabela de indicadores (custo/m², desvios), export CSV; abre o `ObraDetalhe`. | `obras`, `createObra`, `updateObra`, `deleteObra`, `indicadores` |
| `ObraDetalhe.jsx` (747L) | **A tela mais rica.** EAP editável (hierarquia/ordem), itens, realizados, curva ABC, atualização monetária, **Curva S**, **Custo por etapa**, **Produtividade**, e **anexos** (listar/baixar/enviar/excluir). | dezenas: `obraEtapas`, `addItem`, `curvaS`, `custoEtapas`, `uploadAnexo`… |
| `Clientes.jsx` (91L) | CRUD de **clientes** (RF-A01). | `clientes`, `createCliente`, `updateCliente` |
| `Estimativa.jsx` (294L) | **Motor de estimativa** (E5/E6): busca análogas, gera estimativa paramétrica/bottom-up, sugere BDI vigente, exporta PDF, calibra com realizado. | `analogas`, `createEstimativa`, `bdiVigente`, `estimativaPdf` |
| `Cenarios.jsx` (77L) | **Cenários/versões** de estimativa; baixa o PDF. | `cenarios`, `cenario`, `estimativaPdf` |
| `Comparar.jsx` (89L) | **Comparação lado a lado** de obras (RF-E03) + export CSV. | `obras`, `comparar` |
| `Importar.jsx` (122L) | **Importação CSV/Excel** com prévia, sinalização de duplicatas e reimportação idempotente (RF-C04). | `importarAnalisar`, `importarConfirmar` |
| `Cadastros.jsx` (219L) | **admin** — CRUD dos cadastros de referência (tipos de obra, padrões, categorias, localidades), índices econômicos e parâmetros de BDI. | vários `create*`/`upd*`/`del*` |
| `Servicos.jsx` (130L) | **admin** — CRUD do catálogo de serviços/composições (RF-A05). | `servicos`, `createServico`, `updServico` |
| `Auditoria.jsx` (58L) | **admin** — consulta a **trilha de auditoria** (RF-H05). | `auditoria` |

---

## `db/` — banco de dados

| Arquivo | Para que serve | Ligado a |
|---|---|---|
| `migrate.mjs` (56L) | **Runner de migrations** (`npm run migrate`): aplica `migrations/*.sql` em ordem, idempotente, sem `psql`. Tem a **trava `DB_BRANCH_ESPERADA`** que recusa migrar um host inesperado. | usa `db.js` (pool); lê os `.sql` |
| `migrations/001_orcamento_schema.sql` | Schema base: tabelas do módulo (obras, etapas, itens, realizados, anexos, estimativas…), índices e a view `vw_obra_indicadores`. | fundação de tudo |
| `migrations/002_seeds_referencia.sql` | Seeds de referência (categorias, tipos, padrões, índices, BDI default). | 001 |
| `migrations/003_estimativa_itens.sql` | Itens de estimativa (bottom-up por EAP). | 001 |
| `migrations/004_estimativa_grupo.sql` | Cenários/versões de estimativa. | 003 |
| `migrations/005_obra_bdi.sql` | BDI e custo com BDI na obra. | 001 |
| `migrations/006_tipos_obra.sql` | Tipos de obra específicos + reclassifica as obras carregadas. | 002 |
| `migrations/007_pavimentacao_elegivel.sql` | Torna orçamentos por macro-etapa (Template B) elegíveis a referência. | 006 |
| `migrations/008_indicadores_orcado.sql` | Custo/m² passa a usar realizado **ou** orçado (recria a view). | 001 |
| `migrations/009_obras_codigo_unique.sql` | `UNIQUE(obras.codigo)` (desambigua duplicatas legadas antes). | 001 |
| `migrations/010_categorias_unique.sql` | `UNIQUE(nome, tipo)` em categorias de custo. | 002 |
| `migrations/011_medicoes_cronograma.sql` | Cronograma/curva S: baseline nas medições + `UNIQUE(obra, competência)` + CHECK. | 001 |
| `migrations/012_item_horas.sql` | `itens_custo.horas` (homem-hora, opcional) — destrava o h/m². | 001 |
| `migrations/013_desvio_prazo.sql` | Adiciona `fator_desvio_prazo` à view (recria a view; RF-D03). | 008 |

> A view `vw_obra_indicadores` é recriada por 001/008/013. Como a cadeia roda por inteiro a cada
> `migrate`, a **001 faz `DROP VIEW IF EXISTS` antes de criar** — senão o `CREATE OR REPLACE`
> tentaria remover a coluna que a 013 adicionou e o Postgres recusaria.

---

## `scripts/` — ETL Python e utilitários

| Arquivo | Para que serve · funcionalidade | Ligado a |
|---|---|---|
| `importar_orcamento.py` (617L) | **ETL de orçamentos em PDF** (roda à parte do Node). Lê a pasta de um projeto, detecta o template (A: planilha com preços · B: serviços/pavimentação · C: PDF único de projeto básico), extrai obra + EAP + itens + anexos e grava no banco. Anexos grandes vão por **conexão direta** do Neon. | grava no schema `orcamento`; `pdfplumber`+`psycopg2` |
| `diag_pav.py` (46L) | Diagnóstico de layout: mostra a tabela crua da planilha de serviços (para ajustar o parser). | ferramenta de dev do ETL |
| `diag_projbasico.py` (50L) | Diagnóstico do PDF único (projeto básico): páginas com tabela, totais/BDI/área. | ferramenta de dev do ETL |
| `verificar_estimativa.mjs` (89L) | Bate os números da **estimativa paramétrica** contra a API viva (conferência ponta a ponta). | chama a API (`/api/analogas`, `/estimativas`) |
| `sonda_banco.mjs` (79L) | **Sonda somente leitura** (`npm run sonda`): diz se o alvo da `DATABASE_URL` é produção ou dev, migrations aplicadas, contagens — **antes** de qualquer escrita. | usa `pg` direto; ver `PRODUCAO.md` |
| `requirements.txt` | Dependências do ETL: `pdfplumber`, `psycopg2-binary`. | `importar_orcamento.py` |
| `requirements-dev.txt` | Dependências de teste do ETL: `pytest`. | `scripts/tests/` |
| `tests/test_importar_orcamento.py` (75L) | Testes (pytest) das funções puras do ETL: `url_direta`, partição de anexos. | `npm run test:py` |

---

## `tests/` — suíte de testes (sem banco, `npm test`)

Onze suítes de **lógica pura**, uma por área. Cada uma importa a função do `server/` e verifica os
números — por isso rodam offline (240 casos no total).

| Arquivo | Exercita |
|---|---|
| `estimativa.test.mjs` | normalização, similaridade, métodos (núcleo do estimador) |
| `bottomup.test.mjs` | estimativa bottom-up |
| `prazo.test.mjs` | estimativa de prazo |
| `importacao.test.mjs` | `importacao/mapear` |
| `conciliar.test.mjs` | `importacao/conciliar` |
| `indices.test.mjs` | `importacao/indices` (parser em lote) |
| `abc.test.mjs` | `curvaABC` |
| `curvas.test.mjs` | `curvaS` |
| `produtividade.test.mjs` | `produtividade` |
| `custoetapa.test.mjs` | `custoEtapa` (roll-up, ciclo, EAP profunda) e `criaCiclo` |
| `auth.test.mjs` | `auth` (hash, JWT, `requireAuth`) |
| `anexos.test.mjs` | `contentDispositionAnexo` e `nomeAnexo` |

---

## `public/` — estáticos

| Arquivo | Para que serve |
|---|---|
| `assets/promav-mark.svg` | Logomarca (tema claro) — favicon e header. |
| `assets/promav-mark-light.svg` | Variante da logomarca. |

---

## Artefatos NÃO versionados (ignorados pelo git)

Aparecem na pasta local, mas o `.gitignore` os exclui — **não** são código-fonte:

- `node_modules/`, `dist/`, `.vite/` — dependências e build.
- `diag.txt`, `diag-pb.txt`, `dryrun-pav.txt` — dumps de diagnóstico do ETL (contêm dados de
  cliente; ficam só locais).
- `scripts/__pycache__/`, `.pytest_cache/`, `*.pyc` — caches do Python.
- `.claude/settings.local.json` — preferências locais da ferramenta.

---

## Onde mexer para cada tarefa (atalho)

| Quero… | Comece por |
|---|---|
| Adicionar/alterar um endpoint | `server/index.js` (ou `server/obraDetalhe.js` se for de obra) + método em `src/data/api.js` |
| Mudar uma regra de cálculo | a função pura correspondente em `server/*.js` + seu teste em `tests/` |
| Alterar uma tela | `src/screens/*.jsx` |
| Mudar o schema | nova migration numerada em `db/migrations/` (idempotente) |
| Ajustar o parser de PDF | `scripts/importar_orcamento.py` (use os `diag_*.py` para inspecionar) |
| Publicar / migrar produção | `PRODUCAO.md`, `render.yaml`, `scripts/sonda_banco.mjs` |
