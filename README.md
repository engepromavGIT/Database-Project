# Base de Dados de Projetos — Custo e Prazo (PROMAV ENGENHARIA)

Sistema (módulo) para registrar o histórico de obras da PROMAV — custos e prazos
realizados — e usar esse acervo para **estimar novos projetos** de construção civil
com base em dados reais, e não apenas no "feeling" do orçamentista.

O módulo será **integrado ao sistema web já existente da empresa**.

**Stack:** React + Vite · Express + Node · PostgreSQL (Neon) · JWT + bcrypt · ETL em Python (pdfplumber).

---

## Problema que resolve

Hoje o conhecimento de quanto custa e quanto dura cada tipo de obra fica espalhado
em planilhas, e-mails e na cabeça de poucas pessoas. Isso gera:

- Orçamentos inconsistentes para obras parecidas.
- Dificuldade de justificar preços para o cliente.
- Estimativas de prazo otimistas demais (atrasos recorrentes).
- Perda de aprendizado: o que deu certo/errado em uma obra não vira referência.

A base centraliza projetos concluídos, normaliza os valores (atualização monetária e
por padrão/localidade) e oferece um motor de estimativa que sugere custo e prazo para
uma obra nova a partir de obras análogas.

> **Objetivo em uma frase:** transformar o histórico de obras concluídas em uma base
> estruturada e atualizada, capaz de gerar estimativas de **custo** e **prazo** confiáveis
> (com faixa e nível de confiança) para novos projetos.

---

## Como rodar

### Pré-requisitos

| Ferramenta | Uso |
|-----------|-----|
| Node.js 20+ | app web + API + migrations |
| Python 3.12+ | ETL de orçamentos em PDF (`scripts/`) |
| PostgreSQL client (`psql`) | opcional — migrations também rodam via `npm run migrate` |
| Banco Neon | **branch de DEV** (nunca produção — ver [doc 08](./docs/08-setup-dev.md)) |

### Setup

```bash
npm install                              # dependências do app
python -m pip install -r scripts/requirements.txt   # dependências do ETL

cp .env.example .env                     # preencha DATABASE_URL (branch DEV do Neon), JWT_SECRET etc.

npm run migrate                          # aplica db/migrations/*.sql (idempotente)
npm run dev                              # web (Vite :5173) + API (Express :3001)
```

Health check: `GET http://localhost:3001/api/health` → `{ "ok": true, ... }`.

### Scripts npm

| Script | O que faz |
|--------|-----------|
| `npm run dev` | Sobe web (Vite) + API (Express) juntos |
| `npm run migrate` | Aplica as migrations em ordem (sem precisar de psql) |
| `npm run check` | `node --check` em todos os módulos do servidor |
| `npm test` | 6 suítes de lógica pura (estimativa, bottom-up, importação, prazo, conciliação, curva ABC) |
| `npm run build` | Build de produção (Vite) |

### Verificação completa

O runbook [`VERIFICAR.md`](./VERIFICAR.md) descreve o pipeline de verificação
(install → check → test → build → audit → banco/health) e gera o
[`build-check-log.md`](./build-check-log.md), usado para acompanhar o estado do projeto
entre sessões de trabalho.

---

## Importação de orçamentos (ETL)

O carregador [`scripts/importar_orcamento.py`](./scripts/importar_orcamento.py) lê uma
pasta de projeto com os PDFs do orçamento e grava obra + EAP + itens + anexos no banco:

```bash
# dry-run (só mostra o que seria importado, com checagem de totais)
python scripts/importar_orcamento.py "orcamentos/<pasta-do-projeto>"

# grava na branch de DEV (idempotente: pula se a obra já existe)
python scripts/importar_orcamento.py "orcamentos/<pasta-do-projeto>" --commit

# recarrega (apaga e regrava)
python scripts/importar_orcamento.py "orcamentos/<pasta-do-projeto>" --commit --force
```

Templates suportados (detecção automática):

| Template | Arquivos | O que extrai | Elegível p/ referência |
|----------|----------|--------------|:---:|
| **A** — planilha orçamentária com preços | PLANILHA + RESUMO/CONSOLIDADO + MEMORIAL | EAP completa + itens com custo unitário | ✅ |
| **B** — planilha de serviços (pavimentação em diversas localidades) | P.SERVIÇOS + CONSOLIDADO + MEMORIAL | Quantidades por item (agregadas entre localidades) + custo por macro-etapa (normalizado p/ s/BDI) + área do "Quadro Resumo das Vias" | ❌ (sem preço unitário) |

> A pasta `orcamentos/` (PDFs assinados de clientes) **não é versionada** — os documentos
> ficam locais e são anexados ao banco no `--commit`.

---

## Banco de dados

Schema isolado **`orcamento`** no mesmo banco do sistema Promav — nada do sistema atual
é alterado; a identidade (`public.users`) é reutilizada em modo leitura.

- Migrations em [`db/migrations/`](./db/migrations) (numeradas, idempotentes).
- Runner: [`db/migrate.mjs`](./db/migrate.mjs) (`npm run migrate`).
- **Regra de ouro:** desenvolvimento sempre em **branch de DEV do Neon**; produção nunca
  recebe migration direto.

---

## Documentação

A documentação está em [`/docs`](./docs) e segue a ordem de leitura recomendada:

| # | Documento | Conteúdo |
|---|-----------|----------|
| 01 | [Visão, Escopo e Glossário](./docs/01-visao-escopo.md) | Objetivos, escopo, stakeholders, premissas, restrições e vocabulário do domínio. |
| 02 | [Requisitos Funcionais](./docs/02-requisitos-funcionais.md) | O que o sistema deve fazer, por módulo (RF-xxx). |
| 03 | [Requisitos Não Funcionais](./docs/03-requisitos-nao-funcionais.md) | Desempenho, segurança/LGPD, integração, qualidade etc. (RNF-xxx). |
| 04 | [Modelo de Dados](./docs/04-modelo-dados.md) | Entidades, relacionamentos, diagrama ER e dicionário de dados. |
| 05 | [Regras de Estimativa](./docs/05-regras-estimativa.md) | Métodos de estimativa, normalização e cálculo das faixas. |
| 06 | [Arquitetura, Integração e Roadmap](./docs/06-arquitetura-integracao.md) | Arquitetura, stack, integração com o sistema atual e fases de implantação. |
| 07 | [Backlog do MVP](./docs/07-backlog-mvp.md) | Épicos e histórias do MVP, mapeados aos RF. |
| 08 | [Setup de desenvolvimento](./docs/08-setup-dev.md) | Rodar localmente com uma branch do Neon (sem risco à produção). |

---

## Estrutura do repositório

```
├── server/            API Express (auth JWT, obras, estimativa, importação, curva ABC)
│   ├── estimativa/    normalização, similaridade e métodos de estimativa
│   └── importacao/    mapeamento e conciliação de planilhas
├── src/               Front-end React (telas: Dashboard, Acervo, Estimativa, Comparar…)
├── db/
│   ├── migrations/    DDL + seeds do schema 'orcamento' (numeradas, idempotentes)
│   └── migrate.mjs    runner de migrations (npm run migrate)
├── scripts/           ETL Python: importar_orcamento.py + diagnósticos de PDF
├── tests/             6 suítes de lógica pura (npm test)
├── docs/              documentação 01–08
└── VERIFICAR.md       runbook de verificação (gera build-check-log.md)
```

---

## Resumo do escopo

**Inclui (MVP + evolução):**

- Cadastro de obras concluídas com EAP, custos orçados e realizados, e cronograma.
- Importação de orçamentos a partir de PDFs (templates PROMAV) e planilhas.
- Normalização dos custos (atualização monetária por índice e ajuste por padrão/localidade).
- Indicadores: custo por m², desvio de custo, desvio de prazo, curva ABC.
- Busca de obras análogas e motor de estimativa (custo e prazo com faixa).
- Relatórios e dashboards; integração com login e cadastros do sistema atual.

**Não inclui (por ora):**

- Substituir o ERP/financeiro da empresa (a base **consome** dados, não vira sistema contábil).
- Gestão de execução de obra em tempo real (diário de obra, ponto, suprimentos).
- Cálculo legal/tributário definitivo de propostas comerciais.

Detalhes em [`docs/01-visao-escopo.md`](./docs/01-visao-escopo.md).
