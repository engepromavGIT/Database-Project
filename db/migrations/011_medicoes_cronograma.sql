-- ============================================================
-- Migration 011 — Cronograma físico-financeiro (RF-B05, curva S).
-- orcamento.medicoes já existe (001) e nunca foi ligada a rota/tela. Aqui:
--   (a) adiciona a LINHA DE BASE OPCIONAL (previsto). O previsto padrão segue
--       DERIVADO LINEARMENTE das datas de plano da obra, então a curva é
--       exibível SEM digitar nada; a baseline só refina a fidelidade.
--   (b) fixa a semântica no schema (acaba com "acumulado vs incremental");
--   (c) valida faixas (CHECK) e garante 1 medição por (obra, mês).
-- IDEMPOTENTE (medicoes está vazia hoje → sem risco). Rode após 001..010.
-- ============================================================

-- 1) Baseline (previsto) opcional + metadados. IF NOT EXISTS = idempotente.
ALTER TABLE orcamento.medicoes ADD COLUMN IF NOT EXISTS avanco_plan_pct numeric(6,2);
ALTER TABLE orcamento.medicoes ADD COLUMN IF NOT EXISTS desembolso_plan numeric(16,2);
ALTER TABLE orcamento.medicoes ADD COLUMN IF NOT EXISTS observacao      text;
ALTER TABLE orcamento.medicoes ADD COLUMN IF NOT EXISTS criado_por      text;
ALTER TABLE orcamento.medicoes ADD COLUMN IF NOT EXISTS created_at      timestamptz NOT NULL DEFAULT now();
ALTER TABLE orcamento.medicoes ADD COLUMN IF NOT EXISTS updated_at      timestamptz NOT NULL DEFAULT now();

-- 2) Semântica EXPLÍCITA gravada no schema.
COMMENT ON COLUMN orcamento.medicoes.avanco_fisico_pct IS 'REALIZADO: avanco fisico ACUMULADO ao fim da competencia (0..100).';
COMMENT ON COLUMN orcamento.medicoes.avanco_plan_pct   IS 'PREVISTO (linha de base): avanco fisico ACUMULADO ao fim da competencia (0..100).';
COMMENT ON COLUMN orcamento.medicoes.desembolso        IS 'REALIZADO: desembolso INCREMENTAL do mes (R$, nao acumulado).';
COMMENT ON COLUMN orcamento.medicoes.desembolso_plan   IS 'PREVISTO (linha de base): desembolso INCREMENTAL do mes (R$).';

-- 3) Normaliza competências ao 1º dia do mês (bucket mensal). Re-rodar = no-op.
UPDATE orcamento.medicoes
   SET competencia = date_trunc('month', competencia)::date
 WHERE competencia <> date_trunc('month', competencia)::date;

-- 4) Faixas válidas (0..100 no físico; monetários >= 0). Idempotente via duplicate_object.
DO $$ BEGIN
  ALTER TABLE orcamento.medicoes ADD CONSTRAINT medicoes_faixas_chk CHECK (
    (avanco_fisico_pct IS NULL OR (avanco_fisico_pct >= 0 AND avanco_fisico_pct <= 100)) AND
    (avanco_plan_pct   IS NULL OR (avanco_plan_pct   >= 0 AND avanco_plan_pct   <= 100)) AND
    (desembolso        IS NULL OR desembolso      >= 0) AND
    (desembolso_plan   IS NULL OR desembolso_plan >= 0)
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 5) Desambigua duplicatas legadas (obra_id, competencia) antes do índice: mantém a de maior avanço.
WITH numeradas AS (
  SELECT id, row_number() OVER (
           PARTITION BY obra_id, competencia
           ORDER BY avanco_fisico_pct DESC NULLS LAST, id) AS rn
  FROM orcamento.medicoes
)
DELETE FROM orcamento.medicoes m USING numeradas n
 WHERE m.id = n.id AND n.rn > 1;

-- 6) 1 medição por (obra, mês): POST duplicado vira 23505 → 409 e protege o acumulado.
CREATE UNIQUE INDEX IF NOT EXISTS medicoes_obra_competencia_uk
  ON orcamento.medicoes (obra_id, competencia);
-- medicoes_obra_idx (001) fica redundante (obra_id é coluna líder do índice acima), mas é
-- MANTIDO de propósito: dropá-lo aqui seria risco sem ganho.
-- ============================================================
