"""Filmagem: abre render.html num Chrome headless e captura quadro a quadro (30 fps).

O diretor.js desenha cada quadro como função do tempo, então dividimos o episódio em
faixas e filmamos em várias abas ao mesmo tempo. Os quadros vão para
saida/epNNN/quadros/00000.jpg, 00001.jpg...

Navegador: usa o Google Chrome se estiver instalado; senão o Microsoft Edge (que é
Chromium); senão o Chromium do Playwright (python -m playwright install chromium).

Prévia de quadros soltos (sem filmar tudo):
    python navegador.py --episodio 1 --previa 2 8.5 30
"""
from __future__ import annotations

import asyncio
import base64
import functools
import http.server
import math
import shutil
import threading
import time
from pathlib import Path

from playwright.async_api import async_playwright

import config
from roteiro import produto_curto


def montar_ep(pasta: Path) -> dict:
    """Junta linha do tempo + dados do mundo no formato que o diretor.js espera."""
    lt = config.ler_json(pasta / "linha_do_tempo.json")
    d = config.ler_json(pasta / "dados.json")
    return {
        **{k: lt[k] for k in ("numero", "titulo", "missao_obra", "missao_titulo", "proxima", "duracao", "fps", "cenas")},
        "estacao": lt.get("estacao"),      # clima/etiqueta do topo (eventos.py)
        "problema": lt.get("problema"),    # problema do dia (deixa o clima mais forte se for de clima)
        "site_tela": config.SITE_TELA,
        "mundo": {
            "fundadores": d["fundadores"],
            "base": d["base"],
            "obras": d["obras"],
            "colonos": d["mundo"],
            "compras": [{**c, "produto_curto": produto_curto(c["produto"])} for c in d["compras"]],
        },
    }


class _Silencioso(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def servidor() -> tuple[http.server.ThreadingHTTPServer, str]:
    handler = functools.partial(_Silencioso, directory=str(config.FABRICA))
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f"http://127.0.0.1:{srv.server_address[1]}/render.html"


async def abrir_navegador(pw):
    for canal in ("chrome", "msedge", None):
        try:
            b = await pw.chromium.launch(channel=canal, headless=True) if canal else await pw.chromium.launch(headless=True)
            return b, canal or "chromium do playwright"
        except Exception:
            continue
    raise SystemExit("Nenhum navegador encontrado. Instale o Chrome ou rode: python -m playwright install chromium")


async def nova_aba(browser, url: str, ep: dict):
    pagina = await browser.new_page(viewport={"width": config.LARGURA, "height": config.ALTURA}, device_scale_factor=1)
    erros = []
    pagina.on("pageerror", lambda e: erros.append(str(e)))
    await pagina.goto(url)
    await pagina.wait_for_function("window.pronto === true")
    if erros:
        raise RuntimeError("Erro no diretor.js: " + erros[0])
    info = await pagina.evaluate("ep => carregarEpisodio(ep)", ep)
    if not info["fonte"]:
        print("  aviso: a fonte pixel não carregou; usando monospace")
    return pagina, info


def _gravar(caminho: Path, data_url: str) -> None:
    caminho.write_bytes(base64.b64decode(data_url.split(",", 1)[1]))


async def _filmar(pasta: Path, abas: int) -> int:
    ep = montar_ep(pasta)
    quadros = pasta / "quadros"
    shutil.rmtree(quadros, ignore_errors=True)
    quadros.mkdir()
    srv, url = servidor()
    try:
        async with async_playwright() as pw:
            browser, nome = await abrir_navegador(pw)
            print(f"  navegador: {nome} · {abas} abas")
            paginas = [await nova_aba(browser, url, ep) for _ in range(abas)]
            total = paginas[0][1]["quadros"]
            feitos, inicio = 0, time.time()
            faixa = math.ceil(total / abas)

            async def trabalhar(pagina, de, ate):
                nonlocal feitos
                lote = 6
                for i in range(de, ate, lote):
                    urls = await pagina.evaluate(
                        "([a, b]) => { const r = []; for (let i = a; i < b; i++) r.push(quadro(i)); return r; }",
                        [i, min(i + lote, ate)])
                    for k, u in enumerate(urls):
                        _gravar(quadros / f"{i + k:05d}.jpg", u)
                    antes = feitos * 10 // total
                    feitos += len(urls)
                    if feitos * 10 // total > antes:
                        el = time.time() - inicio
                        print(f"  {feitos}/{total} quadros · {feitos / el:.0f} q/s · faltam ~{(total - feitos) / max(1, feitos / el):.0f}s")

            await asyncio.gather(*(trabalhar(p, j * faixa, min(total, (j + 1) * faixa)) for j, (p, _) in enumerate(paginas)))
            await browser.close()
            return total
    finally:
        srv.shutdown()


async def _previa(pasta: Path, tempos: list[float]) -> list[Path]:
    ep = montar_ep(pasta)
    srv, url = servidor()
    saidas = []
    try:
        async with async_playwright() as pw:
            browser, _ = await abrir_navegador(pw)
            pagina, _ = await nova_aba(browser, url, ep)
            for t in tempos:
                u = await pagina.evaluate("t => (desenhar(t), document.getElementById('tela').toDataURL('image/png'))", t)
                destino = pasta / f"previa_{t:07.2f}s.png"
                _gravar(destino, u)
                saidas.append(destino)
            await browser.close()
    finally:
        srv.shutdown()
    return saidas


def filmar(numero: int, abas: int = 4) -> int:
    return asyncio.run(_filmar(config.pasta_episodio(numero), abas))


def previa(numero: int, tempos: list[float]) -> list[Path]:
    return asyncio.run(_previa(config.pasta_episodio(numero), tempos))


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--episodio", type=int, required=True)
    ap.add_argument("--abas", type=int, default=4)
    ap.add_argument("--previa", type=float, nargs="+", metavar="SEGUNDOS")
    a = ap.parse_args()
    if a.previa:
        for p in previa(a.episodio, a.previa):
            print(p)
    else:
        print(f"{filmar(a.episodio, a.abas)} quadros filmados")
