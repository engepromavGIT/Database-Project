// Cliente da API (Express + Neon). Mesmo padrão do app Promav.
// Em dev, VITE_API_URL é vazio → usa /api (proxy do Vite).
const BASE = (import.meta.env.VITE_API_URL || '') + '/api'
const TOKEN_KEY = 'promav-orc-token' // chave própria do módulo

let token = null
try { token = localStorage.getItem(TOKEN_KEY) } catch { /* ignore */ }

function setToken(t) {
  token = t
  try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY) } catch { /* ignore */ }
}

let onUnauthorized = () => {}

async function req(method, path, body) {
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (res.status === 401 && path !== '/auth/login') {
    setToken(null)
    onUnauthorized()
  }
  if (!res.ok) {
    let msg = `${res.status}`
    try { msg = (await res.json()).error || msg } catch { /* corpo não-JSON */ }
    throw new Error(msg)
  }
  if (res.status === 204) return null
  return res.json()
}

export const api = {
  hasToken: () => !!token,
  setUnauthorizedHandler: (fn) => { onUnauthorized = fn },

  // ----- auth -----
  login: async (email, password) => {
    const { token: t, user } = await req('POST', '/auth/login', { email, password })
    setToken(t)
    return user
  },
  me: () => req('GET', '/auth/me'),
  logout: () => setToken(null),

  // ----- cadastros -----
  tiposObra: () => req('GET', '/tipos-obra'),
  padroes: () => req('GET', '/padroes'),
  categorias: () => req('GET', '/categorias'),
  localidades: () => req('GET', '/localidades'),
  servicos: () => req('GET', '/servicos'),

  // ----- clientes (RF-A01 / US-08) -----
  clientes: (todos) => req('GET', `/clientes${todos ? '?todos=1' : ''}`),
  createCliente: (data) => req('POST', '/clientes', data),
  updateCliente: (id, data) => req('PUT', `/clientes/${id}`, data),

  // ----- obras / indicadores / dashboard -----
  obras: (filtros) => {
    const ativos = Object.entries(filtros || {}).filter(([, v]) => v !== '' && v != null)
    const qs = ativos.length ? `?${new URLSearchParams(ativos).toString()}` : ''
    return req('GET', `/obras${qs}`)
  },
  obra: (id) => req('GET', `/obras/${id}`),
  createObra: (data) => req('POST', '/obras', data),
  updateObra: (id, data) => req('PUT', `/obras/${id}`, data),
  deleteObra: (id) => req('DELETE', `/obras/${id}`),
  indicadores: () => req('GET', '/indicadores'),
  dashboard: () => req('GET', '/dashboard'),

  // ----- detalhamento de obra (EAP / itens / realizados / ABC) -----
  obraEtapas: (obraId) => req('GET', `/obras/${obraId}/etapas`),
  addEtapa: (obraId, data) => req('POST', `/obras/${obraId}/etapas`, data),
  updEtapa: (id, data) => req('PUT', `/etapas/${id}`, data),
  delEtapa: (id) => req('DELETE', `/etapas/${id}`),
  etapaItens: (etapaId) => req('GET', `/etapas/${etapaId}/itens`),
  addItem: (etapaId, data) => req('POST', `/etapas/${etapaId}/itens`, data),
  updItem: (id, data) => req('PUT', `/itens/${id}`, data),
  delItem: (id) => req('DELETE', `/itens/${id}`),
  etapaRealizados: (etapaId) => req('GET', `/etapas/${etapaId}/realizados`),
  addRealizado: (etapaId, data) => req('POST', `/etapas/${etapaId}/realizados`, data),
  updRealizado: (id, data) => req('PUT', `/realizados/${id}`, data),
  delRealizado: (id) => req('DELETE', `/realizados/${id}`),
  curvaAbc: (obraId) => req('GET', `/obras/${obraId}/curva-abc`),

  // ----- auditoria (RF-B08 / RF-H05) — restrito a admin -----
  auditoria: (limite = 100) => req('GET', `/auditoria?limite=${limite}`),

  // ----- anexos (RF-B06 / US-18) -----
  obraAnexos: (obraId) => req('GET', `/obras/${obraId}/anexos`),
  // URL de download direto (<a href>); o requireAuth do servidor aceita ?token=.
  anexoUrl: (anexoId) => `${BASE}/anexos/${anexoId}${token ? `?token=${encodeURIComponent(token)}` : ''}`,

  // ----- comparação (RF-E03) -----
  comparar: (obraIds) => req('POST', '/comparar', { obraIds }),

  // ----- conciliação SINAPI (RF-C03) -----
  conciliar: (itens) => req('POST', '/conciliar', { itens }),

  // ----- análogas / estimativa (E5 / E6) -----
  analogas: (body) => req('POST', '/analogas', body),
  estimativas: () => req('GET', '/estimativas'),
  estimativa: (id) => req('GET', `/estimativas/${id}`),
  createEstimativa: (body) => req('POST', '/estimativas', body),
  registrarRealizado: (id, custoRealizado) => req('POST', `/estimativas/${id}/realizado`, { custoRealizado }),

  // ----- cenários / versões -----
  cenarios: () => req('GET', '/cenarios'),
  cenario: (grupo) => req('GET', `/cenarios/${grupo}`),

  // ----- PDF (RF-G02) -----
  estimativaPdf: async (id) => {
    const headers = {}
    if (token) headers['Authorization'] = `Bearer ${token}`
    const res = await fetch(`${BASE}/estimativas/${id}/pdf`, { headers })
    if (res.status === 401) { setToken(null); onUnauthorized() }
    if (!res.ok) { let m = `${res.status}`; try { m = (await res.json()).error || m } catch { /* */ } throw new Error(m) }
    return res.blob()
  },

  // ----- importação (E3) -----
  importarAnalisar: async (file) => {
    const buf = await file.arrayBuffer()
    const headers = { 'Content-Type': 'application/octet-stream' }
    if (token) headers['Authorization'] = `Bearer ${token}`
    const res = await fetch(`${BASE}/importacao/analisar`, { method: 'POST', headers, body: buf })
    if (res.status === 401) { setToken(null); onUnauthorized() }
    if (!res.ok) { let m = `${res.status}`; try { m = (await res.json()).error || m } catch { /* */ } throw new Error(m) }
    return res.json()
  },
  importarConfirmar: (linhas, mapa) => req('POST', '/importacao/confirmar', { linhas, mapa }),
}
