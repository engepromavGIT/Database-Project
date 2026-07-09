// Testes do Content-Disposition de anexos (server/obraDetalhe.js).
// Rode: node tests/anexos.test.mjs
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://u:p@localhost:5432/none'
const { contentDispositionAnexo } = await import('../server/obraDetalhe.js')

let pass = 0, fail = 0
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m) } }
const soAscii = (s) => [...s].every((ch) => ch.charCodeAt(0) <= 0x7e)

// Nome ASCII simples
let cd = contentDispositionAnexo('orcamento.pdf')
ok(cd === "attachment; filename=\"orcamento.pdf\"; filename*=UTF-8''orcamento.pdf", 'nome ASCII simples')

// Nome com caractere > U+00FF (travessão) — regressão do HTTP 500 (ERR_INVALID_CHAR).
const nome = 'Orçamento — Praça 2ª.pdf'
cd = contentDispositionAnexo(nome)
ok(soAscii(cd), 'valor do header é 100% ASCII (não dispara ERR_INVALID_CHAR)')
ok(cd.includes('filename="') && cd.includes("filename*=UTF-8''"), 'tem filename= (fallback) e filename*=')
const m = cd.match(/filename\*=UTF-8''(.+)$/)
ok(m && decodeURIComponent(m[1]) === nome, 'filename* decodifica de volta para o nome original acentuado')

// Aspas e CR/LF são removidos (evita header splitting / valor inválido).
cd = contentDispositionAnexo('a"b\r\nc.pdf')
ok(cd.includes('filename="abc.pdf"') && !/[\r\n]/.test(cd), 'remove aspas e CR/LF do nome')

// Nulo/vazio → "anexo"
ok(contentDispositionAnexo(null).includes('filename="anexo"'), 'nome nulo → "anexo"')
ok(contentDispositionAnexo('').includes('filename="anexo"'), 'nome vazio → "anexo"')

console.log(`\nAnexos (Content-Disposition): ${pass} passou, ${fail} falhou.`)
process.exit(fail ? 1 : 0)
