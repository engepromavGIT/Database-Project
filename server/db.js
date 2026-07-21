// Pool de conexão Postgres (Neon). Lê DATABASE_URL do .env.
import 'dotenv/config'
import pg from 'pg'

const { Pool } = pg

if (!process.env.DATABASE_URL) {
  console.error('\n[promav] DATABASE_URL não definida. Crie um arquivo .env (veja .env.example).\n')
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

// Helper: query simples retornando as linhas. Delega a uma implementação trocável para que
// os testes possam injetar respostas (__setQueryImpl) e exercitar as rotas HTTP sem um banco
// real. Em produção nada muda — a impl padrão consulta o pool.
const _defaultQuery = async (text, params) => (await pool.query(text, params)).rows
let _queryImpl = _defaultQuery
export function q(text, params) {
  return _queryImpl(text, params)
}
// Seam de teste: troca a implementação de q(). Passe null/undefined para restaurar a padrão.
// NÃO use em produção — existe só para os testes de endpoint (tests/estimativa.http.test.mjs).
export function __setQueryImpl(fn) {
  _queryImpl = fn || _defaultQuery
}

// Helper: executa uma função dentro de uma transação.
export async function tx(fn) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const out = await fn(client)
    await client.query('COMMIT')
    return out
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}
