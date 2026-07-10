-- ============================================================
-- Migration 010 — UNIQUE(nome, tipo) em categorias_custo
-- Paridade com os outros cadastros (tipos_obra.nome, padroes.nome e
-- localidades(municipio,uf) já são UNIQUE): impede categorias duplicadas.
-- Com a constraint, um POST duplicado dispara 23505 → 409 (handler global).
-- Antes de criar o índice, desambigua duplicatas legadas (sem apagar linhas).
-- Idempotente. Rode após 001..009.
-- ============================================================

-- 1) Desambigua (nome,tipo) repetidos: mantém a 1ª ocorrência; as extras recebem
--    sufixo "-DUP-<id>" no nome (id único → sem colisão). Re-rodar é no-op.
WITH numeradas AS (
  SELECT id, row_number() OVER (PARTITION BY nome, tipo ORDER BY id) AS rn
  FROM orcamento.categorias_custo
)
UPDATE orcamento.categorias_custo c
   SET nome = c.nome || '-DUP-' || c.id
  FROM numeradas n
 WHERE c.id = n.id AND n.rn > 1;

-- 2) Índice único (idempotente).
CREATE UNIQUE INDEX IF NOT EXISTS categorias_custo_nome_tipo_uk ON orcamento.categorias_custo (nome, tipo);
