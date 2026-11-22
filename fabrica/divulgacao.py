"""
Operação Marte Zero · peças de divulgação, sem IA (mesmo mundo e sprites do vídeo):

    python fabrica/divulgacao.py --apresentacao     # carrossel de apresentação (5 imagens 1080x1350) → saida/divulgacao/apresentacao/
    python fabrica/divulgacao.py --stories 3        # 3 stories (1080x1920) do episódio 3 → saida/ep003/stories/

O fundo é a colônia do episódio (o último gerado, na apresentação). O endereço do site vai escrito NA IMAGEM;
a legenda (legenda.txt) nunca leva link (regra do Instagram/TikTok, conferida de novo na hora de postar).
"""
from __future__ import annotations

import argparse
import asyncio
from pathlib import Path

from playwright.async_api import async_playwright

import config
from imagens import info_do_episodio
from navegador import _gravar, abrir_navegador, montar_ep, nova_aba, servidor

PASTA_APRESENTACAO = config.SAIDA / "divulgacao" / "apresentacao"

LEGENDA_APRESENTACAO = """🚀 Bem-vindo à Operação Marte Zero!

Uma série diária em pixel art onde CADA SEGUIDOR vira colono em Marte.

Como funciona:
1️⃣ Acesse o site (link na bio)
2️⃣ Insira seu nome
3️⃣ Você vira colono, ganha uma casa na colônia e aparece nos próximos episódios

👀 A colônia está ao vivo: procure seu nome no mapa.
👑 Quem entra pelo site concorre a líder da colônia!

💬 Comenta "EU QUERO" que a gente te espera em Marte.
➡️ Siga para não perder o episódio de amanhã.

#pixelart #marte #serie #animacao #operacaomartezero"""


def ultimo_episodio() -> int:
    nums = [int(p.parent.name[2:]) for p in config.SAIDA.glob("ep[0-9][0-9][0-9]/linha_do_tempo.json")
            if (p.parent / "dados.json").exists() and int(p.parent.name[2:]) < 900]
    if not nums:
        raise SystemExit("gere um episódio antes (a peça usa a colônia do episódio como fundo)")
    return max(nums)


async def _gerar(numero: int, funcao: str, destino: Path) -> list[Path]:
    pasta = config.pasta_episodio(numero)
    ep, info = montar_ep(pasta), info_do_episodio(pasta)
    destino.mkdir(parents=True, exist_ok=True)
    srv, url = servidor()
    try:
        async with async_playwright() as pw:
            browser, _ = await abrir_navegador(pw)
            pagina, _ = await nova_aba(browser, url, ep)
            await pagina.add_script_tag(url="extras.js")
            await pagina.add_script_tag(url="divulgacao.js")
            await pagina.wait_for_function(f"typeof window.{funcao} === 'function'")
            pecas = await pagina.evaluate(f"info => {funcao}(info)", info)
            await browser.close()
    finally:
        srv.shutdown()
    for velho in destino.glob("*.png"):
        velho.unlink()
    saidas = []
    for p in pecas:
        _gravar(destino / p["nome"], p["url"])
        saidas.append(destino / p["nome"])
    return saidas


def gerar_apresentacao(numero: int | None = None) -> list[Path]:
    saidas = asyncio.run(_gerar(numero or ultimo_episodio(), "gerarApresentacao", PASTA_APRESENTACAO))
    leg = PASTA_APRESENTACAO / "legenda.txt"
    if not leg.exists():
        leg.write_text(LEGENDA_APRESENTACAO + "\n", encoding="utf-8")
    return saidas


def gerar_stories(numero: int) -> list[Path]:
    return asyncio.run(_gerar(numero, "gerarStories", config.pasta_episodio(numero) / "stories"))


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apresentacao", action="store_true")
    ap.add_argument("--stories", type=int, metavar="EPISODIO")
    ap.add_argument("--fundo", type=int, help="episódio usado de fundo na apresentação (padrão: o último)")
    a = ap.parse_args()
    if not a.apresentacao and not a.stories:
        ap.error("use --apresentacao e/ou --stories N")
    if a.apresentacao:
        for p in gerar_apresentacao(a.fundo):
            print(p)
    if a.stories:
        for p in gerar_stories(a.stories):
            print(p)
