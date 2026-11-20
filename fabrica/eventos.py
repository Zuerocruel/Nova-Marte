"""Clima de Marte e Problema do Dia (sem IA, só templates de fabrica/marte.json).

- Estação: cada episódio é um dia na colônia. O episódio 1 foi o pouso, no começo da primavera;
  as estações seguem a ordem da Terra, comprimidas e muito mais extremas.
- Problema do Dia: um imprevisto (água, oxigênio, manutenção, ataque selvagem, clima) que surge
  e é resolvido no mesmo episódio, EM PARALELO à obra. Não mexe no tempo das construções.

Para não repetir: o mesmo problema não volta antes de 8 episódios, a mesma categoria nunca
aparece dois dias seguidos (o histórico vem dos roteiro.json dos episódios anteriores), e
problemas de uma obra ("requer") só aparecem depois que ela fica pronta.

    python eventos.py --de 2 --ate 40      # mostra estação, temperatura e problema de cada episódio
"""
from __future__ import annotations

import json
import random
from functools import lru_cache

import config

SEM_REPETIR = 8          # episódios até o mesmo problema poder voltar


@lru_cache(maxsize=1)
def marte() -> dict:
    return json.loads((config.FABRICA / "marte.json").read_text(encoding="utf-8"))


# ---------------------------------------------------------------- estação
def estacao(n: int) -> tuple[dict, int]:
    """(estação, dia dentro da estação) do episódio n. Episódio 1 = dia 'inicio.dia' da estação 'inicio'."""
    m = marte()
    ests = m["estacoes"]
    i = next(k for k, e in enumerate(ests) if e["id"] == m["inicio"]["estacao"])
    dia = m["inicio"]["dia"] + (n - 1)
    while dia > ests[i]["episodios"]:
        dia -= ests[i]["episodios"]
        i = (i + 1) % len(ests)
    return ests[i], dia


TENDENCIA = {             # onde a estação começa e termina dentro da sua faixa (0 = mais frio, 1 = mais quente)
    "primavera": (0.0, 1.0),  # esquenta
    "verao": (0.8, 0.9),      # quente o tempo todo (para Marte)
    "outono": (1.0, 0.0),     # esfria
    "inverno": (0.2, 0.0),    # frio o tempo todo
}


def temperatura(n: int, est: dict) -> int:
    """Temperatura do dia (°C): segue a tendência da estação, com uns 10 graus de variação de um dia para o outro."""
    lo, hi = est["temp"]
    _, dia = estacao(n)
    a, b = TENDENCIA.get(est["id"], (0.5, 0.5))
    k = a + (b - a) * (dia - 1) / max(1, est["episodios"] - 1)
    ruido = random.Random(f"temp:{n}").uniform(-0.12, 0.12)
    c = lo + (hi - lo) * min(1.0, max(0.0, k + ruido))
    return int(round(c / 5) * 5)


def temp_falada(c: int, extenso) -> str:
    return ("menos " if c < 0 else "") + extenso(abs(c)) + " graus"


# ---------------------------------------------------------------- problema do dia
def historico(n: int) -> list[dict]:
    """Problemas dos episódios anteriores (do mais recente ao mais antigo), lidos dos roteiro.json."""
    saida = []
    for k in range(n - 1, max(0, n - 1 - SEM_REPETIR), -1):
        arq = config.SAIDA / f"ep{k:03d}" / "roteiro.json"
        if arq.exists():
            p = json.loads(arq.read_text(encoding="utf-8")).get("problema")
            if p:
                saida.append(p)
    return saida


def candidatos(est: dict, concluidas: set[str], hist: list[dict]) -> list[tuple[dict, float]]:
    recentes = {h["id"] for h in hist}
    ontem = hist[0]["categoria"] if hist else None
    m = marte()
    protege = m.get("obras_da_categoria", {})
    saida = []
    for p in m["problemas"]:
        peso = float(p.get("peso", {}).get(est["id"], 1))
        # obra da categoria pronta → esse tipo de problema fica mais raro (ex.: Extrator de Gelo → menos falta de água)
        if p["categoria"] not in m.get("nao_protege", []) and protege.get(p["categoria"]) in concluidas:
            peso *= float(m.get("fator_protecao", 0.4))
        if peso <= 0 or p["id"] in recentes or p["categoria"] == ontem:
            continue
        if p.get("requer") and p["requer"] not in concluidas:
            continue
        saida.append((p, peso))
    return saida


def escolher(n: int, d: dict, hist: list[dict] | None = None) -> dict | None:
    """Problema do episódio n (None no episódio 1). Mesmo episódio → mesmo sorteio."""
    if n < 2:
        return None
    est, _ = estacao(n)
    concluidas = {o["slug"] for o in d.get("obras", []) if o.get("status") == "concluida"}
    hist = historico(n) if hist is None else hist
    opcoes = candidatos(est, concluidas, hist) or candidatos(est, concluidas, hist[:1]) \
        or candidatos(est, concluidas, [])
    rnd = random.Random(f"problema:{n}")
    p = rnd.choices([o for o, _ in opcoes], weights=[w for _, w in opcoes])[0]

    # quem resolve: um colono de verdade quando houver (a câmera vai até a casa dele); senão um fundador.
    # Quem tem o cargo certo para o problema é chamado primeiro (ex.: falta de água → Geologia, Rover, Estufa)
    colonos = [c for c in d.get("mundo", []) if c.get("falado")]
    cargos = config.cargos()
    do_cargo = [c for c in colonos if p["categoria"] in cargos.get(c.get("cargo") or "", {}).get("categorias", [])]
    if colonos and rnd.random() < 0.75:
        c = rnd.choice(do_cargo) if do_cargo and rnd.random() < 0.7 else rnd.choice(colonos)
        cg = cargos.get(c.get("cargo") or "")
        # a narração só apresenta o cargo quando ele tem a ver com o problema ("Ana, da equipe de Geologia, ...")
        falado = f"{c['falado']}, {cg['equipe']}," if c in do_cargo else c["falado"]
        heroi = {"falado": falado, "nome": c["nome"], "foco": f"colono:{c['codigo']}", "colono": c["codigo"],
                 **({"cargo": cg["id"]} if cg else {})}
    else:
        f = rnd.choice(d["fundadores"])
        heroi = {"falado": f.get("falado", f["nome"]), "nome": f["curto"], "foco": f"fundador:{f['id']}"}
    # lugar do problema: a obra ligada a ele, se já estiver pronta (ex.: radiação → Abrigo; água → Extrator)
    alvo = p.get("alvo", "base")
    for obra, lugar in p.get("alvo_com", {}).items():
        if obra in concluidas:
            alvo = lugar
    obra_cat = marte().get("obras_da_categoria", {}).get(p["categoria"])
    if alvo in ("base", "colonia") and obra_cat in concluidas:
        alvo = f"obra:{obra_cat}"
    return {"id": p["id"], "categoria": p["categoria"], "titulo": p["titulo"],
            "rotulo": marte()["categorias"][p["categoria"]], "alvo": alvo,
            "alerta": rnd.choice(p["alerta"]), "solucao": rnd.choice(p["solucao"]), "heroi": heroi}


if __name__ == "__main__":
    import argparse
    from roteiro import extenso
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--de", type=int, default=2)
    ap.add_argument("--ate", type=int, default=30)
    a = ap.parse_args()
    col = config.colonia()
    obras = [{"slug": o["slug"], "status": "concluida"} for o in col["obras"]]
    d = {"fundadores": col["fundadores"], "obras": obras, "mundo": [
        {"falado": "Ana", "nome": "Ana S.", "codigo": "A1", "cargo": "geologia"},
        {"falado": "Rui", "nome": "Rui M.", "codigo": "R2", "cargo": "medicina"}]}
    hist: list[dict] = []
    for n in range(a.de, a.ate + 1):
        est, dia = estacao(n)
        p = escolher(n, d, hist[:SEM_REPETIR])
        hist.insert(0, p)
        print(f"ep{n:>3} {est['nome']:<9} dia {dia:>2} {temperatura(n, est):>5}°C  {p['rotulo']:<18} {p['titulo']:<34} {p['heroi']['falado']}")
