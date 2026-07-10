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
import { requireAuth, requireAdmin, registrarLog, signToken, verifyPassword } from './auth.js'
import { fatorAtualizacao, atualizarValor, chaveMes, custoM2, ajusteRegional } from './estimativa/normalizacao.js'
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

// Em produção, sem JWT_SECRET o auth.js cairia num fallback público hardcoded
// (qualquer um forjaria tokens). Recusar iniciar em vez de só avisar.
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.error('[base-projetos] FATAL: JWT_SECRET não definido em produção — defina um segredo forte no ambiente.')
  process.exit(1)
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
// Trim seguro: valor não-string vira '' (cai na validação de vazio) em vez de estourar .trim().
const asStr = (v) => (typeof v === 'string' ? v.trim() : '')

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
// RF-B08 / RF-H05 — Trilha de auditoria (consulta restrita a admin)
// ============================================================
app.get('/api/auditoria', requireAdmin, wrap(async (req, res) => {
  const n = Math.floor(Number(req.query.limite))
  const limite = Number.isFinite(n) && n > 0 ? Math.min(n, 500) : 100
  res.json(await q(`
    SELECT l.id, l.entidade, l.entidade_id AS "entidadeId", l.acao,
           to_char(l.data_hora, 'YYYY-MM-DD"T"HH24:MI:SS') AS "dataHora",
           l.usuario_id AS "usuarioId", u.name AS "usuarioNome"
    FROM orcamento.log_auditoria l
    LEFT JOIN public.users u ON u.id = l.usuario_id
    ORDER BY l.data_hora DESC LIMIT $1`, [limite]))
}))

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
// Serviços/composições de referência (RF-A05). Leitura ABERTA (selects de estimativa/itens
// bottom-up e conciliação): default só ativos; ?todos=1 inclui inativos; ?busca= filtra
// descrição/código. Escrita restrita a admin (POST/PUT abaixo). "Excluir" = inativar (PUT
// ativo=false), pois itens_custo/estimativa_itens referenciam o serviço (FK) — como clientes.
app.get('/api/servicos', wrap(async (req, res) => {
  const cond = []
  const params = []
  if (req.query.todos !== '1') cond.push('ativo = true')
  const busca = typeof req.query.busca === 'string' ? req.query.busca.trim() : ''
  if (busca) {
    params.push(`%${busca.replace(/[\\%_]/g, '\\$&')}%`)
    cond.push(`(descricao ILIKE $${params.length} OR codigo_sinapi ILIKE $${params.length})`)
  }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : ''
  res.json(await q(
    `SELECT id, codigo_sinapi AS "codigoSinapi", descricao, unidade, categoria_id AS "categoriaId", ativo
     FROM orcamento.servicos_ref ${where} ORDER BY descricao`, params))
}))

// ----- Clientes (RF-A01 / US-08): CRUD. GET default só ativos; ?todos=1 traz inativos.
// "Excluir" = inativar (PUT ativo=false), pois obras referenciam o cliente (FK).
app.get('/api/clientes', wrap(async (req, res) => {
  const todos = req.query.todos === '1'
  res.json(await q(
    `SELECT id, nome, documento, ativo FROM orcamento.clientes
     ${todos ? '' : 'WHERE ativo = true'} ORDER BY nome`))
}))
app.post('/api/clientes', wrap(async (req, res) => {
  const { nome, documento = null } = req.body || {}
  if (!nome || !nome.trim()) return res.status(400).json({ error: 'Informe o nome do cliente.' })
  const doc = (documento || '').trim() || null
  const id = genId('cli')
  await q('INSERT INTO orcamento.clientes (id, nome, documento, ativo) VALUES ($1,$2,$3,true)',
    [id, nome.trim(), doc])
  await registrarLog(req, 'create', 'cliente', id)
  const [c] = await q('SELECT id, nome, documento, ativo FROM orcamento.clientes WHERE id = $1', [id])
  res.status(201).json(c)
}))
app.put('/api/clientes/:id', wrap(async (req, res) => {
  const { nome, documento = null, ativo } = req.body || {}
  if (!nome || !nome.trim()) return res.status(400).json({ error: 'Informe o nome do cliente.' })
  const doc = (documento || '').trim() || null
  // ativo ausente → preserva o valor atual (não reativa um inativo ao editar metadados).
  const ativoParam = typeof ativo === 'boolean' ? ativo : null
  const upd = await q(
    'UPDATE orcamento.clientes SET nome=$2, documento=$3, ativo=COALESCE($4, ativo) WHERE id=$1 RETURNING id, nome, documento, ativo',
    [req.params.id, nome.trim(), doc, ativoParam])
  if (!upd.length) return res.status(404).json({ error: 'Cliente não encontrado.' })
  await registrarLog(req, 'update', 'cliente', req.params.id)
  res.json(upd[0])
}))

// ----- Cadastros de referência (RF-A02/A03/A04/A08): ESCRITA restrita a admin. -----
// A leitura (GETs acima) é aberta — o front precisa dos selects. DELETE trata FK (registro
// em uso) com 409; nome duplicado cai no 23505 → 409 (handler global). Os nomes de tabela
// abaixo são constantes de confiança (não entrada do usuário), então a interpolação é segura.
function cadastroNome(app, { rota, tabela, entidade, prefixo }) {
  app.post(`/api/${rota}`, requireAdmin, wrap(async (req, res) => {
    const nome = asStr(req.body?.nome)
    if (!nome) return res.status(400).json({ error: 'Informe o nome.' })
    const id = genId(prefixo)
    await q(`INSERT INTO orcamento.${tabela} (id, nome) VALUES ($1, $2)`, [id, nome])
    await registrarLog(req, 'create', entidade, id)
    res.status(201).json({ id, nome })
  }))
  app.put(`/api/${rota}/:id`, requireAdmin, wrap(async (req, res) => {
    const nome = asStr(req.body?.nome)
    if (!nome) return res.status(400).json({ error: 'Informe o nome.' })
    const upd = await q(`UPDATE orcamento.${tabela} SET nome = $2 WHERE id = $1 RETURNING id, nome`, [req.params.id, nome])
    if (!upd.length) return res.status(404).json({ error: 'Registro não encontrado.' })
    await registrarLog(req, 'update', entidade, req.params.id)
    res.json(upd[0])
  }))
  app.delete(`/api/${rota}/:id`, requireAdmin, wrap(async (req, res) => {
    let del
    try { del = await q(`DELETE FROM orcamento.${tabela} WHERE id = $1 RETURNING id`, [req.params.id]) }
    catch (e) { if (e.code === '23503') return res.status(409).json({ error: 'Não é possível excluir: o registro está em uso.' }); throw e }
    if (!del.length) return res.status(404).json({ error: 'Registro não encontrado.' })
    await registrarLog(req, 'delete', entidade, req.params.id)
    res.json({ ok: true })
  }))
}
cadastroNome(app, { rota: 'tipos-obra', tabela: 'tipos_obra', entidade: 'tipo_obra', prefixo: 'tobra' })
cadastroNome(app, { rota: 'padroes', tabela: 'padroes_acabamento', entidade: 'padrao', prefixo: 'padr' })

// Categorias de custo (nome + tipo enum)
const CATEGORIA_TIPOS = ['material', 'mao_de_obra', 'equipamento', 'terceiros', 'indireto']
app.post('/api/categorias', requireAdmin, wrap(async (req, res) => {
  const nome = asStr(req.body?.nome)
  const tipo = req.body?.tipo
  if (!nome) return res.status(400).json({ error: 'Informe o nome.' })
  if (!CATEGORIA_TIPOS.includes(tipo)) return res.status(400).json({ error: 'Tipo de categoria inválido.' })
  const id = genId('cat')
  await q('INSERT INTO orcamento.categorias_custo (id, nome, tipo) VALUES ($1,$2,$3)', [id, nome, tipo])
  await registrarLog(req, 'create', 'categoria', id)
  res.status(201).json({ id, nome, tipo })
}))
app.put('/api/categorias/:id', requireAdmin, wrap(async (req, res) => {
  const nome = asStr(req.body?.nome)
  const tipo = req.body?.tipo
  if (!nome) return res.status(400).json({ error: 'Informe o nome.' })
  if (!CATEGORIA_TIPOS.includes(tipo)) return res.status(400).json({ error: 'Tipo de categoria inválido.' })
  const upd = await q('UPDATE orcamento.categorias_custo SET nome=$2, tipo=$3 WHERE id=$1 RETURNING id, nome, tipo', [req.params.id, nome, tipo])
  if (!upd.length) return res.status(404).json({ error: 'Categoria não encontrada.' })
  await registrarLog(req, 'update', 'categoria', req.params.id)
  res.json(upd[0])
}))
app.delete('/api/categorias/:id', requireAdmin, wrap(async (req, res) => {
  let del
  try { del = await q('DELETE FROM orcamento.categorias_custo WHERE id = $1 RETURNING id', [req.params.id]) }
  catch (e) { if (e.code === '23503') return res.status(409).json({ error: 'Não é possível excluir: a categoria está em uso.' }); throw e }
  if (!del.length) return res.status(404).json({ error: 'Categoria não encontrada.' })
  await registrarLog(req, 'delete', 'categoria', req.params.id)
  res.json({ ok: true })
}))

// Localidades (município + UF + fator regional)
function localidadeCampos(body = {}) {
  const municipio = asStr(body.municipio)
  const uf = asStr(body.uf).toUpperCase()
  const raw = body.fatorRegional
  const fatorRegional = raw == null || raw === '' ? 1 : Number(raw)
  return { municipio, uf, fatorRegional }
}
// UF = 2 letras; fator_regional é numeric(6,4) → faixa aberta (0, 100), senão o INSERT estoura (22003).
const localidadeValida = (c) => c.municipio && /^[A-Z]{2}$/.test(c.uf) && Number.isFinite(c.fatorRegional) && c.fatorRegional > 0 && c.fatorRegional < 100
const ERRO_LOCALIDADE = 'Informe município, UF (2 letras) e fator regional entre 0 e 100.'
app.post('/api/localidades', requireAdmin, wrap(async (req, res) => {
  const c = localidadeCampos(req.body)
  if (!localidadeValida(c)) return res.status(400).json({ error: ERRO_LOCALIDADE })
  const id = genId('loc')
  await q('INSERT INTO orcamento.localidades (id, municipio, uf, fator_regional) VALUES ($1,$2,$3,$4)', [id, c.municipio, c.uf, c.fatorRegional])
  await registrarLog(req, 'create', 'localidade', id)
  res.status(201).json({ id, ...c })
}))
app.put('/api/localidades/:id', requireAdmin, wrap(async (req, res) => {
  const c = localidadeCampos(req.body)
  if (!localidadeValida(c)) return res.status(400).json({ error: ERRO_LOCALIDADE })
  const upd = await q('UPDATE orcamento.localidades SET municipio=$2, uf=$3, fator_regional=$4 WHERE id=$1 RETURNING id, municipio, uf, fator_regional AS "fatorRegional"', [req.params.id, c.municipio, c.uf, c.fatorRegional])
  if (!upd.length) return res.status(404).json({ error: 'Localidade não encontrada.' })
  await registrarLog(req, 'update', 'localidade', req.params.id)
  res.json(upd[0])
}))
app.delete('/api/localidades/:id', requireAdmin, wrap(async (req, res) => {
  let del
  try { del = await q('DELETE FROM orcamento.localidades WHERE id = $1 RETURNING id', [req.params.id]) }
  catch (e) { if (e.code === '23503') return res.status(409).json({ error: 'Não é possível excluir: a localidade está em uso.' }); throw e }
  if (!del.length) return res.status(404).json({ error: 'Localidade não encontrada.' })
  await registrarLog(req, 'delete', 'localidade', req.params.id)
  res.json({ ok: true })
}))

// ----- Índices econômicos (RF-A06): série mensal (SINAPI/SICRO/INCC…) que alimenta a
// atualização monetária (RF-D01) e a estimativa. Leitura aberta (o motor precisa da série);
// escrita restrita a admin. Nada referencia esta tabela por FK, então DELETE não trata 23503.
// A UNIQUE(indice, ano, mes) vira 409; a validação de faixa evita o CHECK do banco (mes 1..12).
function indiceCampos(body = {}) {
  const indice = asStr(body.indice).toUpperCase()
  const ano = Number(body.ano)
  const mes = Number(body.mes)
  const valor = Number(body.valor)
  return { indice, ano, mes, valor }
}
const indiceValido = (c) =>
  !!c.indice &&
  Number.isInteger(c.ano) && c.ano >= 1900 && c.ano <= 2100 &&
  Number.isInteger(c.mes) && c.mes >= 1 && c.mes <= 12 &&
  Number.isFinite(c.valor) && c.valor > 0 && c.valor < 1e10
const ERRO_INDICE = 'Informe índice, ano (1900–2100), mês (1–12) e valor (> 0).'
const CONFLITO_INDICE = 'Já existe um ponto para esse índice/ano/mês.'

app.get('/api/indices-economicos', wrap(async (req, res) => {
  const { indice } = req.query
  if (indice != null && typeof indice !== 'string') return res.status(400).json({ error: 'Índice inválido.' })
  const cond = indice ? 'WHERE indice = $1' : ''
  const params = indice ? [indice] : []
  res.json(await q(
    `SELECT id, indice, ano, mes, valor FROM orcamento.indices_economicos ${cond} ORDER BY indice, ano DESC, mes DESC`, params))
}))
app.post('/api/indices-economicos', requireAdmin, wrap(async (req, res) => {
  const c = indiceCampos(req.body)
  if (!indiceValido(c)) return res.status(400).json({ error: ERRO_INDICE })
  const id = genId('idx')
  try {
    await q('INSERT INTO orcamento.indices_economicos (id, indice, ano, mes, valor) VALUES ($1,$2,$3,$4,$5)',
      [id, c.indice, c.ano, c.mes, c.valor])
  } catch (e) { if (e.code === '23505') return res.status(409).json({ error: CONFLITO_INDICE }); throw e }
  await registrarLog(req, 'create', 'indice', id)
  res.status(201).json({ id, ...c })
}))
app.put('/api/indices-economicos/:id', requireAdmin, wrap(async (req, res) => {
  const c = indiceCampos(req.body)
  if (!indiceValido(c)) return res.status(400).json({ error: ERRO_INDICE })
  let upd
  try {
    upd = await q('UPDATE orcamento.indices_economicos SET indice=$2, ano=$3, mes=$4, valor=$5 WHERE id=$1 RETURNING id, indice, ano, mes, valor',
      [req.params.id, c.indice, c.ano, c.mes, c.valor])
  } catch (e) { if (e.code === '23505') return res.status(409).json({ error: CONFLITO_INDICE }); throw e }
  if (!upd.length) return res.status(404).json({ error: 'Ponto de índice não encontrado.' })
  await registrarLog(req, 'update', 'indice', req.params.id)
  res.json(upd[0])
}))
app.delete('/api/indices-economicos/:id', requireAdmin, wrap(async (req, res) => {
  const del = await q('DELETE FROM orcamento.indices_economicos WHERE id = $1 RETURNING id', [req.params.id])
  if (!del.length) return res.status(404).json({ error: 'Ponto de índice não encontrado.' })
  await registrarLog(req, 'delete', 'indice', req.params.id)
  res.json({ ok: true })
}))

// ----- Serviços/composições (RF-A05): escrita admin. GET aberto acima. Sem DELETE físico —
// inativar (PUT ativo=false) preserva os itens/estimativas históricos que referenciam o serviço.
function servicoCampos(body = {}) {
  return {
    codigoSinapi: asStr(body.codigoSinapi) || null,
    descricao: asStr(body.descricao),
    unidade: asStr(body.unidade),
    categoriaId: body.categoriaId || null,
  }
}
const servicoValido = (c) => !!c.descricao && !!c.unidade
const ERRO_SERVICO = 'Informe descrição e unidade do serviço.'
app.post('/api/servicos', requireAdmin, wrap(async (req, res) => {
  const c = servicoCampos(req.body)
  if (!servicoValido(c)) return res.status(400).json({ error: ERRO_SERVICO })
  const id = genId('srv')
  await q('INSERT INTO orcamento.servicos_ref (id, codigo_sinapi, descricao, unidade, categoria_id, ativo) VALUES ($1,$2,$3,$4,$5,true)',
    [id, c.codigoSinapi, c.descricao, c.unidade, c.categoriaId])
  await registrarLog(req, 'create', 'servico', id)
  res.status(201).json({ id, ...c, ativo: true })
}))
app.put('/api/servicos/:id', requireAdmin, wrap(async (req, res) => {
  const c = servicoCampos(req.body)
  if (!servicoValido(c)) return res.status(400).json({ error: ERRO_SERVICO })
  // ativo ausente → preserva (editar metadados não reativa; ativar/inativar é o botão da lista).
  const ativoParam = typeof req.body?.ativo === 'boolean' ? req.body.ativo : null
  const upd = await q(
    `UPDATE orcamento.servicos_ref SET codigo_sinapi=$2, descricao=$3, unidade=$4, categoria_id=$5, ativo=COALESCE($6, ativo)
     WHERE id=$1 RETURNING id, codigo_sinapi AS "codigoSinapi", descricao, unidade, categoria_id AS "categoriaId", ativo`,
    [req.params.id, c.codigoSinapi, c.descricao, c.unidade, c.categoriaId, ativoParam])
  if (!upd.length) return res.status(404).json({ error: 'Serviço não encontrado.' })
  await registrarLog(req, 'update', 'servico', req.params.id)
  res.json(upd[0])
}))

// ============================================================
// Obras (acervo)
// ============================================================
const OBRA_LIST = `
  SELECT o.id, o.codigo, o.nome,
         o.cliente_id   AS "clienteId", cli.nome AS cliente,
         o.tipo_obra_id AS "tipoObraId", o.padrao_id AS "padraoId", o.localidade_id AS "localidadeId",
         o.area_construida_m2 AS "areaConstruidaM2",
         o.area_terreno_m2    AS "areaTerrenoM2",
         o.num_pavimentos     AS "numPavimentos",
         to_char(o.dt_inicio_plan, 'YYYY-MM-DD') AS "dtInicioPlan",
         to_char(o.dt_fim_plan,    'YYYY-MM-DD') AS "dtFimPlan",
         to_char(o.dt_inicio_real, 'YYYY-MM-DD') AS "dtInicioReal",
         to_char(o.dt_fim_real,    'YYYY-MM-DD') AS "dtFimReal",
         to_char(o.data_base_custo, 'YYYY-MM')   AS "dataBaseCusto",
         o.custo_orcado_total AS "custoOrcadoTotal",
         o.custo_real_total   AS "custoRealTotal",
         o.status,
         o.elegivel_referencia AS "elegivelReferencia",
         t.nome AS "tipoObra",
         p.nome AS "padrao"
  FROM orcamento.obras o
  LEFT JOIN orcamento.tipos_obra        t   ON t.id   = o.tipo_obra_id
  LEFT JOIN orcamento.padroes_acabamento p  ON p.id   = o.padrao_id
  LEFT JOIN orcamento.clientes          cli ON cli.id = o.cliente_id`

// Normaliza os campos de uma obra (compartilhado por POST e PUT). Não inclui os totais
// de custo — em obras detalhadas eles são derivados por recalcularObra(); em obras
// manuais entram no create (POST). O PUT edita metadados, sem tocar nos custos.
function obraCampos(body = {}) {
  const b = body || {}
  const numOrNull = (v) => (v === '' || v == null ? null : Number(v))
  return {
    codigo: b.codigo, nome: b.nome,
    clienteId: b.clienteId || null, tipoObraId: b.tipoObraId || null,
    padraoId: b.padraoId || null, localidadeId: b.localidadeId || null,
    areaConstruidaM2: numOrNull(b.areaConstruidaM2),
    areaTerrenoM2: numOrNull(b.areaTerrenoM2),
    numPavimentos: numOrNull(b.numPavimentos),
    dtInicioPlan: b.dtInicioPlan || null, dtFimPlan: b.dtFimPlan || null,
    dtInicioReal: b.dtInicioReal || null, dtFimReal: b.dtFimReal || null,
    dataBaseCusto: dataBaseDate(b.dataBaseCusto),
    status: b.status || 'concluida',
    elegivelReferencia: !!b.elegivelReferencia,
  }
}

// Busca/filtro de obras (RF-E01). Todos os filtros são opcionais e combinam com AND;
// a ordenação vem de uma allowlist (nunca interpola entrada do usuário no ORDER BY).
const ORDENS_OBRA = {
  recente: 'o.created_at DESC',
  codigo: 'o.codigo',
  nome: 'o.nome',
  area: 'o.area_construida_m2 DESC NULLS LAST',
  custo: 'COALESCE(NULLIF(o.custo_real_total, 0), o.custo_orcado_total) DESC NULLS LAST',
}
app.get('/api/obras', wrap(async (req, res) => {
  const { busca, tipoObraId, padraoId, localidadeId, clienteId, status, elegivel, areaMin, areaMax, ordenar } = req.query
  const cond = []
  const params = []
  const bind = (v) => { params.push(v); return `$${params.length}` }
  const num = (v) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null)
  if (busca) {
    // Escapa os curingas do ILIKE (% _ \) para que a busca trate a entrada como literal.
    const b = bind(`%${String(busca).replace(/[\\%_]/g, '\\$&')}%`)
    cond.push(`(o.codigo ILIKE ${b} OR o.nome ILIKE ${b})`)
  }
  if (tipoObraId) cond.push(`o.tipo_obra_id = ${bind(tipoObraId)}`)
  if (padraoId) cond.push(`o.padrao_id = ${bind(padraoId)}`)
  if (localidadeId) cond.push(`o.localidade_id = ${bind(localidadeId)}`)
  if (clienteId) cond.push(`o.cliente_id = ${bind(clienteId)}`)
  if (status && STATUS_OBRA.includes(status)) cond.push(`o.status = ${bind(status)}`)
  if (elegivel === 'true' || elegivel === 'false') cond.push(`o.elegivel_referencia = ${bind(elegivel === 'true')}`)
  const aMin = num(areaMin); if (aMin != null) cond.push(`o.area_construida_m2 >= ${bind(aMin)}`)
  const aMax = num(areaMax); if (aMax != null) cond.push(`o.area_construida_m2 <= ${bind(aMax)}`)
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : ''
  // Object.hasOwn evita que chaves herdadas (constructor/toString/__proto__…) burlem a
  // allowlist e injetem texto inválido no ORDER BY (geraria 500).
  const orderBy = (typeof ordenar === 'string' && Object.hasOwn(ORDENS_OBRA, ordenar)) ? ORDENS_OBRA[ordenar] : ORDENS_OBRA.recente
  res.json(await q(`${OBRA_LIST} ${where} ORDER BY ${orderBy}`, params))
}))

app.get('/api/obras/:id', wrap(async (req, res) => {
  const [obra] = await q(`${OBRA_LIST} WHERE o.id = $1`, [req.params.id])
  if (!obra) return res.status(404).json({ error: 'Obra não encontrada.' })
  res.json(obra)
}))

// Índices econômicos disponíveis (para o seletor da atualização monetária).
app.get('/api/indices', wrap(async (_req, res) => {
  res.json(await q('SELECT DISTINCT indice FROM orcamento.indices_economicos ORDER BY indice'))
}))

// RF-D01 — Atualização monetária: leva os custos da obra da data-base histórica para uma
// data-base alvo aplicando um índice. Retorna o valor atualizado ao lado do histórico.
// fator null (semIndice) quando falta ponto do índice em alguma das pontas → mantém o histórico.
app.get('/api/obras/:id/atualizacao', wrap(async (req, res) => {
  const [obra] = await q(
    `SELECT to_char(data_base_custo, 'YYYY-MM') AS "dataBaseOrigem",
            custo_orcado_total AS "custoOrcado", custo_real_total AS "custoReal"
     FROM orcamento.obras WHERE id = $1`, [req.params.id])
  if (!obra) return res.status(404).json({ error: 'Obra não encontrada.' })
  // Validação de tipo/formato (params repetidos viram array no parser do Express).
  const dataBaseAlvo = chaveMes(req.query.dataBase)
  if (!dataBaseAlvo || !/^\d{4}-(0[1-9]|1[0-2])$/.test(dataBaseAlvo)) {
    return res.status(400).json({ error: 'Informe a data-base alvo no formato AAAA-MM.' })
  }
  const indiceRaw = req.query.indice
  if (indiceRaw != null && typeof indiceRaw !== 'string') return res.status(400).json({ error: 'Índice inválido.' })
  const indice = indiceRaw || 'SINAPI'
  const serie = await serieIndice(indice)
  // Arredonda o fator UMA vez e usa o mesmo valor na resposta e no cálculo (reconciliam).
  const fatorBruto = fatorAtualizacao(serie, obra.dataBaseOrigem, dataBaseAlvo)
  const fator = fatorBruto == null ? null : Math.round(fatorBruto * 10000) / 10000
  const numOrNull = (v) => (v == null ? null : Number(v))
  const orc = numOrNull(obra.custoOrcado)
  const real = numOrNull(obra.custoReal)
  const atualizar = (v) => (v == null ? null : round2(atualizarValor(v, fator ?? 1)))
  res.json({
    indice, dataBaseOrigem: obra.dataBaseOrigem, dataBaseAlvo, fator, semIndice: fator == null,
    custoOrcado: { historico: orc, atualizado: atualizar(orc) },
    custoReal: { historico: real, atualizado: atualizar(real) },
  })
}))

app.post('/api/obras', wrap(async (req, res) => {
  const c = obraCampos(req.body)
  const custoRealTotal = req.body?.custoRealTotal ?? null
  const custoOrcadoTotal = req.body?.custoOrcadoTotal ?? null
  if (!c.codigo || !c.nome) return res.status(400).json({ error: 'Informe ao menos código e nome da obra.' })
  if (!STATUS_OBRA.includes(c.status)) return res.status(400).json({ error: 'Status inválido.' })
  if ((await q('SELECT 1 FROM orcamento.obras WHERE codigo = $1', [c.codigo])).length)
    return res.status(409).json({ error: 'Já existe uma obra com esse código.' })

  const id = genId('obra')
  await q(
    `INSERT INTO orcamento.obras
       (id, codigo, nome, cliente_id, tipo_obra_id, padrao_id, localidade_id,
        area_construida_m2, area_terreno_m2, num_pavimentos,
        dt_inicio_plan, dt_fim_plan, dt_inicio_real, dt_fim_real,
        data_base_custo, status, elegivel_referencia, custo_real_total, custo_orcado_total,
        fonte_dado, criado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,'manual',$20)`,
    [id, c.codigo, c.nome, c.clienteId, c.tipoObraId, c.padraoId, c.localidadeId,
      c.areaConstruidaM2, c.areaTerrenoM2, c.numPavimentos,
      c.dtInicioPlan, c.dtFimPlan, c.dtInicioReal, c.dtFimReal,
      c.dataBaseCusto, c.status, c.elegivelReferencia, custoRealTotal, custoOrcadoTotal,
      req.userId],
  )
  const [obra] = await q(`${OBRA_LIST} WHERE o.id = $1`, [id])
  await registrarLog(req, 'create', 'obra', id)
  res.status(201).json(obra)
}))

// Edição de obra (RF-B01/US-13): metadados. NÃO altera os totais de custo (derivados
// em obras detalhadas; setados no create em obras manuais). Aberta a qualquer autenticado.
app.put('/api/obras/:id', wrap(async (req, res) => {
  const c = obraCampos(req.body)
  if (!c.codigo || !c.nome) return res.status(400).json({ error: 'Informe ao menos código e nome da obra.' })
  if (!STATUS_OBRA.includes(c.status)) return res.status(400).json({ error: 'Status inválido.' })
  if ((await q('SELECT 1 FROM orcamento.obras WHERE codigo = $1 AND id <> $2', [c.codigo, req.params.id])).length)
    return res.status(409).json({ error: 'Já existe outra obra com esse código.' })
  const upd = await q(
    `UPDATE orcamento.obras SET
       codigo=$2, nome=$3, cliente_id=$4, tipo_obra_id=$5, padrao_id=$6, localidade_id=$7,
       area_construida_m2=$8, area_terreno_m2=$9, num_pavimentos=$10,
       dt_inicio_plan=$11, dt_fim_plan=$12, dt_inicio_real=$13, dt_fim_real=$14,
       data_base_custo=$15, status=$16, elegivel_referencia=$17, updated_at=now()
     WHERE id=$1 RETURNING id`,
    [req.params.id, c.codigo, c.nome, c.clienteId, c.tipoObraId, c.padraoId, c.localidadeId,
      c.areaConstruidaM2, c.areaTerrenoM2, c.numPavimentos,
      c.dtInicioPlan, c.dtFimPlan, c.dtInicioReal, c.dtFimReal,
      c.dataBaseCusto, c.status, c.elegivelReferencia],
  )
  if (!upd.length) return res.status(404).json({ error: 'Obra não encontrada.' })
  const [obra] = await q(`${OBRA_LIST} WHERE o.id = $1`, [req.params.id])
  await registrarLog(req, 'update', 'obra', req.params.id)
  res.json(obra)
}))

// Excluir a obra inteira (CASCADE em etapas/itens/realizados/medições/anexos) é destrutivo
// de nível superior → restrito a admin (o requireAdmin roda depois do gate global de auth).
// estimativa_referencias NÃO cascateia (preserva o histórico de estimativas), então uma
// obra usada como análoga em estimativa salva não pode ser excluída — resposta 409 clara.
app.delete('/api/obras/:id', requireAdmin, wrap(async (req, res) => {
  let del
  try {
    del = await q('DELETE FROM orcamento.obras WHERE id = $1 RETURNING id', [req.params.id])
  } catch (e) {
    if (e.code === '23503') return res.status(409).json({ error: 'Não é possível excluir: a obra é referência de uma ou mais estimativas salvas.' })
    throw e
  }
  if (!del.length) return res.status(404).json({ error: 'Obra não encontrada.' })
  await registrarLog(req, 'delete', 'obra', req.params.id)
  res.json({ ok: true })
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
    await registrarLog(req, 'estimate', 'estimativa', id)
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
  await registrarLog(req, 'estimate', 'estimativa', id)
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

  await registrarLog(req, 'export', 'estimativa', est.id)
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
  await registrarLog(req, 'update', 'estimativa', req.params.id)
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
  if (inseridas > 0) await registrarLog(req, 'create', 'importacao', null)
  res.json({ inseridas, total: linhas.length, erros })
}))

// Detalhamento de obra (EAP, itens, realizados, curva ABC) — RF-B02..B04, RF-D04.
registrarObraDetalhe(app)

// ---------- erro ----------
app.use((err, _req, res, _next) => {
  console.error('[base-projetos] erro na API:', err.message)
  // Traduz erros conhecidos do Postgres em respostas de negócio (evita 500 cru + vazar schema).
  if (err.code === '23503') return res.status(400).json({ error: 'Referência inválida (cliente, tipo, padrão ou localidade inexistente).' })
  if (err.code === '23505') return res.status(409).json({ error: 'Registro duplicado.' })
  if (err.code === '22003' || err.code === '22P02') return res.status(400).json({ error: 'Valor numérico fora da faixa permitida.' })
  if (err.code === '23514') return res.status(400).json({ error: 'Valor fora da faixa permitida.' })
  res.status(500).json({ error: err.message })
})

q('SELECT 1 FROM orcamento.obras LIMIT 1')
  .catch(() => console.warn('[base-projetos] schema "orcamento" não encontrado — rode db/migrations/001..004 na sua branch do Neon.'))
  .finally(() => {
    // Auditoria é best-effort (não derruba operação), então uma tabela ausente passaria
    // silenciosa. Avisar cedo se a trilha (RF-H05) não puder ser gravada nesta branch.
    q("SELECT to_regclass('orcamento.log_auditoria') AS t")
      .then(([r]) => { if (!r || !r.t) console.warn('[base-projetos] AVISO: orcamento.log_auditoria ausente — a trilha de auditoria NÃO será gravada (rode as migrations).') })
      .catch(() => {})
    app.listen(PORT, () => console.log(`[base-projetos] API em http://localhost:${PORT}`))
  })
