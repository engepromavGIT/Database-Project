// Testes do Content-Disposition de anexos (server/obraDetalhe.js).
// Rode: node tests/anexos.test.mjs
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://u:p@localhost:5432/none'
const { contentDispositionAnexo, nomeAnexo } = await import('../server/obraDetalhe.js')

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

// ----- nomeAnexo(): sanitiza o ?filename= do upload (RF-B06) -----
{
  ok(nomeAnexo('planilha.pdf') === 'planilha.pdf', 'nome simples passa')
  ok(nomeAnexo('ORÇAMENTO — 07 Praças.pdf') === 'ORÇAMENTO — 07 Praças.pdf', 'acentos/travessão preservados')
  // Path traversal: fica só o basename (evita nome enganoso gravado no banco).
  ok(nomeAnexo('../../etc/passwd') === 'passwd', 'remove caminho unix')
  ok(nomeAnexo('C:\\Users\\fulano\\orc.pdf') === 'orc.pdf', 'remove caminho windows')
  ok(nomeAnexo('a"b\r\nc.pdf') === 'abc.pdf', 'remove aspas e CR/LF (não quebra o header)')
  ok(nomeAnexo('  espaco.pdf  ') === 'espaco.pdf', 'faz trim')
  ok(nomeAnexo('') === null, 'vazio → null (chamador responde 400)')
  ok(nomeAnexo('   ') === null, 'só espaços → null')
  ok(nomeAnexo('/') === null, 'só separador → null')
  // Param repetido no query string vira array → não pode estourar (classe de bug já vista aqui).
  ok(nomeAnexo(['a.pdf', 'b.pdf']) === null, 'array (param repetido) → null, não lança')
  ok(nomeAnexo(undefined) === null && nomeAnexo(null) === null, 'ausente → null')
  ok(nomeAnexo('x'.repeat(300)).length === 200, 'nome gigante é truncado em 200')
  ok(!/[\r\n]/.test(contentDispositionAnexo(nomeAnexo('a"b\r\nc.pdf'))), 'nomeAnexo + CD → header sem CR/LF')
}

console.log(`\nAnexos (Content-Disposition + nomeAnexo): ${pass} passou, ${fail} falhou.`)
process.exit(fail ? 1 : 0)
