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
    "estufa": {
        "nome": "Estufa Hidropônica",
        "planoR": 3.7,   # a base da estufa é maior que a da antena: a terraplanagem deixa mais chão plano
        "etapas": [
            {"id": "abertura", "min": 6,
             "fala": "Como se constrói uma estufa hidropônica em Marte, do zero? Volta comigo para o primeiro dia."},
            {"id": "terraplanagem", "etapa": 1, "sol": 1, "titulo": "TERRAPLANAGEM", "sub": "Terreno plano ao lado da Fazenda Solar", "min": 7.5,
             "fala": "Etapa um: terraplanagem. O trator nivela o terreno ao lado da Fazenda Solar, pertinho da energia da colônia."},
            {"id": "fundacao", "etapa": 2, "sol": 3, "titulo": "FUNDAÇÃO", "sub": "Escavação, manta isolante e malha de aço", "min": 19,
             "fala": "Etapa dois: a fundação. A escavadeira abre a vala, e os colonos montam as fôrmas de madeira. No fundo vai uma manta isolante, porque o chão de Marte chega a sessenta graus negativos. Depois, o guindaste traz o aço, e a turma amarra a malha, ponto por ponto."},
            {"id": "concretagem", "etapa": 3, "sol": 5, "titulo": "CONCRETAGEM", "sub": "Betoneira, bica e caçamba no guindaste", "min": 16,
             "fala": "Etapa três: a concretagem. A betoneira chega girando, com concreto feito de regolito. Uma parte desce pela bica, e o guindaste leva a caçamba até a outra ponta. Os colonos espalham e alisam. Laje pronta."},
            {"id": "estrutura", "etapa": 4, "sol": 8, "titulo": "ESTRUTURA EM ARCO", "sub": "9 arcos de aço içados pelo guindaste", "min": 12,
             "fala": "Etapa quatro: a estrutura. O guindaste ergue nove arcos de aço, um atrás do outro. O formato de túnel aguenta a pressão do ar lá dentro."},
            {"id": "cobertura", "etapa": 5, "sol": 11, "titulo": "COBERTURA E PRESSÃO", "sub": "Painéis duplos que barram a radiação", "min": 13,
             "fala": "Etapa cinco: a cobertura. Painéis duplos deixam a luz entrar e barram a radiação. A eclusa fecha, e o ar é bombeado. Pressão estável, nenhum vazamento."},
            {"id": "hidroponia", "etapa": 6, "sol": 13, "titulo": "HIDROPONIA", "sub": "Calhas, tanque e água com nutrientes", "min": 12,
             "fala": "Etapa seis: a hidroponia. Aqui não tem terra. As raízes ficam em calhas por onde corre água com nutrientes, vinda do gelo marciano. E a mesma água circula de novo e de novo."},
            {"id": "luzes", "etapa": 7, "sol": 15, "titulo": "LUZ DE CULTIVO", "sub": "LEDs vermelhos e azuis", "min": 11,
             "fala": "Etapa sete: a luz. Em Marte, o sol é menos da metade do da Terra. Então o cabo traz a energia, e acendem os LEDs vermelhos e azuis, as cores que as plantas mais usam."},
            {"id": "plantio", "etapa": 8, "sol": 16, "titulo": "PLANTIO", "sub": "Legumes e verduras", "min": 10,
             "fala": "Etapa oito: o plantio. Cada muda vai num furinho da calha. Tomate, pimentão, pepino, morango, alface e rúcula."},
            {"id": "colheita", "etapa": 9, "sol": 46, "titulo": "COLHEITA", "sub": "30 sóis depois", "min": 12,
             "fala": "Trinta sóis depois, a primeira colheita! Tomate vermelhinho, pimentão, pepino e salada fresca, tudo plantado em Marte."},
            {"id": "voo", "sol": 46, "min": 8,
             "fala": "Estufa Hidropônica: do terreno vazio aos legumes no prato, com a mão de cada colono."},
            {"id": "convite", "min": 6,
             "fala": "Qual construção você quer ver sendo feita na próxima? Comenta aí. E cada seguidor vira colono em Marte."},
        ],
        # capa: instante da cena (s, na linha do tempo sem voz), enquadramento e título
        "capa": {"t": 139.0, "plano": {"tx": 0.0, "ty": 0.0, "tz": 0.7, "zoom": 44, "pitch": 0.42},
                 "linhas": [["COMO SE CONSTRÓI", 50, "#ffffff"], ["UMA ESTUFA", 84, "#ffd04a"],
                            ["HIDROPÔNICA", 70, "#7be08f"], ["EM MARTE?", 84, "#ffd04a"]],
                 "thumb": {"y0": 560, "plano": {"tx": 0.0, "ty": 0.0, "tz": 0.2, "zoom": 33, "pitch": 0.4},
                           "linhas": [["ESTUFA HIDROPÔNICA", 60, "#7be08f"], ["EM MARTE", 72, "#ffd04a"]]}},
        "legenda": ("Como se constrói uma ESTUFA HIDROPÔNICA em Marte? 🌱🚀 Da escavação e do concreto até a primeira colheita de legumes, "
                    "etapa por etapa, com os colonos de verdade trabalhando na obra.\n\n"
                    "Qual construção você quer ver na próxima? Comenta! 👇\n"
                    "Cada seguidor vira colono na Operação Marte Zero. Link na bio 👆\n\n"
                    "#operacaomartezero #marte #pixelart #hidroponia #colonizarmarte"),
    },
}
ROTEIROS["solar"] = {
    "nome": "Fazenda Solar",
    "planoR": 4.6,   # campo grande: a terraplanagem deixa plano um terreno maior
    "etapas": [
        {"id": "abertura", "min": 6,
         "fala": "Como se constrói uma fazenda solar em Marte, do zero? Volta comigo para o primeiro dia."},
        {"id": "terraplanagem", "etapa": 1, "sol": 1, "titulo": "TERRAPLANAGEM", "sub": "Terreno aberto, sem sombra de colina", "min": 7.5,
         "fala": "Etapa um: terraplanagem. O trator nivela um terreno grande e aberto, bem onde o sol bate o dia inteiro, sem nenhuma colina fazendo sombra."},
        {"id": "estacas", "etapa": 2, "sol": 2, "titulo": "ESTACAS", "sub": "24 pilares de aço cravados no chão", "min": 19,
         "fala": "Etapa dois: as estacas. O bate-estaca crava vinte e quatro pilares de aço no chão congelado. Eles seguram os painéis mesmo com ventos de cem quilômetros por hora."},
        {"id": "estrutura", "etapa": 3, "sol": 4, "titulo": "ESTRUTURA", "sub": "Suportes inclinados para o sol", "min": 12,
         "fala": "Etapa três: a estrutura. Em cada par de estacas, os colonos soldam um suporte inclinado, apontado para o sol de Marte."},
        {"id": "paineis", "etapa": 4, "sol": 6, "titulo": "PAINÉIS SOLARES", "sub": "12 painéis trazidos pelo rover", "min": 16,
         "fala": "Etapa quatro: os painéis. O rover traz os painéis do módulo de pouso, e a turma encaixa um por um. Em Marte, o sol tem menos da metade da força da Terra, então a fazenda precisa ser grande."},
        {"id": "baterias", "etapa": 5, "sol": 8, "titulo": "BANCO DE BATERIAS", "sub": "Energia guardada para a noite", "min": 12,
         "fala": "Etapa cinco: as baterias. A noite em Marte dura doze horas. Então a energia do dia fica guardada num banco de baterias, coberto de regolito para aguentar o frio."},
        {"id": "energia", "etapa": 6, "sol": 9, "titulo": "LIGAR TUDO", "sub": "Cabo até a colônia", "min": 12,
         "fala": "Etapa seis: ligar tudo. O cabo leva a energia das baterias até a colônia. Chave virada… e quando anoitece, as luzes acendem!"},
        {"id": "poeira", "etapa": 7, "sol": 30, "titulo": "TEMPESTADE DE POEIRA", "sub": "Limpeza dos painéis", "min": 14,
         "fala": "Mas Marte tem tempestades de poeira. A poeira cobre os painéis, e a energia despenca. Então os colonos limpam painel por painel com escovas eletrostáticas. Energia de volta!"},
        {"id": "voo", "sol": 30, "min": 8,
         "fala": "Fazenda Solar: do chão vazio à energia da colônia inteira, com a mão de cada colono."},
        {"id": "convite", "min": 6,
         "fala": "Qual construção você quer ver sendo feita na próxima? Comenta aí. E cada seguidor vira colono em Marte."},
    ],
    # capa: instante da cena (s, na linha do tempo sem voz), enquadramento e título (ajustado com --previa)
    "capa": {"t": 101.5, "plano": {"tx": 0.0, "ty": 0.0, "tz": 0.5, "zoom": 30, "pitch": 0.42},
             "linhas": [["COMO SE CONSTRÓI", 50, "#ffffff"], ["UMA FAZENDA", 76, "#ffd04a"],
                        ["SOLAR", 96, "#8fe6ff"], ["EM MARTE?", 84, "#ffd04a"]],
             "thumb": {"y0": 560, "plano": {"tx": 0.0, "ty": 0.0, "tz": 0.3, "zoom": 24, "pitch": 0.4},
                       "linhas": [["FAZENDA SOLAR", 64, "#8fe6ff"], ["EM MARTE", 72, "#ffd04a"]]}},
    "legenda": ("Como se constrói uma FAZENDA SOLAR em Marte? ☀️🚀 Das estacas cravadas no chão congelado até a tempestade de "
                "poeira, etapa por etapa, com os colonos de verdade trabalhando na obra.\n\n"
                "Qual construção você quer ver na próxima? Comenta! 👇\n"
                "Cada seguidor vira colono na Operação Marte Zero. Link na bio 👆\n\n"
                "#operacaomartezero #marte #pixelart #energiasolar #colonizarmarte"),
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
    return {"obra": obra, "nome": rot["nome"], "planoR": rot.get("planoR"), "etapas": etapas, "duracao": round(t + 0.3, 3),
            "colonos": colonos_recentes()}, falas


async def _gerar(obra: str, previa: list[float] | None, sem_voz: bool, abas: int = 3, capa: bool = False):
    destino = config.SAIDA / "construcao" / obra
    destino.mkdir(parents=True, exist_ok=True)
    info, falas = linha_do_tempo(obra, sem_voz or bool(previa) or capa)
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
                if (config.FABRICA / f"construcao_{obra}.js").exists():   # cena própria da obra (a antena mora no construcao.js)
                    await pagina.add_script_tag(url=f"construcao_{obra}.js")
                await pagina.wait_for_function("typeof window.carregarConstrucao === 'function'")
                return pagina, await pagina.evaluate("i => carregarConstrucao(i)", info)

            if capa:   # capa vertical (IG/TikTok) + thumb do YouTube
                pagina, _ = await aba()
                c = ROTEIROS[obra]["capa"]
                u = await pagina.evaluate("([t, p, l]) => (desenharCapa(t, p, l), document.getElementById('tela').toDataURL('image/png'))",
                                          [c["t"], c["plano"], c["linhas"]])
                arq = destino / "capa_vertical.png"
                _gravar(arq, u)
                th = c["thumb"]
                u = await pagina.evaluate("([t, p, l, y]) => (desenharThumb(t, p, l, y), document.getElementById('tela').toDataURL('image/png'))",
                                          [c["t"], th["plano"], th["linhas"], th["y0"]])
                bruto = destino / "_thumb_bruto.png"
                _gravar(bruto, u)
                await browser.close()
                thumb = destino / "thumb_youtube.png"   # 1280x720: a faixa 16:9 do quadro
                ffmpeg("-y", "-i", bruto.name, "-vf", f"crop=1080:608:0:{th['y0']},scale=1280:720:flags=neighbor",
                       "-frames:v", "1", thumb.name, cwd=destino)
                bruto.unlink(missing_ok=True)
                return [arq, thumb]

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
    ap.add_argument("--capa", action="store_true", help="só a capa vertical e a thumb do YouTube")
    a = ap.parse_args()
    r = asyncio.run(_gerar(a.obra, a.previa, a.sem_voz, a.abas, a.capa))
    for p in (r if isinstance(r, list) else [r]):
        print(p)
