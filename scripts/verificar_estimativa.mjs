// ============================================================
// Verificação da estimativa paramétrica — bate os números contra a API viva.
// Lê /api/analogas (pipeline real: índice, regional, recência, similaridade) e
// roda o MESMO núcleo puro que /api/estimativas usa (metodos.js). NÃO grava nada.
//
// Uso:
//   1) API no ar:  npm run server   (ou npm run dev)
//   2) node scripts/verificar_estimativa.mjs
//   Opcional: API_URL (default http://localhost:3001). Requer .env com JWT_SECRET.
// ============================================================
import 'dotenv/config'
import jwt from 'jsonwebtoken'
import { estimarParametrico, nivelConfianca, coefVariacao, rotuloConfianca } from '../server/estimativa/metodos.js'

const API = process.env.API_URL || 'http://localhost:3001'
const SECRET = process.env.JWT_SECRET
if (!SECRET) { console.error('✗ JWT_SECRET ausente no .env'); process.exit(1) }
const token = jwt.sign({ sub: 'verificacao' }, SECRET, { expiresIn: '10m' })
const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

// Alvo do teste: praça nova de 1.500 m² (entre as duas praças do acervo).
const AREA = 1500
const DATA_BASE = '2026-07-01'
const BDI = 25

const brl = (n) => n == null ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const pct = (x) => `${Math.round((x || 0) * 100)}%`

async function getJSON(path, opt) {
  const r = await fetch(`${API}${path}`, opt)
  const txt = await r.text()
  if (!r.ok) throw new Error(`${path} → HTTP ${r.status}: ${txt.slice(0, 200)}`)
  try { return JSON.parse(txt) } catch { throw new Error(`${path} → resposta não-JSON: ${txt.slice(0, 120)}`) }
}

async function main() {
  console.log(`API: ${API}`)

  // 1) tipo de obra "Urbanização"
  const tipos = await getJSON('/api/tipos-obra', { headers: H })
  const urb = Array.isArray(tipos) && tipos.find((t) => /urbaniz/i.test(t.nome))
  if (!urb) { console.error('✗ Tipo "Urbanização" não encontrado. Tipos:', tipos); process.exit(1) }
  console.log(`Alvo: praça nova · tipo ${urb.nome} · área ${AREA} m² · data-base ${DATA_BASE} · BDI ${BDI}%\n`)

  // 2) obras análogas (pipeline real da API)
  const body = { tipoObraId: urb.id, areaAlvoM2: AREA, dataBase: DATA_BASE, limite: 20 }
  const { analogas } = await getJSON('/api/analogas', { method: 'POST', headers: H, body: JSON.stringify(body) })
  if (!analogas?.length) { console.error('✗ Nenhuma análoga retornada (o acervo tem obras elegíveis?).'); process.exit(1) }

  console.log('Obras análogas (todas, ordenadas por similaridade):')
  for (const a of analogas) {
    const tag = a.tipoObraId === urb.id ? '(mesmo tipo)' : ''
    console.log(`  ${String(a.codigo).padEnd(12)} ${String(a.nome).slice(0, 26).padEnd(26)} ${brl(a.custoM2).padStart(13)}/m²  sim ${pct(a.escore).padStart(4)}  ${tag}`)
  }

  // 3) manter só as do mesmo tipo — é o que o usuário faz ao desmarcar as pavimentações
  const pracas = analogas.filter((a) => a.tipoObraId === urb.id)
  console.log(`\nSelecionadas (mesmo tipo): ${pracas.map((a) => a.codigo).join(', ') || '—'}`)

  const estimar = (refs, rot) => {
    const custo = estimarParametrico(refs.map((a) => ({ custoM2: a.custoM2, peso: a.escore })), AREA)
    const simMedia = refs.reduce((s, a) => s + a.escore, 0) / refs.length
    const conf = nivelConfianca({ n: refs.length, coefVar: coefVariacao(refs.map((a) => a.custoM2)), simMedia })
    const preco = custo.esperado * (1 + BDI / 100)
    console.log(`\n── ${rot} (${refs.length} obra(s)) ──`)
    console.log(`  custo/m² ponderado : ${brl(custo.custoM2Prov)}/m²`)
    console.log(`  custo provável     : ${brl(custo.esperado)}   faixa ${brl(custo.O)} — ${brl(custo.P)}`)
    console.log(`  preço c/ BDI ${BDI}%    : ${brl(preco)}`)
    console.log(`  confiança          : ${rotuloConfianca(conf)} (${conf}%)`)
    return { custo, conf }
  }

  const r = estimar(pracas, 'Só praças (recomendado)')
  if (pracas.length !== analogas.length) estimar(analogas, 'Todas (para contraste — puxa p/ baixo)')

  // 4) conferência vs esperado (nominal, sem atualização por índice)
  console.log('\n── Conferência vs esperado ──')
  const chk = (label, got, exp, tol) => {
    const ok = got != null && Math.abs(got - exp) <= tol
    console.log(`  ${ok ? '✅' : '⚠️ '} ${label}: obtido ${typeof got === 'number' ? got.toFixed(2) : got} · esperado ~${exp} (±${tol})`)
  }
  chk('custo/m² ponderado', r.custo.custoM2Prov, 394, 12)
  chk('custo provável', r.custo.esperado, 590835, 25000)
  chk('confiança %', r.conf, 31, 9)
  console.log(`  ${r.conf < 40 ? '✅' : '⚠️ '} rótulo: ${rotuloConfianca(r.conf)} (esperado Baixa)`)
  console.log('\nObs.: se a série SINAPI dos seeds cobrir os meses, os custos podem vir atualizados e deslocar')
  console.log('os valores; o ranking (praça ≫ pavimentação) e a ordem de grandeza devem se manter.')
}
main().catch((e) => { console.error('✗', e.message); process.exit(1) })
