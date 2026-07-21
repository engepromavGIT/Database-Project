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

// ---- RF-C02: avisos (a linha grava, mas não serve para algum uso) ----
const base = { codigo: 'OB-1', nome: 'Obra', elegivel: false, areaConstruidaM2: 1000, custoRealTotal: 1000000, custoOrcadoTotal: 900000, dtInicioReal: '2024-01-01', dtFimReal: '2024-12-01', dataBaseCusto: '2024-01-01' }
const val = (over) => validarLinha({ ...base, ...over })
const temAviso = (v, tr) => v.avisos.some((a) => a.includes(tr))

// Contrato: sempre existe a lista, mesmo quando vazia — a tela itera sem guardas.
ok(Array.isArray(val({}).avisos) && val({}).avisos.length === 0, 'linha completa → sem avisos')
ok(validarLinha(ruim).avisos !== undefined, 'linha com erro também traz avisos[]')

// Elegível sem o que a torna útil: hoje isso entra no acervo 100% silencioso.
ok(temAviso(val({ elegivel: true, areaConstruidaM2: null }), 'sem área'), 'referência sem área → aviso')
ok(temAviso(val({ elegivel: true, dtFimReal: null }), 'não contribui para estimativa de prazo'), 'referência sem data fim → aviso de prazo')
ok(temAviso(val({ elegivel: true, custoOrcadoTotal: null }), 'aderência'), 'referência sem custo orçado → aviso de aderência')
ok(temAviso(val({ elegivel: true, dataBaseCusto: null }), 'atualizado monetariamente'), 'referência sem data-base → aviso')
// Não elegível não é cobrado de utilidade.
ok(val({ elegivel: false, areaConstruidaM2: null, custoRealTotal: null, dataBaseCusto: null }).avisos.length === 0, 'não elegível → não cobra utilidade')

// REGRESSÃO (achado ALTA): o CAND da paramétrica é
//   COALESCE(NULLIF(custo_real_total, 0), custo_orcado_total) > 0
// Logo, sem custo real a obra NÃO fica de fora — ela ENTRA usando o orçado, que o CAND ainda
// aliasa como "custoRealTotal". O aviso dizia "não entrará em estimativa paramétrica": o oposto
// da verdade, tranquilizando o usuário sobre uma linha que vai puxar a estimativa.
const semReal = val({ elegivel: true, custoRealTotal: null, custoOrcadoTotal: 900000 })
ok(!temAviso(semReal, 'não entrará em estimativa paramétrica'), 'sem custo real mas COM orçado → NÃO afirma que fica de fora')
ok(temAviso(semReal, 'ORÇADO será usado como se fosse realizado'), 'sem custo real mas COM orçado → avisa a substituição')
const semRealZero = val({ elegivel: true, custoRealTotal: 0, custoOrcadoTotal: 900000 })
ok(temAviso(semRealZero, 'ORÇADO será usado como se fosse realizado'), 'custo real ZERO cai no mesmo COALESCE (NULLIF)')
// Só quando o COALESCE também não salva é que a obra fica de fora de verdade.
ok(temAviso(val({ elegivel: true, custoRealTotal: null, custoOrcadoTotal: null }), 'sem custo real nem orçado'), 'sem nenhum dos dois → aí sim fica de fora')

// Zero é AVISO e não erro: a linha continua gravável (senão a reimportação quebraria).
ok(val({ areaConstruidaM2: 0 }).ok === true && temAviso(val({ areaConstruidaM2: 0 }), 'área zero'), 'área zero → aviso, não erro')
ok(val({ custoRealTotal: 0 }).ok === true, 'custo real zero → não é erro')
// "nenhuma estimativa" era falso: aderenciaHistorica não filtra por área.
ok(!temAviso(val({ areaConstruidaM2: 0 }), 'nenhuma estimativa'), 'área zero não afirma "nenhuma estimativa"')
ok(temAviso(val({ areaConstruidaM2: 0 }), 'ainda conta na aderência'), 'área zero diz onde a obra AINDA conta')

// Zero em custo orçado excluía da aderência sem avisar: `== null` não pega 0, e uma célula com
// "n/a"/"a definir"/" " vira 0 em numero().
ok(temAviso(val({ elegivel: true, custoOrcadoTotal: 0 }), 'aderência'), 'custo orçado ZERO → avisa (não só null)')
ok(temAviso(val({ elegivel: true, custoRealTotal: 0, custoOrcadoTotal: 800000 }), 'não contribui para a aderência'), 'custo real ZERO → avisa aderência')

// Outlier de aderência: erro de digitação em custo envenena todo bottom-up futuro daquele tipo.
ok(temAviso(val({ custoRealTotal: 3000000, custoOrcadoTotal: 1000000 }), 'divergem'), 'realizado 3× o orçado → aviso')
ok(temAviso(val({ custoRealTotal: 1000000, custoOrcadoTotal: 3000000 }), 'divergem'), 'orçado 3× o realizado → aviso')
ok(!temAviso(val({ custoRealTotal: 1200000, custoOrcadoTotal: 1000000 }), 'divergem'), 'divergência normal (1,2×) → sem aviso')
ok(!temAviso(val({ custoRealTotal: 1000000, custoOrcadoTotal: null }), 'divergem'), 'sem orçado → não calcula razão (não divide por null)')

// Erros continuam erros (o /confirmar depende de ok/erros — contrato preservado).
ok(val({ dtInicioReal: '2024-12-01', dtFimReal: '2024-01-01' }).ok === false, 'fim antes do início → erro')
ok(val({ areaConstruidaM2: -5 }).ok === false, 'área negativa → erro')

console.log(`\nImportação: ${pass} passou, ${fail} falhou.`)
process.exit(fail ? 1 : 0)
