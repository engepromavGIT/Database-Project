-- ============================================================
-- Migration 002 — Seeds de referência (schema orcamento)
-- Idempotente: pode rodar várias vezes (ON CONFLICT DO NOTHING).
-- Só insere dados nas tabelas novas de 'orcamento'. Não toca em public.*.
-- Rode na MESMA branch de dev do Neon, após a 001.
-- ============================================================

BEGIN;

-- ---------- Categorias de custo ----------
INSERT INTO orcamento.categorias_custo (id, nome, tipo) VALUES
  ('cat_material', 'Material',     'material'),
  ('cat_mao_obra', 'Mão de obra',  'mao_de_obra'),
  ('cat_equip',    'Equipamento',  'equipamento'),
  ('cat_terc',     'Terceiros',    'terceiros'),
  ('cat_indireto', 'Indiretos',    'indireto')
ON CONFLICT (id) DO NOTHING;

-- ---------- Tipos de obra ----------
INSERT INTO orcamento.tipos_obra (id, nome) VALUES
  ('tobra_residencial',   'Residencial'),
  ('tobra_comercial',     'Comercial'),
  ('tobra_industrial',    'Industrial'),
  ('tobra_reforma',       'Reforma'),
  ('tobra_infraestrutura','Infraestrutura')
ON CONFLICT (id) DO NOTHING;

-- ---------- Padrões de acabamento ----------
INSERT INTO orcamento.padroes_acabamento (id, nome) VALUES
  ('pad_popular', 'Popular'),
  ('pad_normal',  'Normal'),
  ('pad_alto',    'Alto')
ON CONFLICT (id) DO NOTHING;

-- ---------- Localidades (EXEMPLOS — ajuste para as cidades reais da PROMAV) ----------
INSERT INTO orcamento.localidades (id, municipio, uf, fator_regional) VALUES
  ('loc_sp_sp', 'São Paulo',      'SP', 1.0000),
  ('loc_rj_rj', 'Rio de Janeiro', 'RJ', 1.0000),
  ('loc_mg_bh', 'Belo Horizonte', 'MG', 1.0000)
ON CONFLICT (id) DO NOTHING;

-- ---------- Serviços de referência (EXEMPLOS) ----------
-- codigo_sinapi deixado NULL: preencher com o código oficial da tabela SINAPI/SICRO.
INSERT INTO orcamento.servicos_ref (id, codigo_sinapi, descricao, unidade, categoria_id, ativo) VALUES
  ('srv_concreto',  NULL, 'Concreto usinado fck 25 MPa - lançamento', 'm³', 'cat_material', true),
  ('srv_aco',       NULL, 'Armação em aço CA-50',                     'kg', 'cat_material', true),
  ('srv_forma',     NULL, 'Forma de madeira para estrutura',          'm²', 'cat_material', true),
  ('srv_alvenaria', NULL, 'Alvenaria de bloco cerâmico',              'm²', 'cat_material', true),
  ('srv_pintura',   NULL, 'Pintura látex PVA (2 demãos)',             'm²', 'cat_material', true)
ON CONFLICT (id) DO NOTHING;

-- ---------- Índices econômicos ----------
-- ATENÇÃO: VALORES PLACEHOLDER (base 100). SUBSTITUA pela série OFICIAL
-- do SINAPI (edificações) / SICRO (infraestrutura) antes de usar para estimar.
INSERT INTO orcamento.indices_economicos (id, indice, ano, mes, valor) VALUES
  ('idx_sinapi_2024_01', 'SINAPI', 2024,  1, 100.0000),
  ('idx_sinapi_2025_01', 'SINAPI', 2025,  1, 100.0000),
  ('idx_sinapi_2026_01', 'SINAPI', 2026,  1, 100.0000),
  ('idx_sinapi_2026_06', 'SINAPI', 2026,  6, 100.0000)
ON CONFLICT (indice, ano, mes) DO NOTHING;

-- ---------- Parâmetro de BDI/encargos (EXEMPLO — calibrar com a PROMAV) ----------
INSERT INTO orcamento.parametros_bdi (id, tipo_obra_id, bdi_pct, encargos_pct, vigencia_inicio, vigencia_fim) VALUES
  ('bdi_default', NULL, 25.00, 0.00, DATE '2024-01-01', NULL)
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- ============================================================
-- Fim dos seeds (002).
-- Próximo: carregar a série oficial de índices e as localidades reais.
-- ============================================================
