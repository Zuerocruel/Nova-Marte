"""Imagens extras de um episódio (sem IA, o mesmo mundo do vídeo): thumbnail do YouTube, capa vertical
dos Reels/TikTok e o carrossel do Instagram.

    python imagens.py --episodio 2

Saída em saida/epNNN/imagens/:
    thumb_youtube.png          1280x720   miniatura do vídeo no YouTube
    capa_vertical.png          1080x1920  capa dos Reels / TikTok
    carrossel_1_capa.png       1080x1350  carrossel do Instagram (4:5), 3 ou 4 imagens
    carrossel_2_boletim.png
    carrossel_3_bem_vindos.png (só quando chegou gente nova)
    carrossel_N_vire_personagem.png
Precisa do episódio já gerado (linha_do_tempo.json + dados.json), não precisa do vídeo.
"""
from __future__ import annotations

import argparse
import asyncio
from pathlib import Path

from playwright.async_api import async_playwright

import config
from navegador import _gravar, abrir_navegador, montar_ep, nova_aba, servidor


def info_do_episodio(pasta: Path) -> dict:
    d = config.ler_json(pasta / "dados.json")
    rot = config.ler_json(pasta / "roteiro.json")
    est = rot.get("estacao")
    prob = rot.get("problema")
    obra = next((o for o in d["obras"] if o["slug"] == rot.get("missao_obra")), None)
    return {
        "manchete": rot["missao_titulo"].split(" · ")[0].upper(),
        "estacao": {"nome": est["nome"], "temp": est["temp"]} if est else None,
        "problema": {"titulo": prob["titulo"], "heroi": prob.get("heroi")} if prob else None,
        "populacao": d["populacao"],
        "novos": d["novos"],
        "novos_total": d["novos_total"],
        "obra": {"nome": obra["nome"], "progresso": (rot.get("obra_progresso") or [0, 0])[1]} if obra else None,
    }


async def _gerar(numero: int) -> list[Path]:
    pasta = config.pasta_episodio(numero)
    ep, info = montar_ep(pasta), info_do_episodio(pasta)
    destino = pasta / "imagens"
    destino.mkdir(exist_ok=True)
    srv, url = servidor()
    try:
        async with async_playwright() as pw:
            browser, _ = await abrir_navegador(pw)
            pagina, _ = await nova_aba(browser, url, ep)
            await pagina.add_script_tag(url="extras.js")
            await pagina.wait_for_function("typeof window.gerarImagens === 'function'")
            pecas = await pagina.evaluate("info => gerarImagens(info)", info)
            await browser.close()
    finally:
        srv.shutdown()
    saidas = []
    for p in pecas:
        _gravar(destino / p["nome"], p["url"])
        saidas.append(destino / p["nome"])
    return saidas


def gerar(numero: int) -> list[Path]:
    return asyncio.run(_gerar(numero))


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--episodio", type=int, required=True)
    a = ap.parse_args()
    for p in gerar(a.episodio):
        print(p)
