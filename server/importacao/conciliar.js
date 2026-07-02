// Conciliação de serviços com o catálogo SINAPI/composições (RF-C03).
// Funções PURAS. Casa por código SINAPI (exato) ou por descrição (exata/parcial).
import { normalizar } from './mapear.js'

// item: { codigoSinapi?, descricao? }
// catalogo: [{ id, codigoSinapi, descricao, unidade }]
export function conciliarServico(item, catalogo) {
  if (item && item.codigoSinapi) {
    const alvo = String(item.codigoSinapi).trim()
    const m = catalogo.find((c) => c.codigoSinapi && String(c.codigoSinapi).trim() === alvo)
    if (m) return { match: m, score: 1, motivo: 'codigo' }
  }
  const dn = normalizar(item && item.descricao)
  if (dn) {
    const exato = catalogo.find((c) => normalizar(c.descricao) === dn)
    if (exato) return { match: exato, score: 1, motivo: 'descricao_exata' }
    const parcial = catalogo.find((c) => {
      const cn = normalizar(c.descricao)
      return cn && (cn.includes(dn) || dn.includes(cn))
    })
    if (parcial) return { match: parcial, score: 0.6, motivo: 'descricao_parcial' }
  }
  return { match: null, score: 0, motivo: 'sem_correspondencia' }
}

export function conciliarLista(itens, catalogo) {
  return (Array.isArray(itens) ? itens : []).map((it, i) => ({ indice: i, ...conciliarServico(it, catalogo) }))
}
