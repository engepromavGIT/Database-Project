// Testes do mapeamento/validação de importação. Rode: node tests/importacao.test.mjs
import { normalizar, mapearCabecalho, numero, data, montarLinha, validarLinha, ehVerdadeiro } from '../server/importacao/mapear.js'

let pass = 0, fail = 0
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m) } }
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} (got ${JSON.stringify(a)})`)

// normalização
eq(normalizar('Área (m²)'), 'aream2', 'normalizar acentos/símbolos')
eq(normalizar('Código'), 'codigo', 'normalizar código')

// número pt-BR
eq(numero('1.234.567,89'), 1234567.89, 'numero milhar+decimal')
eq(numero('1234,5'), 1234.5, 'numero decimal vírgula')
eq(numero('1234.5'), 1234.5, 'numero decimal ponto')
eq(numero('R$ 2.000.000,00'), 2000000, 'numero com prefixo')
eq(numero(1234), 1234, 'numero já numérico')
eq(numero(''), null, 'numero vazio')

// datas
eq(data('01/03/2024'), '2024-03-01', 'data DD/MM/YYYY')
eq(data('2024-12-15'), '2024-12-15', 'data ISO')
eq(data('2024-03'), '2024-03-01', 'data só mês')

// cabeçalho
const headers = ['Código', 'Nome da Obra', 'Área (m²)', 'Custo Real', 'Custo Orçado', 'UF', 'Município', 'Início', 'Fim', 'Data-base', 'Elegível']
const mapa = mapearCabecalho(headers)
ok(mapa.codigo === 0, 'mapa codigo')
ok(mapa.nome === 1, 'mapa nome')
ok(mapa.areaConstruidaM2 === 2, 'mapa area')
ok(mapa.custoRealTotal === 3, 'mapa custo real')
ok(mapa.custoOrcadoTotal === 4, 'mapa custo orçado')
ok(mapa.uf === 5, 'mapa uf')
ok(mapa.municipio === 6, 'mapa municipio')
ok(mapa.dataBaseCusto === 9, 'mapa data-base')

// montar + validar
const row = ['OBR-1', 'Galpão Industrial', '1.234,50', '2.000.000,00', '1.800.000,00', 'sp', 'São Paulo', '01/03/2024', '15/12/2024', '2024-03', 'Sim']
const l = montarLinha(row, mapa)
eq(l.codigo, 'OBR-1', 'linha codigo')
eq(l.areaConstruidaM2, 1234.5, 'linha area')
eq(l.custoRealTotal, 2000000, 'linha custo real')
eq(l.uf, 'SP', 'linha uf maiúsculo')
eq(l.dtInicioReal, '2024-03-01', 'linha início')
eq(l.dataBaseCusto, '2024-03-01', 'linha data-base mês')
ok(l.elegivel === true, 'linha elegível')
ok(validarLinha(l).ok === true, 'linha válida')

const ruim = montarLinha(['', '', '', '', '', '', '', '', '', '', ''], mapa)
ok(validarLinha(ruim).ok === false, 'linha inválida (sem código/nome)')
ok(ehVerdadeiro('não') === false && ehVerdadeiro('Sim') === true, 'ehVerdadeiro')

console.log(`\nImportação: ${pass} passou, ${fail} falhou.`)
process.exit(fail ? 1 : 0)
