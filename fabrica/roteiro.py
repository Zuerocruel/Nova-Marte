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


def fala_com_heroi(molde: str, heroi: dict, **campos) -> Fala:
    """Monta a fala trocando {heroi} pelo nome com foco (a câmera vai até ele quando o nome é dito)."""
    f = Fala()
    partes = molde.split("{heroi}")
    for i, parte in enumerate(partes):
        if i:
            f.add(heroi["falado"], heroi["foco"])
        f.add(parte.format(**campos))
    return f


CAMERA_PROBLEMA = {"base": {"alvo": "base", "zoom": 5.0}, "colonia": {"alvo": "colonia", "zoom": 3.2}}


def camera_do_problema(alvo: str) -> dict:
    return CAMERA_PROBLEMA.get(alvo) or {"alvo": alvo, "zoom": 5.0}   # "obra:<slug>"


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
# Episódio 1 tem gancho próprio. Do 2 em diante a série é diária: "amanhã tem episódio novo".
GANCHOS = [
    "Será que a sua casa já está no mapa? Procure seu nome em {site}. Amanhã tem episódio novo: {proxima}.",
    "Quer fazer parte da Operação Marte Zero? Entre em {site} e procure seu nome no mapa. Amanhã: {proxima}.",
    "Cada colono novo é mais uma mão na obra. Cadastre-se em {site} e procure seu nome no mapa. Amanhã: {proxima}.",
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
        return {"fala": mc["fala"], "acao": mc["acao"], "camera": mc["camera"],
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
                generica(mao, "construir", "colonia", 3.2, [a, a]),
                generica(gen(CONSTRUIR), "construir", "obra", 6, [a, meio]),
                original(3, [meio, 1]), original(4, [1, 1])]
    return [generica(gen(RETOMAR), "apresentar", "obra", 4.5, [a, a]),   # dia do meio
            generica(mao, "construir", "colonia", 3.2, [a, a]),
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

    # 4b. ALERTA do Problema do Dia (resolvido depois da missão, em paralelo à obra)
    if problema:
        f = Fala().add(f"{problema['rotulo'].capitalize()}! ").add(problema["alerta"].format(**campos))
        cenas.append(cena("problema", "problema", f, camera=camera_do_problema(problema["alvo"]),
                          problema={k: problema[k] for k in ("id", "categoria", "titulo", "rotulo")}))

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
                          passo=i, acao=mc["acao"], camera=mc["camera"],
                          progresso=mc["progresso"], atores=mc["atores"]))
    proxima = missao["proxima"] if concluida else f"a obra da {obra['nome']} continua"

    # 5b. problema RESOLVIDO (quem resolve é um colono de verdade, chamado pelo nome)
    if problema:
        f = fala_com_heroi("E o problema do dia? " + problema["solucao"], problema["heroi"], **campos)
        cenas.append(cena("solucao", "solucao", f, camera=camera_do_problema(problema["alvo"]),
                          problema={k: problema[k] for k in ("id", "categoria", "titulo", "rotulo")},
                          heroi=problema["heroi"]["nome"]))

    # 6. gancho final
    if n == 1:
        f = Fala().add(f"Quer ser um dos primeiros colonos da Operação Marte Zero? Entre em {config.SITE_FALADO}, "
                       f"faça seu cadastro e procure seu nome no mapa. No próximo episódio: {proxima}.")
    else:
        f = Fala().add(rnd.choice(GANCHOS).format(site=config.SITE_FALADO, proxima=proxima))
    cenas.append(cena("gancho", "gancho", f, camera={"alvo": "panorama", "zoom": 2.2}))

    titulo = f"Episódio {n} · {obra['nome']}"
    return {
        "numero": n,
        "titulo": titulo,
        "missao_obra": obra["slug"],
        # 1º dia: o título da missão; depois "… · dia 2", "… · dia 3" (os posts não repetem o título)
        "missao_titulo": missao["titulo"] if dia == 1 else f"{missao['titulo']} · dia {dia}",
        "proxima": proxima,
        "obra_progresso": [p0, p1],     # % de ontem → % ao fim deste episódio (gravado ao publicar)
        "obra_dia": dia,
        "obra_concluida": concluida,
        "estacao": {"id": est["id"], "nome": est["nome"], "falado": est["falado"], "dia": dia_est, "temp": temp, "efeito": est["efeito"]},
        "problema": ({k: problema[k] for k in ("id", "categoria", "titulo", "rotulo")}
                     | {"heroi": problema["heroi"]["nome"], "heroi_codigo": problema["heroi"].get("colono")})
                    if problema else None,
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
    if r.get("obra_progresso"):
        linhas.append(f"Obra: {r['titulo'].split(' · ', 1)[-1]} {r['obra_progresso'][1]}%.")
    if r.get("estacao") and r["numero"] >= 2:
        e = r["estacao"]
        linhas.append(f"{e['falado'].capitalize()}, dia {e['dia']}: {e['temp']}°C.")
    if r.get("problema"):
        linhas.append(f"Problema do dia: {r['problema']['titulo']}, resolvido por {r['problema']['heroi']}.")
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
