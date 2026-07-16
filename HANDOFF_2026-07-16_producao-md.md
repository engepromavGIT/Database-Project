# Handoff (Cowork → Claude Code) — 2026-07-16

**Ação: commitar uma edição só de documentação.** O Cowork atualizou o `PRODUCAO.md` (nenhum
código tocado). Não commitei porque o git é com você.

## O que mudou em `PRODUCAO.md`

A partir do que você registrou no `build-check-log.md` de 15/07 (rotação da credencial + ensaio):

1. Seção "Rotação da credencial do Neon" deixou de ser *pendente* → runbook, **com o aviso que
   você pediu**: resetar a senha **derruba o app ao vivo** até a `DATABASE_URL` do `promav-api` ser
   atualizada no Render (operação coordenada, em janela, com o valor novo em mãos). Inclui o
   aprendizado de que **o reset é por branch** (a dev seguiu com a senha antiga).
2. Passo 0 (Backup): aviso de que a branch do **ensaio não serve de rollback** (já foi migrada) — a
   migração real precisa de um backup **novo e intocado** da prod.
3. "Ordem recomendada": rotação e ensaio marcados como ✅ feitos; sobra migrar a prod + publicar.

## Commit sugerido

```
git add PRODUCAO.md
git commit -m "docs(producao): aviso de queda do app na rotação da senha + backup novo p/ migração; ordem atualizada"
git push origin main
```

Só isso. Estado do projeto inalterado (prod ainda não migrada, módulo não publicado).
