// Autenticação: hash de senha (bcrypt) + tokens JWT + middleware de proteção.
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { q } from './db.js'

const SECRET = process.env.JWT_SECRET || 'dev-secret-troque-em-producao'
const EXPIRES_IN = '7d'

export const hashPassword = (plain) => bcrypt.hash(plain, 10)
export const verifyPassword = (plain, hash) => bcrypt.compare(plain, hash)

export const signToken = (user) => jwt.sign({ sub: user.id }, SECRET, { expiresIn: EXPIRES_IN })

// Middleware: exige um Bearer token válido; injeta req.userId.
// Aceita o token no header Authorization OU em ?token= (para <img>/<a>, que
// não conseguem enviar headers ao baixar um arquivo servido pela API).
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || ''
  const token = (header.startsWith('Bearer ') ? header.slice(7) : null) || req.query.token || null
  if (!token) return res.status(401).json({ error: 'Não autenticado.' })
  try {
    const payload = jwt.verify(token, SECRET)
    req.userId = payload.sub
    next()
  } catch {
    res.status(401).json({ error: 'Sessão expirada ou inválida.' })
  }
}

// RBAC (RF-H02): exige que o usuário autenticado seja administrador. O papel é
// resolvido POR REQUEST em public.users — NÃO confiamos numa claim do token, porque
// os tokens são compartilhados com o app Promav (que assina apenas { sub }). Deve
// rodar depois do requireAuth (usa req.userId).
export async function requireAdmin(req, res, next) {
  try {
    const [u] = await q('SELECT is_admin FROM public.users WHERE id = $1', [req.userId])
    if (!u || !u.is_admin) return res.status(403).json({ error: 'Ação restrita a administradores.' })
    req.isAdmin = true
    next()
  } catch (e) {
    next(e)
  }
}

// Trilha de auditoria (RF-B08 / RF-H05): registra uma ação sensível em
// orcamento.log_auditoria. Best-effort — uma falha ao gravar o log NÃO derruba a
// operação principal (é logada no servidor). acao ∈ create|update|delete|export|estimate.
const logId = () => `log${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
export async function registrarLog(req, acao, entidade, entidadeId = null) {
  try {
    await q(
      `INSERT INTO orcamento.log_auditoria (id, usuario_id, entidade, entidade_id, acao)
       VALUES ($1, $2, $3, $4, $5)`,
      [logId(), req?.userId || null, entidade, entidadeId, acao],
    )
  } catch (e) {
    // Best-effort por design (não derruba a operação), mas a falha precisa ser VISÍVEL:
    // logamos com contexto p/ correlação/alarme — uma lacuna na trilha não pode ser muda.
    console.error(`[base-projetos] AUDITORIA PERDIDA — acao=${acao} entidade=${entidade} id=${entidadeId} usuario=${req?.userId || '?'}: ${e.message}`)
  }
}
