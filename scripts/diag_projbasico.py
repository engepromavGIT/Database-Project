#!/usr/bin/env python3
# Diagnóstico para PROJETO BÁSICO em PDF único (orçamento + memorial juntos).
# Lista os PDFs, escolhe o maior (o projeto básico), mostra por página se há
# tabela e o cabeçalho dela (para localizar o orçamento) e o contexto de
# totais/BDI/área. Uso:
#   python scripts/diag_projbasico.py "orcamentos/<pasta>"
import sys, os, glob, re, pdfplumber

pasta = sys.argv[1] if len(sys.argv) > 1 else "."
if not os.path.isabs(pasta):
    pasta = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), pasta)

pdfs = sorted(glob.glob(os.path.join(pasta, "*.pdf")))
print("PDFs na pasta:")
for f in pdfs:
    print(f"  - {os.path.basename(f)}  ({os.path.getsize(f) // 1024} KB)")
if not pdfs:
    sys.exit("Sem PDFs na pasta.")

alvo = max(pdfs, key=os.path.getsize)   # o projeto básico costuma ser o maior arquivo
print("\n### ALVO:", os.path.basename(alvo))

ORC = re.compile(r"ITEM|C[ÓO]D|ESPECIFICA|DESCRI|QUANT|UNID|VALOR|PRE[ÇC]O", re.I)
with pdfplumber.open(alvo) as pdf:
    print("páginas:", len(pdf.pages))
    print("\n== páginas com tabela (cabeçalho da 1ª tabela; * = parece orçamento) ==")
    orc_pages = []
    for i, pg in enumerate(pdf.pages):
        tbls = pg.extract_tables() or []
        if not tbls:
            continue
        hdr = [(c or "").replace("\n", " ").strip()[:14] for c in (tbls[0][0] if tbls[0] else [])]
        eh_orc = ORC.search(" ".join(hdr)) is not None
        if eh_orc:
            orc_pages.append(i)
        print(f"  pág {i + 1:>3}: {len(tbls)} tab {'*' if eh_orc else ' '} | {hdr}")

    if orc_pages:
        p = orc_pages[0]
        print(f"\n== amostra de linhas da pág {p + 1} (parece orçamento) ==")
        for row in pdf.pages[p].extract_tables()[0][:14]:
            print("   ", [(c or "").replace("\n", " ")[:18] for c in row])

    txt = "\n".join((pg.extract_text() or "") for pg in pdf.pages)

print("\n== totais / BDI / área (com contexto) ==")
for kw in [r"VALOR ORÇAMENTO", r"VALOR TOTAL", r"VALOR BDI", r"\bBDI\b", r"m²", r"área", r"quadro", r"extens"]:
    for m in list(re.finditer(kw, txt, re.I))[:3]:
        a = max(0, m.start() - 55)
        print(f"  [{kw:16}] ...{re.sub(r'\s+', ' ', txt[a:m.end() + 40]).strip()[-105:]}")
