// Testes do parser de série de índices em lote. Rode: node tests/indices.test.mjs
import { parseSerieIndices } from '../server/importacao/indices.js'

let pass = 0, fail = 0
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m) } }
const pt = (r, ano, mes) => r.pontos.find((p) => p.ano === ano && p.mes === mes)

// 1) Competência + valor, índice do campo; decimal pt-BR e ponto
{
  const r = parseSerieIndices('2024-01 100,50\n2024-02;101.25\n02/2024 nope', 'sinapi')
  ok(r.pontos.length === 2, '2 pontos válidos (linha inválida vira erro)')
  ok(pt(r, 2024, 1).valor === 100.5 && pt(r, 2024, 1).indice === 'SINAPI', 'AAAA-MM + decimal vírgula; índice em maiúsculas')
  ok(pt(r, 2024, 2).valor === 101.25, 'separador ; e decimal ponto')
  ok(r.erros.length === 1 && r.erros[0].linha === 3, 'competência sem valor numérico → erro na linha 3')
}

// 2) Matriz anual (ano + 12 valores)
{
  const vals = Array.from({ length: 12 }, (_, i) => 100 + i).join(' ')
  const r = parseSerieIndices(`2025 ${vals}`, 'INCC')
  ok(r.pontos.length === 12, 'matriz: 12 meses')
  ok(pt(r, 2025, 1).valor === 100 && pt(r, 2025, 12).valor === 111, 'matriz: Jan=100..Dez=111')
  ok(r.pontos.every((p) => p.indice === 'INCC'), 'matriz: índice do campo')
}

// 3) Matriz parcial (< 12 valores) e > 12 (erro)
{
  const r = parseSerieIndices('2025 100 101 102', 'X')
  ok(r.pontos.length === 3 && pt(r, 2025, 3).valor === 102, 'matriz parcial: 3 meses')
  const r2 = parseSerieIndices('2025 ' + Array(13).fill(100).join(' '), 'X')
  ok(r2.pontos.length === 0 && r2.erros.length === 1, 'matriz > 12 valores → erro')
}

// 4) Índice inline sobrescreve o padrão
{
  const r = parseSerieIndices('SICRO 2024-03 250,0', 'SINAPI')
  ok(r.pontos.length === 1 && r.pontos[0].indice === 'SICRO', 'índice inline sobrescreve o campo')
}

// 5) Cabeçalho e comentários ignorados; sem índice → erro
{
  const r = parseSerieIndices('indice;ano;mes;valor\n# comentário\n\n2024-01 100', 'SINAPI')
  ok(r.pontos.length === 1 && r.erros.length === 0, 'cabeçalho/comentário/linha vazia ignorados')
  const semIdx = parseSerieIndices('2024-01 100', '')
  ok(semIdx.pontos.length === 0 && semIdx.erros.length === 1, 'sem índice (campo vazio, sem inline) → erro')
}

// 6) Validação de faixa (mês/ano/valor)
{
  const r = parseSerieIndices('2024-13 100\n1800-01 100\n2024-05 -3\n2024-06 0', 'S')
  ok(r.pontos.length === 0, 'todos fora de faixa → 0 pontos')
  ok(r.erros.length === 4, 'mês 13, ano 1800, valor negativo e valor 0 → 4 erros')
}

// 7) Dedup dentro do lote (última ocorrência vence)
{
  const r = parseSerieIndices('2024-01 100\n2024-01 200', 'S')
  ok(r.pontos.length === 1 && pt(r, 2024, 1).valor === 200, 'dedup por (indice,ano,mes): última vence')
}

// 8) Valor com milhar pt-BR
{
  const r = parseSerieIndices('2024-01 1.234,56', 'S')
  ok(r.pontos.length === 1 && pt(r, 2024, 1).valor === 1234.56, 'milhar pt-BR 1.234,56 → 1234.56')
}

// 9) Robustez: entrada vazia/nula não lança
{
  let threw = false
  try { parseSerieIndices(); parseSerieIndices(null, null); parseSerieIndices('', 'S') } catch { threw = true }
  ok(!threw, 'entrada vazia/nula não lança')
}

// 10) 3 colunas "ano mês valor" (colagem de planilha) → ponto único, não matriz (fix revisão)
{
  const r = parseSerieIndices('2024\t1\t100,50', 'SINAPI')
  ok(r.pontos.length === 1 && pt(r, 2024, 1) && pt(r, 2024, 1).valor === 100.5, '3 colunas ano/mês/valor → Jan=100,50 (não Jan=1/Fev=100,5)')
  const esp = parseSerieIndices('2024 03 250', 'S')
  ok(esp.pontos.length === 1 && pt(esp, 2024, 3).valor === 250, '"2024 03 250" → mês 3 = 250')
}

// 11) Célula vazia no meio da matriz (delimitada) → pula o mês, não desloca (fix revisão)
{
  const r = parseSerieIndices('2024;100;;102', 'S')
  ok(r.pontos.length === 2 && pt(r, 2024, 1).valor === 100 && !pt(r, 2024, 2) && pt(r, 2024, 3).valor === 102,
    'matriz com vazio interno: Jan=100, Fev pulado, Mar=102 (posição preservada)')
  const tab = parseSerieIndices('2024\t100\t\t102', 'S')
  ok(pt(tab, 2024, 3) && pt(tab, 2024, 3).valor === 102, 'idem com TAB')
}

// 12) Milhar pt-BR sem decimal → inteiro (fix revisão); misto vírgula preservado
{
  const r = parseSerieIndices('2024-01 1.850\n2025 1.089 1.095\n2023-03 2.845,67', 'CUB')
  ok(pt(r, 2024, 1).valor === 1850, '"1.850" → 1850 (milhar, não 1,85)')
  ok(pt(r, 2025, 1).valor === 1089 && pt(r, 2025, 2).valor === 1095, 'matriz milhar → 1089 / 1095')
  ok(pt(r, 2023, 3).valor === 2845.67, '"2.845,67" → 2845.67 (misto preservado)')
}

// 13) HEADER_RE .every: índice inline com nome de palavra reservada não é descartado (fix revisão)
{
  const r = parseSerieIndices('VALOR 2024-01 100', '')
  ok(r.pontos.length === 1 && r.pontos[0].indice === 'VALOR', 'índice inline "VALOR" aceito (não confundido com cabeçalho)')
  const hdr = parseSerieIndices('indice;ano;mes;valor\n2024-01 100', 'S')
  ok(hdr.pontos.length === 1 && hdr.erros.length === 0, 'linha 100% cabeçalho ainda é ignorada')
}

// 14) Teto numeric(14,4): valor acima do limite → erro (não passa p/ estourar no INSERT)
{
  const r = parseSerieIndices('2024-01 99999999999', 'S')
  ok(r.pontos.length === 0 && r.erros.length === 1, 'valor > numeric(14,4) → erro no parse (não 22003 no commit)')
}

console.log(`\nÍndices (lote): ${pass} passou, ${fail} falhou.`)
process.exit(fail ? 1 : 0)
