-- ============================================================
-- Migration 008 — custo/m² usa realizado OU orçado
-- Para orçamentos importados (sem realizado), o custo/m² passa a usar o
-- custo orçado, para o Painel/Acervo mostrarem o valor correto. O desvio
-- de custo só aparece quando há realizado. Idempotente (CREATE OR REPLACE).
-- Rode após 001..007.
-- ============================================================

CREATE OR REPLACE VIEW orcamento.vw_obra_indicadores AS
SELECT
  o.id, o.codigo, o.nome, o.area_construida_m2,
  o.custo_orcado_total, o.custo_real_total,
  CASE WHEN o.area_construida_m2 > 0
       THEN round(COALESCE(NULLIF(o.custo_real_total, 0), o.custo_orcado_total) / o.area_construida_m2, 2)
  END AS custo_m2_real,
  CASE WHEN o.custo_orcado_total > 0 AND o.custo_real_total > 0
       THEN round(o.custo_real_total / o.custo_orcado_total, 4)
  END AS fator_desvio_custo,
  (o.dt_fim_real - o.dt_inicio_real) AS prazo_real_dias,
  (o.dt_fim_plan - o.dt_inicio_plan) AS prazo_plan_dias
FROM orcamento.obras o;
