"""Imagens da loja (uma por item, 1080x1080) e fotos de perfil das redes. Sem IA (loja.js e perfil.js).

    python loja.py                 # imagens da loja
    python loja.py --so-perfil     # só as fotos de perfil
    python loja.py --banner        # banner do canal do YouTube (2560x1440)
    python loja.py --episodio 2    # usa os dados de um episódio específico (padrão: o mais recente)

Saída:
    ../public/itens/<slug>.png     card de cada produto (o site serve em /itens/<slug>.png)
    saida/perfil/perfil_*.png      4 opções de foto de perfil (desenho centralizado: cabe no círculo)
    saida/perfil/banner_youtube.png  banner do canal (+ _areas.png com as áreas de TV/computador/celular marcadas)
Depois de publicar o site, aponte produtos.imagem_url para /itens/<slug>.png.
"""
from __future__ import annotations

import argparse
import asyncio
from pathlib import Path

from playwright.async_api import async_playwright

import config
from navegador import _gravar, abrir_navegador, montar_ep, nova_aba, servidor

PUBLICO = config.FABRICA.parent / "public"


def ultimo_episodio() -> int:
    nums = [int(p.name[2:]) for p in (config.FABRICA / "saida").glob("ep[0-9][0-9][0-9]") if (p / "dados.json").exists()]
    if not nums:
        raise SystemExit("Gere pelo menos um episódio antes (as imagens usam a fonte e os sprites dele).")
    return max(nums)


async def _gerar(numero: int, so_perfil: bool = False, banner: bool = False) -> list[Path]:
    ep = montar_ep(config.pasta_episodio(numero))
    srv, url = servidor()
    try:
        async with async_playwright() as pw:
            browser, _ = await abrir_navegador(pw)
            pagina, _ = await nova_aba(browser, url, ep)
            await pagina.add_script_tag(url="loja.js")
            await pagina.add_script_tag(url="perfil.js")
            await pagina.add_script_tag(url="banner.js")
            await pagina.wait_for_function("typeof window.gerarLoja === 'function' && typeof window.gerarPerfis === 'function' && typeof window.gerarBanner === 'function'")
            pecas = await pagina.evaluate("gerarBanner()" if banner else "gerarPerfis()" if so_perfil else "gerarLoja()")
            await browser.close()
    finally:
        srv.shutdown()
    saidas = []
    for p in pecas:
        destino = (PUBLICO / p["nome"]) if p["nome"].startswith("itens/") else (config.FABRICA / "saida" / p["nome"])
        destino.parent.mkdir(parents=True, exist_ok=True)
        _gravar(destino, p["url"])
        saidas.append(destino)
    return saidas


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--episodio", type=int)
    ap.add_argument("--so-perfil", action="store_true")
    ap.add_argument("--banner", action="store_true")
    a = ap.parse_args()
    for p in asyncio.run(_gerar(a.episodio or ultimo_episodio(), a.so_perfil, a.banner)):
        print(p)
