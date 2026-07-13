-- ============================================================
-- Migration 012 — homem-hora por item de custo (RF-D05).
-- Campo OPCIONAL de horas (homem-hora) no item orçado, para o indicador de
-- produtividade h/m² (a produtividade R$/m² e qtd/m² já saem dos dados atuais).
-- Nullable → não afeta itens/obras existentes. Idempotente. Rode após 001..011.
-- ============================================================

ALTER TABLE orcamento.itens_custo ADD COLUMN IF NOT EXISTS horas numeric(14,2);
COMMENT ON COLUMN orcamento.itens_custo.horas IS 'Homem-hora do item (opcional); alimenta h/m² na produtividade (RF-D05).';

-- Faixa: horas >= 0 (se informada). Idempotente via duplicate_object.
DO $$ BEGIN
  ALTER TABLE orcamento.itens_custo ADD CONSTRAINT itens_custo_horas_chk CHECK (horas IS NULL OR horas >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- ============================================================
