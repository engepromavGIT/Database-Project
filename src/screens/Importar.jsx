import React, { useState } from 'react'
import { api } from '../data/api.js'
import { brl, num } from '../data/format.js'

const ROTULO_CAMPO = {
  codigo: 'Código', nome: 'Nome', tipo: 'Tipo', padrao: 'Padrão', municipio: 'Município', uf: 'UF',
  areaConstruidaM2: 'Área (m²)', custoRealTotal: 'Custo real', custoOrcadoTotal: 'Custo orçado',
  dtInicioReal: 'Início real', dtFimReal: 'Fim real', dataBaseCusto: 'Data-base', elegivel: 'Elegível',
}

export function Importar() {
  const [analise, setAnalise] = useState(null)
  const [resultado, setResultado] = useState(null)
  const [erro, setErro] = useState(null)
  const [busy, setBusy] = useState(false)
  const [nomeArquivo, setNomeArquivo] = useState('')
  const [atualizar, setAtualizar] = useState(true) // RF-C04: atualizar obras já existentes (por código)

  const aoEscolher = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setErro(null); setResultado(null); setAnalise(null); setBusy(true); setNomeArquivo(file.name)
    try { setAnalise(await api.importarAnalisar(file)) } catch (err) { setErro(err.message) } finally { setBusy(false) }
  }

  const confirmar = async () => {
    if (!analise) return
    setBusy(true); setErro(null)
    try { setResultado(await api.importarConfirmar(analise.linhas, analise.mapa, atualizar ? 'atualizar' : 'pular')) }
    catch (err) { setErro(err.message) } finally { setBusy(false) }
  }

  return (
    <div style={{ display: 'grid', gap: 'var(--sp-4)' }}>
      <section className="card" style={{ padding: 'var(--sp-4)' }}>
        <div className="eyebrow">Importar obras (CSV ou Excel)</div>
        <p style={{ color: 'var(--fg-3)', fontSize: 13 }}>
          Uma linha por obra. Colunas reconhecidas: código, nome, tipo, padrão, município, UF, área,
          custo real, custo orçado, início, fim, data-base, elegível.
        </p>
        <input type="file" accept=".csv,.xlsx,.xls" onChange={aoEscolher} />
        {nomeArquivo && <span style={{ marginLeft: 8, color: 'var(--fg-3)', fontSize: 13 }}>{nomeArquivo}</span>}
        {erro && <div className="login-error" style={{ marginTop: 'var(--sp-2)' }}>{erro}</div>}
        {busy && <p className="empty">Processando…</p>}
      </section>

      {analise && (
        <section className="card" style={{ padding: 'var(--sp-4)' }}>
          <div className="eyebrow">Mapeamento detectado</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)', margin: '8px 0' }}>
            {Object.keys(ROTULO_CAMPO).map((campo) => (
              <span key={campo} className="chip" style={{ opacity: analise.mapa[campo] != null ? 1 : 0.4 }}>
                {ROTULO_CAMPO[campo]}: {analise.mapa[campo] != null ? (analise.headers[analise.mapa[campo]] || '—') : '(não encontrado)'}
              </span>
            ))}
          </div>

          <div className="eyebrow" style={{ marginTop: 'var(--sp-3)' }}>
            Prévia ({analise.previa.length} de {analise.totalLinhas} linhas)
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead><tr style={{ textAlign: 'left', color: 'var(--fg-3)' }}>
                <th>Código</th><th>Situação</th><th>Nome</th><th>Tipo</th><th>Área</th><th>Custo real</th><th>UF</th><th>Início</th><th>Fim</th><th>Ref.</th>
              </tr></thead>
              <tbody>
                {analise.previa.map((l, i) => (
                  <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                    <td>{l.codigo || '—'}</td>
                    <td>{l.existe ? <span className="chip" style={{ background: 'var(--prio-medium)', color: '#fff' }}>já existe</span> : <span style={{ color: 'var(--fg-3)' }}>nova</span>}</td>
                    <td>{l.nome || '—'}</td><td>{l.tipoNome || '—'}</td>
                    <td>{l.areaConstruidaM2 != null ? num(l.areaConstruidaM2, 2) : '—'}</td>
                    <td>{brl(l.custoRealTotal)}</td><td>{l.uf || '—'}</td>
                    <td>{l.dtInicioReal || '—'}</td><td>{l.dtFimReal || '—'}</td>
                    <td>{l.elegivel ? '✓' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* RF-C04 — reimportação idempotente por código */}
          {analise.jaExistem > 0 && (
            <div style={{ marginTop: 'var(--sp-3)', fontSize: 13 }}>
              <span style={{ color: 'var(--prio-medium)' }}>{analise.jaExistem} obra(s) já existem no acervo (mesmo código).</span>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6, color: 'var(--fg-3)' }}>
                <input type="checkbox" checked={atualizar} onChange={(e) => setAtualizar(e.target.checked)} />
                Atualizar as obras existentes (idempotente); desmarque para pular e só inserir as novas.
              </label>
            </div>
          )}

          <button className="btn btn-primary" style={{ marginTop: 'var(--sp-3)' }} disabled={busy} onClick={confirmar}>
            Importar {analise.totalLinhas} linha(s)
          </button>
        </section>
      )}

      {resultado && (
        <section className="card" style={{ padding: 'var(--sp-4)' }}>
          <div className="eyebrow">Resultado</div>
          <p>
            <strong>{resultado.inseridas}</strong> inserida(s)
            {resultado.atualizadas > 0 && <> · <strong>{resultado.atualizadas}</strong> atualizada(s)</>}
            {resultado.puladas > 0 && <> · <strong>{resultado.puladas}</strong> pulada(s)</>}
            {' '}de {resultado.total}.
          </p>
          {resultado.erros.length > 0 && (
            <>
              <p style={{ color: 'var(--danger)' }}>{resultado.erros.length} linha(s) com erro:</p>
              <ul style={{ fontSize: 13 }}>
                {resultado.erros.slice(0, 20).map((e, i) => (
                  <li key={i}>Linha {e.linha}: {e.erros.join(', ')}</li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </div>
  )
}
