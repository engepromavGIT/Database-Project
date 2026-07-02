# 07 — Backlog do MVP

Backlog organizado em **épicos → histórias**, mapeado aos
[requisitos funcionais](./02-requisitos-funcionais.md) e às
[fases do roadmap](./06-arquitetura-integracao.md#7-roadmap-de-implantacao).

**Estimativa (tamanho relativo):** P (≤1 dia) · M (2–3 dias) · G (4+ dias).
**MVP =** épicos E0–E4 (marcados ✅). E5–E8 são pós-MVP (fases 3–4).

> O MVP entrega: acervo de obras navegável + importação do histórico + indicadores
> básicos (custo/m², desvios), tudo autenticado e isolado no schema `orcamento`.

---

## E0 — Fundação técnica ✅ (Fase 0)

| ID | História | RF | Prio. | Est. | Pronto quando |
|----|----------|----|:----:|:---:|---------------|
| US-01 | Criar **branch de dev no Neon** e aplicar a migration `001`. | — | E | P | Schema `orcamento` existe na branch; app de produção intacto. |
| US-02 | **Esqueleto** do serviço (Express) + app (Vite) reusando `db.js`/`auth.js` e design tokens. | — | E | M | `npm run dev` sobe API + web; health responde. |
| US-03 | **Login** reaproveitando `public.users` (só-leitura) e o mesmo `JWT_SECRET`. | RF-H01 | E | P | Usuário entra com a conta existente; token válido. |
| US-04 | Tela autenticada base (shell) com identidade do usuário e logout. | RF-H02 | E | P | Sessão expira/limpa em 401; logout funciona. |
| US-05 | Seeds de referência (migration `002`) na branch. | — | E | P | Categorias, tipos, padrões e índices populados. |

## E1 — Cadastros de referência ✅ (Fase 1)

| ID | História | RF | Prio. | Est. | Pronto quando |
|----|----------|----|:----:|:---:|---------------|
| US-06 | CRUD de **tipos de obra** e **padrões de acabamento**. | RF-A02, A03 | E | P | Itens disponíveis para classificar obras. |
| US-07 | CRUD de **categorias de custo**. | RF-A04 | E | P | Categorias usadas nos itens de custo. |
| US-08 | CRUD de **clientes** (tabela nova em `orcamento`). | RF-A01 | E | P | Cliente vinculável a obras. |
| US-09 | CRUD de **localidades** com fator regional. | RF-A08 | I | P | Localidade aplicável a obra/estimativa. |
| US-10 | Cadastro de **índices econômicos** (SINAPI/SICRO) por mês. | RF-A06 | E | M | Série consultável; base da atualização monetária. |
| US-11 | Catálogo de **serviços/composições** com código SINAPI. | RF-A05 | I | M | Serviço reutilizável; busca por código/descrição. |
| US-12 | Parâmetros de **BDI/encargos** por tipo e vigência. | RF-A07 | I | P | Parâmetro versionado por vigência. |

## E2 — Obras, EAP e custos ✅ (Fase 1)

| ID | História | RF | Prio. | Est. | Pronto quando |
|----|----------|----|:----:|:---:|---------------|
| US-13 | CRUD de **obra** (dados gerais + data-base + elegibilidade). | RF-B01, B07 | E | M | Obra salva com validação; flag de referência. |
| US-14 | Montar **EAP** (etapas hierárquicas, ordenáveis). | RF-B02 | E | M | Árvore de etapas editável. |
| US-15 | Lançar **itens de custo orçado** por etapa. | RF-B03 | E | M | Totais por etapa/obra calculados (coluna gerada). |
| US-16 | Lançar **custos realizados** por etapa/competência. | RF-B04 | E | M | Comparativo orçado × realizado por etapa. |
| US-17 | **Cronograma físico-financeiro** (medições, curva S). | RF-B05 | I | M | Curva previsto × realizado exibível. |
| US-18 | **Anexos** da obra (bytea, como no app). | RF-B06 | D | P | Upload/download respeitando permissão. |
| US-19 | **Trilha de auditoria** das ações sensíveis. | RF-B08, H05 | I | P | Log consultável por administrador. |

## E3 — Importação do histórico ✅ (Fase 1)

| ID | História | RF | Prio. | Est. | Pronto quando |
|----|----------|----|:----:|:---:|---------------|
| US-20 | Importar **CSV/Excel** com mapeamento de colunas e prévia. | RF-C01 | E | G | Prévia antes de gravar; linhas inválidas sinalizadas. |
| US-21 | **Validações** de importação (totais, unidades, datas). | RF-C02 | E | M | Relatório de erros/avisos; carga parcial controlada. |
| US-22 | Importar **PDF** (extração de tabelas com revisão manual). | RF-C01 | I | G | Tabelas extraídas conferíveis antes de gravar. |
| US-23 | Conciliar serviços importados com **SINAPI**. | RF-C03 | I | M | Itens conciliados; pendências destacadas. |
| US-24 | **Reimportação** idempotente (sem duplicar). | RF-C04 | I | M | Atualiza registros existentes por chave. |

## E4 — Normalização e indicadores ✅ (Fase 1/2)

| ID | História | RF | Prio. | Est. | Pronto quando |
|----|----------|----|:----:|:---:|---------------|
| US-25 | **Atualização monetária** para uma data-base (índice). | RF-D01 | E | M | Valor atualizado ao lado do histórico. |
| US-26 | **Custo/m²** (total e por etapa/categoria). | RF-D02 | E | P | Indicador via view `vw_obra_indicadores`. |
| US-27 | **Desvios** de custo e prazo (orçado × realizado). | RF-D03 | E | P | Percentuais por etapa e obra. |
| US-28 | **Curva ABC** de serviços. | RF-D04 | I | M | Itens ordenados por participação acumulada. |

## Pós-MVP (fases 3–4) — resumo

| Épico | Conteúdo | RF | Fase |
|-------|----------|----|:----:|
| **E5 — Busca de análogas** | Filtros, escore de similaridade, comparação. | RF-E01..E03 | 2–3 |
| **E6 — Motor de estimativa** | Métodos, faixa O/M/P, nível de confiança, versões, calibração. | RF-F01..F08 | 3 |
| **E7 — Relatórios/dashboards** | Painéis, exportação PDF/Excel. | RF-G01..G03 | 4 |
| **E8 — Integração/admin avançada** | API para o comercial, papéis do módulo, logs. | RF-H03..H05 | 4 |

---

## Ordem de ataque sugerida

1. **E0** (fundação) → ambiente de dev seguro na branch do Neon.
2. **E1** (cadastros) → base mínima para descrever obras.
3. **E2** (obras/custos) → começa a entrar o acervo de verdade.
4. **E3** (importação) → acelera a carga dos ~3 anos de histórico.
5. **E4** (indicadores) → primeiro valor analítico visível (custo/m², desvios).

Concluído o MVP, partir para **E5 → E6** (o motor de estimativa, coração do produto).

---

## Débito técnico

| Item | Severidade | Status | Ação planejada |
|------|:---------:|--------|----------------|
| **Upgrade do Vite (5 → 8)** | Alta (dev-only) | ✅ Resolvido (2026-06-29) | Subido para `vite@8.1.0` + `@vitejs/plugin-react@^6`; build OK e **`npm audit` com 0 vulnerabilidades** (validado no `build-check-log.md`). Eliminou as 3 advisories do Vite ≤6.4.2 (dev server). |

**Mitigações de dependências:** `xlsx` fixado no CDN da SheetJS 0.20.3 (removeu 2 altas). O `overrides` de `esbuild` foi **removido** ao subir para o Vite 8, que já traz um esbuild corrigido.

> Política: **não** usar `npm audit fix --force`. Upgrades de major são tarefa versionada e testada à parte.

---

⬅️ [06 — Arquitetura](./06-arquitetura-integracao.md) · 🏠 [Índice](../README.md)
