// Detalhamento de obra: EAP (etapas), itens de custo orçado, custos realizados
// e curva ABC. Registra rotas no app. Tudo em orcamento.*; usa tabelas da
// migration 001. Autenticação por rota (requireAuth).
import { q } from './db.js'
import { requireAuth, registrarLog } from './auth.js'
import { curvaABC } from './curvaABC.js'

const genId = (p) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)

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
    const { descricao, codigoEap = null, etapaPaiId = null, ordem = 0 } = req.body || {}
    if (!descricao) return res.status(400).json({ error: 'Informe a descrição da etapa.' })
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

  // ----- Itens de custo (orçado) -----
  app.get('/api/etapas/:id/itens', requireAuth, wrap(async (req, res) => {
    res.json(await q(
      `SELECT id, descricao, unidade, quantidade, custo_unitario AS "custoUnitario",
              custo_total AS "custoTotal", servico_ref_id AS "servicoRefId", categoria_id AS "categoriaId"
       FROM orcamento.itens_custo WHERE etapa_id = $1 ORDER BY descricao`, [req.params.id]))
  }))

  app.post('/api/etapas/:id/itens', requireAuth, wrap(async (req, res) => {
    const { descricao = null, unidade = null, quantidade = 0, custoUnitario = 0, servicoRefId = null, categoriaId = null } = req.body || {}
    if (!(Number(quantidade) > 0) || !(Number(custoUnitario) > 0)) {
      return res.status(400).json({ error: 'Informe quantidade e custo unitário.' })
    }
    const id = genId('itm')
    await q(
      `INSERT INTO orcamento.itens_custo (id, etapa_id, servico_ref_id, categoria_id, descricao, unidade, quantidade, custo_unitario)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, req.params.id, servicoRefId, categoriaId, descricao, unidade, Number(quantidade), Number(custoUnitario)])
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

  // ----- Curva ABC da obra (RF-D04) -----
  app.get('/api/obras/:id/curva-abc', requireAuth, wrap(async (req, res) => {
    const itens = await q(
      `SELECT i.id, i.descricao, i.custo_total AS "custoTotal"
       FROM orcamento.itens_custo i JOIN orcamento.etapas e ON e.id = i.etapa_id
       WHERE e.obra_id = $1`, [req.params.id])
    res.json(curvaABC(itens.map((i) => ({ id: i.id, descricao: i.descricao, custoTotal: Number(i.custoTotal) }))))
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
    const nome = (a.filename || 'anexo').replace(/["\r\n]/g, '')
    // Content-Disposition: o parâmetro filename= só aceita ASCII (o Node lança
    // ERR_INVALID_CHAR em codepoint > 0xFF). filename*=UTF-8'' carrega o nome real
    // acentuado (RFC 5987/6266); filename= vira um fallback ASCII p/ navegadores antigos.
    const asciiNome = nome.replace(/[^\x20-\x7E]/g, '_')
    res.setHeader('Content-Type', a.mimeType || 'application/octet-stream')
    res.setHeader('Content-Disposition',
      `attachment; filename="${asciiNome}"; filename*=UTF-8''${encodeURIComponent(nome)}`)
    res.send(a.data)
  }))
}
