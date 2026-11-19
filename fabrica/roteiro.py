"""Roteiro: monta as falas do episódio por templates (sem IA).

Ordem das cenas:
  abertura → população → boas-vindas (se houver novos) → compras pagas (se houver)
  → Missão do Dia (5 cenas) → gancho final.

Cada fala pode ter "marcas": pontos do texto em que a câmera muda de foco
(ex.: no instante em que o narrador diz o nome de um colono). O tempo exato de
cada marca vem dos timestamps da voz (voz.py).

Também gera a linha do tempo (início/fim de cada cena) a partir das durações da voz.
"""
from __future__ import annotations

import random
import re

import config

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


def cena(id_: str, tipo: str, fala: Fala, **extra) -> dict:
    return {"id": id_, "tipo": tipo, "fala": fala.texto.strip(), "marcas": fala.marcas, **extra}


# ---------------------------------------------------------------- templates
ABERTURAS = [
    "Operação Marte Zero, episódio {n}. Mais um dia no planeta vermelho.",
    "Diário da Operação Marte Zero, episódio {n}. O sol nasce de novo sobre a poeira vermelha.",
    "Episódio {n} da Operação Marte Zero. A tempestade passou, e a colônia acordou cedo.",
    "Operação Marte Zero, episódio {n}. Bom dia, colonos.",
]
BOAS_VINDAS_1 = ["Boas-vindas a {nome}! Tem casa nova na colônia.",
                 "Chegou gente nova: {nome}! A casa já está de pé."]
BOAS_VINDAS_N = ["Bem-vindos, ", "Chegaram à colônia: "]
GANCHOS = [
    "Será que a sua casa já está no mapa? Procure seu nome em {site}. No próximo episódio: {proxima}.",
    "Quer fazer parte da Operação Marte Zero? Entre em {site} e procure seu nome no mapa. No próximo episódio: {proxima}.",
]


def montar(d: dict) -> dict:
    n = d["numero"]
    rnd = random.Random(n)  # mesma escolha de template sempre que o mesmo episódio for gerado
    fund = d["fundadores"]
    cenas: list[dict] = []

    # 1. abertura
    if n == 1:
        f = Fala().add("Operação Marte Zero, episódio um. Depois de sete meses no espaço, "
                       "a primeira nave acaba de pousar no planeta vermelho.")
    else:
        f = Fala().add(rnd.choice(ABERTURAS).format(n=extenso(n)))
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

    # 3. boas-vindas (chamando pelo nome; câmera vai em cada um quando o nome é dito)
    if d["novos"]:
        mostrados = d["novos"][:6]
        resto = d["novos_total"] - len(mostrados)
        f = Fala()
        if len(mostrados) == 1 and resto == 0:
            molde = rnd.choice(BOAS_VINDAS_1)
            antes_nome, depois_nome = molde.split("{nome}")
            f.add(antes_nome).add(mostrados[0]["falado"], f"colono:{mostrados[0]['codigo']}").add(depois_nome)
        else:
            f.add(rnd.choice(BOAS_VINDAS_N))
            f.lista([(c["falado"], f"colono:{c['codigo']}") for c in mostrados])
            if resto > 0:
                f.add(f", e mais {plural(resto, 'colono', 'colonos')}")
            f.add("! Procurem suas casas no mapa.")
        cenas.append(cena("boas_vindas", "boas_vindas", f, camera={"alvo": "colonia", "zoom": 5},
                          colonos=[c["codigo"] for c in mostrados]))

    # 4. compras pagas (o item aparece na casa de quem comprou)
    if d["compras"]:
        mostradas = d["compras"][:4]
        f = Fala().add("Novidades na vizinhança! ")
        for c in mostradas:
            f.add("Na casa de ").add(c["falado"], f"compra:{c['codigo']}:{c['produto_slug']}")
            f.add(f": {produto_curto(c['produto'])}. ")
        extra = d["compras_total"] - len(mostradas)
        if extra > 0:
            f.add(f"E mais {plural(extra, 'item chegou', 'itens chegaram')} na colônia. ")
        f.add("Obrigado por apoiar a Operação Marte Zero!")
        cenas.append(cena("compras", "compras", f, camera={"alvo": "colonia", "zoom": 5}))

    # 5. Missão do Dia (5 cenas, da primeira obra não concluída)
    obra = next((o for o in d["obras"] if o["status"] != "concluida"), None)
    catalogo = {o["slug"]: o for o in config.colonia()["obras"]}
    if obra is None:
        raise SystemExit("Todas as obras de colonia.json estão concluídas: cadastre a próxima obra lá.")
    missao = catalogo[obra["slug"]]["missao"]
    if len(missao["cenas"]) != 5:
        raise SystemExit(f"A missão de {obra['slug']} precisa ter 5 cenas (tem {len(missao['cenas'])}).")
    for i, mc in enumerate(missao["cenas"], 1):
        cenas.append(cena(f"missao_{i}", "missao", Fala().add(mc["fala"]),
                          passo=i, acao=mc["acao"], camera=mc["camera"],
                          progresso=mc.get("progresso", [0, 0]), atores=mc.get("atores", {})))

    # 6. gancho final
    if n == 1:
        f = Fala().add(f"Quer ser um dos primeiros colonos da Operação Marte Zero? Entre em {config.SITE_FALADO}, "
                       f"faça seu cadastro e procure seu nome no mapa. No próximo episódio: {missao['proxima']}.")
    else:
        f = Fala().add(rnd.choice(GANCHOS).format(site=config.SITE_FALADO, proxima=missao["proxima"]))
    cenas.append(cena("gancho", "gancho", f, camera={"alvo": "panorama", "zoom": 2.2}))

    titulo = f"Episódio {n} · {obra['nome']}"
    return {
        "numero": n,
        "titulo": titulo,
        "missao_obra": obra["slug"],
        "missao_titulo": missao["titulo"],
        "proxima": missao["proxima"],
        "cenas": cenas,
    }


def legenda_post(d: dict, r: dict) -> str:
    """Texto pronto para a descrição do post (sem IA, só template)."""
    linhas = [f"🚀 OPERAÇÃO MARTE ZERO · {r['titulo']}", "",
              f"Missão do Dia: {r['missao_titulo']}.",
              f"População: {d['populacao']} colonos."]
    if d["novos"]:
        linhas.append("Boas-vindas: " + ", ".join(c["nome"] for c in d["novos"]) +
                      (f" e mais {d['novos_total'] - len(d['novos'])}" if d["novos_total"] > len(d["novos"]) else ""))
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
        dur = max(config.CENA_MINIMA, config.PAUSA_ANTES + v["duracao"] + config.PAUSA_DEPOIS)
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
