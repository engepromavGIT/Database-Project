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
  // ---- Trava de alvo -------------------------------------------------------
  // Já circulou aqui uma connection string de PRODUÇÃO como se fosse de dev; um `npm run
  // migrate` teria criado o schema inteiro no banco do app. Com DB_BRANCH_ESPERADA definida
  // no .env, o migrate RECUSA qualquer host que não seja o esperado — o erro deixa de ser
  // "improvável" e passa a ser impossível sem uma edição consciente do .env.
  const host = (process.env.DATABASE_URL.match(/@([^/:?]+)/) || [])[1] || '(desconhecido)'
  const esperada = process.env.DB_BRANCH_ESPERADA
  if (esperada && !host.includes(esperada)) {
    console.error('\n❌ MIGRATE RECUSADO — o alvo não é a branch esperada.')
    console.error(`   DATABASE_URL aponta para : ${host}`)
    console.error(`   DB_BRANCH_ESPERADA       : ${esperada}`)
    console.error('   Se o alvo é mesmo intencional (ex.: migrar a produção), rode antes')
    console.error('   `npm run sonda` e ajuste DB_BRANCH_ESPERADA no .env conscientemente.\n')
    process.exit(1)
  }
  console.log(`Alvo: ${host}`)
  if (!esperada) console.log('⚠️  DB_BRANCH_ESPERADA não definida — trava DESLIGADA. Rode `npm run sonda` antes.')

  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
  console.log(`\nAplicando ${files.length} migration(s) em ${dir}\n`)
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
