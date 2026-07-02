-- ============================================================
-- Migration 005 — BDI e custo com BDI na obra
-- Para orçamentos importados: guardar custo direto (sem BDI) +
-- BDI (%) + custo com BDI. Isolado em orcamento; idempotente.
-- Rode após 001..004, na mesma branch.
-- ============================================================

ALTER TABLE orcamento.obras ADD COLUMN IF NOT EXISTS bdi_pct numeric(6,2);
ALTER TABLE orcamento.obras ADD COLUMN IF NOT EXISTS custo_orcado_com_bdi numeric(16,2);
