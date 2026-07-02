# Base de Dados de Projetos — Custo e Prazo (PROMAV ENGENHARIA)

Sistema (módulo) para registrar o histórico de obras da PROMAV — custos e prazos
realizados — e usar esse acervo para **estimar novos projetos** de construção civil
com base em dados reais, e não apenas no "feeling" do orçamentista.

O módulo será **integrado ao sistema web já existente da empresa**.

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

---

## Objetivo em uma frase

> Transformar o histórico de obras concluídas em uma base estruturada e atualizada,
> capaz de gerar estimativas de **custo** e **prazo** confiáveis (com faixa e nível de
> confiança) para novos projetos.

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

> 🗄️ **Banco:** schema `orcamento` em [`db/migrations/001_orcamento_schema.sql`](./db/migrations/001_orcamento_schema.sql) e seeds em [`db/migrations/002_seeds_referencia.sql`](./db/migrations/002_seeds_referencia.sql).
>
> 💻 **Código:** este repositório já traz o **esqueleto executável** (Express em `server/`, React+Vite em `src/`). Como rodar: [doc 08](./docs/08-setup-dev.md).

---

## Resumo do escopo

**Inclui (MVP + evolução):**

- Cadastro de obras concluídas com EAP, custos orçados e realizados, e cronograma.
- Importação de orçamentos a partir de planilhas (Excel/CSV) existentes.
- Normalização dos custos (atualização monetária por índice e ajuste por padrão/localidade).
- Indicadores: custo por m², desvio de custo, desvio de prazo, curva ABC.
- Busca de obras análogas e motor de estimativa (custo e prazo com faixa).
- Relatórios e dashboards; integração com login e cadastros do sistema atual.

**Não inclui (por ora):**

- Substituir o ERP/financeiro da empresa (a base **consome** dados, não vira sistema contábil).
- Gestão de execução de obra em tempo real (diário de obra, ponto, suprimentos).
- Cálculo legal/tributário definitivo de propostas comerciais.

Detalhes em [`docs/01-visao-escopo.md`](./docs/01-visao-escopo.md).

---

## Stack e integração (definidas)

Integra ao sistema **Promav** atual: **React + Vite · Express + Node · PostgreSQL (Neon)
· JWT + bcrypt**. O módulo é um app/serviço **separado** que reutiliza identidade
(`public.users`, só-leitura) e o mesmo banco **sem alterar o sistema atual** — os objetos
novos ficam no schema `orcamento` ([DDL](./db/migrations/001_orcamento_schema.sql)).
Detalhes no [doc 06](./docs/06-arquitetura-integracao.md). Os poucos pontos menores ainda
em aberto estão listados no fim desse documento.

---

*Documento de estruturação inicial — versão 0.1. Sujeito a refinamento com o time da PROMAV.*
