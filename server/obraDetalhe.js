// Detalhamento de obra: EAP (etapas), itens de custo orçado, custos realizados
// e curva ABC. Registra rotas no app. Tudo em orcamento.*; usa tabelas da
// migration 001. Autenticação por rota (requireAuth).
import express from 'express'
import { q } from './db.js'
import { requireAuth, registrarLog } from './auth.js'
import { curvaABC } from './curvaABC.js'
import { curvaS } from './curvaS.js'
import { produtividade } from './produtividade.js'
import { custoPorEtapa, criaCiclo } from './custoEtapa.js'

const genId = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

// Horas (homem-hora) de um item — opcional (RF-D05). '' / null → null; senão número ≥ 0.
// Retorna { ok, val }; ok=false quando informado mas inválido/negativo.
function parseHoras(v) {
  if (v == null || v === '') return { ok: true, val: null }
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? { ok: true, val: n } : { ok: false, val: null }
}

// Medições (RF-B05): normaliza 'AAAA-MM'/'AAAA-MM-DD' para o 1º dia do mês; null se inválido.
function mesPrimeiroDia(v) {
  if (typeof v !== 'string') return null
  const m = v.match(/^(\d{4})-(0[1-9]|1[0-2])/)
  return m ? `${m[1]}-${m[2]}-01` : null
}
// Valida um valor opcional numa faixa. Ausente ('' / null) → ok com val=null.
function numFaixa(v, lo, hi) {
  if (v == null || v === '') return { ok: true, val: null }
  const n = Number(v)
  if (!Number.isFinite(n) || n < lo || (hi != null && n > hi)) return { ok: false, val: null }
  return { ok: true, val: n }
}
// Campos de uma medição (previsto + realizado). Retorna os validados + flags de erro.
function medicaoCampos(body = {}) {
  const av = numFaixa(body.avancoFisicoPct, 0, 100)
  const avP = numFaixa(body.avancoPlanPct, 0, 100)
  const d = numFaixa(body.desembolso, 0, null)
  const dP = numFaixa(body.desembolsoPlan, 0, null)
  const observacao = typeof body.observacao === 'string' ? body.observacao.trim() || null : null
  const faixaOk = av.ok && avP.ok && d.ok && dP.ok
  const algumValor = [av.val, avP.val, d.val, dP.val].some((x) => x != null)
  return { av, avP, d, dP, observacao, faixaOk, algumValor }
}
const ERRO_FAIXA = 'Valores fora da faixa (avanço físico 0–100%, desembolso ≥ 0).'
const ERRO_VAZIO = 'Informe ao menos um valor (avanço ou desembolso).'

// Monta o Content-Disposition de um anexo. O parâmetro filename= só aceita ASCII
// (o Node lança ERR_INVALID_CHAR em codepoint > 0xFF), então dá o nome real acentuado
// em filename*=UTF-8'' (RFC 5987/6266) e um fallback ASCII em filename=. Puro/testável.
export function contentDispositionAnexo(filename) {
  // Surrogate SOLTO (par UTF-16 partido, ex.: emoji cortado por um slice) faz o
  // encodeURIComponent lançar URIError — e o contrato aqui é nunca lançar.
  const nome = String(filename || 'anexo').replace(/["\r\n]/g, '').replace(/[\uD800-\uDFFF]/g, '') || 'anexo'
  const asciiNome = nome.replace(/[^\x20-\x7E]/g, '_')
  return `attachment; filename="${asciiNome}"; filename*=UTF-8''${encodeURIComponent(nome)}`
}

// Teto do upload de anexo PELO APP (RF-B06). Acima disso o INSERT de BYTEA derruba a conexão
// do POOLER do Neon — o mesmo problema que o ETL contorna com conexão direta. Arquivo maior
// deve entrar pelo ETL (scripts/importar_orcamento.py), não pela API.
export const ANEXO_UPLOAD_MAX_MB = Number(process.env.ANEXO_UPLOAD_MAX_MB || 25) || 25

// Nome do arquivo enviado (?filename=). Remove caminho, caracteres de controle e aspas, e
// limita o tamanho. Não-string (ex.: param repetido vira array) → null → o chamador responde
// 400 em vez de estourar. Puro/testável.
export function nomeAnexo(v) {
  if (typeof v !== 'string') return null
  const base = v.split(/[/\\]/).pop() || ''
  const limpo = base.replace(/[\u0000-\u001F\u007F]/g, '').replace(/["\r\n]/g, '').trim()
  if (!limpo || limpo === '.' || limpo === '..') return null
  // Corta por CODE POINT: slice(0,200) em unidades UTF-16 partiria um emoji ao meio e
  // deixaria um surrogate solto (nome mutilado no banco + URIError no Content-Disposition).
  return [...limpo].slice(0, 200).join('')
}

// Aceita só um media-type bem-formado; qualquer outra coisa vira octet-stream. O mime é
// escolhido pelo CLIENTE e refletido no download — não pode virar header arbitrário.
const MIME_RE = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/
export function mimeSeguro(v) {
  const m = String(v ?? '').split(';')[0].trim().toLowerCase()
  return MIME_RE.test(m) ? m : 'application/octet-stream'
}

// Campo de texto vindo do corpo JSON. Não-string (número, array, objeto) → '' → o chamador
// responde 400 limpo em vez de estourar no .trim() (500 cru). Mesmo helper do index.js.
const asStr = (v) => (typeof v === 'string' ? v.trim() : '')

// A etapa pertence mesmo a esta obra? Evita pendurar/mover uma etapa na EAP de outra obra.
async function etapaDaObra(etapaId, obraId) {
  const [e] = await q('SELECT 1 FROM orcamento.etapas WHERE id = $1 AND obra_id = $2', [etapaId, obraId])
  return !!e
}

// Recalcula subtotais das etapas e os totais da obra a partir de itens/realizados.
async function recalcularObra(obraId) {
  await q(
    `UPDATE orcamento.etapas e SET
       custo_orcado = COALESCE((SELECT sum(custo_total) FROM orcamento.itens_custo WHERE etapa_id = e.id), 0),
       custo_real   = COALESCE((SELECT sum(valor)       FROM orcamento.custos_realizados WHERE etapa_id = e.id), 0)
     WHERE e.obra_id = $1`, [obraId])
  await q(
    `UPDATE orcamento.obras o SET
       custo_orcado_total = COALESCE((SELECT sum(ic.custo_total) FROM orcamento.itens_custo ic JOIN orcamento.etapas e ON e.id = ic.etapa_id WHERE e.obra_id = $1), 0),
       custo_real_total   = COALESCE((SELECT sum(cr.valor)       FROM orcamento.custos_realizados cr JOIN orcamento.etapas e ON e.id = cr.etapa_id WHERE e.obra_id = $1), 0),
       updated_at = now()
     WHERE o.id = $1`, [obraId])
}

async function etapaObraId(etapaId) {
  const [e] = await q('SELECT obra_id FROM orcamento.etapas WHERE id = $1', [etapaId])
  return e ? e.obra_id : null
}

export function registrarObraDetalhe(app) {
  // ----- Etapas (EAP) -----
  app.get('/api/obras/:id/etapas', requireAuth, wrap(async (req, res) => {
    res.json(await q(
      `SELECT id, etapa_pai_id AS "etapaPaiId", codigo_eap AS "codigoEap", descricao, ordem,
              custo_orcado AS "custoOrcado", custo_real AS "custoReal"
       FROM orcamento.etapas WHERE obra_id = $1 ORDER BY ordem, descricao`, [req.params.id]))
  }))

  app.post('/api/obras/:id/etapas', requireAuth, wrap(async (req, res) => {
    const { etapaPaiId = null, ordem = 0 } = req.body || {}
    const descricao = asStr(req.body?.descricao)
    const codigoEap = typeof req.body?.codigoEap === 'string' ? req.body.codigoEap.trim() || null : null
    if (!descricao) return res.status(400).json({ error: 'Informe a descrição da etapa.' })
    if (etapaPaiId && !(await etapaDaObra(etapaPaiId, req.params.id))) {
      return res.status(400).json({ error: 'Etapa pai inválida (precisa ser uma etapa da mesma obra).' })
    }
    const id = genId('etp')
    await q(
      `INSERT INTO orcamento.etapas (id, obra_id, etapa_pai_id, codigo_eap, descricao, ordem)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, req.params.id, etapaPaiId, codigoEap, descricao, Number(ordem) || 0])
    await registrarLog(req, 'create', 'etapa', id)
    res.status(201).json({ id })
  }))

  // Exclui a etapa (CASCADE em itens/realizados). Como não há rota de edição, a
  // correção de um lançamento é excluir+recriar → fica aberta a qualquer autenticado
  // (a trilha de auditoria dá o rastro). Só registra o log se algo foi de fato excluído.
  app.delete('/api/etapas/:id', requireAuth, wrap(async (req, res) => {
    const obraId = await etapaObraId(req.params.id)
    const del = await q('DELETE FROM orcamento.etapas WHERE id = $1 RETURNING id', [req.params.id])
    if (obraId) await recalcularObra(obraId)
    if (del.length) await registrarLog(req, 'delete', 'etapa', req.params.id)
    res.json({ ok: true })
  }))

  // Edita a etapa: descrição, código EAP e — RF-B02 — a HIERARQUIA (etapa pai) e a ORDEM.
  // Só mexe em etapa_pai_id/ordem se as chaves vierem no corpo (ausente = preserva): mesma
  // lição do 'origem' dos realizados e da 'observacao' das medições, que um PUT zerava.
  // Guardas: o pai precisa ser da MESMA obra e não pode criar ciclo (criaCiclo) — um ciclo
  // penduraria o roll-up de custo por etapa. Custos são derivados → não mudam aqui.
  app.put('/api/etapas/:id', requireAuth, wrap(async (req, res) => {
    const body = req.body || {}
    // Tipos estritos: um número/array em descricao estourava o .trim() → 500 cru; um array em
    // codigoEap era serializado pelo pg como literal ('{"1","2"}') e corrompia a EAP em silêncio.
    const descricao = asStr(body.descricao)
    const codigoEap = typeof body.codigoEap === 'string' ? body.codigoEap.trim() || null : null
    if (!descricao) return res.status(400).json({ error: 'Informe a descrição da etapa.' })

    const [atual] = await q('SELECT obra_id AS "obraId" FROM orcamento.etapas WHERE id = $1', [req.params.id])
    if (!atual) return res.status(404).json({ error: 'Etapa não encontrada.' })

    const mudaPai = Object.hasOwn(body, 'etapaPaiId')
    const mudaOrdem = Object.hasOwn(body, 'ordem')
    const paiId = mudaPai ? (body.etapaPaiId || null) : undefined

    if (mudaPai && paiId) {
      if (!(await etapaDaObra(paiId, atual.obraId))) {
        return res.status(400).json({ error: 'Etapa pai inválida (precisa ser uma etapa da mesma obra).' })
      }
      const todas = await q(
        'SELECT id, etapa_pai_id AS "etapaPaiId" FROM orcamento.etapas WHERE obra_id = $1', [atual.obraId])
      if (criaCiclo(todas, req.params.id, paiId)) {
        return res.status(400).json({ error: 'Hierarquia inválida: a etapa não pode ficar abaixo dela mesma nem de uma descendente.' })
      }
    }

    let ordem
    if (mudaOrdem) {
      // Number([]) === 0 e Number(true) === 1: sem checar o tipo, um array/booleano passaria.
      const raw = body.ordem
      const n = (typeof raw === 'number' || (typeof raw === 'string' && raw.trim() !== '')) ? Number(raw) : NaN
      if (!Number.isInteger(n)) return res.status(400).json({ error: 'Ordem inválida (informe um número inteiro).' })
      ordem = n
    }

    const sets = ['descricao = $2', 'codigo_eap = $3']
    const params = [req.params.id, descricao, codigoEap]
    if (mudaPai) { params.push(paiId); sets.push(`etapa_pai_id = $${params.length}`) }
    if (mudaOrdem) { params.push(ordem); sets.push(`ordem = $${params.length}`) }

    const upd = await q(`UPDATE orcamento.etapas SET ${sets.join(', ')} WHERE id = $1 RETURNING id`, params)
    if (!upd.length) return res.status(404).json({ error: 'Etapa não encontrada.' })
    await registrarLog(req, 'update', 'etapa', req.params.id)
    res.json({ id: req.params.id })
  }))

  // ----- Itens de custo (orçado) -----
  app.get('/api/etapas/:id/itens', requireAuth, wrap(async (req, res) => {
    res.json(await q(
      `SELECT id, descricao, unidade, quantidade, custo_unitario AS "custoUnitario",
              custo_total AS "custoTotal", servico_ref_id AS "servicoRefId", categoria_id AS "categoriaId", horas
       FROM orcamento.itens_custo WHERE etapa_id = $1 ORDER BY descricao`, [req.params.id]))
  }))

  app.post('/api/etapas/:id/itens', requireAuth, wrap(async (req, res) => {
    const { descricao = null, unidade = null, quantidade = 0, custoUnitario = 0, servicoRefId = null, categoriaId = null } = req.body || {}
    if (!(Number(quantidade) > 0) || !(Number(custoUnitario) > 0)) {
      return res.status(400).json({ error: 'Informe quantidade e custo unitário.' })
    }
    const horas = parseHoras(req.body?.horas)
    if (!horas.ok) return res.status(400).json({ error: 'Horas inválidas (informe um número ≥ 0).' })
    const id = genId('itm')
    await q(
      `INSERT INTO orcamento.itens_custo (id, etapa_id, servico_ref_id, categoria_id, descricao, unidade, quantidade, custo_unitario, horas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [id, req.params.id, servicoRefId, categoriaId, descricao, unidade, Number(quantidade), Number(custoUnitario), horas.val])
    const obraId = await etapaObraId(req.params.id)
    if (obraId) await recalcularObra(obraId)
    await registrarLog(req, 'create', 'item', id)
    res.status(201).json({ id })
  }))

  app.delete('/api/itens/:id', requireAuth, wrap(async (req, res) => {
    const [it] = await q('SELECT etapa_id FROM orcamento.itens_custo WHERE id = $1', [req.params.id])
    const del = await q('DELETE FROM orcamento.itens_custo WHERE id = $1 RETURNING id', [req.params.id])
    if (it) { const obraId = await etapaObraId(it.etapa_id); if (obraId) await recalcularObra(obraId) }
    if (del.length) await registrarLog(req, 'delete', 'item', req.params.id)
    res.json({ ok: true })
  }))

  // Edita um item de custo. quantidade/custo mudam o total → recalcula os agregados.
  app.put('/api/itens/:id', requireAuth, wrap(async (req, res) => {
    const { descricao = null, unidade = null, quantidade = 0, custoUnitario = 0, servicoRefId = null, categoriaId = null } = req.body || {}
    if (!(Number(quantidade) > 0) || !(Number(custoUnitario) > 0)) {
      return res.status(400).json({ error: 'Informe quantidade e custo unitário.' })
    }
    const horas = parseHoras(req.body?.horas)
    if (!horas.ok) return res.status(400).json({ error: 'Horas inválidas (informe um número ≥ 0).' })
    const [it] = await q('SELECT etapa_id FROM orcamento.itens_custo WHERE id = $1', [req.params.id])
    if (!it) return res.status(404).json({ error: 'Item não encontrado.' })
    await q(
      `UPDATE orcamento.itens_custo
         SET descricao = $2, unidade = $3, quantidade = $4, custo_unitario = $5, servico_ref_id = $6, categoria_id = $7, horas = $8
       WHERE id = $1`,
      [req.params.id, descricao, unidade, Number(quantidade), Number(custoUnitario), servicoRefId, categoriaId, horas.val])
    const obraId = await etapaObraId(it.etapa_id)
    if (obraId) await recalcularObra(obraId)
    await registrarLog(req, 'update', 'item', req.params.id)
    res.json({ id: req.params.id })
  }))

  // ----- Custos realizados -----
  app.get('/api/etapas/:id/realizados', requireAuth, wrap(async (req, res) => {
    res.json(await q(
      `SELECT id, to_char(competencia, 'YYYY-MM-DD') AS competencia, valor, origem
       FROM orcamento.custos_realizados WHERE etapa_id = $1 ORDER BY competencia`, [req.params.id]))
  }))

  app.post('/api/etapas/:id/realizados', requireAuth, wrap(async (req, res) => {
    const { competencia = null, valor = 0, origem = null } = req.body || {}
    if (!competencia || !(Number(valor) > 0)) return res.status(400).json({ error: 'Informe competência e valor.' })
    const id = genId('rea')
    await q(
      `INSERT INTO orcamento.custos_realizados (id, etapa_id, competencia, valor, origem)
       VALUES ($1,$2,$3,$4,$5)`,
      [id, req.params.id, competencia, Number(valor), origem])
    const obraId = await etapaObraId(req.params.id)
    if (obraId) await recalcularObra(obraId)
    await registrarLog(req, 'create', 'realizado', id)
    res.status(201).json({ id })
  }))

  app.delete('/api/realizados/:id', requireAuth, wrap(async (req, res) => {
    const [r] = await q('SELECT etapa_id FROM orcamento.custos_realizados WHERE id = $1', [req.params.id])
    const del = await q('DELETE FROM orcamento.custos_realizados WHERE id = $1 RETURNING id', [req.params.id])
    if (r) { const obraId = await etapaObraId(r.etapa_id); if (obraId) await recalcularObra(obraId) }
    if (del.length) await registrarLog(req, 'delete', 'realizado', req.params.id)
    res.json({ ok: true })
  }))

  // Edita um lançamento de custo realizado (competência/valor). Recalcula os agregados.
  // NÃO mexe em 'origem' (proveniência: manual/importado/conciliado) — não há edição dela
  // na UI e o front não a envia; incluí-la no UPDATE a zeraria. Preservada, como o
  // data_base fica de fora do UPDATE do item.
  app.put('/api/realizados/:id', requireAuth, wrap(async (req, res) => {
    const { competencia = null, valor = 0 } = req.body || {}
    if (!competencia || !(Number(valor) > 0)) return res.status(400).json({ error: 'Informe competência e valor.' })
    const [r] = await q('SELECT etapa_id FROM orcamento.custos_realizados WHERE id = $1', [req.params.id])
    if (!r) return res.status(404).json({ error: 'Lançamento não encontrado.' })
    await q('UPDATE orcamento.custos_realizados SET competencia = $2, valor = $3 WHERE id = $1',
      [req.params.id, competencia, Number(valor)])
    const obraId = await etapaObraId(r.etapa_id)
    if (obraId) await recalcularObra(obraId)
    await registrarLog(req, 'update', 'realizado', req.params.id)
    res.json({ id: req.params.id })
  }))

  // ----- Curva ABC da obra (RF-D04) -----
  app.get('/api/obras/:id/curva-abc', requireAuth, wrap(async (req, res) => {
    const itens = await q(
      `SELECT i.id, i.descricao, i.custo_total AS "custoTotal"
       FROM orcamento.itens_custo i JOIN orcamento.etapas e ON e.id = i.etapa_id
       WHERE e.obra_id = $1`, [req.params.id])
    res.json(curvaABC(itens.map((i) => ({ id: i.id, descricao: i.descricao, custoTotal: Number(i.custoTotal) }))))
  }))

  // ----- Produtividade / indicadores por serviço (RF-D05): R$/m², qtd/m², h/m² -----
  app.get('/api/obras/:id/produtividade', requireAuth, wrap(async (req, res) => {
    const [obra] = await q('SELECT area_construida_m2 AS area FROM orcamento.obras WHERE id = $1', [req.params.id])
    if (!obra) return res.status(404).json({ error: 'Obra não encontrada.' })
    const itens = await q(
      `SELECT i.servico_ref_id AS "servicoRefId", sr.descricao AS "servicoNome",
              i.descricao, i.unidade, i.quantidade, i.custo_total AS "custoTotal", i.horas,
              i.categoria_id AS "categoriaId", c.nome AS "categoriaNome"
       FROM orcamento.itens_custo i
       JOIN orcamento.etapas e ON e.id = i.etapa_id
       LEFT JOIN orcamento.servicos_ref sr ON sr.id = i.servico_ref_id
       LEFT JOIN orcamento.categorias_custo c ON c.id = i.categoria_id
       WHERE e.obra_id = $1`, [req.params.id])
    res.json(produtividade({ itens, area: obra.area }))
  }))

  // ----- Custo por etapa da EAP (RF-D02): R$ e R$/m² com roll-up nas macro-etapas -----
  // O roll-up é essencial: as macro-etapas não têm itens próprios (o custo vive nas folhas),
  // então sem somar as descendentes elas apareceriam zeradas. O custo/m² por CATEGORIA já é
  // servido por /produtividade (RF-D05) — mesma origem de dados, sem duplicar a agregação.
  app.get('/api/obras/:id/custo-etapas', requireAuth, wrap(async (req, res) => {
    const [obra] = await q('SELECT area_construida_m2 AS area FROM orcamento.obras WHERE id = $1', [req.params.id])
    if (!obra) return res.status(404).json({ error: 'Obra não encontrada.' })
    const etapas = await q(
      `SELECT id, etapa_pai_id AS "etapaPaiId", codigo_eap AS "codigoEap", descricao, ordem
       FROM orcamento.etapas WHERE obra_id = $1`, [req.params.id])
    const itens = await q(
      `SELECT i.etapa_id AS "etapaId", i.custo_total AS "custoTotal"
       FROM orcamento.itens_custo i JOIN orcamento.etapas e ON e.id = i.etapa_id
       WHERE e.obra_id = $1`, [req.params.id])
    res.json(custoPorEtapa({ etapas, itens, area: obra.area }))
  }))

  // ----- Cronograma físico-financeiro / Curva S (RF-B05) -----
  // Curva S de PREVISTO × REALIZADO. Todo o cálculo vive na função pura curvaS() → nunca 500.
  app.get('/api/obras/:id/curva-s', requireAuth, wrap(async (req, res) => {
    const [obra] = await q(
      `SELECT to_char(dt_inicio_plan, 'YYYY-MM-DD') AS "dtInicioPlan",
              to_char(dt_fim_plan,    'YYYY-MM-DD') AS "dtFimPlan",
              custo_orcado_total AS "custoOrcadoTotal"
       FROM orcamento.obras WHERE id = $1`, [req.params.id])
    if (!obra) return res.status(404).json({ error: 'Obra não encontrada.' })
    const medicoes = await q(
      `SELECT to_char(competencia, 'YYYY-MM-DD') AS competencia,
              avanco_fisico_pct AS "avancoFisicoPct", avanco_plan_pct AS "avancoPlanPct",
              desembolso, desembolso_plan AS "desembolsoPlan"
       FROM orcamento.medicoes WHERE obra_id = $1`, [req.params.id])
    const custosRealizados = await q(
      `SELECT to_char(date_trunc('month', cr.competencia), 'YYYY-MM-DD') AS competencia, sum(cr.valor) AS valor
       FROM orcamento.custos_realizados cr JOIN orcamento.etapas e ON e.id = cr.etapa_id
       WHERE e.obra_id = $1 GROUP BY date_trunc('month', cr.competencia)`, [req.params.id])
    res.json(curvaS({ medicoes, plano: obra, custosRealizados }))
  }))

  app.get('/api/obras/:id/medicoes', requireAuth, wrap(async (req, res) => {
    res.json(await q(
      `SELECT id, to_char(competencia, 'YYYY-MM') AS competencia,
              avanco_fisico_pct AS "avancoFisicoPct", avanco_plan_pct AS "avancoPlanPct",
              desembolso, desembolso_plan AS "desembolsoPlan", observacao
       FROM orcamento.medicoes WHERE obra_id = $1 ORDER BY competencia`, [req.params.id]))
  }))

  // CRIA uma medição (convenção POST-cria/PUT-edita do módulo; mês único → UNIQUE → 409).
  app.post('/api/obras/:id/medicoes', requireAuth, wrap(async (req, res) => {
    const [obra] = await q('SELECT 1 FROM orcamento.obras WHERE id = $1', [req.params.id])
    if (!obra) return res.status(404).json({ error: 'Obra não encontrada.' })
    const mes = mesPrimeiroDia(req.body?.competencia)
    if (!mes) return res.status(400).json({ error: 'Informe a competência (AAAA-MM).' })
    const c = medicaoCampos(req.body)
    if (!c.faixaOk) return res.status(400).json({ error: ERRO_FAIXA })
    if (!c.algumValor) return res.status(400).json({ error: ERRO_VAZIO })
    const id = genId('med')
    try {
      await q(
        `INSERT INTO orcamento.medicoes
           (id, obra_id, competencia, avanco_fisico_pct, avanco_plan_pct, desembolso, desembolso_plan, observacao, criado_por)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [id, req.params.id, mes, c.av.val, c.avP.val, c.d.val, c.dP.val, c.observacao, req.userId])
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: 'Já existe medição para este mês (edite ou exclua a existente).' })
      throw e
    }
    await registrarLog(req, 'create', 'medicao', id)
    res.status(201).json({ id })
  }))

  // Edita valores de uma medição por id. NÃO altera competencia/obra_id (evita colisão de mês)
  // nem observacao (o front não a envia; incluí-la a zeraria — mesmo cuidado do PUT de realizados
  // com 'origem').
  app.put('/api/medicoes/:id', requireAuth, wrap(async (req, res) => {
    const c = medicaoCampos(req.body)
    if (!c.faixaOk) return res.status(400).json({ error: ERRO_FAIXA })
    if (!c.algumValor) return res.status(400).json({ error: ERRO_VAZIO })
    const upd = await q(
      `UPDATE orcamento.medicoes
         SET avanco_fisico_pct=$2, avanco_plan_pct=$3, desembolso=$4, desembolso_plan=$5, updated_at=now()
       WHERE id=$1 RETURNING id`,
      [req.params.id, c.av.val, c.avP.val, c.d.val, c.dP.val])
    if (!upd.length) return res.status(404).json({ error: 'Medição não encontrada.' })
    await registrarLog(req, 'update', 'medicao', req.params.id)
    res.json({ id: req.params.id })
  }))

  app.delete('/api/medicoes/:id', requireAuth, wrap(async (req, res) => {
    const del = await q('DELETE FROM orcamento.medicoes WHERE id = $1 RETURNING id', [req.params.id])
    if (del.length) await registrarLog(req, 'delete', 'medicao', req.params.id)
    res.json({ ok: true })
  }))

  // ----- Anexos da obra (RF-B06 / US-18): caminho de LEITURA -----
  // Lista os metadados dos anexos de uma obra (sem trazer o binário).
  app.get('/api/obras/:id/anexos', requireAuth, wrap(async (req, res) => {
    res.json(await q(
      `SELECT id, filename, mime_type AS "mimeType", size_bytes AS "sizeBytes",
              to_char(created_at, 'YYYY-MM-DD') AS "createdAt"
       FROM orcamento.anexos WHERE obra_id = $1 ORDER BY created_at`, [req.params.id]))
  }))

  // Baixa o binário de um anexo. O requireAuth aceita ?token= (ver auth.js),
  // então funciona por <a href="/api/anexos/ID?token=...">. O bytea volta como Buffer.
  app.get('/api/anexos/:id', requireAuth, wrap(async (req, res) => {
    const [a] = await q(
      'SELECT filename, mime_type AS "mimeType", data FROM orcamento.anexos WHERE id = $1',
      [req.params.id])
    if (!a) return res.status(404).json({ error: 'Anexo não encontrado.' })
    res.setHeader('Content-Type', mimeSeguro(a.mimeType))
    // O mime é escolhido por quem sobe o arquivo; o nosniff impede o browser de reinterpretar
    // o conteúdo (defesa em profundidade — o attachment já força download).
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Content-Disposition', contentDispositionAnexo(a.filename))
    res.send(a.data)
  }))

  // ----- Anexos: ESCRITA (RF-B06) — upload pelo app -----
  // Corpo = bytes crus (o mime do arquivo); o nome vai em ?filename=. O express.json global
  // não toca no corpo (content-type não é JSON) e o express.raw daqui o entrega como Buffer.
  // Acima de ANEXO_UPLOAD_MAX_MB o body-parser corta → 413 (traduzido no handler global).
  app.post('/api/obras/:id/anexos', requireAuth,
    express.raw({ type: '*/*', limit: `${ANEXO_UPLOAD_MAX_MB}mb` }),
    wrap(async (req, res) => {
      const [obra] = await q('SELECT 1 FROM orcamento.obras WHERE id = $1', [req.params.id])
      if (!obra) return res.status(404).json({ error: 'Obra não encontrada.' })
      const buf = req.body
      if (!Buffer.isBuffer(buf) || !buf.length) return res.status(400).json({ error: 'Arquivo vazio.' })
      const filename = nomeAnexo(req.query.filename)
      if (!filename) return res.status(400).json({ error: 'Informe o nome do arquivo (?filename=).' })
      const mimeType = mimeSeguro(req.headers['content-type'])
      const id = genId('anx')
      await q(
        `INSERT INTO orcamento.anexos (id, obra_id, filename, mime_type, size_bytes, data)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, req.params.id, filename, mimeType, buf.length, buf])
      await registrarLog(req, 'create', 'anexo', id)
      res.status(201).json({ id, filename, mimeType, sizeBytes: buf.length })
    }))

  // Exclui um anexo (correção do dia-a-dia, como as demais exclusões de linha → requireAuth).
  app.delete('/api/anexos/:id', requireAuth, wrap(async (req, res) => {
    const del = await q('DELETE FROM orcamento.anexos WHERE id = $1 RETURNING id', [req.params.id])
    if (del.length) await registrarLog(req, 'delete', 'anexo', req.params.id)
    res.json({ ok: true })
  }))
}
