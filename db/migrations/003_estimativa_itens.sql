-- ============================================================
-- Migration 003 — Itens de estimativa (bottom-up por EAP)
-- Persiste a composição de uma estimativa feita item a item.
-- Isolado no schema 'orcamento'. Não toca em public.*.
-- Idempotente (IF NOT EXISTS). Rode após 001 e 002, na mesma branch.
-- ============================================================

CREATE TABLE IF NOT EXISTS orcamento.estimativa_itens (
  id              text PRIMARY KEY,
  estimativa_id   text NOT NULL REFERENCES orcamento.estimativas(id) ON DELETE CASCADE,
  servico_ref_id  text REFERENCES orcamento.servicos_ref(id),
  descricao       text,
  unidade         text,
  quantidade      numeric(16,4) NOT NULL DEFAULT 0,
  custo_unitario  numeric(16,4) NOT NULL DEFAULT 0,
  custo_total     numeric(16,2) GENERATED ALWAYS AS (round(quantidade * custo_unitario, 2)) STORED,
  categoria_id    text REFERENCES orcamento.categorias_custo(id)
);

CREATE INDEX IF NOT EXISTS estitens_estimativa_idx ON orcamento.estimativa_itens (estimativa_id);
