"""Vídeos extras em PRIMEIRA PESSOA ("câmera do capacete"), para postar entre os episódios. Sem IA.

    python pov.py --episodio 2                     # as 4 cenas sorteadas do episódio
    python pov.py --episodio 2 --plano             # só mostra quem faz o quê
    python pov.py --episodio 2 --cena botanica     # uma cena específica
    python pov.py --episodio 2 --cena obra --previa 4 12   # só imagens de teste (segundos)

Cada episódio sorteia 4 colonos (diferentes; quem chegou no episódio tem 10% a mais de chance) e cada um
ganha um momento ligado ao CARGO dele (pov.js: TRABALHOS): engenharia → obra, guarda → defesa noturna,
botânica → estufa, medicina → check-up, energia → painéis, astronomia → noite de observação, etc. Se dois
sorteados têm o mesmo cargo, o segundo ganha uma cena geral (passeio pelo bairro ou papo na praça).
A ordem das cenas também é sorteada. Sem --cena, gera as 4 e junta tudo em pov_colonia.mp4.

Saída em saida/epNNN/pov/: pov_<cena>.mp4 (1080x1920, música, falas dubladas e diário escrito na tela) e
pov_<cena>.txt (legenda do post). Precisa do episódio já gerado (dados.json + linha_do_tempo.json).

Vozes: cada personagem fala com uma voz própria da ElevenLabs (modelo Flash v2.5, metade do preço),
masculina ou feminina conforme fabrica/vozes_pov.json. O mesmo colono tem sempre a mesma voz e as
falas repetidas saem do cache. --sem-voz faz o vídeo só com música (não gasta crédito).
"""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import shutil
import time
from pathlib import Path

from playwright.async_api import async_playwright

import config
import voz as elevenlabs
from audio import ffmpeg, gerar_musica, gerar_narracao, mixar
from navegador import _gravar, abrir_navegador, montar_ep, nova_aba, servidor

CENAS_GERAIS = ["passeio", "conversa"]
# cargo → cena (pov.js). Os que não estão aqui usam o próprio id do cargo como cena (TRABALHOS em pov.js).
CENA_DO_CARGO = {"engenharia": "obra", "guarda": "defesa"}
TRABALHOS = ["botanica", "medicina", "energia", "rover", "piloto", "ciencia", "geologia", "robotica",
             "comunicacao", "astronomia", "cozinha"]
CENAS = ["obra", "defesa", *TRABALHOS, *CENAS_GERAIS]
POVS_POR_EPISODIO = 4
PESO_NOVO = 1.10   # colono que chegou neste episódio tem 10% a mais de chance de ser sorteado


def planejar_povs(d: dict) -> list[tuple[str, dict]]:
    """[(cena, colono)] do episódio, em ordem sorteada. Sorteio fixo por episódio (gerar de novo dá o
    mesmo resultado): 4 colonos diferentes enquanto houver gente, os novos 10% mais prováveis; cada um faz a
    cena do próprio cargo e, se ela já saiu para outro, ganha uma cena geral que ainda não saiu."""
    import random
    colonos = d["mundo"]
    if not colonos:
        return []
    novos = {c["codigo"] for c in d.get("novos", [])}
    rnd = random.Random(f"pov-ep{d['numero']}")
    plano, usadas, sacola = [], set(), []
    for _ in range(POVS_POR_EPISODIO):
        if not sacola:
            sacola = list(colonos)
        c = rnd.choices(sacola, weights=[PESO_NOVO if x["codigo"] in novos else 1.0 for x in sacola])[0]
        sacola.remove(c)
        cena = CENA_DO_CARGO.get(c.get("cargo") or "", c.get("cargo") or "")
        if cena not in CENAS or cena in usadas:
            livres = [x for x in CENAS_GERAIS + ["obra"] if x not in usadas] or CENAS_GERAIS
            cena = rnd.choice(livres)
        usadas.add(cena)
        plano.append((cena, c))
    rnd.shuffle(plano)
    return plano


def info_pov(pasta: Path, cena: str) -> dict:
    import random
    d = config.ler_json(pasta / "dados.json")
    rot = config.ler_json(pasta / "roteiro.json")
    colonos = d["mundo"]
    if not colonos:
        raise SystemExit("O POV precisa de pelo menos um colono cadastrado.")
    prota = dict(planejar_povs(d)).get(cena) or random.Random(f"pov-ep{d['numero']}-{cena}").choice(colonos)
    outros = [c for c in colonos if c["codigo"] != prota["codigo"]]
    vizinho = random.Random(f"viz-ep{d['numero']}-{cena}").choice(outros) if outros else None
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
    "botanica": "POV: um turno na estufa de Marte 🌱 {quem} cuida das primeiras plantas da colônia.",
    "medicina": "POV: ronda de saúde em Marte 🩺 {quem} confere se a colônia está bem.",
    "energia": "POV: limpando os painéis solares em Marte ☀️ {quem} garante a luz da colônia.",
    "rover": "POV: checagem do rover antes da viagem 🚙 {quem} prepara as seis rodas.",
    "piloto": "POV: checagem de voo em Marte 🚀 {quem} prepara a chegada da nave de carga.",
    "ciencia": "POV: coleta de amostras nas dunas de Marte 🔬 {quem} acha gelo debaixo da poeira.",
    "geologia": "POV: caçando rochas em Marte ⛏️ {quem} descobre por que o planeta é vermelho.",
    "robotica": "POV: consertando um robô de carga em Marte 🤖 {quem} coloca o R-2 de pé.",
    "comunicacao": "POV: falando com a Terra direto de Marte 📡 {quem} manda notícias da colônia.",
    "astronomia": "POV: noite de observação em Marte 🔭 {quem} mostra Fobos e a Terra no céu.",
    "cozinha": "POV: café da manhã da colônia 🍲 {quem} prepara a sopa de batata da estufa.",
}


def legenda(cena: str, info: dict) -> str:
    base = LEGENDAS[cena].format(quem=info["prota"]["nome"], obra=(info["obra"] or {}).get("nome", "a colônia"))
    return (f"{base}\n\nCada seguidor vira personagem na Operação Marte Zero. Link na bio 👆\n"
            "📺 Episódio novo todo dia.\n\n#operacaomartezero #pixelart #marte #pov #jogoindie")


# ---------------------------------------------------------------- vozes
def _num(texto: str) -> int:
    return int(hashlib.md5(texto.encode("utf-8")).hexdigest()[:8], 16)


def _pessoa(quem: str | None, info: dict, fundadores: list[dict]) -> dict:
    """Quem fala: None = o protagonista (diário). Devolve {chave, nome, tipo}."""
    if not quem or quem == info["prota"]["nome"]:
        c = info["prota"]
        return {"chave": c["codigo"], "nome": c["nome"], "tipo": "colono"}
    for c in info["colonos"]:
        if c["nome"] == quem:
            return {"chave": c["codigo"], "nome": c["nome"], "tipo": "colono"}
    for f in fundadores:
        if quem in (f.get("curto"), f.get("nome"), f["id"]):
            return {"chave": f["id"], "nome": f.get("curto", f["id"]), "tipo": "fundador"}
    return {"chave": quem, "nome": quem, "tipo": "outro"}


def escolher_vozes(falas: list[dict], info: dict, fundadores: list[dict]) -> tuple[dict, list[str]]:
    """{quem ('' = protagonista): voz} + avisos de gênero não definido.

    A voz é fixa por pessoa em todos os vídeos: fundadores e depois colonos (ordem do código NM)
    recebem, dentro do seu gênero, as vozes da lista em sequência. Assim ninguém troca de voz entre
    cenas e, até 8 homens / 6 mulheres, cada um tem a sua. Quem chega depois não muda os antigos."""
    cfg = config.ler_json(config.VOZES_POV_JSON) if config.VOZES_POV_JSON.exists() else {}
    avisos = []

    def preferencia(p):
        grupo = cfg.get("fundadores" if p["tipo"] == "fundador" else "colonos", {})
        pref = grupo.get(p["chave"]) or grupo.get(p["nome"])
        if isinstance(pref, str):
            pref = {"genero": pref}
        if not pref or pref.get("genero") not in config.POV_VOZES:
            return {"genero": "mf"[_num(p["chave"]) % 2], "sorteado": True}
        return pref

    todos = ([{"chave": f["id"], "nome": f.get("curto", f["id"]), "tipo": "fundador"} for f in fundadores]
             + [{"chave": c["codigo"], "nome": c["nome"], "tipo": "colono"}
                for c in sorted(info["colonos"], key=lambda c: c["codigo"])])
    fixas, contagem = {}, {"m": 0, "f": 0}
    for p in todos:
        pref = preferencia(p)
        lista = config.POV_VOZES[pref["genero"]]
        i = next((k for k, (n, _) in enumerate(lista) if n.lower() == str(pref.get("voz", "")).lower()), None)
        if i is None:
            i = contagem[pref["genero"]] % len(lista)
            contagem[pref["genero"]] += 1
        fixas[p["chave"]] = (lista[i], pref)

    vozes = {}
    for quem in dict.fromkeys(f.get("quem") or "" for f in falas):
        p = _pessoa(quem, info, fundadores)
        if p["chave"] not in fixas:
            pref = preferencia(p)
            fixas[p["chave"]] = (config.POV_VOZES[pref["genero"]][_num(p["chave"]) % len(config.POV_VOZES[pref["genero"]])], pref)
        (nome, vid), pref = fixas[p["chave"]]
        if pref.get("sorteado") and not any(p["nome"] in a for a in avisos):
            avisos.append(f"{p['nome']}: gênero não definido em vozes_pov.json, voz "
                          f"{'masculina' if pref['genero'] == 'm' else 'feminina'} sorteada")
        vozes[quem] = {"voice_id": vid, "nome": nome, "pessoa": p["nome"], "genero": pref["genero"]}
    return vozes, avisos


def texto_falado(texto: str, info: dict) -> str:
    """Troca o nick pelo jeito de falar (campo 'falado') para a voz pronunciar direito."""
    for c in info["colonos"]:
        if c.get("falado") and c["falado"] != c["nome"]:
            texto = texto.replace(c["nome"], c["falado"])
    return texto


def chave_fala(f: dict) -> str:
    return f"{f.get('quem') or ''}|{f['texto']}"


def gerar_vozes(falas: list[dict], info: dict, fundadores: list[dict]) -> dict:
    """{"quem|texto": {audio, duracao}} de todas as falas da cena."""
    vozes, avisos = escolher_vozes(falas, info, fundadores)
    for a in avisos:
        print(f"  aviso: {a}")
    print("  vozes: " + ", ".join(f"{v['pessoa']} = {v['nome']} ({v['genero']})" for v in vozes.values()))
    api = elevenlabs.ElevenLabs()

    def chave(f):
        return elevenlabs.chave_cache(vozes[f.get("quem") or ""]["voice_id"], texto_falado(f["texto"], info),
                                      config.POV_MODELO, config.POV_AJUSTES)
    pendentes = [f for f in falas if not (config.CACHE_VOZ / f"{chave(f)}.json").exists()]
    if pendentes:
        custo = sum(len(texto_falado(f["texto"], info)) for f in pendentes)
        conta = api.creditos()
        saldo = f" (conta: {conta[0]}/{conta[1]} usados)" if conta else ""
        print(f"  {len(pendentes)} falas novas = {custo} caracteres no Flash{saldo}")
        if conta and conta[0] + custo > conta[1]:
            raise elevenlabs.ErroVoz("Créditos da ElevenLabs insuficientes para as vozes do POV.")
    saida = {}
    for f in falas:
        v = vozes[f.get("quem") or ""]
        saida[chave_fala(f)] = elevenlabs.falar(api, v, texto_falado(f["texto"], info), config.POV_MODELO, config.POV_AJUSTES)
    return saida


async def _gerar(numero: int, cena: str, previa: list[float] | None = None, abas: int = 3,
                 com_voz: bool = True) -> Path | list[Path]:
    pasta = config.pasta_episodio(numero)
    ep, info = montar_ep(pasta), info_pov(pasta, cena)
    fundadores = config.ler_json(config.COLONIA_JSON).get("fundadores", [])
    falas_voz: dict = {}
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

            if com_voz:   # 1º as vozes (o tempo de cada fala muda o ritmo da cena), depois a filmagem
                sonda, meta0 = await aba()
                await sonda.close()
                falas_voz = gerar_vozes(meta0["falas"], info, fundadores)
                info["duracoes"] = {k: v["duracao"] for k, v in falas_voz.items()}

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
    som = musica
    if falas_voz:   # cada fala no instante em que aparece na tela; a música abaixa quando alguém fala
        narracao, som = destino / f"narracao_{cena}.wav", destino / f"mix_{cena}.wav"
        trilha = [{"audio": falas_voz[chave_fala(f)]["audio"], "fala_inicio": f["t"]}
                  for f in meta["falas"] if chave_fala(f) in falas_voz]
        gerar_narracao(narracao, {"cenas": trilha, "duracao": meta["duracao"]})
        mixar(musica, narracao, som, True)
        narracao.unlink(missing_ok=True)
    final = destino / f"pov_{cena}.mp4"
    ffmpeg("-framerate", config.FPS, "-i", f"{quadros.name}/%05d.jpg", "-i", som.name,
           "-vf", "format=yuv420p", "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-r", config.FPS,
           "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", final.name, cwd=destino)
    shutil.rmtree(quadros, ignore_errors=True)
    musica.unlink(missing_ok=True)
    som.unlink(missing_ok=True)
    (destino / f"pov_{cena}.txt").write_text(legenda(cena, info), encoding="utf-8")
    return final


def gerar(numero: int, cena: str, previa: list[float] | None = None, com_voz: bool = True):
    return asyncio.run(_gerar(numero, cena, previa, com_voz=com_voz and not previa))


def juntar(numero: int) -> Path:
    """pov_colonia.mp4: as cenas prontas em sequência (um dia na colônia pelos olhos dos colonos)."""
    destino = config.pasta_episodio(numero) / "pov"
    ordem = [c for c, _ in planejar_povs(config.ler_json(config.pasta_episodio(numero) / "dados.json"))]
    partes = [destino / f"pov_{c}.mp4" for c in ordem if (destino / f"pov_{c}.mp4").exists()]
    if len(partes) < 2:
        raise SystemExit("Gere pelo menos 2 cenas antes de juntar.")
    entradas = [x for v in partes for x in ("-i", v.name)]
    grafo = "".join(f"[{i}:v][{i}:a]" for i in range(len(partes))) + f"concat=n={len(partes)}:v=1:a=1[v][a]"
    final = destino / "pov_colonia.mp4"
    ffmpeg(*entradas, "-filter_complex", grafo, "-map", "[v]", "-map", "[a]",
           "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p", "-r", config.FPS,
           "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", final.name, cwd=destino)
    info = [info_pov(config.pasta_episodio(numero), c)["prota"]["nome"] for c in ordem if (destino / f"pov_{c}.mp4").exists()]
    (destino / "pov_colonia.txt").write_text(
        f"POV: um dia inteiro em Marte pelos olhos dos colonos 👀🚀 {', '.join(dict.fromkeys(info))}: "
        "cada um no seu trabalho na colônia.\n\n"
        "Cada seguidor vira personagem na Operação Marte Zero. Link na bio 👆\n📺 Episódio novo todo dia.\n\n"
        "#operacaomartezero #pixelart #marte #pov #jogoindie", encoding="utf-8")
    return final


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--episodio", type=int, required=True)
    ap.add_argument("--cena", choices=CENAS)
    ap.add_argument("--plano", action="store_true", help="só mostra o sorteio do episódio")
    ap.add_argument("--previa", type=float, nargs="+", metavar="SEGUNDOS")
    ap.add_argument("--sem-voz", action="store_true", help="só música, sem gastar ElevenLabs")
    ap.add_argument("--juntar", action="store_true", help="só junta as cenas prontas em pov_colonia.mp4")
    a = ap.parse_args()
    if a.juntar:
        raise SystemExit(print(juntar(a.episodio)))
    plano = planejar_povs(config.ler_json(config.pasta_episodio(a.episodio) / "dados.json"))
    if a.plano:
        raise SystemExit("\n".join(f"  {c:12} {p['nome']} ({p.get('cargo') or 'sem cargo'})" for c, p in plano))
    for c in ([a.cena] if a.cena else [c for c, _ in plano]):
        r = gerar(a.episodio, c, a.previa, com_voz=not a.sem_voz)
        for p in (r if isinstance(r, list) else [r]):
            print(p)
    if not a.cena and not a.previa:
        print(juntar(a.episodio))
