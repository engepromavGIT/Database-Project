-- ============================================================
-- Módulo Base de Projetos (custo e prazo) — schema inicial
-- PostgreSQL (Neon). Estilo alinhado ao backend Promav atual:
--   • IDs em text (gerados na aplicação, ex.: genId('obra'))
--   • CREATE ... IF NOT EXISTS (idempotente)
--   • snake_case; valores monetários em numeric
--
-- IMPORTANTE: tudo aqui vive no schema próprio "orcamento".
-- NÃO altera nenhuma tabela do app existente (public.*). A identidade
-- (public.users) é apenas REFERENCIADA por valor (coluna texto criado_por),
-- sem FK, para não acoplar nem modificar o sistema atual.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS orcamento;

-- ------------------------------------------------------------
-- Tipos enumerados (idempotentes)
-- ------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE orcamento.obra_status AS ENUM ('planejada','em_andamento','concluida','cancelada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE orcamento.categoria_tipo AS ENUM ('material','mao_de_obra','equipamento','terceiros','indireto');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE orcamento.estimativa_metodo AS ENUM ('analoga','parametrica','bottom_up','combinada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ------------------------------------------------------------
-- Dimensões / cadastros de referência
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orcamento.clientes (
  id          text PRIMARY KEY,
  nome        text NOT NULL,
  documento   text,
  ativo       boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orcamento.tipos_obra (
  id    text PRIMARY KEY,
  nome  text NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS orcamento.padroes_acabamento (
  id    text PRIMARY KEY,
  nome  text NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS orcamento.localidades (
  id              text PRIMARY KEY,
  municipio       text NOT NULL,
  uf              char(2) NOT NULL,
  fator_regional  numeric(6,4) DEFAULT 1.0,
  UNIQUE (municipio, uf)
);

CREATE TABLE IF NOT EXISTS orcamento.categorias_custo (
  id    text PRIMARY KEY,
  nome  text NOT NULL,
  tipo  orcamento.categoria_tipo NOT NULL
);

-- Catálogo de serviços/composições de referência (SINAPI/SICRO ou próprios)
CREATE TABLE IF NOT EXISTS orcamento.servicos_ref (
  id            text PRIMARY KEY,
  codigo_sinapi text,            -- código SINAPI/SICRO quando aplicável
  descricao     text NOT NULL,
  unidade       text NOT NULL,
  categoria_id  text REFERENCES orcamento.categorias_custo(id),
  ativo         boolean NOT NULL DEFAULT true
);

-- Série mensal de índices para atualização monetária (SINAPI/SICRO/INCC)
CREATE TABLE IF NOT EXISTS orcamento.indices_economicos (
  id      text PRIMARY KEY,
  indice  text NOT NULL,         -- 'SINAPI','SICRO','INCC'
  ano     int  NOT NULL,
  mes     int  NOT NULL CHECK (mes BETWEEN 1 AND 12),
  valor   numeric(14,4) NOT NULL,
  UNIQUE (indice, ano, mes)
);

-- BDI e encargos por tipo de obra e vigência
CREATE TABLE IF NOT EXISTS orcamento.parametros_bdi (
  id              text PRIMARY KEY,
  tipo_obra_id    text REFERENCES orcamento.tipos_obra(id),
  bdi_pct         numeric(6,2) NOT NULL,
  encargos_pct    numeric(6,2) NOT NULL,
  vigencia_inicio date NOT NULL,
  vigencia_fim    date
);

-- ------------------------------------------------------------
-- Núcleo: obras, EAP, custos e prazos
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orcamento.obras (
  id                  text PRIMARY KEY,
  codigo              text NOT NULL,
  nome                text NOT NULL,
  cliente_id          text REFERENCES orcamento.clientes(id),
  tipo_obra_id        text REFERENCES orcamento.tipos_obra(id),
  padrao_id           text REFERENCES orcamento.padroes_acabamento(id),
  localidade_id       text REFERENCES orcamento.localidades(id),
  area_construida_m2  numeric(14,2),
  area_terreno_m2     numeric(14,2),
  num_pavimentos      int,
  dt_inicio_plan      date,
  dt_fim_plan         date,
  dt_inicio_real      date,
  dt_fim_real         date,
  status              orcamento.obra_status NOT NULL DEFAULT 'concluida',
  custo_orcado_total  numeric(16,2) DEFAULT 0,
  custo_real_total    numeric(16,2) DEFAULT 0,
  data_base_custo     date,
  elegivel_referencia boolean NOT NULL DEFAULT false,
  fonte_dado          text,                 -- 'manual' | 'importado' | 'conciliado'
  criado_por          text,                 -- referência (soft) a public.users(id)
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- EAP: etapas hierárquicas (auto-relacionamento)
CREATE TABLE IF NOT EXISTS orcamento.etapas (
  id            text PRIMARY KEY,
  obra_id       text NOT NULL REFERENCES orcamento.obras(id) ON DELETE CASCADE,
  etapa_pai_id  text REFERENCES orcamento.etapas(id) ON DELETE CASCADE,
  codigo_eap    text,
  descricao     text NOT NULL,
  ordem         int DEFAULT 0,
  custo_orcado  numeric(16,2) DEFAULT 0,
  custo_real    numeric(16,2) DEFAULT 0
);

-- Itens de custo ORÇADO (custo_total calculado pelo banco)
CREATE TABLE IF NOT EXISTS orcamento.itens_custo (
  id              text PRIMARY KEY,
  etapa_id        text NOT NULL REFERENCES orcamento.etapas(id) ON DELETE CASCADE,
  servico_ref_id  text REFERENCES orcamento.servicos_ref(id),
  categoria_id    text REFERENCES orcamento.categorias_custo(id),
  descricao       text,
  unidade         text,
  quantidade      numeric(16,4) NOT NULL DEFAULT 0,
  custo_unitario  numeric(16,4) NOT NULL DEFAULT 0,
  custo_total     numeric(16,2) GENERATED ALWAYS AS (round(quantidade * custo_unitario, 2)) STORED,
  data_base       date
);

-- Custos REALIZADOS (apropriação por etapa/competência)
CREATE TABLE IF NOT EXISTS orcamento.custos_realizados (
  id          text PRIMARY KEY,
  etapa_id    text NOT NULL REFERENCES orcamento.etapas(id) ON DELETE CASCADE,
  competencia date NOT NULL,
  valor       numeric(16,2) NOT NULL DEFAULT 0,
  origem      text
);

-- Cronograma físico-financeiro (curva S)
CREATE TABLE IF NOT EXISTS orcamento.medicoes (
  id                text PRIMARY KEY,
  obra_id           text NOT NULL REFERENCES orcamento.obras(id) ON DELETE CASCADE,
  competencia       date NOT NULL,
  avanco_fisico_pct numeric(6,2),
  desembolso        numeric(16,2)
);

-- ------------------------------------------------------------
-- Estimativas de novos projetos
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orcamento.estimativas (
  id                   text PRIMARY KEY,
  descricao            text NOT NULL,
  tipo_obra_id         text REFERENCES orcamento.tipos_obra(id),
  padrao_id            text REFERENCES orcamento.padroes_acabamento(id),
  localidade_id        text REFERENCES orcamento.localidades(id),
  area_alvo_m2         numeric(14,2),
  data_base            date NOT NULL,
  metodo               orcamento.estimativa_metodo NOT NULL DEFAULT 'parametrica',
  custo_otimista       numeric(16,2),
  custo_provavel       numeric(16,2),
  custo_pessimista     numeric(16,2),
  prazo_otimista_dias  int,
  prazo_provavel_dias  int,
  prazo_pessimista_dias int,
  nivel_confianca_pct  numeric(5,2),
  versao               int NOT NULL DEFAULT 1,
  criado_por           text,                -- referência (soft) a public.users(id)
  criado_em            timestamptz NOT NULL DEFAULT now(),
  custo_realizado      numeric(16,2),       -- preenchido quando a obra é executada
  erro_pct             numeric(7,2)         -- desvio estimado x realizado (calibração)
);

-- Obras que embasaram cada estimativa (N:N) com peso de similaridade
CREATE TABLE IF NOT EXISTS orcamento.estimativa_referencias (
  id                text PRIMARY KEY,
  estimativa_id     text NOT NULL REFERENCES orcamento.estimativas(id) ON DELETE CASCADE,
  obra_id           text NOT NULL REFERENCES orcamento.obras(id),
  peso_similaridade numeric(5,4),
  UNIQUE (estimativa_id, obra_id)
);

-- ------------------------------------------------------------
-- Apoio: anexos (bytea, como no app) e auditoria
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orcamento.anexos (
  id          text PRIMARY KEY,
  obra_id     text NOT NULL REFERENCES orcamento.obras(id) ON DELETE CASCADE,
  filename    text NOT NULL,
  mime_type   text NOT NULL,
  size_bytes  integer NOT NULL,
  data        bytea NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orcamento.log_auditoria (
  id          text PRIMARY KEY,
  usuario_id  text,                 -- referência (soft) a public.users(id)
  entidade    text NOT NULL,
  entidade_id text,
  acao        text NOT NULL,        -- 'create' | 'update' | 'delete' | 'export' | 'estimate'
  data_hora   timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- Índices (consultas e similaridade)
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS obras_tipo_idx        ON orcamento.obras (tipo_obra_id);
CREATE INDEX IF NOT EXISTS obras_padrao_idx       ON orcamento.obras (padrao_id);
CREATE INDEX IF NOT EXISTS obras_localidade_idx   ON orcamento.obras (localidade_id);
CREATE INDEX IF NOT EXISTS obras_elegivel_idx     ON orcamento.obras (elegivel_referencia);
CREATE INDEX IF NOT EXISTS etapas_obra_idx        ON orcamento.etapas (obra_id);
CREATE INDEX IF NOT EXISTS itens_etapa_idx        ON orcamento.itens_custo (etapa_id);
CREATE INDEX IF NOT EXISTS realizados_etapa_idx   ON orcamento.custos_realizados (etapa_id);
CREATE INDEX IF NOT EXISTS medicoes_obra_idx      ON orcamento.medicoes (obra_id);
CREATE INDEX IF NOT EXISTS estref_estimativa_idx  ON orcamento.estimativa_referencias (estimativa_id);
CREATE INDEX IF NOT EXISTS estref_obra_idx        ON orcamento.estimativa_referencias (obra_id);

-- ------------------------------------------------------------
-- View de indicadores por obra (apoia RF-D02 / RF-D03)
-- custo/m², fator de desvio de custo e prazos em dias.
-- ------------------------------------------------------------
-- As migrations são re-executadas por inteiro a cada `npm run migrate` (não há tabela de
-- controle), então esta precisa conviver com uma view JÁ EVOLUÍDA por migrations posteriores.
-- A 013 acrescentou a coluna fator_desvio_prazo; um CREATE OR REPLACE aqui tentaria REMOVÊ-LA
-- e o Postgres recusa ("cannot drop columns from view"), quebrando a cadeia logo na 001.
-- Dropar antes resolve: a view não guarda dado e nada depende dela (sem CASCADE de propósito —
-- se um dia algo depender, queremos o erro alto, não uma remoção silenciosa).
DROP VIEW IF EXISTS orcamento.vw_obra_indicadores;

CREATE VIEW orcamento.vw_obra_indicadores AS
SELECT
  o.id,
  o.codigo,
  o.nome,
  o.area_construida_m2,
  o.custo_orcado_total,
  o.custo_real_total,
  CASE WHEN o.area_construida_m2 > 0
       THEN round(o.custo_real_total / o.area_construida_m2, 2) END AS custo_m2_real,
  CASE WHEN o.custo_orcado_total > 0
       THEN round(o.custo_real_total / o.custo_orcado_total, 4) END AS fator_desvio_custo,
  (o.dt_fim_real - o.dt_inicio_real) AS prazo_real_dias,
  (o.dt_fim_plan - o.dt_inicio_plan) AS prazo_plan_dias
FROM orcamento.obras o;

-- ============================================================
-- Fim do schema inicial (001).
-- Próximas migrations: seeds de referência (categorias, tipos,
-- índices SINAPI/SICRO) e ajustes conforme evolução do módulo.
-- ============================================================
