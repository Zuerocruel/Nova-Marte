"""Vídeo extra "Como se constrói ... em Marte?" em 2,5D (construcao.js): a obra inteira, etapa por etapa.

    python construcao.py --obra antena                  # vídeo completo (narração ElevenLabs + música)
    python construcao.py --obra antena --sem-voz        # só música, tempos estimados (não gasta crédito)
    python construcao.py --obra antena --previa 3 12 40 # só imagens de teste (segundos)

Saída em saida/construcao/<obra>/: construcao_<obra>.mp4 (1080x1920) e construcao_<obra>.txt (legenda do post).
Os operários são colonos de verdade (do episódio mais recente) e aparecem com o nome em cima da cabeça.
"""
from __future__ import annotations

import argparse
import asyncio
import shutil
import time
from pathlib import Path

from playwright.async_api import async_playwright

import config
import voz as elevenlabs
from audio import ffmpeg, gerar_musica, gerar_narracao, mixar
from navegador import _gravar, abrir_navegador, montar_ep, nova_aba, servidor

# Cada etapa: id (o construcao.js sabe desenhar), número da etapa e sol (dia marciano) no topo, título,
# subtítulo e a narração. "min" = duração mínima da etapa (s), para a animação ter tempo de acontecer.
ROTEIROS = {
    "antena": {
        "nome": "Antena de Comunicação",
        "etapas": [
            {"id": "abertura", "min": 5.5,
             "fala": "Como se constrói uma antena em Marte, do zero? Volta comigo para o primeiro dia."},
            {"id": "terraplanagem", "etapa": 1, "sol": 1, "titulo": "TERRAPLANAGEM", "sub": "O trator nivela o topo da colina", "min": 7.5,
             "fala": "Etapa um: terraplanagem. O trator raspa o topo da colina mais alta perto da colônia, onde o sinal pega melhor."},
            {"id": "fundacao", "etapa": 2, "sol": 3, "titulo": "FUNDAÇÃO", "sub": "8 blocos de regolito prensado", "min": 9,
             "fala": "Etapa dois: a fundação. Primeiro a grade de ferro, depois oito blocos de regolito prensado, encaixados um a um. A base aguenta ventos de cem quilômetros por hora."},
            {"id": "torre", "etapa": 3, "sol": 6, "titulo": "TORRE DE TRELIÇA", "sub": "6 módulos içados pelo guindaste", "min": 12,
             "fala": "Etapa três: a torre. O guindaste ergue seis módulos de treliça, um em cima do outro. Lá no alto, cada encaixe é soldado na hora."},
            {"id": "prato", "etapa": 4, "sol": 10, "titulo": "PRATO PARABÓLICO", "sub": "12 pétalas de alumínio", "min": 9,
             "fala": "Etapa quatro: o prato parabólico. Doze pétalas de alumínio se juntam no topo e formam um espelho de quatro metros."},
            {"id": "energia", "etapa": 5, "sol": 12, "titulo": "ENERGIA", "sub": "Cabo enterrado até a Fazenda Solar", "min": 8,
             "fala": "Etapa cinco: energia. A casa de equipamentos fica pronta, e um cabo enterrado traz a força da Fazenda Solar."},
            {"id": "alinhamento", "etapa": 6, "sol": 14, "titulo": "ALINHAMENTO", "sub": "O prato procura a Terra no céu", "min": 8.5,
             "fala": "Etapa seis: o alinhamento. A noite cai, e o prato varre o céu atrás de um pontinho azul. A Terra."},
            {"id": "sinal", "sol": 15, "min": 7,
             "fala": "Sinal enviado! Minutos depois, a resposta chega da Terra. A colônia não está mais sozinha."},
            {"id": "voo", "sol": 15, "min": 8,
             "fala": "Antena de Comunicação: pronta em quinze sóis, com a mão de cada colono."},
            {"id": "convite", "min": 6,
             "fala": "Qual construção você quer ver sendo feita na próxima? Comenta aí. E cada seguidor vira colono em Marte."},
        ],
        "legenda": ("Como se constrói uma ANTENA em Marte? 📡🚀 Do terreno vazio ao primeiro sinal para a Terra, "
                    "etapa por etapa, com os colonos de verdade trabalhando na obra.\n\n"
                    "Qual construção você quer ver na próxima? Comenta! 👇\n"
                    "Cada seguidor vira colono na Operação Marte Zero. Link na bio 👆\n\n"
                    "#operacaomartezero #marte #pixelart #comoefeito #colonizarmarte"),
    },
}
INICIO_FALA = 0.45     # respiro entre o começo da etapa e a narração
SOBRA = 0.9            # respiro depois da fala


def colonos_recentes(n: int = 5) -> list[dict]:
    """Os colonos (com nome) do episódio mais recente, os mais novos primeiro."""
    pastas = sorted(p for p in config.SAIDA.glob("ep[0-9][0-9][0-9]") if (p / "dados.json").exists())
    if not pastas:
        return [{"nome": "Vega"}, {"nome": "Lia"}]
    mundo = config.ler_json(pastas[-1] / "dados.json").get("mundo", [])
    return [{"nome": c["nome"], "codigo": c["codigo"]} for c in mundo[::-1][:n]] or [{"nome": "Vega"}, {"nome": "Lia"}]


def linha_do_tempo(obra: str, sem_voz: bool) -> tuple[dict, dict]:
    rot = ROTEIROS[obra]
    falas = elevenlabs.gerar_falas({"cenas": [{"id": e["id"], "fala": e["fala"]} for e in rot["etapas"]]}, sem_voz)
    t, etapas = 0.0, []
    for e in rot["etapas"]:
        f = falas[e["id"]]
        ini, fala_ini = t, t + INICIO_FALA
        fim = max(fala_ini + f["duracao"] + SOBRA, ini + e["min"])
        etapas.append({k: e.get(k) for k in ("id", "etapa", "sol", "titulo", "sub")}
                      | {"ini": round(ini, 3), "fim": round(fim, 3), "fala_ini": round(fala_ini, 3),
                         "palavras": [{"p": w["p"], "i": round(fala_ini + w["i"], 3), "f": round(fala_ini + w["f"], 3)}
                                      for w in f.get("palavras", [])]})
        t = fim
    return {"obra": obra, "nome": rot["nome"], "etapas": etapas, "duracao": round(t + 0.3, 3),
            "colonos": colonos_recentes()}, falas


async def _gerar(obra: str, previa: list[float] | None, sem_voz: bool, abas: int = 3):
    destino = config.SAIDA / "construcao" / obra
    destino.mkdir(parents=True, exist_ok=True)
    info, falas = linha_do_tempo(obra, sem_voz or bool(previa))
    pastas = sorted(p for p in config.SAIDA.glob("ep[0-9][0-9][0-9]") if (p / "linha_do_tempo.json").exists())
    ep = montar_ep(pastas[-1])   # só para carregar o diretor.js (fonte, cores, texto); a cena é toda da obra
    srv, url = servidor()
    quadros = destino / "quadros"
    try:
        async with async_playwright() as pw:
            browser, _ = await abrir_navegador(pw)

            async def aba():
                pagina, _ = await nova_aba(browser, url, ep)
                await pagina.add_script_tag(url="construcao.js")
                await pagina.wait_for_function("typeof window.carregarConstrucao === 'function'")
                return pagina, await pagina.evaluate("i => carregarConstrucao(i)", info)

            if previa:
                pagina, _ = await aba()
                saidas = []
                for t in previa:
                    u = await pagina.evaluate("t => (desenharConstrucao(t), document.getElementById('tela').toDataURL('image/png'))", t)
                    arq = destino / f"previa_{t:05.1f}s.png"
                    _gravar(arq, u)
                    saidas.append(arq)
                await browser.close()
                return saidas

            shutil.rmtree(quadros, ignore_errors=True)
            quadros.mkdir()
            paginas = [await aba() for _ in range(abas)]
            total = paginas[0][1]["quadros"]
            print(f"  {info['nome']}: {info['duracao']:.1f}s · {total} quadros · {abas} abas")
            faixa, inicio = -(-total // abas), time.time()

            async def trabalhar(pagina, de, ate):
                for i in range(de, ate, 6):
                    urls = await pagina.evaluate(
                        "([a, b]) => { const r = []; for (let i = a; i < b; i++) r.push(quadroConstrucao(i)); return r; }",
                        [i, min(i + 6, ate)])
                    for k, u in enumerate(urls):
                        _gravar(quadros / f"{i + k:05d}.jpg", u)

            await asyncio.gather(*(trabalhar(p, j * faixa, min(total, (j + 1) * faixa)) for j, (p, _) in enumerate(paginas)))
            await browser.close()
            print(f"  filmado em {time.time() - inicio:.0f}s")
    finally:
        srv.shutdown()

    musica = destino / "musica.wav"
    gerar_musica(musica, info["duracao"])
    som = musica
    trilha = [{"audio": falas[e["id"]]["audio"], "fala_inicio": e["fala_ini"]} for e in info["etapas"] if falas[e["id"]].get("audio")]
    if trilha:
        narracao, som = destino / "narracao.wav", destino / "mix.wav"
        gerar_narracao(narracao, {"cenas": trilha, "duracao": info["duracao"]})
        mixar(musica, narracao, som, True)
        narracao.unlink(missing_ok=True)
    final = destino / f"construcao_{obra}.mp4"
    ffmpeg("-framerate", config.FPS, "-i", f"{quadros.name}/%05d.jpg", "-i", som.name,
           "-vf", "format=yuv420p", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-r", config.FPS,
           "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", final.name, cwd=destino)
    shutil.rmtree(quadros, ignore_errors=True)
    musica.unlink(missing_ok=True)
    if som != musica:
        som.unlink(missing_ok=True)
    (destino / f"construcao_{obra}.txt").write_text(ROTEIROS[obra]["legenda"], encoding="utf-8")
    return final


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--obra", choices=sorted(ROTEIROS), default="antena")
    ap.add_argument("--previa", type=float, nargs="+", metavar="SEGUNDOS")
    ap.add_argument("--sem-voz", action="store_true")
    ap.add_argument("--abas", type=int, default=3)
    a = ap.parse_args()
    r = asyncio.run(_gerar(a.obra, a.previa, a.sem_voz, a.abas))
    for p in (r if isinstance(r, list) else [r]):
        print(p)
