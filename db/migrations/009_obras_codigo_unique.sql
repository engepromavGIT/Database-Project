-- ============================================================
-- Migration 009 — UNIQUE em obras.codigo
-- Garante no banco a unicidade do código da obra. A aplicação já barra duplicatas
-- (POST/PUT retornam 409), mas faltava a garantia física — esta é a defesa final.
-- Antes de criar o índice único, desambigua códigos repetidos pré-existentes
-- (ex.: importações antigas) renomeando as ocorrências EXTRAS, sem apagar obras.
-- Idempotente. Rode após 001..008.
-- ============================================================

-- 1) Desambigua duplicatas: mantém a 1ª ocorrência (por created_at) com o código
--    original; as demais recebem sufixo "-DUP-<id>". Como o id é único, o novo código
--    é garantidamente único. Após a 1ª execução não há mais duplicatas → re-rodar é no-op.
WITH numeradas AS (
  SELECT id, row_number() OVER (PARTITION BY codigo ORDER BY created_at, id) AS rn
  FROM orcamento.obras
)
UPDATE orcamento.obras o
   SET codigo = o.codigo || '-DUP-' || o.id
  FROM numeradas n
 WHERE o.id = n.id AND n.rn > 1;

-- 2) Índice único (idempotente).
CREATE UNIQUE INDEX IF NOT EXISTS obras_codigo_uk ON orcamento.obras (codigo);
