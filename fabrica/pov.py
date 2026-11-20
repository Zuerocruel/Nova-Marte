"""Vídeos extras em PRIMEIRA PESSOA ("câmera do capacete"), para postar entre os episódios. Sem IA.

    python pov.py --episodio 2                     # as 4 cenas
    python pov.py --episodio 2 --cena obra         # uma só: obra | defesa | passeio | conversa
    python pov.py --episodio 2 --cena obra --previa 4 12   # só imagens de teste (segundos)

Cenas (o protagonista é um colono de verdade, cada cena com um diferente):
    obra      sai de casa, vai até a obra do dia, confere o tablet e martela junto com a turma
    defesa    noite: besouros-de-ferrugem na cerca, espanta com a luz estroboscópica
    passeio   anda pelo bairro, acena e conversa rapidinho com os vizinhos
    conversa  papo na praça com outro colono sobre a colônia (população, obra, problema do dia)

Saída em saida/epNNN/pov/: pov_<cena>.mp4 (1080x1920, música, diário escrito na tela) e pov_<cena>.txt (legenda do post).
Precisa do episódio já gerado (dados.json + linha_do_tempo.json).
"""
from __future__ import annotations

import argparse
import asyncio
import shutil
import time
from pathlib import Path

from playwright.async_api import async_playwright

import config
from audio import ffmpeg, gerar_musica
from navegador import _gravar, abrir_navegador, montar_ep, nova_aba, servidor

CENAS = ["obra", "defesa", "passeio", "conversa"]


def info_pov(pasta: Path, cena: str) -> dict:
    d = config.ler_json(pasta / "dados.json")
    rot = config.ler_json(pasta / "roteiro.json")
    colonos = d["mundo"]
    if not colonos:
        raise SystemExit("O POV precisa de pelo menos um colono cadastrado.")
    # cada cena com um protagonista diferente (e muda a cada episódio)
    i = (CENAS.index(cena) + d["numero"]) % len(colonos)
    prota = colonos[i]
    vizinho = colonos[(i + 1) % len(colonos)] if len(colonos) > 1 else None
    est, prob = rot.get("estacao"), rot.get("problema")
    obra = next((o for o in d["obras"] if o["slug"] == rot.get("missao_obra")), None)
    pets = [c for c in d["compras"] if "pet" in c["produto_slug"]]
    return {
        "prota": prota, "vizinho": vizinho, "colonos": colonos,
        "pets": [{"x": c["x"], "y": c["y"]} for c in pets],
        "estacao": {"nome": est["nome"], "temp": est["temp"]} if est else None,
        "problema": {"titulo": prob["titulo"], "heroi": prob.get("heroi")} if prob else None,
        "obra": {"nome": obra["nome"], "progresso": (rot.get("obra_progresso") or [0, 0])[1]} if obra else None,
        "populacao": d["populacao"],
    }


LEGENDAS = {
    "obra": "POV: um dia de obra em Marte 🏗️ {quem} conta como foi construir {obra}.",
    "defesa": "POV: besouros-de-ferrugem atacando a cerca à noite 🐞🔦 {quem} defende a colônia.",
    "passeio": "POV: passeio pelo bairro da colônia 👋 {quem} visita os vizinhos (todos seguidores de verdade).",
    "conversa": "POV: papo na praça de Marte 💬 {quem} conversa sobre o dia na colônia.",
}


def legenda(cena: str, info: dict) -> str:
    base = LEGENDAS[cena].format(quem=info["prota"]["nome"], obra=(info["obra"] or {}).get("nome", "a colônia"))
    return (f"{base}\n\nCada seguidor vira personagem na Operação Marte Zero. Link na bio 👆\n"
            "📺 Episódio novo todo dia.\n\n#operacaomartezero #pixelart #marte #pov #jogoindie")


async def _gerar(numero: int, cena: str, previa: list[float] | None = None, abas: int = 3) -> Path | list[Path]:
    pasta = config.pasta_episodio(numero)
    ep, info = montar_ep(pasta), info_pov(pasta, cena)
    destino = pasta / "pov"
    destino.mkdir(exist_ok=True)
    quadros = destino / f"quadros_{cena}"
    srv, url = servidor()
    try:
        async with async_playwright() as pw:
            browser, _ = await abrir_navegador(pw)

            async def aba():
                pagina, _ = await nova_aba(browser, url, ep)
                await pagina.add_script_tag(url="pov.js")
                await pagina.wait_for_function("typeof window.carregarPOV === 'function'")
                meta = await pagina.evaluate("([i, c]) => carregarPOV(i, c)", [info, cena])
                return pagina, meta

            if previa:
                pagina, meta = await aba()
                saidas = []
                for t in previa:
                    u = await pagina.evaluate("t => (desenharPOV(t), document.getElementById('tela').toDataURL('image/png'))", t)
                    _gravar(destino / f"previa_{cena}_{t:05.1f}s.png", u)
                    saidas.append(destino / f"previa_{cena}_{t:05.1f}s.png")
                await browser.close()
                return saidas

            shutil.rmtree(quadros, ignore_errors=True)
            quadros.mkdir()
            paginas = [await aba() for _ in range(abas)]
            meta = paginas[0][1]
            total = meta["quadros"]
            print(f"  {cena}: \"{meta['titulo']}\" · POV de {info['prota']['nome']} · {meta['duracao']:.1f}s · {total} quadros")
            faixa = -(-total // abas)
            inicio = time.time()

            async def trabalhar(pagina, de, ate):
                for i in range(de, ate, 6):
                    urls = await pagina.evaluate(
                        "([a, b]) => { const r = []; for (let i = a; i < b; i++) r.push(quadroPOV(i)); return r; }",
                        [i, min(i + 6, ate)])
                    for k, u in enumerate(urls):
                        _gravar(quadros / f"{i + k:05d}.jpg", u)

            await asyncio.gather(*(trabalhar(p, j * faixa, min(total, (j + 1) * faixa)) for j, (p, _) in enumerate(paginas)))
            await browser.close()
            print(f"  filmado em {time.time() - inicio:.0f}s")
    finally:
        srv.shutdown()

    musica = destino / f"musica_{cena}.wav"
    gerar_musica(musica, meta["duracao"])
    final = destino / f"pov_{cena}.mp4"
    ffmpeg("-framerate", config.FPS, "-i", f"{quadros.name}/%05d.jpg", "-i", musica.name,
           "-vf", "format=yuv420p", "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-r", config.FPS,
           "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", final.name, cwd=destino)
    shutil.rmtree(quadros, ignore_errors=True)
    musica.unlink(missing_ok=True)
    (destino / f"pov_{cena}.txt").write_text(legenda(cena, info), encoding="utf-8")
    return final


def gerar(numero: int, cena: str, previa: list[float] | None = None):
    return asyncio.run(_gerar(numero, cena, previa))


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--episodio", type=int, required=True)
    ap.add_argument("--cena", choices=CENAS)
    ap.add_argument("--previa", type=float, nargs="+", metavar="SEGUNDOS")
    a = ap.parse_args()
    for c in ([a.cena] if a.cena else CENAS):
        r = gerar(a.episodio, c, a.previa)
        for p in (r if isinstance(r, list) else [r]):
            print(p)
