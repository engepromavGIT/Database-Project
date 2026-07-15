-- ============================================================
-- Migration 013 — fator de desvio de PRAZO na view de indicadores (RF-D03)
-- O prazo real e o planejado já existiam na view, mas o desvio (realizado ÷
-- planejado) era calculado só para custo. Agora a view expõe também o de prazo,
-- para o Acervo/Painel/Comparar mostrarem o % (ex.: 1,20 → +20% de atraso).
-- Só aparece quando HÁ os dois prazos (> 0); senão fica NULL (a UI mostra "—").
-- CREATE OR REPLACE + coluna nova no FIM (requisito do Postgres). Idempotente.
-- Rode após 001..012.
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
  (o.dt_fim_plan - o.dt_inicio_plan) AS prazo_plan_dias,
  CASE WHEN (o.dt_fim_plan - o.dt_inicio_plan) > 0
        AND (o.dt_fim_real - o.dt_inicio_real) > 0
       THEN round((o.dt_fim_real - o.dt_inicio_real)::numeric
                  / (o.dt_fim_plan - o.dt_inicio_plan)::numeric, 4)
  END AS fator_desvio_prazo
FROM orcamento.obras o;
