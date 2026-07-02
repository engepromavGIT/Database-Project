-- ============================================================
-- Migration 004 — Cenários/versões de estimativa
-- Agrupa versões da mesma estimativa por 'grupo'. Isolado em
-- orcamento; não toca em public.*. Idempotente.
-- Rode após 001..003, na mesma branch.
-- ============================================================

ALTER TABLE orcamento.estimativas ADD COLUMN IF NOT EXISTS grupo text;

CREATE INDEX IF NOT EXISTS estimativas_grupo_idx ON orcamento.estimativas (grupo);
