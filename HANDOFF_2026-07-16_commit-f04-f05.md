# Handoff (Cowork → Claude Code) — 2026-07-16

**Ação: commitar um trabalho que já está pronto na árvore, sem o lixo junto.**

Ao continuar, o Cowork encontrou **RF-F04 e RF-F05 já implementados, porém NÃO commitados** (o
`git status` está sujo). O código não é do Cowork — provavelmente uma sessão anterior que parou
antes do commit. **Nenhuma linha foi alterada por este handoff**; o Cowork só verificou.

## O que está pronto (e verificado)

Verifiquei a árvore suja inteira: **`npm run check` OK · `npm test` 296 passou, 0 falhou · `npm run
build` OK (30 módulos)**. As suítes novas passam: **Bottom-up 34** (era 10) e **Formatadores 32**.

- **RF-F04** — o bottom-up agora grava `nivel_confianca_pct`. `server/estimativa/metodos.js` ganhou
  `confiancaBottomUp()` (com constantes `BU_*` explícitas): trata acervo vazio (o caso da produção
  hoje → base 30, "não calibrado"), caso degenerado (otimista em R$ 0), e só credita dispersão a
  partir de 3 obras. `server/index.js` chama e persiste; a UI mostra confiança + rótulo.
- **RF-F05** — a **faixa O–P de prazo** aparece na UI, simétrica à de custo. `src/data/format.js`
  ganhou `faixaPrazo`, `prazoDias`, `aderenciaTexto`; `Estimativa.jsx` e `Cenarios.jsx` exibem.

A lógica é sólida (constantes revisáveis, casos-limite tratados, testada). Vale a revisão adversarial
de vocês por cima, mas **não** reimplementem — está completo.

## Como commitar (só os arquivos reais)

```
git add server/estimativa/metodos.js server/index.js src/data/format.js \
        src/screens/Estimativa.jsx src/screens/Cenarios.jsx \
        tests/bottomup.test.mjs tests/format.test.mjs package.json \
        HANDOFF_2026-07-16_commit-f04-f05.md
git commit -m "RF-F04 confiança do bottom-up + RF-F05 faixa O–P de prazo na UI"
git push origin main
```

## NÃO commitar (ruído e rascunho)

1. **`.claude/launch.json`** — o diff é **só de fim-de-linha** (CRLF↔LF); o conteúdo é idêntico.
   Descarte: `git checkout -- .claude/launch.json`.
2. **`_rprobe1.mjs` e `_rprobe2.mjs`** (na raiz) — rascunhos de análise do cenário "produção hoje,
   0 obras". Não são referenciados por nada do projeto. Apague:
   `git rm -f --ignore-unmatch _rprobe1.mjs _rprobe2.mjs` (ou `del`/`rm`).
   *(Sugestão: adicionar `_rprobe*.mjs` ou `_*.mjs` ao `.gitignore` para rascunhos futuros não
   aparecerem.)*

Confirme com `git status` limpo depois. Rode `npm test` → deve dar **296 passou**.

## Contexto de estado (para o log)

O módulo **está em produção** (commit `69082ad`: migração + publicação, smoke 6/6 com SSO). Com F04/F05
commitados, o backlog de código fica só em **RF-C01/C02** (validação na prévia de importação + PDF na
web). O maior valor agora é **dado**: colar as séries reais SINAPI/INCC (o importador em lote já
existe) e carregar mais orçamentos — cada obra melhora a estimativa para quem já está usando o módulo
no ar.
