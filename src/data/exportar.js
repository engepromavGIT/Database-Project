// Exporta linhas para CSV e dispara o download no navegador (sem dependências).
// Separador ';' e BOM UTF-8 para o Excel pt-BR abrir corretamente com acentos.
export function baixarCSV(nomeArquivo, colunas, linhas) {
  const esc = (v) => {
    let s = v == null ? '' : String(v)
    // Neutraliza injeção de fórmula (CWE-1236): célula iniciada por =,+,-,@,TAB,CR é
    // avaliada como fórmula pelo Excel/LibreOffice. Prefixa com ' antes de decidir a citação.
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
    return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const cabecalho = colunas.map((c) => esc(c.rotulo)).join(';')
  const corpo = linhas.map((l) => colunas.map((c) => esc(c.valor(l))).join(';')).join('\r\n')
  const conteudo = `﻿${cabecalho}\r\n${corpo}`
  const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomeArquivo
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
