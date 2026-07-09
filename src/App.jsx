import React, { useEffect, useState } from 'react'
import { api } from './data/api.js'
import { Dashboard } from './screens/Dashboard.jsx'
import { Acervo } from './screens/Acervo.jsx'
import { Estimativa } from './screens/Estimativa.jsx'
import { Cenarios } from './screens/Cenarios.jsx'
import { Comparar } from './screens/Comparar.jsx'
import { Importar } from './screens/Importar.jsx'
import { Clientes } from './screens/Clientes.jsx'
import { Auditoria } from './screens/Auditoria.jsx'

// ---------------- Login ----------------
function Login({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    setError(null); setBusy(true)
    try {
      await onLogin(email.trim(), password)
    } catch (err) {
      setError(err.message || 'Não foi possível entrar.'); setBusy(false)
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <img src="/assets/promav-mark-light.svg" alt="" />
          <span className="word">promav</span>
        </div>
        <h1 className="login-title">Base de Projetos</h1>
        <p className="login-sub">Acesse com sua conta Promav.</p>

        <div className="field">
          <label>Email</label>
          <input className="control" type="email" autoFocus autoComplete="username"
            placeholder="voce@promav.app" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label>Senha</label>
          <input className="control" type="password" autoComplete="current-password"
            placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>

        {error && <div className="login-error">{error}</div>}

        <button className="btn btn-primary login-submit" type="submit" disabled={busy || !email || !password}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}

// ---------------- Shell com abas ----------------
const ABAS = [
  ['painel', 'Painel', Dashboard],
  ['acervo', 'Acervo', Acervo],
  ['clientes', 'Clientes', Clientes],
  ['estimativa', 'Estimativa', Estimativa],
  ['cenarios', 'Cenários', Cenarios],
  ['comparar', 'Comparar', Comparar],
  ['importar', 'Importar', Importar],
]
// Aba restrita a administradores (o endpoint /api/auditoria também exige admin).
const ABA_ADMIN = ['auditoria', 'Auditoria', Auditoria]

function Shell({ user, onLogout }) {
  const [aba, setAba] = useState('painel')
  const abas = user.isAdmin ? [...ABAS, ABA_ADMIN] : ABAS
  const Tela = (abas.find(([id]) => id === aba) || abas[0])[2]
  return (
    <div style={{ maxWidth: 1060, margin: '0 auto', padding: 'var(--sp-4)' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--sp-4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
          <img src="/assets/promav-mark.svg" alt="" height="28" />
          <strong>Base de Projetos</strong>
          <nav style={{ display: 'flex', gap: 'var(--sp-2)', marginLeft: 'var(--sp-3)' }}>
            {abas.map(([id, rotulo]) => (
              <button key={id} className={`btn btn-sm ${aba === id ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setAba(id)}>
                {rotulo}
              </button>
            ))}
          </nav>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)' }}>
          <span className="chip">{user.name}</span>
          <button className="btn btn-secondary btn-sm" onClick={onLogout}>Sair</button>
        </div>
      </header>

      <Tela user={user} />
    </div>
  )
}

// ---------------- App ----------------
export default function App() {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    api.setUnauthorizedHandler(() => setUser(null))
    if (api.hasToken()) {
      api.me().then(setUser).catch(() => {}).finally(() => setReady(true))
    } else {
      setReady(true)
    }
  }, [])

  if (!ready) return <div className="login-wrap"><div className="login-card">Carregando…</div></div>
  if (!user) return <Login onLogin={async (e, p) => setUser(await api.login(e, p))} />
  return <Shell user={user} onLogout={() => { api.logout(); setUser(null) }} />
}
