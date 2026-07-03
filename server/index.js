// ============================================================
// Base de Projetos — backend (Express + Neon/Postgres)
// Módulo do Promav. Tudo é gravado no schema "orcamento"; a
// identidade vem de public.users (SOMENTE LEITURA). Não toca
// em nenhuma tabela do app existente.
// ============================================================
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import * as XLSX from 'xlsx'
import { q } from './db.js'
import { requireAuth, signToken, verifyPassword } from './auth.js'
import { fatorAtualizacao, custoM2, ajusteRegional } from './estimativa/normalizacao.js'
import { escoreSimilaridade } from './estimativa/similaridade.js'
import {
  estimarParametrico, estimarPrazo, estimarPrazoDireto, estimarBottomUp, estatisticaAderencia,
  coefVariacao, nivelConfianca, rotuloConfianca,
} from './estimativa/metodos.js'
import { mapearCabecalho, montarLinha, validarLinha } from './importacao/mapear.js'
import { conciliarLista } from './importacao/conciliar.js'
import { registrarObraDetalhe } from './obraDetalhe.js'

const app = express()

const origins = (process.env.CORS_ORIGIN || '*').split(',').map(s => s.trim()).filter(Boolean)
app.use(cors({ origin: origins.includes('*') ? true : origins }))
app.use(express.json({ limit: '10mb' }))

// API_PORT tem precedência: PORT genérico pode ser injetado por ferramentas de
// preview/hospedagem no processo inteiro (e o Vite já ocupa essa porta em dev).
const PORT = process.env.API_PORT || process.env.PORT || 3001

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.warn('[base-projetos] AVISO: JWT_SECRET não definido em produção.')
}

// ---------- helpers ----------
const genId = (prefix) =>
  `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

const PUBLIC_USER = 'id, name, initials, color, email, is_admin AS "isAdmin"'
const STATUS_OBRA = ['planejada', 'em_andamento', 'concluida', 'cancelada']

const round2 = (v) => (v == null ? null : Math.round(v * 100) / 100)
const roundInt = (v) => (v == null ? null : Math.round(v))
const dataBaseDate = (d) => (d ? (d.length === 7 ? `${d}-01` : d) : null)

function requireApiKey(req, res, next) {
  const key = process.env.INTEGRACAO_API_KEY
  if (!key) return res.status(503).json({ error: 'Integração não configurada (defina INTEGRACAO_API_KEY).' })
  if (req.headers['x-api-key'] !== key) return res.status(401).json({ error: 'API key inválida.' })
  next()
}

async function serieIndice(indice = 'SINAPI') {
  const rows = await q('SELECT ano, mes, valor FROM orcamento.indices_economicos WHERE indice = $1', [indice])
  const m = {}
  for (const r of rows) m[`${r.ano}-${String(r.mes).padStart(2, '0')}`] = Number(r.valor)
  return m
}

const PADRAO_ORDEM = { popular: 0, normal: 1, alto: 2 }
const ordemPadrao = (nome) => (nome ? (PADRAO_ORDEM[nome.toLowerCase()] ?? null) : null)

async function montarAlvo(body = {}) {
  const {
    tipoObraId = null, padraoId = null, localidadeId = null,
    areaAlvoM2 = null, dataBase = null, indice = 'SINAPI',
  } = body
  let padraoNome = null, uf = null, fatorRegionalAlvo = 1
  if (padraoId) {
    const [p] = await q('SELECT nome FROM orcamento.padroes_acabamento WHERE id = $1', [padraoId])
    padraoNome = p ? p.nome : null
  }
  if (localidadeId) {
    const [l] = await q('SELECT uf, fator_regional AS "fatorRegional" FROM orcamento.localidades WHERE id = $1', [localidadeId])
    if (l) { uf = l.uf; fatorRegionalAlvo = Number(l.fatorRegional) || 1 }
  }
  return {
    tipoObraId, padraoId, localidadeId,
    areaAlvoM2: areaAlvoM2 != null ? Number(areaAlvoM2) : null,
    dataBase, indice, padraoNome, uf, fatorRegionalAlvo,
  }
}

// Resolve o cenário (grupo) e a próxima versão.
async function resolverGrupo(grupoIn) {
  if (grupoIn) {
    const [mx] = await q('SELECT max(versao) AS v FROM orcamento.estimativas WHERE grupo = $1', [grupoIn])
    return { grupo: grupoIn, versao: (Number(mx?.v) || 0) + 1 }
  }
  return { grupo: genId('grp'), versao: 1 }
}

const CAND = `
  SELECT o.id, o.codigo, o.nome,
         o.tipo_obra_id AS "tipoObraId", o.padrao_id AS "padraoId", o.localidade_id AS "localidadeId",
         o.area_construida_m2 AS "areaConstruidaM2",
         COALESCE(NULLIF(o.custo_real_total, 0), o.custo_orcado_total) AS "custoRealTotal",
         to_char(o.data_base_custo, 'YYYY-MM') AS "dataBaseCusto",
         (o.dt_fim_real - o.dt_inicio_real) AS "prazoRealDias",
         loc.uf AS uf, loc.fator_regional AS "fatorRegional",
         pad.nome AS "padraoNome"
  FROM orcamento.obras o
  LEFT JOIN orcamento.localidades loc ON loc.id = o.localidade_id
  LEFT JOIN orcamento.padroes_acabamento pad ON pad.id = o.padrao_id
  WHERE o.elegivel_referencia = true AND o.area_construida_m2 > 0
        AND COALESCE(NULLIF(o.custo_real_total, 0), o.custo_orcado_total) > 0`

async function calcularAnalogas(alvo) {
  const serie = await serieIndice(alvo.indice || 'SINAPI')
  const cands = await q(CAND)
  const anoAlvo = Number((alvo.dataBase || '').slice(0, 4)) || new Date().getFullYear()
  const alvoSim = {
    tipoObraId: alvo.tipoObraId, padraoId: alvo.padraoId, padraoOrdem: ordemPadrao(alvo.padraoNome),
    areaAlvoM2: alvo.areaAlvoM2, localidadeId: alvo.localidadeId, uf: alvo.uf,
  }
  const out = cands.map((o) => {
    const fator = fatorAtualizacao(serie, o.dataBaseCusto, alvo.dataBase)
    const f = fator == null ? 1 : fator
    const custoAtualizado = ajusteRegional(Number(o.custoRealTotal) * f, o.fatorRegional, alvo.fatorRegionalAlvo)
    const cm2 = custoM2(custoAtualizado, Number(o.areaConstruidaM2))
    const anoObra = Number((o.dataBaseCusto || '').slice(0, 4)) || anoAlvo
    const recencia = Math.max(0, 1 - Math.max(0, anoAlvo - anoObra) / 10)
    const escore = escoreSimilaridade(alvoSim, {
      tipoObraId: o.tipoObraId, padraoId: o.padraoId, padraoOrdem: ordemPadrao(o.padraoNome),
      areaConstruidaM2: Number(o.areaConstruidaM2), localidadeId: o.localidadeId, uf: o.uf, recencia,
    })
    const diasM2 = o.prazoRealDias != null && o.areaConstruidaM2 > 0
      ? Number(o.prazoRealDias) / Number(o.areaConstruidaM2) : null
    return {
      id: o.id, codigo: o.codigo, nome: o.nome, tipoObraId: o.tipoObraId, padrao: o.padraoNome,
      areaConstruidaM2: Number(o.areaConstruidaM2),
      custoAtualizado: round2(custoAtualizado), custoM2: round2(cm2),
      prazoRealDias: o.prazoRealDias != null ? Number(o.prazoRealDias) : null,
      diasM2, escore: Math.round(escore * 10000) / 10000, semIndice: fator == null,
    }
  })
  out.sort((a, b) => b.escore - a.escore)
  return out
}

async function aderenciaHistorica(tipoObraId) {
  const base = `SELECT (custo_real_total::float / NULLIF(custo_orcado_total, 0)) AS r
                FROM orcamento.obras
                WHERE elegivel_referencia = true AND custo_orcado_total > 0 AND custo_real_total > 0`
  const rows = tipoObraId ? await q(`${base} AND tipo_obra_id = $1`, [tipoObraId]) : await q(base)
  return estatisticaAderencia(rows.map((x) => Number(x.r)))
}

async function prazoHistorico(tipoObraId, areaAlvo) {
  const base = `SELECT (dt_fim_real - dt_inicio_real) AS dias, area_construida_m2 AS area
                FROM orcamento.obras
                WHERE elegivel_referencia = true AND dt_inicio_real IS NOT NULL AND dt_fim_real IS NOT NULL`
  const rows = tipoObraId ? await q(`${base} AND tipo_obra_id = $1`, [tipoObraId]) : await q(base)
  const valid = rows.map((r) => ({ dias: Number(r.dias), area: Number(r.area) })).filter((r) => r.dias > 0)
  if (!valid.length) return { O: null, M: null, P: null, esperado: null }
  if (areaAlvo > 0) {
    const itens = valid.filter((r) => r.area > 0).map((r) => ({ valor: r.dias / r.area, peso: 1 }))
    if (itens.length) return estimarPrazo(itens, areaAlvo)
  }
  return estimarPrazoDireto(valid.map((r) => r.dias))
}

// ============================================================
// Saúde
// ============================================================
app.get('/api/health', wrap(async (_req, res) => {
  const [{ now }] = await q('SELECT now()')
  res.json({ ok: true, now })
}))

// ============================================================
// Autenticação (público)
// ============================================================
app.post('/api/auth/login', wrap(async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) return res.status(400).json({ error: 'Informe email e senha.' })
  const [row] = await q(
    'SELECT id, name, initials, color, email, is_admin AS "isAdmin", password_hash FROM public.users WHERE lower(email) = lower($1)',
    [email],
  )
  if (!row || !(await verifyPassword(password, row.password_hash))) {
    return res.status(401).json({ error: 'Email ou senha incorretos.' })
  }
  const { password_hash, ...user } = row
  res.json({ token: signToken(user), user })
}))

app.get('/api/auth/me', requireAuth, wrap(async (req, res) => {
  const [user] = await q(`SELECT ${PUBLIC_USER} FROM public.users WHERE id = $1`, [req.userId])
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' })
  res.json(user)
}))

// ============================================================
// RF-H03 — Integração comercial (API key, antes do gate de usuário)
// ============================================================
app.get('/api/integracao/estimativas', requireApiKey, wrap(async (_req, res) => {
  res.json(await q(`
    SELECT id, descricao, custo_provavel AS "custoProvavel", metodo,
           to_char(criado_em, 'YYYY-MM-DD') AS "geradoEm"
    FROM orcamento.estimativas ORDER BY criado_em DESC LIMIT 100`))
}))

app.get('/api/integracao/estimativas/:id', requireApiKey, wrap(async (req, res) => {
  const [e] = await q(`
    SELECT id, descricao, metodo, to_char(data_base, 'YYYY-MM-DD') AS "dataBase", area_alvo_m2 AS "areaAlvoM2",
           custo_otimista AS "custoOtimista", custo_provavel AS "custoProvavel", custo_pessimista AS "custoPessimista",
           prazo_provavel_dias AS "prazoProvavelDias", nivel_confianca_pct AS "nivelConfianca",
           to_char(criado_em, 'YYYY-MM-DD') AS "geradoEm"
    FROM orcamento.estimativas WHERE id = $1`, [req.params.id])
  if (!e) return res.status(404).json({ error: 'Estimativa não encontrada.' })
  res.json({
    id: e.id, descricao: e.descricao, metodo: e.metodo, dataBase: e.dataBase, areaAlvoM2: e.areaAlvoM2,
    custoReferencia: { otimista: e.custoOtimista, provavel: e.custoProvavel, pessimista: e.custoPessimista },
    prazoProvavelDias: e.prazoProvavelDias, nivelConfianca: e.nivelConfianca, geradoEm: e.geradoEm,
    observacao: 'Custo de referência (sem BDI). O preço final é responsabilidade do processo comercial.',
  })
}))

// A partir daqui, tudo exige autenticação de usuário (JWT).
app.use('/api', requireAuth)

// ============================================================
// Cadastros de referência
// ============================================================
app.get('/api/tipos-obra', wrap(async (_req, res) => {
  res.json(await q('SELECT id, nome FROM orcamento.tipos_obra ORDER BY nome'))
}))
app.get('/api/padroes', wrap(async (_req, res) => {
  res.json(await q('SELECT id, nome FROM orcamento.padroes_acabamento ORDER BY nome'))
}))
app.get('/api/categorias', wrap(async (_req, res) => {
  res.json(await q('SELECT id, nome, tipo FROM orcamento.categorias_custo ORDER BY nome'))
}))
app.get('/api/localidades', wrap(async (_req, res) => {
  res.json(await q('SELECT id, municipio, uf, fator_regional AS "fatorRegional" FROM orcamento.localidades ORDER BY uf, municipio'))
}))
app.get('/api/servicos', wrap(async (_req, res) => {
  res.json(await q('SELECT id, codigo_sinapi AS "codigoSinapi", descricao, unidade, categoria_id AS "categoriaId" FROM orcamento.servicos_ref WHERE ativo = true ORDER BY descricao'))
}))

// ============================================================
// Obras (acervo)
// ============================================================
const OBRA_LIST = `
  SELECT o.id, o.codigo, o.nome,
         o.area_construida_m2 AS "areaConstruidaM2",
         to_char(o.dt_inicio_real, 'YYYY-MM-DD') AS "dtInicioReal",
         to_char(o.dt_fim_real,    'YYYY-MM-DD') AS "dtFimReal",
         o.custo_orcado_total AS "custoOrcadoTotal",
         o.custo_real_total   AS "custoRealTotal",
         o.status,
         o.elegivel_referencia AS "elegivelReferencia",
         t.nome AS "tipoObra",
         p.nome AS "padrao"
  FROM orcamento.obras o
  LEFT JOIN orcamento.tipos_obra        t ON t.id = o.tipo_obra_id
  LEFT JOIN orcamento.padroes_acabamento p ON p.id = o.padrao_id`

app.get('/api/obras', wrap(async (_req, res) => {
  res.json(await q(`${OBRA_LIST} ORDER BY o.created_at DESC`))
}))

app.get('/api/obras/:id', wrap(async (req, res) => {
  const [obra] = await q(`${OBRA_LIST} WHERE o.id = $1`, [req.params.id])
  if (!obra) return res.status(404).json({ error: 'Obra não encontrada.' })
  res.json(obra)
}))

app.post('/api/obras', wrap(async (req, res) => {
  const {
    codigo, nome, tipoObraId = null, padraoId = null, localidadeId = null,
    areaConstruidaM2 = null, dtInicioReal = null, dtFimReal = null,
    dataBaseCusto = null, status = 'concluida', elegivelReferencia = false,
    custoRealTotal = null, custoOrcadoTotal = null,
  } = req.body || {}

  if (!codigo || !nome) return res.status(400).json({ error: 'Informe ao menos código e nome da obra.' })
  if (!STATUS_OBRA.includes(status)) return res.status(400).json({ error: 'Status inválido.' })

  const id = genId('obra')
  await q(
    `INSERT INTO orcamento.obras
       (id, codigo, nome, tipo_obra_id, padrao_id, localidade_id, area_construida_m2,
        dt_inicio_real, dt_fim_real, data_base_custo, status, elegivel_referencia,
        custo_real_total, custo_orcado_total, fonte_dado, criado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'manual',$15)`,
    [id, codigo, nome, tipoObraId, padraoId, localidadeId, areaConstruidaM2,
      dtInicioReal, dtFimReal, dataBaseDate(dataBaseCusto), status, !!elegivelReferencia,
      custoRealTotal, custoOrcadoTotal, req.userId],
  )
  const [obra] = await q(`${OBRA_LIST} WHERE o.id = $1`, [id])
  res.status(201).json(obra)
}))

// ============================================================
// Indicadores e RF-G — Dashboard
// ============================================================
app.get('/api/indicadores', wrap(async (_req, res) => {
  res.json(await q(`
    SELECT id, codigo, nome,
           area_construida_m2 AS "areaConstruidaM2",
           custo_m2_real      AS "custoM2Real",
           fator_desvio_custo AS "fatorDesvioCusto",
           prazo_real_dias    AS "prazoRealDias",
           prazo_plan_dias    AS "prazoPlanDias"
    FROM orcamento.vw_obra_indicadores
    ORDER BY custo_m2_real DESC NULLS LAST`))
}))

app.get('/api/dashboard', wrap(async (_req, res) => {
  const [obras] = await q('SELECT count(*)::int AS total, count(*) FILTER (WHERE elegivel_referencia)::int AS elegiveis FROM orcamento.obras')
  const [geral] = await q(`
    SELECT round(avg(custo_m2_real)::numeric, 2) AS "custoM2Medio",
           round(avg(fator_desvio_custo)::numeric, 4) AS "desvioCustoMedio",
           round(avg(prazo_real_dias)::numeric, 0) AS "prazoMedioDias"
    FROM orcamento.vw_obra_indicadores`)
  const porTipo = await q(`
    SELECT t.nome AS tipo, count(o.id)::int AS n,
           round(avg(v.custo_m2_real)::numeric, 2) AS "custoM2Medio",
           round(avg(v.fator_desvio_custo)::numeric, 4) AS "desvioCustoMedio"
    FROM orcamento.obras o
    JOIN orcamento.tipos_obra t ON t.id = o.tipo_obra_id
    LEFT JOIN orcamento.vw_obra_indicadores v ON v.id = o.id
    GROUP BY t.nome ORDER BY n DESC`)
  const [estimativas] = await q(`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE custo_realizado IS NOT NULL)::int AS calibradas,
           round(avg(abs(erro_pct)) FILTER (WHERE erro_pct IS NOT NULL)::numeric, 1) AS "erroMedioAbs"
    FROM orcamento.estimativas`)
  res.json({ obras, geral, porTipo, estimativas })
}))

// ============================================================
// RF-E03 — Comparação lado a lado
// ============================================================
app.post('/api/comparar', wrap(async (req, res) => {
  const { obraIds } = req.body || {}
  if (!Array.isArray(obraIds) || !obraIds.length) return res.status(400).json({ error: 'Selecione ao menos uma obra.' })
  const rows = await q(`
    SELECT o.id, o.codigo, o.nome, t.nome AS "tipoObra", p.nome AS padrao,
           o.area_construida_m2 AS "areaConstruidaM2",
           o.custo_orcado_total AS "custoOrcadoTotal", o.custo_real_total AS "custoRealTotal",
           v.custo_m2_real AS "custoM2Real", v.fator_desvio_custo AS "fatorDesvioCusto",
           v.prazo_real_dias AS "prazoRealDias", v.prazo_plan_dias AS "prazoPlanDias"
    FROM orcamento.obras o
    LEFT JOIN orcamento.tipos_obra t ON t.id = o.tipo_obra_id
    LEFT JOIN orcamento.padroes_acabamento p ON p.id = o.padrao_id
    LEFT JOIN orcamento.vw_obra_indicadores v ON v.id = o.id
    WHERE o.id = ANY($1::text[])`, [obraIds])
  res.json(rows)
}))

// ============================================================
// RF-C03 — Conciliação de serviços com SINAPI
// ============================================================
app.post('/api/conciliar', wrap(async (req, res) => {
  const itens = Array.isArray(req.body?.itens) ? req.body.itens : []
  const catalogo = await q('SELECT id, codigo_sinapi AS "codigoSinapi", descricao, unidade FROM orcamento.servicos_ref WHERE ativo = true')
  res.json(conciliarLista(itens, catalogo))
}))

// ============================================================
// E5 — Busca de obras análogas
// ============================================================
app.post('/api/analogas', wrap(async (req, res) => {
  const alvo = await montarAlvo(req.body)
  const analogas = await calcularAnalogas(alvo)
  const limite = Number(req.body?.limite) || 10
  res.json({ alvo, total: analogas.length, analogas: analogas.slice(0, limite) })
}))

// ============================================================
// E6 — Motor de estimativa (paramétrica e bottom-up) com versão/cenário
// ============================================================
app.post('/api/estimativas', wrap(async (req, res) => {
  const { descricao, metodo = 'parametrica', bdiPct = 0 } = req.body || {}
  if (!descricao) return res.status(400).json({ error: 'Informe a descrição da estimativa.' })
  const alvo = await montarAlvo(req.body)
  const { grupo, versao } = await resolverGrupo(req.body?.grupo || null)

  // ----- Bottom-up por EAP -----
  if (metodo === 'bottom_up') {
    const itens = (Array.isArray(req.body?.itens) ? req.body.itens : [])
      .map((i) => ({
        servicoRefId: i.servicoRefId || null, descricao: i.descricao || null, unidade: i.unidade || null,
        categoriaId: i.categoriaId || null,
        quantidade: Number(i.quantidade) || 0, custoUnitario: Number(i.custoUnitario) || 0,
      }))
      .filter((i) => i.quantidade > 0 && i.custoUnitario > 0)
    if (!itens.length) return res.status(400).json({ error: 'Informe ao menos um item com quantidade e custo unitário.' })

    const custoDireto = itens.reduce((s, i) => s + i.quantidade * i.custoUnitario, 0)
    const ad = await aderenciaHistorica(alvo.tipoObraId)
    const bu = estimarBottomUp(custoDireto, ad.fator, ad.desvio)
    const prazo = await prazoHistorico(alvo.tipoObraId, alvo.areaAlvoM2)

    const id = genId('est')
    await q(
      `INSERT INTO orcamento.estimativas
         (id, descricao, tipo_obra_id, padrao_id, localidade_id, area_alvo_m2, data_base, metodo,
          custo_otimista, custo_provavel, custo_pessimista,
          prazo_otimista_dias, prazo_provavel_dias, prazo_pessimista_dias, grupo, versao, criado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'bottom_up',$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [id, descricao, alvo.tipoObraId, alvo.padraoId, alvo.localidadeId, alvo.areaAlvoM2, dataBaseDate(alvo.dataBase),
        round2(bu.O), round2(bu.esperado), round2(bu.P),
        roundInt(prazo.O), roundInt(prazo.esperado), roundInt(prazo.P), grupo, versao, req.userId],
    )
    for (const it of itens) {
      await q(
        `INSERT INTO orcamento.estimativa_itens (id, estimativa_id, servico_ref_id, descricao, unidade, quantidade, custo_unitario, categoria_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [genId('eit'), id, it.servicoRefId, it.descricao, it.unidade, it.quantidade, it.custoUnitario, it.categoriaId],
      )
    }
    const preco = bu.esperado != null ? round2(bu.esperado * (1 + (Number(bdiPct) || 0) / 100)) : null
    return res.status(201).json({
      id, descricao, metodo: 'bottom_up', alvo, grupo, versao,
      custoDireto: round2(custoDireto),
      aderencia: { fator: round2(ad.fator), desvio: round2(ad.desvio), n: ad.n },
      custo: { O: round2(bu.O), M: round2(bu.M), P: round2(bu.P), esperado: round2(bu.esperado) },
      prazo: { O: roundInt(prazo.O), M: roundInt(prazo.M), P: roundInt(prazo.P), esperado: roundInt(prazo.esperado) },
      bdiPct: Number(bdiPct) || 0, preco, itens,
    })
  }

  // ----- Paramétrica (análogas) -----
  const { obraIds } = req.body || {}
  if (!(alvo.areaAlvoM2 > 0)) return res.status(400).json({ error: 'Informe a área-alvo (m²).' })
  let analogas = await calcularAnalogas(alvo)
  analogas = Array.isArray(obraIds) && obraIds.length
    ? analogas.filter((a) => obraIds.includes(a.id))
    : analogas.slice(0, 5)
  if (!analogas.length) return res.status(400).json({ error: 'Nenhuma obra análoga elegível encontrada.' })

  const custo = estimarParametrico(analogas.map((a) => ({ custoM2: a.custoM2, peso: a.escore })), alvo.areaAlvoM2)
  const prazo = estimarPrazo(analogas.map((a) => ({ valor: a.diasM2, peso: a.escore })), alvo.areaAlvoM2)
  const simMedia = analogas.reduce((s, a) => s + a.escore, 0) / analogas.length
  const conf = nivelConfianca({ n: analogas.length, coefVar: coefVariacao(analogas.map((a) => a.custoM2)), simMedia })

  const id = genId('est')
  await q(
    `INSERT INTO orcamento.estimativas
       (id, descricao, tipo_obra_id, padrao_id, localidade_id, area_alvo_m2, data_base, metodo,
        custo_otimista, custo_provavel, custo_pessimista,
        prazo_otimista_dias, prazo_provavel_dias, prazo_pessimista_dias,
        nivel_confianca_pct, grupo, versao, criado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
    [id, descricao, alvo.tipoObraId, alvo.padraoId, alvo.localidadeId, alvo.areaAlvoM2, dataBaseDate(alvo.dataBase), metodo,
      round2(custo.O), round2(custo.esperado), round2(custo.P),
      roundInt(prazo.O), roundInt(prazo.esperado), roundInt(prazo.P),
      conf, grupo, versao, req.userId],
  )
  for (const a of analogas) {
    await q(
      `INSERT INTO orcamento.estimativa_referencias (id, estimativa_id, obra_id, peso_similaridade)
       VALUES ($1,$2,$3,$4) ON CONFLICT (estimativa_id, obra_id) DO NOTHING`,
      [genId('eref'), id, a.id, a.escore],
    )
  }
  const preco = custo.esperado != null ? round2(custo.esperado * (1 + (Number(bdiPct) || 0) / 100)) : null
  res.status(201).json({
    id, descricao, metodo, alvo, grupo, versao,
    custo: { O: round2(custo.O), M: round2(custo.M), P: round2(custo.P), esperado: round2(custo.esperado) },
    prazo: { O: roundInt(prazo.O), M: roundInt(prazo.M), P: roundInt(prazo.P), esperado: roundInt(prazo.esperado) },
    nivelConfianca: conf, rotulo: rotuloConfianca(conf), bdiPct: Number(bdiPct) || 0, preco,
    analogas,
  })
}))

app.get('/api/estimativas', wrap(async (_req, res) => {
  res.json(await q(`
    SELECT id, descricao, metodo, grupo, versao, area_alvo_m2 AS "areaAlvoM2",
           custo_otimista AS "custoOtimista", custo_provavel AS "custoProvavel", custo_pessimista AS "custoPessimista",
           prazo_provavel_dias AS "prazoProvavelDias", nivel_confianca_pct AS "nivelConfianca",
           to_char(criado_em, 'YYYY-MM-DD') AS "criadoEm",
           custo_realizado AS "custoRealizado", erro_pct AS "erroPct"
    FROM orcamento.estimativas ORDER BY criado_em DESC`))
}))

// Cenários: agrupa versões por 'grupo'.
app.get('/api/cenarios', wrap(async (_req, res) => {
  res.json(await q(`
    SELECT grupo, count(*)::int AS versoes, max(versao) AS "ultimaVersao",
           (array_agg(descricao ORDER BY versao DESC))[1] AS descricao,
           (array_agg(custo_provavel ORDER BY versao DESC))[1] AS "custoProvavel",
           to_char(max(criado_em), 'YYYY-MM-DD') AS "atualizadoEm"
    FROM orcamento.estimativas WHERE grupo IS NOT NULL
    GROUP BY grupo ORDER BY max(criado_em) DESC`))
}))

app.get('/api/cenarios/:grupo', wrap(async (req, res) => {
  res.json(await q(`
    SELECT id, versao, descricao, metodo, area_alvo_m2 AS "areaAlvoM2",
           custo_otimista AS "custoOtimista", custo_provavel AS "custoProvavel", custo_pessimista AS "custoPessimista",
           prazo_provavel_dias AS "prazoProvavelDias", nivel_confianca_pct AS "nivelConfianca",
           to_char(criado_em, 'YYYY-MM-DD') AS "criadoEm", custo_realizado AS "custoRealizado", erro_pct AS "erroPct"
    FROM orcamento.estimativas WHERE grupo = $1 ORDER BY versao`, [req.params.grupo]))
}))

app.get('/api/estimativas/:id', wrap(async (req, res) => {
  const [est] = await q(`
    SELECT id, descricao, metodo, grupo, versao, area_alvo_m2 AS "areaAlvoM2", to_char(data_base, 'YYYY-MM-DD') AS "dataBase",
           custo_otimista AS "custoOtimista", custo_provavel AS "custoProvavel", custo_pessimista AS "custoPessimista",
           prazo_otimista_dias AS "prazoOtimistaDias", prazo_provavel_dias AS "prazoProvavelDias", prazo_pessimista_dias AS "prazoPessimistaDias",
           nivel_confianca_pct AS "nivelConfianca",
           custo_realizado AS "custoRealizado", erro_pct AS "erroPct"
    FROM orcamento.estimativas WHERE id = $1`, [req.params.id])
  if (!est) return res.status(404).json({ error: 'Estimativa não encontrada.' })
  const referencias = await q(`
    SELECT r.obra_id AS "obraId", r.peso_similaridade AS peso, o.codigo, o.nome
    FROM orcamento.estimativa_referencias r JOIN orcamento.obras o ON o.id = r.obra_id
    WHERE r.estimativa_id = $1 ORDER BY r.peso_similaridade DESC`, [req.params.id])
  const itens = await q(`
    SELECT descricao, unidade, quantidade, custo_unitario AS "custoUnitario", custo_total AS "custoTotal"
    FROM orcamento.estimativa_itens WHERE estimativa_id = $1`, [req.params.id])
  res.json({ ...est, referencias, itens })
}))

// RF-G02 — Exporta a estimativa em PDF (pdfkit via import dinâmico).
app.get('/api/estimativas/:id/pdf', wrap(async (req, res) => {
  const [est] = await q(`
    SELECT id, descricao, metodo, versao, area_alvo_m2 AS "areaAlvoM2", to_char(data_base, 'YYYY-MM-DD') AS "dataBase",
           custo_otimista AS o, custo_provavel AS m, custo_pessimista AS p,
           prazo_provavel_dias AS prazo, nivel_confianca_pct AS conf
    FROM orcamento.estimativas WHERE id = $1`, [req.params.id])
  if (!est) return res.status(404).json({ error: 'Estimativa não encontrada.' })
  const refs = await q('SELECT o.codigo, o.nome, r.peso_similaridade AS peso FROM orcamento.estimativa_referencias r JOIN orcamento.obras o ON o.id = r.obra_id WHERE r.estimativa_id = $1 ORDER BY r.peso_similaridade DESC', [req.params.id])
  const itens = await q('SELECT descricao, unidade, quantidade, custo_unitario AS cu, custo_total AS ct FROM orcamento.estimativa_itens WHERE estimativa_id = $1', [req.params.id])

  let PDFDocument
  try { ({ default: PDFDocument } = await import('pdfkit')) }
  catch { return res.status(503).json({ error: 'Geração de PDF indisponível (rode npm install para instalar o pdfkit).' }) }

  const brl = (v) => (v == null ? '—' : `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `inline; filename="estimativa-${est.id}.pdf"`)
  const doc = new PDFDocument({ margin: 50, size: 'A4' })
  doc.pipe(res)

  doc.fontSize(18).text('Estimativa de Custo — PROMAV', { continued: false })
  doc.moveDown(0.3).fontSize(11).fillColor('#555')
    .text(`${est.descricao}  ·  versão ${est.versao}  ·  método ${est.metodo}`)
  doc.fillColor('#000').moveDown(0.8)

  doc.fontSize(12).text('Premissas', { underline: true }).moveDown(0.3).fontSize(10)
  doc.text(`Data-base: ${est.dataBase || '—'}`)
  doc.text(`Área-alvo: ${est.areaAlvoM2 != null ? `${est.areaAlvoM2} m²` : '—'}`)
  doc.text(`Nível de confiança: ${est.conf != null ? `${est.conf}%` : '—'}`)
  doc.moveDown(0.8)

  doc.fontSize(12).text('Resultado', { underline: true }).moveDown(0.3).fontSize(10)
  doc.text(`Custo otimista (O): ${brl(est.o)}`)
  doc.text(`Custo provável (M): ${brl(est.m)}`)
  doc.text(`Custo pessimista (P): ${brl(est.p)}`)
  doc.text(`Prazo provável: ${est.prazo != null ? `${est.prazo} dias` : '—'}`)
  doc.moveDown(0.8)

  if (refs.length) {
    doc.fontSize(12).text('Obras de referência', { underline: true }).moveDown(0.3).fontSize(10)
    refs.forEach((r) => doc.text(`• ${r.codigo} — ${r.nome}  (similaridade ${Math.round((Number(r.peso) || 0) * 100)}%)`))
    doc.moveDown(0.8)
  }
  if (itens.length) {
    doc.fontSize(12).text('Composição (bottom-up)', { underline: true }).moveDown(0.3).fontSize(10)
    itens.forEach((i) => doc.text(`• ${i.descricao || '—'}  ${i.quantidade} ${i.unidade || ''} × ${brl(i.cu)} = ${brl(i.ct)}`))
    doc.moveDown(0.8)
  }

  doc.fontSize(8).fillColor('#888')
    .text('Custo de referência gerado pela Base de Projetos. O preço final (com BDI) é responsabilidade do processo comercial.', { align: 'left' })
  doc.end()
}))

app.post('/api/estimativas/:id/realizado', wrap(async (req, res) => {
  const { custoRealizado } = req.body || {}
  if (custoRealizado == null) return res.status(400).json({ error: 'Informe o custo realizado.' })
  const [est] = await q('SELECT custo_provavel FROM orcamento.estimativas WHERE id = $1', [req.params.id])
  if (!est) return res.status(404).json({ error: 'Estimativa não encontrada.' })
  const prov = Number(est.custo_provavel) || 0
  const erro = prov > 0 ? round2(((Number(custoRealizado) - prov) / prov) * 100) : null
  await q('UPDATE orcamento.estimativas SET custo_realizado = $2, erro_pct = $3 WHERE id = $1',
    [req.params.id, custoRealizado, erro])
  res.json({ id: req.params.id, custoRealizado: Number(custoRealizado), erroPct: erro })
}))

// ============================================================
// E3 — Importação de planilhas (CSV/Excel)
// ============================================================
app.post('/api/importacao/analisar', express.raw({ type: '*/*', limit: '25mb' }), wrap(async (req, res) => {
  if (!req.body || !req.body.length) return res.status(400).json({ error: 'Arquivo vazio.' })
  let wb
  try { wb = XLSX.read(req.body, { type: 'buffer', cellDates: true }) }
  catch { return res.status(400).json({ error: 'Não foi possível ler o arquivo (use CSV ou XLSX).' }) }
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const matriz = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: null })
  if (!matriz.length) return res.status(400).json({ error: 'Planilha sem dados.' })
  const headers = (matriz[0] || []).map((h) => (h == null ? '' : String(h)))
  const linhas = matriz.slice(1).filter((r) => Array.isArray(r) && r.some((c) => c != null && c !== ''))
  const mapa = mapearCabecalho(headers)
  const previa = linhas.slice(0, 10).map((r) => montarLinha(r, mapa))
  res.json({ headers, mapa, totalLinhas: linhas.length, previa, linhas })
}))

app.post('/api/importacao/confirmar', wrap(async (req, res) => {
  const { linhas, mapa } = req.body || {}
  if (!Array.isArray(linhas) || !linhas.length || !mapa) return res.status(400).json({ error: 'Nada para importar.' })
  let inseridas = 0
  const erros = []
  for (let idx = 0; idx < linhas.length; idx++) {
    const l = montarLinha(linhas[idx], mapa)
    const v = validarLinha(l)
    if (!v.ok) { erros.push({ linha: idx + 2, erros: v.erros }); continue }
    const tipoId = l.tipoNome ? (await q('SELECT id FROM orcamento.tipos_obra WHERE lower(nome) = lower($1)', [l.tipoNome]))[0]?.id || null : null
    const padraoId = l.padraoNome ? (await q('SELECT id FROM orcamento.padroes_acabamento WHERE lower(nome) = lower($1)', [l.padraoNome]))[0]?.id || null : null
    let localidadeId = null
    if (l.municipio && l.uf) {
      localidadeId = (await q('SELECT id FROM orcamento.localidades WHERE lower(municipio) = lower($1) AND uf = $2', [l.municipio, l.uf]))[0]?.id || null
    }
    await q(
      `INSERT INTO orcamento.obras
         (id, codigo, nome, tipo_obra_id, padrao_id, localidade_id, area_construida_m2, custo_real_total, custo_orcado_total,
          dt_inicio_real, dt_fim_real, data_base_custo, status, elegivel_referencia, fonte_dado, criado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'concluida',$13,'importado',$14)`,
      [genId('obra'), l.codigo, l.nome, tipoId, padraoId, localidadeId, l.areaConstruidaM2, l.custoRealTotal, l.custoOrcadoTotal,
        l.dtInicioReal, l.dtFimReal, l.dataBaseCusto, l.elegivel, req.userId],
    )
    inseridas++
  }
  res.json({ inseridas, total: linhas.length, erros })
}))

// Detalhamento de obra (EAP, itens, realizados, curva ABC) — RF-B02..B04, RF-D04.
registrarObraDetalhe(app)

// ---------- erro ----------
app.use((err, _req, res, _next) => {
  console.error('[base-projetos] erro na API:', err.message)
  res.status(500).json({ error: err.message })
})

q('SELECT 1 FROM orcamento.obras LIMIT 1')
  .catch(() => console.warn('[base-projetos] schema "orcamento" não encontrado — rode db/migrations/001..004 na sua branch do Neon.'))
  .finally(() => {
    app.listen(PORT, () => console.log(`[base-projetos] API em http://localhost:${PORT}`))
  })
