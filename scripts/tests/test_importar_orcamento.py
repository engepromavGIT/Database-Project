"""Testes das funções puras do ETL (scripts/importar_orcamento.py).
Rode: python -m pytest scripts/tests -q  (precisa de pytest — ver requirements-dev.txt)

Cobre url_direta() (derivar a conexão direta do Neon) e particionar_anexos()
(decidir pooler × conexão direta × só-local por tamanho). Não toca em banco nem PDFs.
"""
import importlib.util
import os

_here = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location(
    "importar_orcamento", os.path.join(_here, "..", "importar_orcamento.py"))
etl = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(etl)

MB = 1024 * 1024


# ---------------- url_direta ----------------
def test_url_direta_remove_pooler_do_host():
    assert etl.url_direta("postgresql://u:p@ep-abc-pooler.neon.tech/db") == \
        "postgresql://u:p@ep-abc.neon.tech/db"


def test_url_direta_ja_direta_retorna_none():
    assert etl.url_direta("postgresql://u:p@ep-abc.neon.tech/db") is None


def test_url_direta_preserva_porta_e_query():
    assert etl.url_direta("postgresql://u:p@ep-x-pooler.neon.tech:5432/db?sslmode=require") == \
        "postgresql://u:p@ep-x.neon.tech:5432/db?sslmode=require"


def test_url_direta_nao_toca_senha_com_pooler():
    # '-pooler' na SENHA não pode ser removido — só no host.
    assert etl.url_direta("postgresql://user:x-pooler-x@ep-abc-pooler.neon.tech/db") == \
        "postgresql://user:x-pooler-x@ep-abc.neon.tech/db"


def test_url_direta_localhost_none():
    assert etl.url_direta("postgresql://u:p@localhost:5432/db") is None


# ---------------- particionar_anexos ----------------
def test_particionar_pequeno_via_pooler():
    peq, gr, ign = etl.particionar_anexos([("a.pdf", 10 * MB)], 25, 100, True)
    assert (peq, gr, ign) == (["a.pdf"], [], [])


def test_particionar_grande_via_direta():
    peq, gr, ign = etl.particionar_anexos([("big.pdf", 38 * MB)], 25, 100, True)
    assert (peq, gr, ign) == ([], ["big.pdf"], [])


def test_particionar_excede_max_fica_local():
    peq, gr, ign = etl.particionar_anexos([("huge.pdf", 150 * MB)], 25, 100, True)
    assert (peq, gr, ign) == ([], [], ["huge.pdf"])


def test_particionar_sem_direta_grande_vai_pro_pooler():
    # URL já direta (tem_direta=False): sem limite de pooler; tudo <= max entra normal.
    peq, gr, ign = etl.particionar_anexos([("big.pdf", 38 * MB)], 25, 100, False)
    assert (peq, gr, ign) == (["big.pdf"], [], [])


def test_particionar_limite_do_pooler_e_estrito():
    # Exatamente no limite do pooler NÃO conta como "grande" (usa > estrito).
    peq, gr, ign = etl.particionar_anexos([("edge.pdf", 25 * MB)], 25, 100, True)
    assert (peq, gr, ign) == (["edge.pdf"], [], [])


def test_particionar_mistura():
    itens = [("p.pdf", 5 * MB), ("g.pdf", 40 * MB), ("x.pdf", 200 * MB)]
    peq, gr, ign = etl.particionar_anexos(itens, 25, 100, True)
    assert (peq, gr, ign) == (["p.pdf"], ["g.pdf"], ["x.pdf"])
