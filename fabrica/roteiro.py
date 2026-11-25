"""Roteiro: monta as falas do episódio por templates (sem IA).

Ordem das cenas:
  abertura (com estação e temperatura) → população → boas-vindas (se houver novos)
  → compras pagas (se houver) → ALERTA do Problema do Dia → Missão do Dia (5 cenas)
  → problema RESOLVIDO → gancho final.

O Problema do Dia (eventos.py + marte.json) corre em paralelo à obra e não muda o tempo dela.

Episódios são diários e uma obra leva vários episódios: o avanço do dia é
(população × pontos_por_pessoa) ÷ trabalho da obra (fabrica/colonia.json → "ritmo").
Quanto mais colonos, mais mão de obra e mais rápida a construção.

Cada fala pode ter "marcas": pontos do texto em que a câmera muda de foco
(ex.: no instante em que o narrador diz o nome de um colono). O tempo exato de
cada marca vem dos timestamps da voz (voz.py).

Também gera a linha do tempo (início/fim de cada cena) a partir das durações da voz.
"""
from __future__ import annotations

import json
import random
import re

import config
import eventos

# ---------------------------------------------------------------- números
_UNI = "zero um dois três quatro cinco seis sete oito nove dez onze doze treze catorze quinze dezesseis dezessete dezoito dezenove".split()
_DEZ = "_ _ vinte trinta quarenta cinquenta sessenta setenta oitenta noventa".split()
_CEN = "_ cento duzentos trezentos quatrocentos quinhentos seiscentos setecentos oitocentos novecentos".split()


def _ate_mil(n: int) -> str:
    if n == 100:
        return "cem"
    c, r = divmod(n, 100)
    partes = [_CEN[c]] if c else []
    if r:
        partes.append(_UNI[r] if r < 20 else _DEZ[r // 10] + (f" e {_UNI[r % 10]}" if r % 10 else ""))
    return " e ".join(partes)


def extenso(n: int) -> str:
    """Número por extenso em pt-BR (até 999 milhões). O TTS lê sem tropeçar."""
    if n < 1000:
        return _UNI[n] if n < 20 else _ate_mil(n)
    grupos = []
    for valor, sing, plur in ((1_000_000, "um milhão", "milhões"), (1000, "mil", "mil")):
        q, n = divmod(n, valor)
        if q:
            grupos.append(sing if q == 1 else f"{_ate_mil(q)} {plur}")
    if n:
        conector = " e " if n < 100 or n % 100 == 0 else " "
        return " ".join(grupos) + conector + _ate_mil(n)
    return " ".join(grupos)


def plural(n: int, um: str, varios: str) -> str:
    return f"{extenso(n)} {um if n == 1 else varios}"


def lista_falada(itens: list[str]) -> str:
    return itens[0] if len(itens) == 1 else ", ".join(itens[:-1]) + " e " + itens[-1]


def produto_curto(nome: str) -> str:
    """'Bandeira (minhas cores / país) · Satélite' → 'Bandeira'."""
    return re.split(r"\s*[(·|/]\s*", nome)[0].strip() or nome


# ---------------------------------------------------------------- falas com marcas
class Fala:
    """Texto montado em pedaços; pedaços com foco viram marcas (posição no texto)."""

    def __init__(self) -> None:
        self.texto = ""
        self.marcas: list[dict] = []

    def add(self, trecho: str, foco: str | None = None) -> "Fala":
        if foco:
            self.marcas.append({"pos": len(self.texto), "foco": foco})
        self.texto += trecho
        return self

    def lista(self, itens: list[tuple[str, str]]) -> "Fala":
        for i, (nome, foco) in enumerate(itens):
            if i:
                self.add(" e " if i == len(itens) - 1 else ", ")
            self.add(nome, foco)
        return self


# como cada item é dito quando várias pessoas compram o mesmo ("três colonos compraram uma cápsula")
PRODUTO_FALADO = {
    "capsula-habitacional": "uma cápsula", "capsula-comercio": "uma cápsula de comércio", "pet-do-colono": "um pet", "pet-macaco": "um macaco",
    "seu-foguete": "um foguete", "rover": "um rover", "outdoor-holografico": "um outdoor", "traje-espacial": "um traje espacial",
    "monumento-dourado": "um monumento dourado", "bandeira": "uma bandeira",
}


CAPSULA_FALADA = {"estufa": "uma cápsula estufa", "observatorio": "uma cápsula observatório", "dupla": "uma cápsula dupla"}


def produto_falado(slug: str, nome: str, opcao: str | None = None) -> str:
    if slug == "capsula-habitacional" and opcao in CAPSULA_FALADA:
        return CAPSULA_FALADA[opcao]
    if slug == "pet-do-colono" and opcao == "gato":
        return "um gato"
    if slug in PRODUTO_FALADO:
        return PRODUTO_FALADO[slug]
    curto = produto_curto(nome)
    return ("uma " if curto.split()[0].lower().endswith("a") else "um ") + curto[0].lower() + curto[1:]


_PAISES = None


def pais(valor: str | None) -> str | None:
    """'br' → 'Brasil' (fabrica/paises.json, sem o emoji: a fonte do vídeo não desenha emoji)."""
    global _PAISES
    if _PAISES is None:
        _PAISES = {x["valor"]: x["rotulo"].split(" ", 1)[1] for x in config.ler_json(config.FABRICA / "paises.json")}
    return _PAISES.get(valor or "")


def curto_com_variante(c: dict, slug: str) -> str:
    """"Rover", "Cápsula Habitacional", "Cápsula Estufa" ou "Bandeira: Brasil"."""
    if slug == "bandeira" and c.get("opcao") not in (None, "", "cores") and pais(c.get("opcao")):
        return f"Bandeira: {pais(c['opcao'])}"
    if slug == "capsula-habitacional" and c.get("opcao") in CAPSULA_FALADA:
        return CAPSULA_FALADA[c["opcao"]].removeprefix("uma ").title()   # "Cápsula Estufa"
    if slug == "pet-do-colono" and c.get("opcao") in ("cachorro", "gato"):
        return f"Pet {c['opcao'].title()}"   # "Pet Gato"
    return produto_curto(c["produto"])


def fala_das_compras(compras: list[dict], max_nomes: int = 6) -> Fala:
    """Compras agrupadas por produto: quem comprou sozinho aparece como "Na casa de Ana: Rover."; produto com
    várias compras vira "Três colonos compraram uma cápsula: Ana, Bia e Caio." (até max_nomes nomes no total,
    cada nome com foco para a câmera ir até a casa)."""
    grupos: dict[str, list[dict]] = {}
    for c in compras:
        grupos.setdefault(c["produto_slug"], []).append(c)
    f = Fala().add("Novidades na vizinhança! ")
    sobra = max_nomes
    calados = 0
    for slug, g in sorted(grupos.items(), key=lambda kv: -len(kv[1])):
        if sobra <= 0:
            calados += len(g)
            continue
        if len(g) == 1:
            c = g[0]
            f.add("Na casa de ").add(c["falado"], f"compra:{c['codigo']}:{slug}").add(f": {curto_com_variante(c, slug)}. ")
            sobra -= 1
            continue
        frase = plural(len(g), "colono comprou", "colonos compraram")
        f.add(f"{frase[0].upper()}{frase[1:]} {produto_falado(slug, g[0]['produto'], g[0].get('opcao') if len({c.get('opcao') for c in g}) == 1 else None)}: ")
        ditos = g[:min(sobra, 3)]
        f.lista([(c["falado"], f"compra:{c['codigo']}:{slug}") for c in ditos])
        if len(g) > len(ditos):
            f.add(f" e mais {extenso(len(g) - len(ditos))}")
        f.add(". ")
        sobra -= len(ditos)
    if calados:
        f.add(f"E mais {plural(calados, 'item chegou', 'itens chegaram')} na colônia. ")
    return f.add("Obrigado por apoiar a Operação Marte Zero!")


def nome_falado(nome: str) -> str:
    """Para a narração: separa palavras grudadas ("BuracoNegrote" → "Buraco Negrote")."""
    return re.sub(r"(?<=[a-zà-ÿ])(?=[A-ZÀ-Þ])", " ", nome)


def handle_falado(handle: str) -> str:
    """"@bombeira_ana" → "bombeira ana" (a voz não lê _ . nem números soltos)."""
    t = re.sub(r"[_.\-]+", " ", handle.lstrip("@"))
    t = re.sub(r"\d+", " ", t)
    return nome_falado(re.sub(r"\s+", " ", t).strip()) or handle


def com_equipe(c: dict) -> str:
    """Nome falado + profissão, para as boas-vindas: "ZéGotinha da equipe de Engenharia"."""
    return f"{c['falado']} {c['equipe']}" if c.get("equipe") else c["falado"]


def fala_com_heroi(molde: str, heroi: dict, **campos) -> Fala:
    """Monta a fala trocando {heroi} pelo nome com foco (a câmera vai até ele quando o nome é dito)."""
    f = Fala()
    partes = molde.split("{heroi}")
    for i, parte in enumerate(partes):
        if i:
            f.add(heroi["falado"], heroi["foco"])
        f.add(parte.format(**campos))
    return f


CAMERA_PROBLEMA = {"base": {"alvo": "base", "zoom": 5.0}, "colonia": {"alvo": "colonia", "zoom": 3.2},
                   "praca": {"alvo": "praca", "zoom": 5.0}}


def camera_do_problema(alvo: str) -> dict:
    return CAMERA_PROBLEMA.get(alvo) or {"alvo": alvo, "zoom": 5.0}   # "obra:<slug>"


def cena(id_: str, tipo: str, fala: Fala, **extra) -> dict:
    return {"id": id_, "tipo": tipo, "fala": fala.texto.strip(), "marcas": fala.marcas, **extra}


# ---------------------------------------------------------------- templates
# fundação da próxima obra, no fim do episódio em que uma obra fica pronta (cena "fundacao")
FUNDACAO_PCT = 15
FUNDACAO_FALAS = [
    "Com a obra pronta, ninguém foi descansar: a colônia já começou {art} {obra}. A escavadeira abre o buraco, "
    "os colonos armam a malha de aço e o caminhão despeja o concreto. Fim do dia: fundação pronta, {pct} por cento!",
]

ABERTURAS = [
    "Operação Marte Zero, episódio {n}. Mais um dia no planeta vermelho.",
    "Diário da Operação Marte Zero, episódio {n}. O sol nasce de novo sobre a poeira vermelha.",
    "Episódio {n} da Operação Marte Zero. A tempestade passou, e a colônia acordou cedo.",
    "Operação Marte Zero, episódio {n}. Bom dia, colonos.",
]
BOAS_VINDAS_1 = ["Boas-vindas a {nome}! Tem casa nova na colônia.",
                 "Chegou gente nova: {nome}! A casa já está de pé."]
BOAS_VINDAS_N = ["Bem-vindos, ", "Chegaram à colônia: "]
# Episódio 1 tem gancho próprio. Do 2 em diante a série é diária: "amanhã tem episódio novo".
GANCHOS = [   # fim de TODO episódio: chamada para o site + "concorre a líder da colônia" (cargos de liderança)
    "Quer aparecer no próximo episódio? Entre em {site} e vire colono premium: quem entra pelo site concorre a líder da colônia! Amanhã: {proxima}.",
    "Entre em {site}, vire colono premium e procure seu nome no mapa. Quem entra pelo site concorre a líder da colônia! Amanhã: {proxima}.",
    "A colônia precisa de líderes. Entre em {site} e vire colono premium: quem entra pelo site concorre a líder da colônia! Amanhã: {proxima}.",
]

# Missão do Dia quando a obra NÃO termina e/ou NÃO começa no episódio (a obra leva vários dias)
RETOMAR = ["Missão do Dia: continuar a obra da {obra}. Ontem paramos em {p0} por cento.",
           "De volta ao canteiro: a {obra} está em {p0} por cento. Hora de trabalhar."]
MAO_DE_OBRA_IGUAL = ["Hoje são {pop} na obra. Cada colono é mais uma mão trabalhando.",
                     "A equipe segue com {pop}. Quanto mais gente, mais rápido a obra anda."]
MAO_DE_OBRA_MAIS = ["Hoje a obra ganhou reforço: são {pop} trabalhando, {novos} a mais que ontem.",
                    "Com {novos} recém-chegados, a equipe da obra cresceu para {pop}."]
CONSTRUIR = ["Viga por viga, a {obra} vai tomando forma.",
             "Os robôs de carga trazem material do módulo de pouso, e a estrutura sobe mais um pouco.",
             "Solda, encaixe, aperto. A {obra} está cada vez mais perto de ficar pronta."]
AVANCO = ["Fim do turno: a {obra} chegou a {p1} por cento.",
          "Hoje a obra avançou {ganho} por cento. Já são {p1} por cento da {obra}."]
FIM_DO_DIA = ["O sol se põe em Marte. Amanhã a obra continua, e cada novo colono deixa a construção mais rápida.",
              "Ferramentas guardadas. Quando a {obra} fica pronta? Depende de você: quanto mais colonos, mais rápido ela sai."]



# ---------------------------------------------------------------- votação SIM ou NÃO (fabrica/votacoes.json)
def votacoes() -> dict:
    return json.loads((config.FABRICA / "votacoes.json").read_text(encoding="utf-8"))


def escolher_votacao(n: int, d: dict) -> dict | None:
    """Pergunta do fim do episódio n: sem repetir as recentes e só se a obra que ela pede já estiver pronta."""
    if n < 2:
        return None
    banco = votacoes()
    recentes = set()
    for k in range(n - 1, max(0, n - 1 - int(banco.get("sem_repetir", 12))), -1):
        arq = config.SAIDA / f"ep{k:03d}" / "roteiro.json"
        if arq.exists():
            v = json.loads(arq.read_text(encoding="utf-8")).get("votacao")
            if v:
                recentes.add(v["id"])
    prontas = {o["slug"] for o in d.get("obras", []) if o.get("status") == "concluida"}
    ok = [v for v in banco["votacoes"] if (not v.get("requer") or v["requer"] in prontas)]
    opcoes = [v for v in ok if v["id"] not in recentes] or ok
    return random.Random(f"votacao:{n}").choice(opcoes) if opcoes else None


def ler_correio(n: int) -> dict:
    arq = config.SAIDA / f"ep{n:03d}" / "correio.json"
    return json.loads(arq.read_text(encoding="utf-8")) if arq.exists() else {}


def placar_do_correio(n: int) -> dict | None:
    """Placar SIM × NÃO dos comentários do episódio anterior (correio.py, um voto por pessoa e por rede)."""
    sim, nao, vistos = [], [], set()
    for v in ler_correio(n).get("votos_por_comentario", []):
        chave = (v["rede"], v["autor"].lower())
        if v.get("voto") not in ("sim", "nao") or chave in vistos:
            continue
        vistos.add(chave)
        (sim if v["voto"] == "sim" else nao).append(v["autor"])
    return {"sim": len(sim), "nao": len(nao), "nomes_sim": sim, "nomes_nao": nao} if sim or nao else None


def resultado_da_votacao(n: int) -> dict | None:
    """Decisão da votação do episódio n-1. Vale a marcada no painel (saida/epNNN/votacao.json); sem marcação, o
    placar dos comentários decide (correio.py). Empate: só decide se alguém deu uma ideia de desempate nos
    comentários; sem ideia, fica sem resultado. O placar (e quem votou) vai para a tela."""
    if n < 2:
        return None
    arq = config.SAIDA / f"ep{n - 1:03d}" / "votacao.json"
    marcado = json.loads(arq.read_text(encoding="utf-8")) if arq.exists() else {}
    rot_ant = config.SAIDA / f"ep{n - 1:03d}" / "roteiro.json"
    aberta = (json.loads(rot_ant.read_text(encoding="utf-8")).get("votacao") or {}) if rot_ant.exists() else {}
    placar = placar_do_correio(n) if aberta else None
    desempate = ler_correio(n).get("desempate")
    empate = bool(placar) and placar["sim"] == placar["nao"]
    resultado = marcado.get("resultado") if marcado.get("resultado") in ("sim", "nao") else None
    if resultado is None and placar:
        resultado = ("sim" if placar["sim"] > placar["nao"] else "nao") if not empate else (desempate or {}).get("decisao")
    v = next((x for x in votacoes()["votacoes"] if x["id"] == (marcado.get("id") or aberta.get("id"))), None)
    if not v or resultado not in ("sim", "nao"):
        return None
    fala = v[resultado]
    if placar and empate and desempate and desempate.get("decisao") == resultado:
        fala = f"Deu empate nos comentários: {extenso(placar['sim'])} a {extenso(placar['nao'])}! {desempate['fala']} {fala}"
        placar = {**placar, "desempate": desempate["autor"]}
    elif placar:
        fala = f"Placar da votação: {extenso(placar['sim'])} a {extenso(placar['nao'])}. {fala}"
    return {"id": v["id"], "tela": v["tela"], "resultado": resultado, "fala": fala, "camera": v.get("camera"),
            "placar": placar}


def avanco_da_obra(d: dict, obra: dict, n: int) -> tuple[int, int]:
    """(progresso de ontem, progresso ao fim de hoje) em %, pela mão de obra da colônia."""
    p0 = int(obra.get("progresso") or 0)
    trabalho = obra.get("trabalho")
    if n == 1 or not trabalho:
        return p0, 100            # episódio 1 (já publicado) construiu a Fazenda Solar inteira
    ritmo = config.colonia().get("ritmo", {})
    pontos = d["populacao"] * float(ritmo.get("pontos_por_pessoa", 1))
    ganho = max(1, round(100 * pontos / float(trabalho)))
    return p0, min(100, p0 + ganho)


def cenas_da_missao(d: dict, obra: dict, missao: dict, p0: int, p1: int, rnd: random.Random) -> list[dict]:
    """Sempre 5 cenas. Progresso das cenas em fração ABSOLUTA da obra (o diretor parte do progresso salvo)."""
    base = missao["cenas"]
    a, b = p0 / 100, p1 / 100
    meio = a + (b - a) / 2
    nome = obra["nome"]
    pop, antes = d["populacao"], d.get("populacao_anterior", d["populacao"])
    fmt = dict(obra=nome, p0=extenso(p0), p1=extenso(p1), ganho=extenso(p1 - p0),
               pop=plural(pop, "colono", "colonos"), novos=extenso(max(0, pop - antes)))
    gen = lambda textos: rnd.choice(textos).format(**fmt)

    def original(i: int, prog=None) -> dict:
        mc = base[i]
        return {"fala": mc["fala"], "acao": mc["acao"], "camera": mc["camera"], "extra": mc.get("extra", 0),
                "progresso": prog if prog is not None else mc.get("progresso", [0, 0]), "atores": mc.get("atores", {})}

    def generica(fala: str, acao: str, alvo: str, zoom: float, prog) -> dict:
        return {"fala": fala, "acao": acao, "camera": {"alvo": alvo, "zoom": zoom}, "progresso": prog, "atores": {}}

    mao = gen(MAO_DE_OBRA_MAIS if pop > antes else MAO_DE_OBRA_IGUAL)
    if p0 == 0 and p1 >= 100:          # colônia grande: a obra inteira num dia (cenas originais)
        return [original(i) for i in range(5)]
    if p0 == 0:                        # primeiro dia da obra, ela continua amanhã
        return [original(0, [0, 0]), original(1, [0, 0]), original(2, [a, meio]),
                generica(gen(AVANCO), "construir", "obra", 6, [meio, b]),
                generica(gen(FIM_DO_DIA), "construir", "colonia", 3.2, [b, b])]
    if p1 >= 100:                      # dia da conclusão: fecha com as cenas originais (ligar)
        return [generica(gen(RETOMAR), "apresentar", "obra", 4.5, [a, a]),
                generica(mao, "construir", "obra", 5, [a, a]),
                generica(gen(CONSTRUIR), "construir", "obra", 6, [a, meio]),
                original(3, [meio, 1]), original(4, [1, 1])]
    return [generica(gen(RETOMAR), "apresentar", "obra", 4.5, [a, a]),   # dia do meio
            generica(mao, "construir", "obra", 5, [a, a]),
            generica(gen(CONSTRUIR), "construir", "obra", 6, [a, meio]),
            generica(gen(AVANCO), "construir", "obra", 6, [meio, b]),
            generica(gen(FIM_DO_DIA), "construir", "colonia", 3.2, [b, b])]


def montar(d: dict) -> dict:
    n = d["numero"]
    rnd = random.Random(n)  # mesma escolha de template sempre que o mesmo episódio for gerado
    fund = d["fundadores"]
    cenas: list[dict] = []
    est, dia_est = eventos.estacao(n)
    temp = eventos.temperatura(n, est)
    problema = eventos.escolher(n, d)
    campos = {"temp": eventos.temp_falada(temp, extenso), "estacao": est["falado"]}

    # 1. abertura
    if n == 1:
        f = Fala().add("Operação Marte Zero, episódio um. Depois de sete meses no espaço, "
                       "a primeira nave acaba de pousar no planeta vermelho.")
    else:
        f = Fala().add(rnd.choice(ABERTURAS).format(n=extenso(n)))
        f.add(f" {est['falado'].capitalize()}, dia {extenso(dia_est)}. Lá fora, {eventos.temp_falada(temp, extenso)}.")
        if dia_est == 1 or rnd.random() < 0.35:           # 1º dia da estação sempre ganha a frase do clima
            f.add(" " + rnd.choice(est["frases"]))
    cenas.append(cena("abertura", "abertura", f, camera={"alvo": "base", "zoom": 4.2}))

    # 2. população
    pop, antes = d["populacao"], d["populacao_anterior"]
    f = Fala()
    if d["colonos_total"] == 0:
        f.add(f"População da colônia: {extenso(pop)}. ")
        f.lista([(x.get("falado", x["nome"]), f"fundador:{x['id']}") for x in fund]).add(".")
    elif pop > antes:
        novos = pop - antes
        f.add(f"A colônia não para de crescer: já somos {plural(pop, 'colono', 'colonos')}. ")
        f.add("Um novo colono chegou desde o último episódio." if novos == 1 else
              f"{extenso(novos).capitalize()} novos colonos chegaram desde o último episódio.")
    else:
        f.add(f"A população segue firme: {plural(pop, 'colono', 'colonos')} na Operação Marte Zero.")
    cenas.append(cena("populacao", "populacao", f, camera={"alvo": "colonia", "zoom": 3.0},
                      contagem=[antes, pop]))

    # 2b. resultado da votação do episódio anterior (quem comentou decidiu)
    res = resultado_da_votacao(n)
    if res:
        cenas.append(cena("resultado", "resultado", Fala().add(res["fala"]), camera=res.get("camera") or {"alvo": "colonia", "zoom": 3.4},
                          votacao={k: res[k] for k in ("id", "tela", "resultado")}, placar=res.get("placar")))

    # 2c. Correio da colônia: o narrador lê o comentário e a Vega ou a Lia responde, com a voz dela/dele
    #     (correio.py grava saida/epNNN/correio.json na coleta; sem ele, o episódio segue sem o quadro)
    arq_correio = config.SAIDA / f"ep{n:03d}" / "correio.json"
    escolhidos = config.ler_json(arq_correio).get("escolhidos", []) if arq_correio.exists() else []
    REDES_FALADAS = {"youtube": "no YouTube", "instagram": "no Instagram", "tiktok": "no TikTok"}
    for i, e in enumerate(escolhidos[:2], 1):
        info = {"rede": e["rede"], "autor": e["autor"], "texto": e["comentario_tela"], "quem": e["quem"], "indice": i}
        abre = rnd.choice(["Correio da colônia! ", "Abrindo o correio da colônia! "]) if i == 1 else "E tem mais! "
        cenas.append(cena(f"correio_{i}a", "correio", Fala().add(f"{abre}{e['autor_falado']} comentou {REDES_FALADAS.get(e['rede'], '')}: "
                                                                 f"{e['comentario_falado']}"),
                          camera={"alvo": "base", "zoom": 4.5}, correio={**info, "fase": "comentario"}))
        cenas.append(cena(f"correio_{i}b", "correio", Fala().add(e["resposta"]), voz=e["quem"],
                          camera={"alvo": f"ator:{e['quem']}", "zoom": 6.5}, correio={**info, "fase": "resposta"}))

    # 2d. pedido do dia: a ideia/sonho de alguém dos comentários vira uma cena curta (correio.py escolhe)
    ped = (config.ler_json(arq_correio).get("pedido") if arq_correio.exists() else None)
    if ped:
        cenas.append(cena("pedido", "pedido", Fala().add(ped["fala"]), camera={"alvo": "colonia", "zoom": 4},
                          pedido={"autor": ped["autor"], "tela": ped["tela"], "rede": ped["rede"]}))

    # 3. boas-vindas (chamando pelo nome; câmera vai em cada um quando o nome é dito)
    if d["novos"]:
        mostrados = d["novos"][:6]
        resto = d["novos_total"] - len(mostrados)
        f = Fala()
        if len(mostrados) == 1 and resto == 0:
            molde = rnd.choice(BOAS_VINDAS_1)
            antes_nome, depois_nome = molde.split("{nome}")
            f.add(antes_nome).add(com_equipe(mostrados[0]), f"colono:{mostrados[0]['codigo']}").add(depois_nome)
        else:
            f.add(rnd.choice(BOAS_VINDAS_N))
            f.lista([(com_equipe(c), f"colono:{c['codigo']}") for c in mostrados])
            if resto > 0:
                f.add(f", e mais {plural(resto, 'colono', 'colonos')}")
            f.add("! Procurem suas casas no mapa.")
        cenas.append(cena("boas_vindas", "boas_vindas", f, camera={"alvo": "colonia", "zoom": 5},
                          colonos=[c["codigo"] for c in mostrados]))

    # 3b. andarilhos: comentaram dizendo a profissão e entraram na colônia (ainda sem casa, de mochila)
    novos_and = [a for a in d.get("andarilhos", []) if a.get("novo")][:6]
    if novos_and:
        cargos = config.cargos()
        f = Fala().add(rnd.choice(["Chegaram pelos comentários: ", "Entraram pela votação: "]))
        f.lista([(handle_falado(a["handle"]) + (f" {cargos[a['cargo']]['equipe']}" if a.get("cargo") in cargos else ""),
                  f"andarilho:{a['handle']}") for a in novos_and])
        f.add(rnd.choice(["! Por enquanto andam de mochila pela colônia: quem se cadastrar no site ganha a casa.",
                          "! Ainda sem casa, de mochila nas costas: o cadastro no site dá a casinha e o cargo."]))
        cenas.append(cena("andarilhos", "andarilhos", f, camera={"alvo": "colonia", "zoom": 4.5}))

    # 4. compras pagas (o item aparece na casa de quem comprou)
    if d["compras"]:
        cenas.append(cena("compras", "compras", fala_das_compras(d["compras"]), camera={"alvo": "colonia", "zoom": 5}))

    # 4a. crateras batizadas desde o último episódio (a câmera vai até a cratera quando o nome é dito)
    novas = [c for c in d.get("crateras", []) if c.get("nova")][:3]
    if novas:
        f = Fala().add(rnd.choice(["Tem nome novo no mapa de Marte! ", "O mapa da colônia ganhou um nome novo! "]))
        for i, c in enumerate(novas):
            if i:
                f.add(" E ")
            f.add(f"{c['dono_falado']} batizou a ").add(nome_falado(c["nome"]), f"cratera:{c['id']}").add(".")
        f.add(rnd.choice([" Procure no Mundo ao vivo!", " Agora ela é parte da história da colônia."]))
        cenas.append(cena("cratera", "cratera", f, camera={"alvo": f"cratera:{novas[0]['id']}", "zoom": 3.2},
                          crateras=[c["id"] for c in novas]))

    # 4a'. Destaque no Próximo EP (produto): até 2 por episódio, na ordem da compra; os outros ficam para amanhã
    destaques = (d.get("servicos") or {}).get("destaque-proximo-ep", [])[:2]
    if destaques:
        itens = [(com_equipe(c), f"colono:{c['codigo']}") for c in destaques]
        if len(destaques) == 1:
            f = Fala().add(rnd.choice(["Destaque do dia: ", "Hoje o destaque da colônia é "])).add(itens[0][0], itens[0][1]).add("! ")
        else:
            f = Fala().add("Os destaques do dia são ").lista(itens).add("! ")
        f.add(rnd.choice(["Obrigado por fazer parte da Operação Marte Zero.", "A colônia inteira agradece!"]))
        cenas.append(cena("destaque", "destaque", f, camera={"alvo": "colonia", "zoom": 5},
                          colonos=[c["codigo"] for c in destaques]))

    # 4b. ALERTA do Problema do Dia (resolvido depois da missão, em paralelo à obra)
    if problema:
        alerta = problema["alerta"].format(**campos)
        # "Alerta de clima! Alerta de radiação!" soa repetido: o rótulo só entra se a fala não começar com "Alerta"
        f = Fala() if alerta.lower().startswith("alerta") else Fala().add(f"{problema['rotulo'].capitalize()}! ")
        if problema.get("furia"):   # comprado: quem chamou a Fúria de Marte é dito antes do alerta
            f = Fala().add(f"{problema['furia']['falado']} despertou a Fúria de Marte! ")
        f.add(alerta)
        cenas.append(cena("problema", "problema", f, camera=camera_do_problema(problema["alvo"]),
                          problema={k: problema[k] for k in ("id", "categoria", "titulo", "rotulo")}
                          | ({"furia": problema["furia"]["nome"]} if problema.get("furia") else {})))

    # 5. Missão do Dia (5 cenas, da primeira obra não concluída)
    obra = next((o for o in d["obras"] if o["status"] != "concluida"), None)
    catalogo = {o["slug"]: o for o in config.colonia()["obras"]}
    if obra is None:
        raise SystemExit("Todas as obras de colonia.json estão concluídas: cadastre a próxima obra lá.")
    missao = catalogo[obra["slug"]]["missao"]
    if len(missao["cenas"]) != 5:
        raise SystemExit(f"A missão de {obra['slug']} precisa ter 5 cenas (tem {len(missao['cenas'])}).")
    obra = {**obra, "trabalho": obra.get("trabalho") or catalogo[obra["slug"]].get("trabalho")}
    p0, p1 = avanco_da_obra(d, obra, n)
    dia = int(obra.get("dias") or 0) + 1
    concluida = p1 >= 100
    for i, mc in enumerate(cenas_da_missao(d, obra, missao, p0, p1, rnd), 1):
        cenas.append(cena(f"missao_{i}", "missao", Fala().add(mc["fala"]),
                          passo=i, acao=mc["acao"], camera=mc["camera"], extra=mc.get("extra", 0),
                          progresso=mc["progresso"], atores=mc["atores"]))
    proxima = missao["proxima"] if concluida else f"a obra da {obra['nome']} continua"

    # 5a'. obra pronta hoje: no fim do dia a colônia já começa a PRÓXIMA obra e deixa a fundação pronta
    obra_extra = None
    seguinte = (next((o for o in d["obras"] if o["status"] != "concluida" and o["slug"] != obra["slug"]), None)
                if concluida else None)
    if seguinte:
        nome2 = seguinte["nome"]
        art = "a" if nome2.split()[0].lower().endswith("a") else "o"
        obra_extra = {"slug": seguinte["slug"], "progresso": FUNDACAO_PCT, "dias": 1}
        f = Fala().add(rnd.choice(FUNDACAO_FALAS).format(obra=nome2, art=art, Art=art.upper(), pct=extenso(FUNDACAO_PCT)))
        cenas.append(cena("fundacao", "fundacao", f, camera={"alvo": f"obra:{seguinte['slug']}", "zoom": 5},
                          obra=seguinte["slug"], obra_nome=nome2, progresso=[0, FUNDACAO_PCT / 100]))
        proxima = f"{art} {nome2} sobe do chão"

    # 5b. problema RESOLVIDO (quem resolve é um colono de verdade, chamado pelo nome)
    if problema:
        f = fala_com_heroi("Antes de começar a obra, vamos resolver o problema do dia! " + problema["solucao"], problema["heroi"], **campos)
        cenas.append(cena("solucao", "solucao", f, camera=camera_do_problema(problema["alvo"]),
                          problema={k: problema[k] for k in ("id", "categoria", "titulo", "rotulo")}
                          | ({"furia": problema["furia"]["nome"]} if problema.get("furia") else {}),
                          heroi=problema["heroi"]["nome"],
                          # como a colônia reage no vídeo: abrigar (todos entram no módulo), recolher (cada um
                          # corre para casa) ou heroi (só quem resolve vai até o lugar do problema)
                          reacao=problema.get("reacao", "heroi"), alvo=problema["alvo"],
                          heroi_codigo=problema["heroi"].get("colono")))

    # 5c. votação: SIM ou NÃO nos comentários (o resultado abre o próximo episódio)
    votacao = escolher_votacao(n, d)
    if votacao:
        pede = rnd.choice([" E escreve a sua profissão: quem comenta entra na colônia!",
                           " Diz também a sua profissão: quem comenta vira colono!"])
        cenas.append(cena("votacao", "votacao", Fala().add(votacao["fala"] + pede), camera=votacao.get("camera") or {"alvo": "panorama", "zoom": 2.6},
                          votacao={"id": votacao["id"], "tela": votacao["tela"]}))

    # 6. gancho final
    if n == 1:
        f = Fala().add(f"Quer ser um dos primeiros colonos da Operação Marte Zero? Entre em {config.SITE_FALADO} e vire "
                       f"colono premium: quem entra pelo site concorre a líder da colônia! No próximo episódio: {proxima}.")
    else:
        f = Fala().add(rnd.choice(GANCHOS).format(site=config.SITE_FALADO, proxima=proxima))
    prox = (next((o["slug"] for o in d["obras"] if o["status"] != "concluida" and o["slug"] != obra["slug"]), None)
            if concluida else None)
    # obra terminou: o gancho mostra o terreno JÁ DEMARCADO da próxima obra (estacas + placa "PRÓXIMA OBRA")
    cam_gancho = {"alvo": f"obra:{prox}", "zoom": 5} if prox else {"alvo": "panorama", "zoom": 2.2}
    cenas.append(cena("gancho", "gancho", f, camera=cam_gancho))

    # ordem da história: o problema estoura logo no começo (depois da abertura) e é resolvido logo ANTES da obra
    ids = [c["id"] for c in cenas]
    if "problema" in ids:
        cenas.insert(1, cenas.pop(ids.index("problema")))
    ids = [c["id"] for c in cenas]
    if "solucao" in ids:
        sol = cenas.pop(ids.index("solucao"))
        cenas.insert(next(i for i, c in enumerate(cenas) if c["tipo"] == "missao"), sol)
    titulo = f"Episódio {n} · {obra['nome']}"
    if concluida:   # dia em que a obra fica pronta: o episódio é a INAUGURAÇÃO
        titulo = f"Episódio {n} · Inauguração d{'a' if obra['nome'].split()[0].lower().endswith('a') else 'o'} {obra['nome']}"
    return {
        "numero": n,
        "titulo": titulo,
        "missao_obra": obra["slug"],
        # "Construindo a Estufa Hidropônica" (a obra leva vários episódios); a partir do 2º dia "… · dia 2"
        "missao_titulo": (f"Inauguração d{'a' if obra['nome'].split()[0].lower().endswith('a') else 'o'} {obra['nome']}"
                          if concluida else titulo_da_missao(obra, dia)),
        "proxima": proxima,
        # obra terminou hoje? a PRÓXIMA já aparece demarcada no chão no fim do episódio (estacas + placa)
        "proxima_obra": (next((o["slug"] for o in d["obras"] if o["status"] != "concluida" and o["slug"] != obra["slug"]), None)
                         if concluida else None),
        "obra_progresso": [p0, p1],     # % de ontem → % ao fim deste episódio (gravado ao publicar)
        "obra_dia": dia,
        "obra_concluida": concluida,
        # obra pronta hoje: a próxima já sai com a fundação feita (gravado ao publicar, como obra_progresso)
        "obra_extra": obra_extra,
        "estacao": {"id": est["id"], "nome": est["nome"], "falado": est["falado"], "dia": dia_est, "temp": temp, "efeito": est["efeito"]},
        "problema": ({k: problema[k] for k in ("id", "categoria", "titulo", "rotulo")}
                     | {"heroi": problema["heroi"]["nome"], "heroi_codigo": problema["heroi"].get("colono")}
                     | ({"furia": problema["furia"]} if problema.get("furia") else {}))
                    if problema else None,
        # pedidos de Destaque usados aqui (episodio.ja_usados lê isto para não repetir)
        "destaques": [{"pedido": c["pedido"], "codigo": c["codigo"], "nome": c["nome"]} for c in destaques],
        "votacao": {"id": votacao["id"], "tela": votacao["tela"], "fala": votacao["fala"]} if votacao else None,
        "resultado_votacao": {k: v for k, v in res.items() if k != "camera"} if res else None,
        "cenas": cenas,
    }


def titulo_da_missao(obra: dict, dia: int) -> str:
    """"Construindo a Estufa Hidropônica · dia 2": o artigo vem da primeira palavra (Estufa → a, Extrator → o)."""
    artigo = "a" if obra["nome"].split()[0].lower().endswith("a") else "o"
    t = f"Construindo {artigo} {obra['nome']}"
    return t if dia == 1 else f"{t} · dia {dia}"


def legenda_post(d: dict, r: dict) -> str:
    """Texto pronto para a descrição do post (sem IA, só template)."""
    linhas = [f"🚀 OPERAÇÃO MARTE ZERO · {r['titulo']}", "",
              f"Missão do Dia: {r['missao_titulo']}.",
              f"População: {d['populacao']} colonos."]
    if d["novos"]:
        linhas.append("Boas-vindas: " + ", ".join(c["nome"] for c in d["novos"]) +
                      (f" e mais {d['novos_total'] - len(d['novos'])}" if d["novos_total"] > len(d["novos"]) else ""))
    if r.get("obra_progresso"):
        linhas.append(f"Obra: {r['titulo'].split(' · ', 1)[-1]} {r['obra_progresso'][1]}%.")
    if r.get("estacao") and r["numero"] >= 2:
        e = r["estacao"]
        linhas.append(f"{e['falado'].capitalize()}, dia {e['dia']}: {e['temp']}°C.")
    if r.get("problema"):
        linhas.append(f"Problema do dia: {r['problema']['titulo']}, resolvido por {r['problema']['heroi']}.")
        if r["problema"].get("furia"):
            linhas.append(f"Fúria de Marte chamada por {r['problema']['furia']['nome']}.")
    if r.get("destaques"):
        linhas.append("Destaque do dia: " + ", ".join(x["nome"] for x in r["destaques"]) + ".")
    for c in [c for c in d.get("crateras", []) if c.get("nova")][:3]:
        linhas.append(f"Nome novo no mapa: {c['nome']}, batizada por {c['dono']}.")
    if r["numero"] >= 2:
        linhas.append("Episódio novo todo dia.")
    linhas += ["", f"Vire personagem e procure seu nome no mapa: {config.SITE_TELA}", "",
               "#operacaomartezero #pixelart #marte #colonia"]
    return "\n".join(linhas)


# ---------------------------------------------------------------- linha do tempo
def linha_do_tempo(roteiro: dict, falas: dict) -> dict:
    """Junta roteiro + voz: cada cena ganha início/fim absolutos e as marcas viram tempos."""
    t = 0.0
    cenas = []
    for c in roteiro["cenas"]:
        v = falas[c["id"]]
        dur = max(config.CENA_MINIMA, config.PAUSA_ANTES + v["duracao"] + config.PAUSA_DEPOIS) + float(c.get("extra") or 0)
        fala_ini = t + config.PAUSA_ANTES
        focos = [{"t": round(fala_ini + tempo_do_caractere(v, m["pos"]), 3), "alvo": m["foco"]} for m in c["marcas"]]
        palavras = [{"p": w["p"], "i": round(fala_ini + w["i"], 3), "f": round(fala_ini + w["f"], 3)} for w in v["palavras"]]
        cenas.append({**{k: x for k, x in c.items() if k != "marcas"},
                      "inicio": round(t, 3), "fim": round(t + dur, 3),
                      "fala_inicio": round(fala_ini, 3), "audio": v.get("audio"),
                      "palavras": palavras, "focos": focos})
        t += dur
    cenas[-1]["fim"] = round(t + config.FINAL_EXTRA, 3)
    return {**{k: x for k, x in roteiro.items() if k != "cenas"},
            "duracao": cenas[-1]["fim"], "fps": config.FPS, "cenas": cenas}


def tempo_do_caractere(v: dict, pos: int) -> float:
    inicios = v.get("inicio_caracteres") or []
    if pos < len(inicios):
        return inicios[pos]
    return v["duracao"] * pos / max(1, v.get("total_caracteres", pos + 1))


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--episodio", type=int, required=True)
    a = ap.parse_args()
    pasta = config.pasta_episodio(a.episodio)
    dados = config.ler_json(pasta / "dados.json")
    r = montar(dados)
    config.gravar_json(pasta / "roteiro.json", r)
    (pasta / "post.txt").write_text(legenda_post(dados, r), encoding="utf-8")
    for c in r["cenas"]:
        print(f"[{c['id']}] {c['fala']}")
