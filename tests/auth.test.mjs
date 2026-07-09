// Testes de autenticação (server/auth.js) — sem banco. Rode: node tests/auth.test.mjs
// Cobre hash/verify de senha, roundtrip do token, aceitação por header e ?token=,
// precedência e os caminhos de 401. requireAdmin/registrarLog dependem do banco e são
// cobertos pelo teste de integração (ver build-check-log.md), não aqui.
import jwt from 'jsonwebtoken'

// Fixa o segredo ANTES de importar auth.js (ele lê process.env.JWT_SECRET no load, e o
// dotenv de db.js não sobrescreve vars já definidas). DATABASE_URL dummy só p/ silenciar
// o aviso do db.js — nenhuma query é executada aqui.
process.env.JWT_SECRET = 'segredo-de-teste-nao-usar-em-prod'
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://u:p@localhost:5432/none'
const SECRET = process.env.JWT_SECRET
const { hashPassword, verifyPassword, signToken, requireAuth } = await import('../server/auth.js')

let pass = 0, fail = 0
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m) } }

// Roda requireAuth com um req simulado e captura o resultado.
function corre(req) {
  let status = null, nextChamado = false
  const res = { status(c) { status = c; return this }, json() { return this } }
  requireAuth(req, res, () => { nextChamado = true })
  return { status, nextChamado, userId: req.userId }
}

// --- hash / verify de senha ---
const hash = await hashPassword('senha123')
ok(hash && hash !== 'senha123', 'hashPassword não devolve a senha em claro')
ok((await verifyPassword('senha123', hash)) === true, 'verifyPassword aceita a senha correta')
ok((await verifyPassword('errada', hash)) === false, 'verifyPassword rejeita a senha errada')

// --- signToken + requireAuth (roundtrip) ---
const token = signToken({ id: 'u42' })
ok(typeof token === 'string' && token.split('.').length === 3, 'signToken devolve um JWT')
let r = corre({ headers: { authorization: `Bearer ${token}` }, query: {} })
ok(r.nextChamado && r.userId === 'u42', 'token válido no header → next() + req.userId')

// --- token via ?token= (para <a>/<img> que não enviam header) ---
r = corre({ headers: {}, query: { token } })
ok(r.nextChamado && r.userId === 'u42', 'token válido em ?token= → autentica')

// --- precedência: header ganha da query ---
const tokenA = signToken({ id: 'A' }), tokenB = signToken({ id: 'B' })
r = corre({ headers: { authorization: `Bearer ${tokenA}` }, query: { token: tokenB } })
ok(r.userId === 'A', 'header tem precedência sobre ?token=')

// --- sem token → 401 ---
r = corre({ headers: {}, query: {} })
ok(!r.nextChamado && r.status === 401, 'sem token → 401')

// --- assinatura inválida → 401 ---
const forjado = jwt.sign({ sub: 'x' }, 'outro-segredo')
r = corre({ headers: { authorization: `Bearer ${forjado}` }, query: {} })
ok(!r.nextChamado && r.status === 401, 'assinatura inválida → 401')

// --- token expirado → 401 ---
const expirado = jwt.sign({ sub: 'x' }, SECRET, { expiresIn: -10 })
r = corre({ headers: { authorization: `Bearer ${expirado}` }, query: {} })
ok(!r.nextChamado && r.status === 401, 'token expirado → 401')

// --- Authorization sem "Bearer " → 401 (não confunde o token cru com Bearer) ---
r = corre({ headers: { authorization: token }, query: {} })
ok(!r.nextChamado && r.status === 401, 'Authorization sem "Bearer " → 401')

console.log(`\nAutenticação: ${pass} passou, ${fail} falhou.`)
process.exit(fail ? 1 : 0)
