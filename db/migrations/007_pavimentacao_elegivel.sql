-- ============================================================
-- Migration 007 — Orçamentos por macro-etapa (Template B) elegíveis
-- A estimativa paramétrica usa o custo/m² da OBRA (não o custo por item),
-- então os orçamentos importados por macro-etapa também servem de análoga.
-- Isolado em orcamento; idempotente. Rode após 001..006.
-- ============================================================

UPDATE orcamento.obras
   SET elegivel_referencia = true
 WHERE fonte_dado = 'orcamento_pdf_macro';
