// Sonda de banco — SOMENTE LEITURA. Nunca escreve nada.
// Uso:  npm run sonda            (usa a DATABASE_URL do .env)
//       DATABASE_URL="postgres://..." npm run sonda
//
// Serve para responder, ANTES de qualquer migration: "esta connection string é a produção
// do app Promav ou uma branch de dev do módulo?". Já houve um quase-acidente aqui — uma
// DATABASE_URL de PRODUÇÃO circulou como se fosse dev, e um `npm run migrate` teria criado o
// schema inteiro lá. Esta sonda abre só uma conexão de leitura e classifica o alvo.
import 'dotenv/config'
import pg from 'pg'

const url = process.env.DATABASE_URL
if (!url) { console.error('DATABASE_URL não definida.'); process.exit(1) }

const host = (url.match(/@([^/:?]+)/) || [])[1] || '(desconhecido)'
const db = (url.match(/\/([^/?]+)(\?|$)/) || [])[1] || '(desconhecido)'
const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false } })

const uma = async (sql, p) => (await pool.query(sql, p)).rows[0]
const todas = async (sql, p) => (await pool.query(sql, p)).rows

try {
  console.log('\n══════════════ SONDA (somente leitura) ══════════════')
  console.log(`host : ${host}`)
  console.log(`db   : ${db}`)
  console.log(`hora : ${(await uma('SELECT now() AS t')).t.toISOString()}`)

  // O módulo vive no schema 'orcamento'; o app Promav, no 'public'.
  const nObj = (await uma(
    "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'orcamento'")).n
  const temApp = (await uma(
    "SELECT to_regclass('public.users') IS NOT NULL AS t")).t

  let obras = null, migrations = []
  if (nObj > 0) {
    obras = (await uma('SELECT count(*)::int AS n FROM orcamento.obras')).n
    migrations = (await todas(`
      SELECT to_regclass('orcamento.medicoes')     IS NOT NULL AS m011,
             to_regclass('orcamento.log_auditoria') IS NOT NULL AS m_audit,
             (SELECT count(*)::int FROM information_schema.columns
               WHERE table_schema='orcamento' AND table_name='itens_custo' AND column_name='horas') AS m012,
             (SELECT count(*)::int FROM information_schema.columns
               WHERE table_schema='orcamento' AND table_name='vw_obra_indicadores'
                 AND column_name='fator_desvio_prazo') AS m013`))
  }
  let usuarios = null
  if (temApp) usuarios = (await uma('SELECT count(*)::int AS n FROM public.users')).n

  console.log('\n--- conteúdo ---')
  console.log(`schema 'orcamento' (módulo) : ${nObj > 0 ? `${nObj} objeto(s), ${obras} obra(s)` : 'AUSENTE'}`)
  console.log(`public.users (app Promav)   : ${temApp ? `presente (${usuarios} usuário(s))` : 'ausente'}`)
  if (nObj > 0) {
    const m = migrations[0]
    console.log(`migrations aplicadas        : 011 medicoes=${m.m011 ? 'sim' : 'NÃO'} · 012 horas=${m.m012 ? 'sim' : 'NÃO'} · 013 desvio_prazo=${m.m013 ? 'sim' : 'NÃO'} · auditoria=${m.m_audit ? 'sim' : 'NÃO'}`)
  }

  console.log('\n--- veredito ---')
  if (temApp && nObj === 0) {
    console.log('⚠️  ATENÇÃO: tem o app (public.users) e NÃO tem o schema do módulo.')
    console.log('    Isto tem CARA DE PRODUÇÃO (ou de uma branch nova ainda não migrada).')
    console.log('    NÃO rode `npm run migrate` aqui sem ter certeza absoluta e um plano de rollback.')
  } else if (nObj > 0) {
    console.log('✅ Schema do módulo presente — é uma branch já migrada (dev, ou prod já preparada).')
  } else {
    console.log('❔ Banco vazio para os dois lados (nem app, nem módulo).')
  }
  const esperada = process.env.DB_BRANCH_ESPERADA
  if (esperada) {
    console.log(`\ntrava DB_BRANCH_ESPERADA='${esperada}' → ${host.includes(esperada) ? '✅ bate com o host' : '❌ NÃO bate: o migrate vai RECUSAR'}`)
  } else {
    console.log('\n⚠️  DB_BRANCH_ESPERADA não definida no .env — a trava do migrate está DESLIGADA.')
  }
  console.log('════════════════════════════════════════════════════\n')
} catch (e) {
  console.error('ERRO ao sondar:', e.message)
  process.exitCode = 1
} finally {
  await pool.end()
}
