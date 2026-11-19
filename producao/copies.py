"""Copies de divulgação por template (sem IA): YouTube, Instagram e TikTok.

Lê o que a fábrica gerou para o episódio (dados.json, roteiro.json, linha_do_tempo.json)
e grava saida/epNNN/copies.json. O painel deixa editar e aprovar cada uma.

Cada rede usa o seu link rastreável (/l/yt-ep001, /l/ig-ep001, /l/tt-ep001): é assim
que o painel mostra qual post trouxe cadastros e vendas. O Publicar do episódio cria
esses links na tabela `links`.

    python copies.py --episodio 1
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "fabrica"))
import config  # noqa: E402  (config da fábrica: nome do site, pastas)

NOME = "Operação Marte Zero"
PLATAFORMAS = {
    "youtube": {"rotulo": "YouTube", "prefixo": "yt", "plataforma": "youtube"},
    "instagram": {"rotulo": "Instagram", "prefixo": "ig", "plataforma": "instagram"},
    "tiktok": {"rotulo": "TikTok", "prefixo": "tt", "plataforma": "tiktok"},
}
# O YouTube só aceita link externo na descrição depois que o canal libera os recursos
# avançados (verificação por telefone + histórico). Até lá: 0 → "link no perfil do canal".
import os  # noqa: E402
YT_LINK_NA_DESCRICAO = (os.environ.get("YOUTUBE_LINK_NA_DESCRICAO") or "0").strip() == "1"

HASHTAGS = ["#operacaomartezero", "#pixelart", "#marte", "#colonia", "#jogoindie"]


def slug_link(plataforma: str, numero: int) -> str:
    return f"{PLATAFORMAS[plataforma]['prefixo']}-ep{numero:03d}"


def link(plataforma: str, numero: int) -> str:
    return f"{config.SITE_TELA}/l/{slug_link(plataforma, numero)}"


def _mmss(s: float) -> str:
    s = int(s)
    return f"{s // 60}:{s % 60:02d}"


ROTULO_CENA = {"abertura": "Abertura", "populacao": "População", "boas_vindas": "Boas-vindas",
               "compras": "Novidades na vizinhança", "gancho": "Próximo episódio"}


def capitulos(lt: dict) -> list[str]:
    linhas, missao = [], False
    for c in lt["cenas"]:
        if c["tipo"] == "missao":
            if missao:
                continue
            missao = True
            linhas.append(f"{_mmss(c['inicio'])} Missão do Dia: {lt['missao_titulo']}")
        else:
            linhas.append(f"{_mmss(c['inicio'])} {ROTULO_CENA.get(c['tipo'], c['tipo'])}")
    return linhas


def destaques(d: dict) -> list[str]:
    out = [f"👥 População: {d['populacao']} colonos"]
    if d["novos"]:
        nomes = ", ".join(c["nome"] for c in d["novos"][:6])
        resto = d["novos_total"] - min(6, len(d["novos"]))
        out.append(f"👋 Boas-vindas: {nomes}" + (f" e mais {resto}" if resto > 0 else ""))
    if d["compras"]:
        out.append("🛒 Novidades: " + ", ".join(f"{c['nome']} ({c['produto']})" for c in d["compras"][:4]))
    return out


def gerar(numero: int) -> dict:
    pasta = config.pasta_episodio(numero)
    d = config.ler_json(pasta / "dados.json")
    r = config.ler_json(pasta / "roteiro.json")
    lt = config.ler_json(pasta / "linha_do_tempo.json") if (pasta / "linha_do_tempo.json").exists() else None
    n, missao = numero, r["missao_titulo"]
    tags = " ".join(HASHTAGS)
    linhas_dest = "\n".join(destaques(d))

    yt_desc = [
        f"Episódio {n} da {NOME}: {missao}.",
        "",
        linhas_dest,
        "",
        (f"🚀 Vire personagem e procure seu nome no mapa: https://{link('youtube', n)}" if YT_LINK_NA_DESCRICAO
         else "🚀 Vire personagem e procure seu nome no mapa: link no perfil do canal 👆"),
    ]
    if lt:
        yt_desc += ["", "Capítulos:", *capitulos(lt)]
    yt_desc += ["", tags]

    return {
        "numero": n,
        "youtube": {
            "titulo": f"{missao} | {NOME} #{n}"[:100],
            "descricao": "\n".join(yt_desc),
            "tags": "operação marte zero, pixel art, marte, colônia espacial, " + r["missao_titulo"].lower(),
            "link": f"https://{link('youtube', n)}",
        },
        "instagram": {
            "legenda": "\n".join([
                f"🚀 {NOME} · Episódio {n}",
                f"Missão do Dia: {missao}.",
                "",
                linhas_dest,
                "",
                "Quer virar personagem? Link na bio 👆 Cadastre-se e procure seu nome no mapa.",
                "",
                tags,
            ]),
            "link": f"https://{link('instagram', n)}",
            "obs": "Instagram não deixa link clicável na legenda: use este link na bio ou no story.",
        },
        "tiktok": {
            "legenda": f"Ep. {n}: {missao} 🚀 Vire personagem: link na bio! {tags}"[:2200],
            "link": f"https://{link('tiktok', n)}",
            "obs": "Coloque o link na bio do TikTok antes de postar.",
        },
    }


def gravar(numero: int) -> Path:
    destino = config.pasta_episodio(numero) / "copies.json"
    config.gravar_json(destino, gerar(numero))
    return destino


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--episodio", type=int, required=True)
    print(gravar(ap.parse_args().episodio))
