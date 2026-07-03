#!/usr/bin/env python3
"""
Carregador de orçamentos (template PROMAV / obra pública) para a Base de Projetos.

Por pasta de projeto, lê:
  • PLANILHA ORÇAMENTÁRIA  -> itens (item, código, fonte, unidade, qtd, valores sem/com BDI)
  • RESUMO/CONSOLIDADO     -> totais (orçamento s/BDI, BDI, total c/BDI), município, contratante
  • MEMORIAL DESCRITIVO    -> área (m²) e objeto

Monta obra + EAP (etapas) + itens e, com --commit, grava na branch de DEV
(DATABASE_URL do .env), anexando os PDFs. Sem --commit é dry-run (só mostra).

Uso:
  python scripts/importar_orcamento.py "orcamentos/<projeto>"
  python scripts/importar_orcamento.py "orcamentos/<projeto>" --commit
  python scripts/importar_orcamento.py "orcamentos/<projeto>" --commit --force
"""
import sys, os, re, glob, argparse, secrets
import pdfplumber

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ---------------- utilitários ----------------
def num(s):
    if s is None:
        return None
    s = str(s).replace("R$", "").strip()
    if not s:
        return None
    s = s.replace(".", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None

def gid(prefix):
    return f"{prefix}{secrets.token_hex(5)}"

def achar(pasta, termos, excluir=()):
    """1º PDF cujo nome contém algum dos 'termos' e nenhum dos 'excluir'."""
    termos = [t.upper() for t in (termos if isinstance(termos, (list, tuple)) else [termos])]
    excl = [e.upper() for e in excluir]
    for f in sorted(glob.glob(os.path.join(pasta, "*.pdf"))):
        nome = os.path.basename(f).upper()
        if any(x in nome for x in excl):
            continue
        if any(t in nome for t in termos):
            return f
    return None

# ---------------- parsing ----------------
HDR = {"ITEM", "CÓDIGO", "DESCRIÇÃO", "FONTE", "UNIDADE", "QTD",
       "SEM BDI", "BDI", "COM BDI", "PREÇO TOTAL R$", "VALOR UNITÁRIO R$", ""}

# Código de EAP válido: "1", "3.2", "10.1.4" (só dígitos e pontos).
# Linhas de rodapé/resumo (ex.: "VALOR BDI TOTAL: R$ ...") não casam e são ignoradas.
EAP_RE = re.compile(r"^\d+(\.\d+)*$")
# Item de planilha: EAP com pelo menos um ponto (2.1, 6.4, 4.1.1). Distingue itens
# da planilha sintética dos insumos das composições unitárias ("00011267", "93681")
# e de cabeçalhos mesclados ("4.1. C3179 ESC…"), que não casam.
DOT_EAP = re.compile(r"^\d+(\.\d+)+$")
# Etapa de EAP: segmentos curtos (macro 1–99, subs). Códigos longos de insumo
# ("93681", "00011267") não casam e ficam de fora também do ramo de etapas.
ETAPA_RE = re.compile(r"^\d{1,2}(\.\d{1,3})*$")

def parse_planilha(path):
    etapas, itens = [], []
    with pdfplumber.open(path) as pdf:
        for pg in pdf.pages:
            tbl = pg.extract_table()
            if not tbl:
                continue
            for row in tbl:
                c = [(x or "").replace("\n", " ").strip() for x in row] + [""] * 10
                it = c[0]
                if not it or it.upper() == "ITEM":
                    continue
                if set(c[:10]) <= HDR:
                    continue
                qtd = num(c[5])
                if qtd is not None and (c[3] or c[4]) and DOT_EAP.match(it):  # item: qtd + fonte/unidade + EAP pontuada
                    itens.append(dict(item=it, codigo=c[1], descricao=c[2], fonte=c[3],
                                      unidade=c[4], qtd=qtd, vu_sem=num(c[6]), vu_com=num(c[8])))
                elif ETAPA_RE.match(it) and qtd is None:  # etapa (macro/sub): EAP curta, sem qtd na linha
                    etapas.append(dict(item=it, nome=(c[1] or c[2]).strip(), total=num(c[9])))
                # demais linhas (rodapés, totais, insumos de composição) são ignoradas
    return etapas, itens

def parse_resumo(path):
    # O RESUMO costuma estar na pág. 1 (arquivos separados), mas em PDF único
    # (projeto básico) fica numa página interna. Varre até achar a página que tem
    # os totais completos (VALOR ORÇAMENTO + VALOR BDI TOTAL) e usa só ela — evita
    # pegar a ocorrência parcial/arredondada de outra página. Se nenhuma página
    # tiver os dois, usa o texto acumulado.
    with pdfplumber.open(path) as pdf:
        acum = []
        txt = None
        for pg in pdf.pages:
            t = pg.extract_text() or ""
            if "VALOR ORÇAMENTO" in t and "VALOR BDI TOTAL" in t:
                txt = t
                break
            acum.append(t)
        if txt is None:
            txt = "\n".join(acum)
    def g(p, d=None):
        m = re.search(p, txt)
        return m.group(1).strip() if m else d
    vo = num(g(r"VALOR ORÇAMENTO:\s*R\$\s*([\d.]+,\d{2})"))
    vb = num(g(r"VALOR BDI TOTAL:\s*R\$\s*([\d.]+,\d{2})"))
    vt = num(g(r"VALOR TOTAL:\s*R\$\s*([\d.]+,\d{2})"))
    m = re.search(r"PREFEITURA MUNICIPAL DE\s+([A-ZÀ-Ú ]+?)\s*/\s*([A-Z]{2})", txt)
    return dict(
        obra=g(r"OBRA:\s*(?:\([A-Z]+\)\s*)?(?:R\d+_)?(.+?)(?:\s+DATA|\s+REVIS|$)"),
        valor_orcamento=vo, valor_bdi=vb, valor_total=vt,
        data=g(r"DATA\s*:?\s*(\d{2}/\d{2}/\d{4})"),
        municipio=(m.group(1).strip().title() if m else None),
        uf=(m.group(2) if m else None),
        contratante=g(r"(PREFEITURA[^\n]+?/[A-Z]{2})"),
        mapp=g(r"MAPP\s*N?º?\s*(\d+)"),
        bdi=(round(vb / vo * 100, 2) if vo and vb else num(g(r"BDI\s*:?\s*(\d{1,2},\d{2})\s*%"))),
    )

# ---- Template B: planilha de SERVIÇOS (quantitativos) + custos por macro-etapa ----
def parse_servicos(path):
    """Planilha de SERVIÇOS (ITEM | COD | ESPECIFICAÇÃO | UNID | QUANT), sem preços.
    Os itens têm EAP com ponto (3.1) e a EAP se repete por localidade; agrega a
    quantidade por (macro, código, descrição, unidade), somando entre localidades."""
    agg, ordem = {}, {}
    with pdfplumber.open(path) as pdf:
        for pg in pdf.pages:
            tbl = pg.extract_table()
            if not tbl:
                continue
            for row in tbl:
                c = [(x or "").replace("\n", " ").strip() for x in row] + [""] * 6
                it = c[0]
                if not EAP_RE.match(it) or "." not in it:   # macros puros (sem ponto) vêm do resumo
                    continue
                qtd = num(c[4])
                if qtd is None or not (c[1] or c[3]):        # item precisa de qtd + (código ou unidade)
                    continue
                macro = it.split(".")[0]
                key = (macro, c[1], c[2], c[3])
                agg[key] = agg.get(key, 0.0) + qtd
                ordem.setdefault(key, len(ordem))
    itens = [dict(item=m, codigo=cod, descricao=desc, unidade=unid, qtd=round(q, 4), vu_sem=0, vu_com=0)
             for (m, cod, desc, unid), q in sorted(agg.items(), key=lambda kv: ordem[kv[0]])]
    return itens

MACRO_RE = re.compile(r"^\s*(\d{1,2})\s+(.+?)\s+R\$\s*([\d.]+,\d{2})\b")

def parse_macros(path):
    """Macro-etapas do resumo/consolidado: (código, nome, custo COM BDI). Dedup por código."""
    with pdfplumber.open(path) as pdf:
        txt = "\n".join((p.extract_text() or "") for p in pdf.pages[:2])
    macros, vistos = [], set()
    for ln in txt.splitlines():
        if "VALOR" in ln.upper():
            continue
        m = MACRO_RE.match(ln)
        if m and m.group(1) not in vistos:
            vistos.add(m.group(1))
            macros.append((m.group(1), re.sub(r"\s+", " ", m.group(2)).strip(), num(m.group(3))))
    return macros

def extract_meta(textos):
    """Município/UF, cliente, data e MAPP a partir de vários PDFs (aceita '/' ou '-' como separador UF)."""
    t = "\n".join(textos)
    def s(p, d=None, flags=0):
        m = re.search(p, t, flags)
        return m.group(1).strip() if m else d
    mun = (re.search(r"MUNIC[IÍ]PIO DE\s+([A-ZÀ-Ú][A-ZÀ-Ú ]+?)\s*/\s*([A-Z]{2})", t)
           or re.search(r"PREFEITURA MUNICIPAL DE\s+([A-ZÀ-Ú ]+?)\s*[-/]\s*([A-Z]{2})", t))
    cli = re.search(r"(PREFEITURA MUNICIPAL DE\s+[A-ZÀ-Ú ]+?\s*[-/]\s*[A-Z]{2})", t)
    obra = s(r"OBRA:\s*(?:R\d+[_ ]?V?\d*\s+)?(.+?)(?:\s+DATA|\s+LOCAL|\n)")
    return dict(
        municipio=(mun.group(1).strip().title() if mun else None),
        uf=(mun.group(2) if mun else None),
        cliente=(re.sub(r"\s+", " ", cli.group(1)).replace(" - ", "/").strip() if cli else None),
        data=s(r"DATA\s*:?\s*(\d{2}/\d{2}/\d{4})"),
        mapp=s(r"MAPP\s*N?[ºo°]?\s*(\d{3,})"),
        obra=(re.sub(r"\s+", " ", obra).strip() if obra else None),
    )

def area_vias(path):
    """Área total pavimentada, do 'Quadro Resumo das Vias' (memorial de pavimentação).
    O cabeçalho pode não estar na 1ª linha e as colunas se deslocam entre linhas macro/folha,
    então localiza o quadro por conteúdo e usa a linha TOTAL (último número). Sem TOTAL, soma
    os subtotais por localidade (Nº = 'N.0')."""
    try:
        with pdfplumber.open(path) as pdf:
            for pg in pdf.pages:
                for tbl in (pg.extract_tables() or []):
                    linhas = [[(c or "").replace("\n", " ").strip() for c in row] for row in (tbl or [])]
                    flat = " ".join(c for row in linhas for c in row).upper()
                    if "ÁREA" not in flat or ("EXTENS" not in flat and "LOCALIDADE" not in flat):
                        continue  # não é o Quadro Resumo das Vias
                    for row in linhas:                                   # 1) linha TOTAL → último número
                        if any(c.upper() == "TOTAL" for c in row):
                            nums = [num(c) for c in row if num(c) is not None]
                            if nums:
                                return round(nums[-1], 2)
                    soma, achou = 0.0, False                            # 2) fallback: subtotais por localidade
                    for row in linhas:
                        nz = [c for c in row if c]
                        if nz and re.fullmatch(r"\d+\.0", nz[0]):
                            nums = [num(c) for c in row if num(c) is not None]
                            if nums:
                                soma += nums[-1]
                                achou = True
                    if achou:
                        return round(soma, 2)
    except Exception:
        pass
    return None

def parse_memorial(path):
    if not path:
        return dict(area=None, objeto=None)
    with pdfplumber.open(path) as pdf:
        txt = "\n".join((p.extract_text() or "") for p in pdf.pages[:12])
    area = None
    # "por unidade × quantidade" (projeto básico de N praças): ÁREA … 270,36 m² por unidade × 07 praças
    mu = re.search(r"([\d.]*\d,\d+)\s*m[²2]\s*por\s*unidade", txt, re.IGNORECASE)
    mq = re.search(r"QUANTIDADE\s+DE\s+PRA[ÇC]AS\s*:?\s*0*(\d+)", txt, re.IGNORECASE)
    if mu and mq:
        area = round(num(mu.group(1)) * int(mq.group(1)), 2)
    if area is None:
        m = re.search(r"área(?:\s+total|\s+de intervenç[ãa]o|\s+constru[íi]da)?\s*(?:de\s*)?([\d.]*\d,\d+)\s*m[²2]",
                      txt, re.IGNORECASE)
        area = num(m.group(1)) if m else area_vias(path)   # pavimentação: soma o Quadro Resumo das Vias
    if area is None:
        m2 = re.search(r"([\d.]*\d,\d+)\s*m[²2]", txt)
        area = num(m2.group(1)) if m2 else None
    mo = re.search(r"OBJETO:\s*(.+?)(?:CONFORME|\n\n|\.)", txt, re.IGNORECASE | re.DOTALL)
    return dict(area=area, objeto=(re.sub(r"\s+", " ", mo.group(1)).strip() if mo else None))

def inferir_tipo(texto):
    t = (texto or "").lower()
    if any(k in t for k in ["pavimenta", "pedra tosca", "asfalt", "calçad", "meio-fio", "meio fio", "via "]):
        return "Pavimentação"
    if any(k in t for k in ["praça", "praca", "urbaniz", "paisag", "áreas verdes", "areas verdes"]):
        return "Urbanização"
    if any(k in t for k in ["escola", "creche", "posto de saúde", "ubs", "edifíc", "edific", "prédio", "predio",
                            "galpão", "galpao", "quadra poliesportiva", "ginásio", "ginasio"]):
        return "Edificação"
    if "reforma" in t:
        return "Reforma"
    if any(k in t for k in ["industrial", "fábrica", "fabrica"]):
        return "Industrial"
    if any(k in t for k in ["comercial", "loja"]):
        return "Comercial"
    if any(k in t for k in ["residencial", "habitacional"]):
        return "Residencial"
    return "Infraestrutura"  # drenagem, saneamento, adutora, etc.

def montar(pasta, area_override=None):
    EXC = ["MEMORIAL", "COMPARATIV"]
    mem = achar(pasta, ["MEMORIAL"])
    # Planilha de itens (nomes variam: PLANILHA ORÇAMENTÁRIA, P.SERVIÇOS, PLANILHA DE SERVIÇOS...).
    plan = (achar(pasta, ["PLANILHA", "P.SERVI", "P. SERVI", "PLANILHA DE SERVI", "SINTETIC"], excluir=EXC)
            or achar(pasta, ["SERVI"], excluir=EXC))
    # Resumo/consolidado (CONSOLIDADO/RESUMO; senão um "ORÇAMENTO" que não seja a planilha/comparativo).
    res = (achar(pasta, ["CONSOLIDADO", "RESUMO"], excluir=EXC)
           or achar(pasta, ["ORÇAMENT", "ORCAMENT"], excluir=EXC + ["P.SERVI", "P. SERVI", "PLANILHA", "SERVI"]))
    # Template C: projeto básico em PDF único (memorial + planilha + composições no mesmo arquivo).
    unico = None
    if not plan:
        pdfs = sorted(glob.glob(os.path.join(pasta, "*.pdf")))
        cand = achar(pasta, ["PROJ.BASICO", "PROJ. BASICO", "PROJETO BASICO", "BASICO", "BÁSICO"])
        if len(pdfs) == 1:
            unico = pdfs[0]
        elif cand:
            unico = cand
        elif pdfs:
            unico = max(pdfs, key=os.path.getsize)  # o projeto básico costuma ser o maior arquivo
        if unico:
            plan = res = mem = unico
    if not plan:
        sys.exit("Não achei a planilha de itens (PLANILHA / P.SERVIÇOS) nesta pasta.")
    etapas, itens = parse_planilha(plan)
    h = parse_resumo(res) if res else parse_resumo(plan)  # sem resumo: usa o cabeçalho da própria planilha
    m = parse_memorial(mem)

    if [i for i in itens if i.get("vu_sem")]:             # planilha orçamentária com preços por item
        template, fonte = ("C", "orcamento_pdf_unico") if unico else ("A", "orcamento_pdf")
        if not h.get("valor_orcamento") and itens:        # sem total no resumo: soma dos itens (sem BDI)
            h["valor_orcamento"] = round(sum((i["qtd"] or 0) * (i["vu_sem"] or 0) for i in itens), 2)
        if h.get("valor_orcamento") and h.get("bdi") and not h.get("valor_total"):
            h["valor_total"] = round(h["valor_orcamento"] * (1 + h["bdi"] / 100), 2)
    else:                                                 # Template B: planilha de serviços (qtd) + custo por macro-etapa
        template, fonte = "B", "orcamento_pdf_macro"
        if not res:
            sys.exit("Planilha de serviços sem resumo/consolidado com custos por etapa — não dá para importar.")
        itens = parse_servicos(plan)
        macros = parse_macros(res)
        if not macros:
            sys.exit("Não consegui ler os custos por macro-etapa no resumo/consolidado.")
        bdi = h.get("bdi") or 0
        fator = 1 / (1 + bdi / 100) if bdi else 1         # macro-etapa vem COM BDI; normaliza p/ s/BDI (base do template A)
        etapas = [dict(item=cod, nome=nome, total=round((custo_cb or 0) * fator, 2))
                  for cod, nome, custo_cb in macros]
        textos = []
        for p in (res, plan, mem):
            if p:
                try:
                    with pdfplumber.open(p) as pdf:
                        textos.append("\n".join((pg.extract_text() or "") for pg in pdf.pages[:2]))
                except Exception:
                    pass
        meta = extract_meta(textos)
        h["obra"] = h.get("obra") or meta["obra"]
        h["municipio"] = h.get("municipio") or meta["municipio"]
        h["uf"] = h.get("uf") or meta["uf"]
        h["contratante"] = h.get("contratante") or meta["cliente"]
        h["data"] = h.get("data") or meta["data"]
        h["mapp"] = h.get("mapp") or meta["mapp"]

    nome = re.sub(r"\s+", " ", (h.get("obra") or os.path.basename(pasta))).strip()
    codigo = f"MAPP-{h['mapp']}" if h.get("mapp") else os.path.basename(pasta).split("_")[0]
    area = area_override if area_override else m.get("area")
    obra = dict(codigo=codigo, nome=nome, cliente=h.get("contratante"),
                municipio=h.get("municipio"), uf=h.get("uf"),
                tipo=inferir_tipo((m.get("objeto") or "") + " " + nome),
                area=area, custo_orcado=h.get("valor_orcamento"),
                custo_com_bdi=h.get("valor_total"), bdi=h.get("bdi"),
                data_base=h.get("data"), objeto=m.get("objeto"),
                template=template, fonte=fonte)
    anexos = []
    for p in (plan, res, mem):        # PDF único entra uma vez só
        if p and p not in anexos:
            anexos.append(p)
    return obra, etapas, itens, anexos

# ---------------- dry-run ----------------
def mostrar(obra, etapas, itens):
    macro = [e for e in etapas if "." not in e["item"]]
    sub = [e for e in etapas if "." in e["item"]]
    cm2 = round(obra["custo_orcado"] / obra["area"], 2) if obra.get("area") and obra.get("custo_orcado") else None
    print("=" * 70)
    print(f"OBRA   : {obra['codigo']}  —  {obra['nome']}")
    print(f"OBJETO : {obra.get('objeto') or '—'}")
    print(f"CLIENTE: {obra['cliente']}   LOCAL: {obra['municipio']}/{obra['uf']}   TIPO: {obra['tipo']}")
    print(f"ÁREA   : {obra['area']} m²   DATA-BASE: {obra['data_base']}")
    co = obra['custo_orcado'] or 0
    print(f"CUSTO  : s/BDI R$ {co:,.2f}   BDI {obra['bdi']}%   c/BDI R$ {(obra['custo_com_bdi'] or 0):,.2f}")
    print(f"CUSTO/m²: {('R$ %s' % cm2) if cm2 else '—'}")
    print(f"EAP    : {len(macro)} macro-etapas + {len(sub)} sub-etapas | {len(itens)} itens"
          + ("   (itens com quantidade; custo por macro-etapa)" if obra.get("template") == "B" else ""))
    if obra.get("template") == "B":
        soma_macro = round(sum(e["total"] or 0 for e in etapas), 2)
        print(f"CHECK  : soma macro-etapas s/BDI = R$ {soma_macro:,.2f}  (orçamento R$ {co:,.2f}, dif {round(soma_macro - co, 2)})")
    else:
        soma_sem = round(sum((i["qtd"] or 0) * (i["vu_sem"] or 0) for i in itens), 2)
        print(f"CHECK  : soma itens s/BDI = R$ {soma_sem:,.2f}  (orçamento R$ {co:,.2f}, dif {round(soma_sem - co, 2)})")
    print("-" * 70)
    for e in macro:
        print(f"  {e['item']:>3}  {(e['nome'] or '')[:46]:46}  R$ {e['total']:,.2f}" if e['total'] else f"  {e['item']:>3}  {e['nome']}")
    print("=" * 70)

# ---------------- commit ----------------
def ler_database_url():
    if os.environ.get("DATABASE_URL"):
        return os.environ["DATABASE_URL"]
    envp = os.path.join(RAIZ, ".env")
    if os.path.exists(envp):
        for line in open(envp, encoding="utf-8"):
            if line.strip().startswith("DATABASE_URL="):
                return line.split("=", 1)[1].strip()
    return None

def commit(obra, etapas, itens, anexos, force=False):
    import psycopg2
    url = ler_database_url()
    if not url:
        sys.exit("DATABASE_URL não definida (.env).")
    conn = psycopg2.connect(url)
    cur = conn.cursor()
    def one(q, p=()):
        cur.execute(q, p)
        r = cur.fetchone()
        return r[0] if r else None
    try:
        existente = one("SELECT id FROM orcamento.obras WHERE codigo = %s", (obra["codigo"],))
        if existente and not force:
            print(f"Obra {obra['codigo']} já existe — pulei (use --force para recarregar).")
            return
        if existente and force:
            cur.execute("DELETE FROM orcamento.obras WHERE id = %s", (existente,))  # CASCADE limpa etapas/itens/anexos

        tipo_id = one("SELECT id FROM orcamento.tipos_obra WHERE lower(nome) = lower(%s)", (obra["tipo"],))
        loc_id = None
        if obra["municipio"] and obra["uf"]:
            loc_id = one("SELECT id FROM orcamento.localidades WHERE lower(municipio)=lower(%s) AND uf=%s",
                         (obra["municipio"], obra["uf"]))
            if not loc_id:
                loc_id = gid("loc")
                cur.execute("INSERT INTO orcamento.localidades (id,municipio,uf,fator_regional) VALUES (%s,%s,%s,1.0)",
                            (loc_id, obra["municipio"], obra["uf"]))
        cli_id = None
        if obra["cliente"]:
            cli_id = one("SELECT id FROM orcamento.clientes WHERE lower(nome)=lower(%s)", (obra["cliente"],))
            if not cli_id:
                cli_id = gid("cli")
                cur.execute("INSERT INTO orcamento.clientes (id,nome,ativo) VALUES (%s,%s,true)", (cli_id, obra["cliente"]))
        data_base = None
        if obra["data_base"]:
            d, mn, y = obra["data_base"].split("/")
            data_base = f"{y}-{mn}-{d}"

        obra_id = gid("obra")
        # Orçamentos importados entram como referência de estimativa. A paramétrica usa o
        # custo/m² da OBRA (não o custo por item), então o Template B também é elegível.
        elegivel = True
        cur.execute(
            """INSERT INTO orcamento.obras
                 (id,codigo,nome,cliente_id,tipo_obra_id,localidade_id,area_construida_m2,
                  custo_orcado_total,custo_orcado_com_bdi,bdi_pct,data_base_custo,status,
                  elegivel_referencia,fonte_dado)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'concluida',%s,%s)""",
            (obra_id, obra["codigo"], obra["nome"], cli_id, tipo_id, loc_id, obra["area"],
             obra["custo_orcado"], obra["custo_com_bdi"], obra["bdi"], data_base,
             elegivel, obra.get("fonte", "orcamento_pdf")))

        emap = {}
        for e in sorted(etapas, key=lambda x: [int(n) for n in x["item"].split(".")]):
            pai = emap.get(e["item"].rsplit(".", 1)[0]) if "." in e["item"] else None
            eid = gid("etp")
            emap[e["item"]] = eid
            cur.execute("INSERT INTO orcamento.etapas (id,obra_id,etapa_pai_id,codigo_eap,descricao,ordem) VALUES (%s,%s,%s,%s,%s,0)",
                        (eid, obra_id, pai, e["item"], e["nome"]))

        def etapa_de(item):
            parts = item.split(".")
            for k in range(len(parts) - 1, 0, -1):
                key = ".".join(parts[:k])
                if key in emap:
                    return emap[key]
            return emap.get(parts[0])

        n_it = 0
        for i in itens:
            eid = etapa_de(i["item"])
            if not eid:
                continue
            sref = one("SELECT id FROM orcamento.servicos_ref WHERE codigo_sinapi=%s", (i["codigo"],)) if i.get("codigo") else None
            cur.execute(
                """INSERT INTO orcamento.itens_custo (id,etapa_id,servico_ref_id,descricao,unidade,quantidade,custo_unitario)
                   VALUES (%s,%s,%s,%s,%s,%s,%s)""",
                (gid("itm"), eid, sref, i["descricao"], i["unidade"], i["qtd"], i["vu_sem"]))
            n_it += 1

        # subtotais por etapa (folha) a partir dos itens com preço
        cur.execute("""UPDATE orcamento.etapas e SET
                         custo_orcado = COALESCE((SELECT sum(custo_total) FROM orcamento.itens_custo WHERE etapa_id=e.id),0)
                       WHERE e.obra_id=%s""", (obra_id,))
        # Template B: itens não têm preço — custo vem por macro-etapa (do resumo, normalizado p/ s/BDI)
        if obra.get("template") == "B":
            for e in etapas:
                cur.execute("UPDATE orcamento.etapas SET custo_orcado=%s WHERE id=%s",
                            (e["total"], emap[e["item"]]))

        for path in anexos:
            with open(path, "rb") as fh:
                data = fh.read()
            cur.execute("INSERT INTO orcamento.anexos (id,obra_id,filename,mime_type,size_bytes,data) VALUES (%s,%s,%s,%s,%s,%s)",
                        (gid("anx"), obra_id, os.path.basename(path), "application/pdf", len(data), psycopg2.Binary(data)))

        conn.commit()
        print(f"OK — obra {obra['codigo']} gravada (id {obra_id}): {len(etapas)} etapas, {n_it} itens, {len(anexos)} anexos.")
    except Exception as e:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()

# ---------------- main ----------------
def main():
    ap = argparse.ArgumentParser(description="Carrega um orçamento (pasta de projeto) na Base de Projetos.")
    ap.add_argument("pasta", help="Pasta do projeto (com os PDFs).")
    ap.add_argument("--commit", action="store_true", help="Grava no banco (sem isso é dry-run).")
    ap.add_argument("--force", action="store_true", help="Recarrega (apaga e regrava) se a obra já existir.")
    ap.add_argument("--area", type=float, default=None,
                    help="Área total em m² (sobrepõe a extração automática; use p/ casos 'por unidade × quantidade').")
    a = ap.parse_args()
    pasta = a.pasta if os.path.isabs(a.pasta) else os.path.join(RAIZ, a.pasta)
    obra, etapas, itens, anexos = montar(pasta, area_override=a.area)
    mostrar(obra, etapas, itens)
    if a.commit:
        commit(obra, etapas, itens, anexos, force=a.force)
    else:
        print("\n(dry-run — nada gravado. Use --commit para gravar.)")

if __name__ == "__main__":
    main()
