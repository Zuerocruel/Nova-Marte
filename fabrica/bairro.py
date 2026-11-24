"""Onde mora cada colono: a MESMA conta de lib/mundo.ts (casaDoId) e da função casa_pos() do banco
(supabase/migrations/016_vilarejo.sql). VILAREJO ESPALHADO: células de CEL x CEL casas numa espiral em volta do
Módulo de Pouso, uma casa por célula num ponto sorteado dentro dela, 1 em cada 5 células vira clareira, e
células cuja casa cai nas construções (colonia.json) ou a até MARGEM casas delas são puladas.

    python bairro.py 20      # mostra as 20 primeiras casas e um mapinha
"""
from __future__ import annotations

import math
import sys
from functools import lru_cache

import config

CENTRO = (5, -8)
CEL = 3
ANEL_INICIAL = 2
MARGEM = 2
ANEL_RESERVAS = 30


def _celula(m: int) -> tuple[int, int, int]:
    r = (math.isqrt(m) + 1) // 2
    t = m - (2 * r - 1) ** 2
    if t < r:
        u, v = t, r
    elif t < 3 * r:
        u, v = r, r - (t - r)
    elif t < 5 * r:
        u, v = r - (t - 3 * r), -r
    elif t < 7 * r:
        u, v = -r, -r + (t - 5 * r)
    else:
        u, v = -r + (t - 7 * r), r
    return u, v, r


def _sorteio(u: int, v: int) -> int:
    s = u * 7919 + v * 104729
    return abs(s * s + 31 * s + 13 * u * v) % 1009


def _casa_da_celula(u: int, v: int) -> tuple[int, int]:
    h = _sorteio(u, v)
    return CENTRO[0] + CEL * u - 1 + h % 2, CENTRO[1] + CEL * v - 1 + (h // 2) % 2   # 2x2 posições: sempre 1 casa livre entre vizinhos


def _clareira(u: int, v: int) -> bool:
    return (_sorteio(u, v) // 10) % 5 == 0


def _casa_do_indice(m: int) -> tuple[int, int]:
    u, v, _ = _celula(m)
    return _casa_da_celula(u, v)


@lru_cache(maxsize=1)
def reservas() -> list[tuple[int, int, int, int]]:
    col = config.colonia()
    b, p = col["base"], col["praca"]
    rs = [(o["x"] - MARGEM, o["y"] - MARGEM, o["x"] + o["w"] + MARGEM, o["y"] + o["h"] + MARGEM)
          for o in [b, p, *col["obras"]]]
    rs.append((CENTRO[0], b["y"] + b["h"], CENTRO[0] + 1, p["y"]))   # trilha do módulo até a praça
    rs.append((CENTRO[0] + 25, CENTRO[1] - 9, CENTRO[0] + 43, CENTRO[1] + 23))   # Vila das Cápsulas (até 50 cápsulas)
    return rs


def reservado(x: int, y: int) -> bool:
    return any(x0 <= x < x1 and y0 <= y < y1 for x0, y0, x1, y1 in reservas())


@lru_cache(maxsize=1)
def _livres() -> list[int]:
    m0, mfim = (2 * ANEL_INICIAL - 1) ** 2, (2 * ANEL_RESERVAS + 1) ** 2
    out = []
    for m in range(m0, mfim):
        u, v, _ = _celula(m)
        if not _clareira(u, v) and not reservado(*_casa_da_celula(u, v)):
            out.append(m)
    return out


def casa_do_id(id_: int) -> tuple[int, int]:
    id_ = max(1, int(id_))
    livres, mfim = _livres(), (2 * ANEL_RESERVAS + 1) ** 2
    return _casa_do_indice(livres[id_ - 1] if id_ <= len(livres) else mfim + (id_ - len(livres)) - 1)


def casa_do_codigo(codigo: str) -> tuple[int, int]:
    return casa_do_id(int("".join(ch for ch in codigo if ch.isdigit()) or 1))


# ---------- crateras batizadas (item "Nomeie sua Cratera") ----------
# Ficam num anel FORA da colônia (as obras vão até ~14 casas do módulo), cada uma num ângulo (ângulo áureo, sem
# empilhar). A mesma conta está em lib/crateras.ts. O vilarejo só chega nesse anel perto de ~850 colonos.
CRATERA_RAIO = 60   # longe do vilarejo (que só chega a 60 casas com ~850 colonos)


def pos_cratera(id_: int) -> dict:
    """Centro (em casas) e raio (em pixels do mundo, CASA = 16) da cratera do resgate `id_`."""
    id_ = max(1, int(id_))
    ang = 0.9 + (id_ - 1) * 2.399963
    dist = CRATERA_RAIO + (id_ * 3) % 4
    return {"x": CENTRO[0] + round(dist * math.cos(ang)), "y": CENTRO[1] + round(dist * math.sin(ang)),
            "r": 38 + (id_ * 5) % 8}


if __name__ == "__main__":
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 20
    casas = [casa_do_id(i) for i in range(1, n + 1)]
    for i, c in enumerate(casas[:n], 1):
        print(f"colono {i:>4} → {c}")
