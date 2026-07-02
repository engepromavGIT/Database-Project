// Runner de migrations (sem psql) — aplica db/migrations/*.sql em ordem,
// usando o mesmo pool 'pg' do app. As migrations são idempotentes, então
// pode rodar várias vezes com segurança. Uso: npm run migrate
import 'dotenv/config'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { pool } from '../server/db.js'

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations')

async function run() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL não definida — preencha o .env antes de migrar.')
    process.exit(1)
  }
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
  console.log(`Aplicando ${files.length} migration(s) em ${dir}\n`)
  for (const f of files) {
    process.stdout.write(`  ${f} ... `)
    try {
      await pool.query(readFileSync(path.join(dir, f), 'utf8'))
      console.log('OK')
    } catch (e) {
      console.log('ERRO')
      console.error(`    ${e.message}`)
      await pool.end()
      process.exit(1)
    }
  }
  const r = await pool.query(
    "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'orcamento'",
  )
  console.log(`\nSchema 'orcamento': ${r.rows[0].n} tabela(s)/visão(ões). Migrations aplicadas com sucesso.`)
  await pool.end()
}

run().catch(async (e) => { console.error(e.message); try { await pool.end() } catch { /* */ } process.exit(1) })
