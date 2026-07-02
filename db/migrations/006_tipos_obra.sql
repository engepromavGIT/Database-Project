-- ============================================================
-- Migration 006 — Tipos de obra mais específicos + reclassificação
-- Cria Pavimentação, Urbanização e Edificação e reclassifica as obras
-- já carregadas por palavra-chave no nome. Melhora a similaridade do
-- estimador (não mistura praça com pavimentação).
-- Isolado em orcamento; idempotente. Rode após 001..005.
-- ============================================================

INSERT INTO orcamento.tipos_obra (id, nome) VALUES
  ('tobra_pavimentacao', 'Pavimentação'),
  ('tobra_urbanizacao',  'Urbanização'),
  ('tobra_edificacao',   'Edificação')
ON CONFLICT (id) DO NOTHING;

-- Reclassifica as obras existentes (idempotente).
UPDATE orcamento.obras SET tipo_obra_id = (SELECT id FROM orcamento.tipos_obra WHERE nome = 'Pavimentação')
  WHERE lower(nome) LIKE '%pavimenta%' OR lower(nome) LIKE '%pedra tosca%';

UPDATE orcamento.obras SET tipo_obra_id = (SELECT id FROM orcamento.tipos_obra WHERE nome = 'Urbanização')
  WHERE (lower(nome) LIKE '%praça%' OR lower(nome) LIKE '%praca%' OR lower(nome) LIKE '%urbaniz%')
    AND lower(nome) NOT LIKE '%pavimenta%';
