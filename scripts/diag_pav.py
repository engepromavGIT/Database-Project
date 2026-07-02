#!/usr/bin/env python3
# Diagnóstico de layout — mostra a tabela crua da planilha de itens (colunas por posição)
# e procura a área no memorial. Uso:
#   python scripts/diag_pav.py "orcamentos/<projeto>"
import sys, os, glob, re, pdfplumber

pasta = sys.argv[1] if len(sys.argv) > 1 else "."
if not os.path.isabs(pasta):
    pasta = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), pasta)

def achar(*termos, exc=()):
    for f in sorted(glob.glob(os.path.join(pasta, "*.pdf"))):
        n = os.path.basename(f).upper()
        if any(e in n for e in exc):
            continue
        if any(t in n for t in termos):
            return f
    return None

plan = achar("P.SERVI", "P. SERVI", "PLANILHA", "SERVI", exc=("MEMORIAL", "COMPARATIV"))
mem = achar("MEMORIAL")

print("### PLANILHA:", os.path.basename(plan) if plan else "(não achei)")
if plan:
    with pdfplumber.open(plan) as pdf:
        npag = len(pdf.pages)
        t = pdf.pages[0].extract_table()
    print("páginas:", npag)
    if t:
        print("== primeiras 18 linhas (cada coluna entre []) ==")
        for i, row in enumerate(t[:18]):
            print(f"  [{i}]", [(c or "").replace("\n", " ")[:22] for c in row])
    else:
        print("(extract_table não achou tabela na pág 1; talvez layout sem linhas de grade)")

print("\n### MEMORIAL:", os.path.basename(mem) if mem else "(não achei)")
if mem:
    with pdfplumber.open(mem) as pdf:
        npag = len(pdf.pages)
        txt = "\n".join((p.extract_text() or "") for p in pdf.pages)
    print("páginas:", npag)
    print("== ocorrências de área / m² / extensão (com contexto) ==")
    for kw in [r"m²", r"m2", r"área", r"extens", r"comprimento", r"pavimentad", r"intervenç"]:
        for m in list(re.finditer(kw, txt, re.I))[:4]:
            a = max(0, m.start() - 70)
            print(f"  [{kw:10}] ...{re.sub(r'\s+', ' ', txt[a:m.end() + 35]).strip()[-110:]}")
