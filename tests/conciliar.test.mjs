// Testes da conciliação SINAPI. Rode: node tests/conciliar.test.mjs
import { conciliarServico, conciliarLista } from '../server/importacao/conciliar.js'

let pass = 0, fail = 0
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m) } }

const cat = [
  { id: 's1', codigoSinapi: '94990', descricao: 'Concreto usinado fck 25 MPa', unidade: 'm³' },
  { id: 's2', codigoSinapi: null, descricao: 'Alvenaria de bloco cerâmico', unidade: 'm²' },
]

let r = conciliarServico({ codigoSinapi: '94990' }, cat)
ok(r.match && r.match.id === 's1' && r.motivo === 'codigo', 'casa por código SINAPI')

r = conciliarServico({ descricao: 'concreto usinado fck 25 mpa' }, cat)
ok(r.match && r.match.id === 's1' && r.motivo === 'descricao_exata', 'casa por descrição exata (normalizada)')

r = conciliarServico({ descricao: 'Alvenaria' }, cat)
ok(r.match && r.match.id === 's2' && r.motivo === 'descricao_parcial' && r.score === 0.6, 'casa por descrição parcial')

r = conciliarServico({ descricao: 'Pintura epóxi' }, cat)
ok(r.match === null && r.motivo === 'sem_correspondencia', 'sem correspondência')

const lista = conciliarLista([{ codigoSinapi: '94990' }, { descricao: 'xyz' }], cat)
ok(lista.length === 2 && lista[0].indice === 0 && lista[0].match.id === 's1' && lista[1].match === null, 'conciliarLista mapeia índices e matches')

console.log(`\nConciliação: ${pass} passou, ${fail} falhou.`)
process.exit(fail ? 1 : 0)
