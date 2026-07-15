// Smoke-test PÓS-DEPLOY — roda contra a URL PÚBLICA do módulo já publicado.
// Não importa nada do projeto (só usa fetch nativo do Node) e NÃO lê o .env local:
// toda a configuração vem por variáveis de ambiente. Nunca imprime senha nem token.
//
// Uso mínimo (verifica o que não exige credencial):
//   API_URL=https://promav-orcamento-api.onrender.com npm run smoke
//
// Completo (recomendado — prova auth + banco + SSO + site):
//   API_URL=https://promav-orcamento-api.onrender.com \
//   WEB_URL=https://promav-orcamento-web.onrender.com \
//   SMOKE_EMAIL=engenharia.promav@gmail.com \
//   SMOKE_PASSWORD='...' \
//   APP_API_URL=https://promav-api.onrender.com \
//   npm run smoke
//
// APP_API_URL é opcional: se informado, faz login no APP e usa ESSE token no MÓDULO — é a
// prova real de que o JWT_SECRET dos dois bate (SSO). Sem ele, o SSO não é testado.

const API = (process.env.API_URL || '').replace(/\/$/, '')
const WEB = (process.env.WEB_URL || '').replace(/\/$/, '')
const APP = (process.env.APP_API_URL || '').replace(/\/$/, '')
const EMAIL = process.env.SMOKE_EMAIL || ''
const SENHA = process.env.SMOKE_PASSWORD || ''

if (!API) { console.error('❌ Defina API_URL (a URL pública da API do módulo).'); process.exit(2) }

let pass = 0, fail = 0, skip = 0
const ok = (c, m, detalhe = '') => { if (c) { pass++; console.log('  ✓', m, detalhe && `— ${detalhe}`) } else { fail++; console.error('  ✗ FALHOU:', m, detalhe && `— ${detalhe}`) } }
const pular = (m, porque) => { skip++; console.log('  ○ PULADO:', m, `(${porque})`) }

// fetch com timeout por request que NUNCA lança: um erro de rede/timeout vira uma resposta
// sintética { status: 0, _err }. Um smoke-test tem que REPORTAR a falha, não morrer no meio.
async function pega(url, opts = {}, ms = 15000) {
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms)
  try { return await fetch(url, { ...opts, signal: ac.signal }) }
  catch (e) { return { status: 0, _err: e?.cause?.code || e?.code || e?.name || 'erro de rede', headers: new Map(), _dead: true } }
  finally { clearTimeout(t) }
}

// O free tier do Render "dorme" e o primeiro acesso pode levar ~1 min pra acordar.
async function acordar(base) {
  const limite = Date.now() + 90000
  process.stdout.write('  … acordando o serviço (free tier pode demorar até 90s) ')
  while (Date.now() < limite) {
    try {
      const r = await pega(`${base}/api/health`, {}, 12000)
      if (r.ok) { console.log('acordou.'); return true }
    } catch { /* ainda subindo */ }
    process.stdout.write('.'); await new Promise((r) => setTimeout(r, 5000))
  }
  console.log(' desistiu.'); return false
}

const jsonSeguro = async (r) => { if (!r || r._dead) return null; try { return await r.json() } catch { return null } }
const textoSeguro = async (r) => { if (!r || r._dead) return ''; try { return await r.text() } catch { return '' } }

console.log(`\n═══════════ SMOKE-TEST PÓS-DEPLOY ═══════════`)
console.log(`API : ${API}`)
console.log(`WEB : ${WEB || '(não informado — pula o site)'}`)
console.log(`SSO : ${APP ? APP : '(APP_API_URL não informado — pula o SSO)'}`)
console.log(`login: ${EMAIL ? EMAIL : '(SMOKE_EMAIL/SENHA não informados — pula login)'}\n`)

// 1) Health público (com warmup)
await acordar(API)
{
  const r = await pega(`${API}/api/health`)
  const d = await jsonSeguro(r)
  ok(r.status === 200 && d && d.ok === true && d.now, 'GET /api/health → 200 {ok:true, now}', d?.now ? `banco respondeu ${d.now}` : `status ${r.status}${r._err ? ' ' + r._err : ''}`)
}

// 2) Gate de autenticação ativo (rota protegida sem token → 401)
{
  const r = await pega(`${API}/api/obras`)
  ok(r.status === 401, 'GET /api/obras sem token → 401 (gate ativo)', `status ${r.status}`)
}

// 3) CORS: a origem do site é refletida?
if (WEB) {
  const r = await pega(`${API}/api/health`, { headers: { Origin: WEB } })
  const allow = r.headers.get('access-control-allow-origin')
  ok(allow === WEB || allow === '*', 'CORS reflete a origem do site', `allow-origin: ${allow || '(ausente)'}`)
} else pular('CORS', 'WEB_URL não informado')

// 4) Login real → me → leitura (prova auth + banco + hash)
let tokenModulo = null
if (EMAIL && SENHA) {
  const r = await pega(`${API}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: SENHA }),
  })
  const d = await jsonSeguro(r)
  ok(r.status === 200 && d?.token, 'POST /api/auth/login → 200 + token', r.status === 200 ? `usuário: ${d?.user?.name || '?'}${d?.user?.isAdmin ? ' (admin)' : ''}` : `status ${r.status} ${d?.error || ''}`)
  tokenModulo = d?.token
  if (tokenModulo) {
    const me = await pega(`${API}/api/auth/me`, { headers: { Authorization: `Bearer ${tokenModulo}` } })
    ok(me.status === 200, 'GET /api/auth/me com token → 200')
    const ob = await pega(`${API}/api/obras`, { headers: { Authorization: `Bearer ${tokenModulo}` } })
    const arr = await jsonSeguro(ob)
    ok(ob.status === 200 && Array.isArray(arr), 'GET /api/obras com token → 200 (lista)', Array.isArray(arr) ? `${arr.length} obra(s)` : `status ${ob.status}`)
  }
} else pular('login/leitura', 'SMOKE_EMAIL/SMOKE_PASSWORD não informados')

// 5) SSO real: token EMITIDO PELO APP vale no MÓDULO? (mesmo JWT_SECRET)
if (APP && EMAIL && SENHA) {
  const rApp = await pega(`${APP}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: SENHA }),
  })
  const dApp = await jsonSeguro(rApp)
  if (rApp.status !== 200 || !dApp?.token) {
    ok(false, 'SSO: login no APP', `status ${rApp.status} ${dApp?.error || ''}`)
  } else {
    const me = await pega(`${API}/api/auth/me`, { headers: { Authorization: `Bearer ${dApp.token}` } })
    ok(me.status === 200, 'SSO: token do APP é aceito pelo MÓDULO → 200', `JWT_SECRET dos dois bate (status ${me.status})`)
  }
} else pular('SSO', 'APP_API_URL e/ou credenciais não informados')

// 6) Site estático (SPA) subiu?
if (WEB) {
  const r = await pega(WEB)
  const html = await textoSeguro(r)
  ok(r.status === 200 && /<div id="root">/.test(html), 'GET site → 200 e HTML da SPA', `status ${r.status}${r._err ? ' ' + r._err : ''}`)
} else pular('site', 'WEB_URL não informado')

console.log(`\n═════════════════════════════════════════════`)
console.log(`Resultado: ${pass} ok · ${fail} falhou · ${skip} pulado`)
if (fail) console.log('⚠️  Há falhas — o deploy NÃO está saudável. Veja acima.')
else if (skip) console.log('✅ O que foi testado passou. Rode com login+APP+WEB para a checagem completa (SSO inclusive).')
else console.log('✅ Deploy saudável: health, auth, banco, SSO e site.')
console.log('')
process.exit(fail ? 1 : 0)
