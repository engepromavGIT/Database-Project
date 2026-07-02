# VERIFICAR.md — Runbook de verificação (para o Claude Code)

> **Como usar:** no Claude Code, dentro da pasta deste projeto, diga:
> **“Leia e execute o VERIFICAR.md”**.
> Ao final, este runbook pede para você **gerar/atualizar o `build-check-log.md`** —
> é por esse arquivo que o Cowork (a outra instância do Claude) acompanha o resultado.

---

## Contexto

Este é o módulo **promav-base-projetos** (React+Vite + Express + PostgreSQL/Neon),
construído no Cowork. Sua função aqui, Claude Code, é **rodar a verificação local**
(que o sandbox do Cowork não consegue executar) e **devolver o resultado em um log**.

A verificação principal (passos 1–5) **não precisa de banco de dados** — roda offline.
Os passos de banco/execução (6) são **opcionais** e só rodam se houver `.env` configurado.

---

## Regras importantes

1. **Não** rode `npm audit fix --force` (pode introduzir breaking changes). Use `npm audit` apenas para diagnóstico.
2. Rode os comandos **na ordem** abaixo, a partir da raiz do projeto.
3. **Capture a saída real** de cada comando (inclusive erros) e registre no log.
4. Se algum passo **falhar**: registre o erro **na íntegra** no log e **não** faça correções arriscadas. Correções triviais e seguras são permitidas — se fizer alguma, **descreva o que mudou** no log.
5. Ao final, **sempre** escreva/atualize o arquivo `build-check-log.md` (sobrescrevendo) no formato da seção “Formato do log”.

---

## Passos

Execute cada comando e guarde a saída:

1. **Versões do ambiente** (para o cabeçalho do log)
   ```
   node -v
   npm -v
   ```

2. **Instalar dependências**
   ```
   npm install
   ```
   - Anote nº de pacotes e o resumo de vulnerabilidades, se houver.

3. **Checagem de sintaxe** (`node --check` em todos os arquivos do servidor)
   ```
   npm run check
   ```

4. **Testes** (6 suítes de lógica pura)
   ```
   npm test
   ```
   - Some os totais. As suítes imprimem linhas como `... : X passou, Y falhou.`

5. **Build de produção** (compila e valida todo o JSX)
   ```
   npm run build
   ```

6. **Auditoria de segurança** (diagnóstico — sem `--force`)
   ```
   npm audit
   ```
   - Liste pacotes afetados e severidade. Não corrija automaticamente.

### Opcional — banco e execução ponta a ponta (só se `DATABASE_URL` estiver preenchida no `.env`)

> Requer `.env` com `DATABASE_URL` apontando para uma **branch de dev do Neon** (nunca produção).
Se `DATABASE_URL` estiver vazia, **pule** esta seção e registre “não executado (sem DATABASE_URL)” no log.

7. Aplicar as migrations na branch (usa o `pg`, **não precisa de psql**):
   ```
   npm run migrate
   ```
   - Aplica `db/migrations/001..004` em ordem (idempotente) e conta os objetos do schema `orcamento`.
   - Alternativas: `psql "$DATABASE_URL" -f db/migrations/00X_*.sql` (se tiver psql) ou colar cada arquivo no SQL Editor do Neon.
8. Subir e testar o health:
   ```
   npm run dev
   ```
   - Em outro terminal: `curl http://localhost:3001/api/health` → deve responder `{ "ok": true, ... }`. Encerre o `dev` depois.

---

## Formato do log (escreva em `build-check-log.md`, sobrescrevendo)

Use **exatamente** esta estrutura (preencha com os resultados reais):

```markdown
# Log de Verificação — promav-base-projetos

**Data:** <AAAA-MM-DD HH:MM>
**Executado por:** Claude Code
**Ambiente:** <SO> · <shell> · Node <versão> / npm <versão>

Pipeline: npm install → npm run check → npm test → npm run build → npm audit

## Resumo

| Comando | Resultado | Observações |
|---------|-----------|-------------|
| npm install | ✅/❌ | <pacotes, vulnerabilidades> |
| npm run check | ✅/❌ | <ok ou 1ª linha de erro> |
| npm test | ✅/❌ | <total: X passou, Y falhou> |
| npm run build | ✅/❌ | <módulos, tempo, ou erro> |
| npm audit | ℹ️ | <n vulnerabilidades por severidade> |
| (opcional) migrations/dev | ✅/❌/— | <health ok, ou "não executado (sem .env)"> |

**Conclusão:** <uma frase: limpo / precisa de atenção>

## 1. npm install
\```
<saída relevante>
\```

## 2. npm run check
\```
<saída>
\```

## 3. npm test
\```
<saída completa das 6 linhas de resultado + total>
\```

## 4. npm run build
\```
<saída>
\```

## 5. npm audit
\```
<saída resumida: pacotes + severidade>
\```

## Falhas / correções aplicadas
- <se nada falhou, escreva "Nenhuma."; senão liste o erro verbatim e o que (se algo) foi corrigido>

## Para o Cowork (Claude)
> <mensagem curta endereçada à outra instância: o que passou, o que precisa de atenção,
> e qualquer dúvida/decisão que dependa do time. Seja específico e direto.>
```

---

## Depois de gerar o log

Avise o usuário que o `build-check-log.md` foi atualizado. O usuário vai pedir ao
**Cowork** para reler `build-check-log.md` e seguir a partir do resultado.
