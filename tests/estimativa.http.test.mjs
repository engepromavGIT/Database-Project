// Testes de ENDPOINT (HTTP) das recusas 400 do motor de estimativa. Diferente dos demais
// testes (funções puras), estes sobem o Express de verdade numa porta efêmera e batem via
// fetch — cobrindo roteamento, o middleware requireAuth e os guards das rotas.
//
// Sem banco: o db.js expõe __setQueryImpl (seam de teste) para injetar respostas de query.
// O requireAuth só verifica o JWT (não toca no banco), então um signToken() basta.
//
// Rode: node tests/estimativa.http.test.mjs
import { __setQueryImpl, pool } from '../server/db.js'
import { app } from '../server/index.js'
import { signToken } from '../server/auth.js'

let pass = 0, fail = 0
const ok = (cond, msg) => { if (cond) { pass++ } else { fail++; console.error('  ✗ FALHOU:', msg) } }

const token = signToken({ id: 'u-teste' })

// Sobe o app numa porta efêmera (0) só para os testes.
const server = app.listen(0)
await new Promise((res) => server.once('listening', res))
const base = `http://127.0.0.1:${server.address().port}`

// Helper de request. auth=true anexa o Bearer token.
async function req(method, path, body, auth = true) {
  const headers = { 'Content-Type': 'application/json' }
  if (auth) headers.Authorization = `Bearer ${token}`
  const r = await fetch(`${base}${path}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  })
  let json = null
  try { json = await r.json() } catch { /* respostas sem corpo */ }
  return { status: r.status, json }
}

try {
  // --- auth: sem token, qualquer /api responde 401 (não vaza para o handler) ---
  __setQueryImpl(async () => { throw new Error('não deveria consultar o banco antes do auth') })
  {
    const r = await req('POST', '/api/estimativas', { descricao: 'x' }, false)
    ok(r.status === 401, `POST /api/estimativas sem token → 401 (got ${r.status})`)
  }

  // --- validação de entrada (antes de qualquer query) ---
  {
    const r = await req('POST', '/api/estimativas', {}) // sem descricao
    ok(r.status === 400 && /descrição/i.test(r.json?.error || ''), `sem descrição → 400 (got ${r.status})`)
  }
  {
    const r = await req('POST', '/api/estimativas/est-1/realizado', {}) // sem custoRealizado
    ok(r.status === 400 && /custo realizado/i.test(r.json?.error || ''), `realizado sem custo → 400 (got ${r.status})`)
  }

  // --- GUARD 1: paramétrica com todas as análogas de escore 0 → 400 (o núcleo do fix) ---
  // Não envio padraoId/localidadeId (montarAlvo faz 0 queries) e envio bdiPct (pula resolverBdi).
  // Sobram: a query de índices (retorno vazio) e a CAND (um candidato deliberadamente dissimilar
  // → escore 0). Assim somaEscores == 0 e a rota deve RECUSAR em vez de gravar custo_provavel null.
  __setQueryImpl(async (text) => {
    if (text.includes('indices_economicos')) return [] // série vazia → fator neutro
    if (text.includes('FROM orcamento.obras o') && text.includes('elegivel_referencia')) {
      // Dissimilar em TUDO: tipo ausente no alvo, área 5× (diff ≥ 100%), sem localidade/UF,
      // e obra de 2010 (16 anos → recência 0). escoreSimilaridade → 0.
      return [{
        id: 'o-diss', codigo: 'C1', nome: 'Obra dissimilar',
        tipoObraId: 'tipo-outro', padraoId: null, padraoNome: null,
        areaConstruidaM2: 5000, custoRealTotal: 1000000, fatorRegional: 1,
        dataBaseCusto: '2010-01-01', localidadeId: null, uf: null, prazoRealDias: null,
      }]
    }
    return []
  })
  {
    const r = await req('POST', '/api/estimativas', { descricao: 'sem similaridade', areaAlvoM2: 1000, bdiPct: 0 })
    ok(r.status === 400 && /similaridade/i.test(r.json?.error || ''),
      `paramétrica escore 0 → 400 (got ${r.status} / ${r.json?.error || ''})`)
  }

  // --- GUARD 2: /realizado numa estimativa com custo_provavel NULL → 400 (cobre legado) ---
  __setQueryImpl(async (text) => {
    if (text.includes('custo_provavel') && text.includes('FROM orcamento.estimativas')) {
      return [{ custo_provavel: null }]
    }
    return []
  })
  {
    const r = await req('POST', '/api/estimativas/est-legado/realizado', { custoRealizado: 100000 })
    ok(r.status === 400 && /custo provável/i.test(r.json?.error || ''),
      `realizado sem custo provável → 400 (got ${r.status} / ${r.json?.error || ''})`)
  }

  // --- /realizado numa estimativa inexistente → 404 (contraste com o 400 acima) ---
  __setQueryImpl(async () => []) // SELECT não acha a estimativa
  {
    const r = await req('POST', '/api/estimativas/nao-existe/realizado', { custoRealizado: 100000 })
    ok(r.status === 404, `realizado de estimativa inexistente → 404 (got ${r.status})`)
  }
} finally {
  // Teardown completo ANTES de sair: fechar o servidor e o pool com await evita a corrida do
  // libuv no Windows (process.exit durante handle-close aborta com "UV_HANDLE_CLOSING").
  __setQueryImpl(null)
  await new Promise((res) => server.close(() => res()))
  await pool.end().catch(() => {})
}

console.log(`\nTestes HTTP de estimativa: ${pass} passou, ${fail} falhou.`)
// exitCode + saída natural (sem process.exit forçado) para não colidir com o encerramento de handles.
process.exitCode = fail ? 1 : 0
