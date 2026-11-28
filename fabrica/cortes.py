"""Cortes curtos do episódio para o Instagram e o TikTok (o YouTube continua com o episódio completo).

Os dois saem do MESMO episódio (mesmos dados, mesmo mundo), mas são diferentes entre si e terminam
chamando para o episódio completo no YouTube:

  * Instagram (~30-40 s): abre no ALERTA com o nome de quem vai resolver → solução → obra do dia →
    novos colonos → "episódio completo (com a votação) no YouTube".
  * TikTok (~25-35 s): abre chamando o herói pelo nome no meio do perigo → novos colonos → obra →
    termina SEM mostrar a solução: "Será que <herói> salva a colônia? Episódio completo no YouTube".

Sem abertura/vinheta: o segundo zero já é o conflito. Pausas mais curtas que no episódio completo.

    python cortes.py --episodio 7                    # gera os dois (precisa do episódio completo já gerado)
    python cortes.py --episodio 7 --rede tiktok
    python cortes.py --episodio 7 --a-partir-de filmagem
    python cortes.py --episodio 7 --so-roteiro       # só mostra as falas (não gasta voz)

Saída: saida/epNNN/curto_<rede>/ e o vídeo saida/epNNN/episodio_NNN_<rede>.mp4
"""
from __future__ import annotations

import argparse
import asyncio
import contextlib
import random
import shutil

import audio
import config
import eventos
import navegador
import roteiro as R
import voz

REDES = ("instagram", "tiktok")
ETAPAS = ["roteiro", "voz", "tempo", "filmagem", "montagem"]

# chamada final para o YouTube (o nome do canal é dito; link clicável não existe no IG/TT)
CHAMADA_IG = [
    "O episódio completo, com a votação de hoje, está no YouTube: Operação Marte Zero. Lá você decide o que acontece amanhã!",
    "Quer ver tudo e votar no que vem amanhã? Episódio completo no YouTube: Operação Marte Zero!",
]
CHAMADA_TT = [
    "Será que {heroi} consegue salvar a colônia? Descubra no episódio completo no YouTube: Operação Marte Zero!",
    "E agora, {heroi}? O final está no episódio completo no YouTube: Operação Marte Zero!",
]
HOOK_IG = ["{alerta} ", "{alerta} "]
NOME_IG = [", a colônia precisa de você!", ", só você pode resolver isso!"]
NOME_TT = ["{heroi}, acorda! ", "{heroi}, corre! ", "Atenção, {heroi}! "]
NOVOS_IG = ["E chegou gente nova: ", "Novos colonos na área: "]
NOVOS_TT = ["Enquanto isso, chegaram: ", "E a colônia não para de crescer: "]


@contextlib.contextmanager
def ritmo_rapido():
    """Pausas menores entre as falas (só durante a linha do tempo do corte)."""
    antes = (config.PAUSA_ANTES, config.PAUSA_DEPOIS, config.CENA_MINIMA, config.FINAL_EXTRA)
    config.PAUSA_ANTES, config.PAUSA_DEPOIS, config.CENA_MINIMA, config.FINAL_EXTRA = 0.08, 0.22, 2.0, 1.2
    try:
        yield
    finally:
        config.PAUSA_ANTES, config.PAUSA_DEPOIS, config.CENA_MINIMA, config.FINAL_EXTRA = antes


def _novos(d: dict, abre: str, max_nomes: int = 4) -> dict | None:
    if not d.get("novos"):
        return None
    mostrados = d["novos"][:max_nomes]
    resto = d["novos_total"] - len(mostrados)
    f = R.Fala().add(abre)
    if resto > 0:   # "Ana, Bia, Caio e mais dois"
        for i, c in enumerate(mostrados):
            f.add(", " if i else "").add(c["falado"], f"colono:{c['codigo']}")
        f.add(f" e mais {R.extenso(resto)}")
    else:
        f.lista([(c["falado"], f"colono:{c['codigo']}") for c in mostrados])
    f.add("!")
    return R.cena("boas_vindas", "boas_vindas", f, camera={"alvo": "colonia", "zoom": 5},
                  colonos=[c["codigo"] for c in mostrados])


def _andarilhos(d: dict, rnd: random.Random) -> dict | None:
    """Quem entrou pelos comentários hoje (andarilhos novos): cena curta com o @ de cada um."""
    novos = [a for a in d.get("andarilhos", []) if a.get("novo")][:3]
    if not novos:
        return None
    f = R.Fala().add(rnd.choice(["E pelos comentários chegou: ", "Entrou pelos comentários: "]))
    f.lista([(R.handle_falado(a["handle"]), f"andarilho:{a['handle']}") for a in novos]).add("!")
    return R.cena("andarilhos", "andarilhos", f, camera={"alvo": "colonia", "zoom": 4.5})


def _obra(r: dict, rnd: random.Random) -> list[dict]:
    """A obra do dia em 1 cena (ou 2 no dia da inauguração: a última cena é a da obra ligando)."""
    missao = [c for c in r["cenas"] if c["tipo"] == "missao"]
    p0, p1 = r["obra_progresso"]
    nome = next((o["nome"] for o in config.colonia()["obras"] if o["slug"] == r["missao_obra"]), "obra")
    fem = nome.split()[0].lower().endswith("a")   # Estufa → a; Extrator → o
    art, pronta = ("a", "pronta") if fem else ("o", "pronto")
    limpa = lambda c, **k: {**{x: v for x, v in c.items() if x not in ("marcas",)}, "marcas": [], **k}
    if r["obra_concluida"] and len(missao) >= 5:
        a = p0 / 100
        constroi = R.cena("missao_1", "missao", R.Fala().add(rnd.choice([
            f"E {art} {nome} ficou {pronta} hoje!", f"Último dia de obra: {art} {nome} chega a cem por cento!"])),
            passo=4, acao="construir", camera={"alvo": "obra", "zoom": 6}, extra=0, progresso=[a, 1], atores={})
        # as animações exclusivas do último dia (etapas + cenas originais com tomada) passam durante a fala
        tipos = [e["tipo"] for c in missao[:4] for e in c.get("tomadas", [])]
        if tipos:
            constroi["tomadas"] = [{"tipo": tp, "frac": [round(i / len(tipos), 3), round((i + 1) / len(tipos), 3)]}
                                   for i, tp in enumerate(tipos)]
            constroi["extra"] = 1.2 * len(tipos) / 2
        liga = limpa(missao[4], id="missao_2", passo=5)
        return [constroi, liga]
    fala = rnd.choice([f"Enquanto isso, {art} {nome} chegou a {R.extenso(p1)} por cento.",
                       f"E a obra não para: {nome}, {R.extenso(p1)} por cento."])
    # as etapas exclusivas do dia (as mesmas animações do episódio) passam em sequência durante a fala
    tipos = [e["tipo"] for c in missao for e in c.get("tomadas", [])]
    etapas = ({"tomadas": [{"tipo": tp, "frac": [round(i / len(tipos), 3), round((i + 1) / len(tipos), 3)]}
                           for i, tp in enumerate(tipos)]} if tipos else {})
    return [R.cena("missao_1", "missao", R.Fala().add(fala), passo=4, acao="construir",
                   camera={"alvo": "obra", "zoom": 6}, extra=1.2 * len(tipos) / 2 if tipos else 0,
                   progresso=[p0 / 100, p1 / 100], atores={}, **etapas)]


def montar(d: dict, r: dict, rede: str) -> dict:
    n = d["numero"]
    rnd = random.Random(f"corte:{rede}:{n}")
    problema = eventos.escolher(n, d) if r.get("problema") else None
    if problema and problema["id"] != r["problema"]["id"]:
        raise SystemExit("o Problema do Dia mudou desde o episódio completo: gere o episódio de novo antes dos cortes")
    base = {k: v for k, v in r.items() if k not in ("cenas", "votacao", "resultado_votacao", "destaques", "obra_extra")}
    if not problema:   # dia sem problema: abre na obra, depois os novos colonos e a chamada para o YouTube
        cenas = _obra(r, rnd)
        novos = _novos(d, rnd.choice(NOVOS_IG if rede == "instagram" else NOVOS_TT))
        if rede == "tiktok" and novos:
            cenas.insert(0, novos)
        elif novos:
            cenas.append(novos)
        cenas.append(R.cena("youtube", "youtube", R.Fala().add(rnd.choice(CHAMADA_IG)), camera={"alvo": "panorama", "zoom": 2.4}))
        return {**base, "proxima_obra": None, "curto": rede, "cenas": cenas}
    est, _ = eventos.estacao(n)
    campos = {"temp": eventos.temp_falada(eventos.temperatura(n, est), R.extenso), "estacao": est["falado"]}
    heroi = problema["heroi"]
    curto = {**heroi, "falado": R.nome_falado(heroi["nome"])}   # só o nome ("Levs"), sem a equipe
    alerta = problema["alerta"].format(**campos)
    if not alerta.lower().startswith("alerta"):
        alerta = f"{problema['rotulo'].capitalize()}! {alerta}"
    info_prob = {k: problema[k] for k in ("id", "categoria", "titulo", "rotulo")} | (
        {"furia": problema["furia"]["nome"]} if problema.get("furia") else {})
    cam = R.camera_do_problema(problema["alvo"])
    furia = f"{problema['furia']['falado']} despertou a Fúria de Marte! " if problema.get("furia") else ""

    def cena_problema(f: R.Fala) -> dict:
        return R.cena("problema", "problema", f, camera=cam, problema=info_prob)

    cenas: list[dict] = []
    if rede == "instagram":
        f = R.Fala().add(furia + rnd.choice(HOOK_IG).format(alerta=alerta)).add(curto["falado"], heroi["foco"]).add(rnd.choice(NOME_IG))
        cenas.append(cena_problema(f))
        sol = R.fala_com_heroi(problema["solucao"], heroi, **campos)
        cenas.append(R.cena("solucao", "solucao", sol, camera=cam, problema=info_prob, heroi=heroi["nome"],
                            reacao=problema.get("reacao", "heroi"), alvo=problema["alvo"], heroi_codigo=heroi.get("colono")))
        cenas += _obra(r, rnd)
        novos = _novos(d, rnd.choice(NOVOS_IG))
        if novos:
            cenas.append(novos)
        if (andar := _andarilhos(d, rnd)):
            cenas.append(andar)
        chamada = R.Fala().add(rnd.choice(CHAMADA_IG))
    else:   # tiktok: termina no suspense, sem a solução
        molde = rnd.choice(NOME_TT)
        antes_nome, depois_nome = molde.split("{heroi}")
        f = R.Fala().add(antes_nome).add(curto["falado"], heroi["foco"]).add(depois_nome + furia + alerta)
        cenas.append(cena_problema(f))
        novos = _novos(d, rnd.choice(NOVOS_TT), max_nomes=3)
        if novos:
            cenas.append(novos)
        if (andar := _andarilhos(d, rnd)):
            cenas.append(andar)
        cenas += _obra(r, rnd)
        chamada = R.fala_com_heroi(rnd.choice(CHAMADA_TT), curto)
    cenas.append(R.cena("youtube", "youtube", chamada, camera=cam if rede == "tiktok" else {"alvo": "panorama", "zoom": 2.4}))
    return {**base, "proxima_obra": None, "curto": rede, "cenas": cenas}


def gerar(n: int, rede: str, a_partir_de: str = "roteiro", sem_voz: bool = False, abas: int = 4,
          so_roteiro: bool = False) -> None:
    ep = config.pasta_episodio(n)
    pasta = ep / f"curto_{rede}"
    pasta.mkdir(exist_ok=True)
    faz = lambda etapa: ETAPAS.index(etapa) >= ETAPAS.index(a_partir_de)
    print(f"== corte {rede} do episódio {n}")
    if faz("roteiro"):
        d, r = config.ler_json(ep / "dados.json"), config.ler_json(ep / "roteiro.json")
        shutil.copyfile(ep / "dados.json", pasta / "dados.json")
        rc = montar(d, r, rede)
        config.gravar_json(pasta / "roteiro.json", rc)
        for c in rc["cenas"]:
            print(f"  [{c['id']}] {c['fala']}")
        if so_roteiro:
            return
    rc = config.ler_json(pasta / "roteiro.json")
    if faz("voz"):
        config.gravar_json(pasta / "voz.json", voz.gerar_falas(rc, sem_voz))
    if faz("tempo"):
        with ritmo_rapido():
            lt = R.linha_do_tempo(rc, config.ler_json(pasta / "voz.json"))
        lt["curto"] = rede
        config.gravar_json(pasta / "linha_do_tempo.json", lt)
        print(f"  duração: {lt['duracao']:.1f}s")
    if faz("filmagem"):
        asyncio.run(navegador._filmar(pasta, abas))
    if faz("montagem"):
        final = audio.montar_pasta(pasta, f"episodio_{n:03d}_{rede}.mp4")
        destino = ep / final.name
        shutil.move(str(final), destino)
        print(f"  pronto: {destino}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--episodio", type=int, required=True)
    ap.add_argument("--rede", choices=REDES)
    ap.add_argument("--a-partir-de", choices=ETAPAS, default="roteiro")
    ap.add_argument("--sem-voz", action="store_true")
    ap.add_argument("--abas", type=int, default=4)
    ap.add_argument("--so-roteiro", action="store_true")
    a = ap.parse_args()
    for rede in ([a.rede] if a.rede else REDES):
        gerar(a.episodio, rede, a.a_partir_de, a.sem_voz, a.abas, a.so_roteiro)
