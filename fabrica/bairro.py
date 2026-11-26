"""Onde mora cada colono: a MESMA conta de lib/mundo.ts (casaDoId) e da função casa_pos() do banco
(supabase/migrations/018_aneis.sql). VILAREJO EM ANÉIS (pedido do dono em 2026-11-26):

  * ruas em ANEL (quadradas) em volta do Módulo de Pouso, a R0, R0+PASSO, R0+2*PASSO... casas do centro
    (o miolo, até ~12 casas, é das construções);
  * duas AVENIDAS retas cruzando a colônia: norte-sul na coluna do módulo (dx = 0) e leste-oeste logo abaixo
    dele (dy = +2), indo até o último anel;
  * as casas ficam dos DOIS lados de cada anel, de frente para a rua, uma a cada 2 casas (1 de quintal entre
    vizinhas); sem casa nos cantos nem coladas nas avenidas;
  * ordem de chegada: anel por anel; dentro do anel, a partir da avenida sul, girando para o leste, o lado de
    dentro e o de fora de cada ponto da rua (a rua vai sendo ocupada dos dois lados);
  * casa em cima (ou a até MARGEM casas) de uma construção, da Vila das Cápsulas ou de um lote de cratera é pulada.

CRATERAS BATIZADAS: ficam perto, na faixa logo depois de cada anel (6 por faixa, em ângulos diferentes), como
lugares já explorados; o vilarejo cresce desviando delas (o lote da cratera é reservado).

    python bairro.py 40      # mostra as 40 primeiras casas e um mapinha
"""
from __future__ import annotations

import math
import sys
from functools import lru_cache

import config

CENTRO = (5, -8)
R0 = 14            # distância (em casas, do centro) da rua do primeiro anel
PASSO = 5          # de um anel ao outro: rua, casa, quintal, quintal, casa
AV_Y = 2           # avenida leste-oeste: dy = +2 (logo abaixo do módulo); a norte-sul é dx = 0
MARGEM = 2
CRATERAS_POR_FAIXA = 6
CRATERAS_RESERVADAS = 48   # lotes de cratera guardados (além disso a cratera não reserva lote)


def rua_do_anel(k: int) -> int:
    return R0 + PASSO * k


def _arred(v: float) -> int:
    return math.floor(v + 0.5)   # igual em TS (Math.floor(v + 0.5)) e SQL (floor(v + 0.5))


# ---------- crateras batizadas (item "Nomeie sua Cratera") ----------
def pos_cratera(id_: int) -> dict:
    """Centro (em casas) e raio (em pixels do mundo, CASA = 16) da cratera do resgate `id_`."""
    i = max(1, int(id_))
    faixa = (i - 1) // CRATERAS_POR_FAIXA
    d = R0 + 2 + PASSO * faixa                       # meio da faixa entre o anel `faixa` e o seguinte
    ang = 0.9 + (i - 1) * 2.399963                    # ângulo áureo: não empilha
    co, si = math.cos(ang), math.sin(ang)
    m = max(abs(co), abs(si))
    dx, dy = _arred(d * co / m), _arred(d * si / m)
    if abs(dx) <= 3:                                  # longe das avenidas
        dx = 4 if dx >= 0 else -4
    if abs(dy - AV_Y) <= 3:
        dy = AV_Y + (4 if dy >= AV_Y else -4)
    return {"x": CENTRO[0] + dx, "y": CENTRO[1] + dy, "r": 20 + (i * 5) % 6}


@lru_cache(maxsize=1)
def reservas() -> list[tuple[int, int, int, int]]:
    col = config.colonia()
    b, p = col["base"], col["praca"]
    rs = [(o["x"] - MARGEM, o["y"] - MARGEM, o["x"] + o["w"] + MARGEM, o["y"] + o["h"] + MARGEM)
          for o in [b, p, *col["obras"]]]
    rs.append((CENTRO[0] + 25, CENTRO[1] - 9, CENTRO[0] + 43, CENTRO[1] + 23))   # Vila das Cápsulas (até 50 cápsulas)
    for i in range(1, CRATERAS_RESERVADAS + 1):
        c = pos_cratera(i)
        rs.append((c["x"] - 2, c["y"] - 2, c["x"] + 3, c["y"] + 3))
    return rs


def reservado(x: int, y: int) -> bool:
    return any(x0 <= x < x1 and y0 <= y < y1 for x0, y0, x1, y1 in reservas())


def vagas_do_anel(k: int) -> list[tuple[int, int]]:
    """Todas as casas possíveis do anel k (antes das reservas), na ordem de chegada."""
    d = rua_do_anel(k)
    seq = ([(dx, d, 0, 1) for dx in range(0, d + 1)] + [(d, dy, 1, 0) for dy in range(d, -d - 1, -1)]
           + [(dx, -d, 0, -1) for dx in range(d, -d - 1, -1)] + [(-d, dy, -1, 0) for dy in range(-d, d + 1)]
           + [(dx, d, 0, 1) for dx in range(-d, 0)])
    out = []
    for dx, dy, nx, ny in seq:
        ao_longo = dx if ny else dy
        if ao_longo % 2 or abs(ao_longo) > d - 3:
            continue
        if (ny and abs(dx) <= 1) or (nx and abs(dy - AV_Y) <= 1):
            continue
        for s in (-1, 1):   # lado de dentro, lado de fora
            out.append((CENTRO[0] + dx + s * nx, CENTRO[1] + dy + s * ny))
    return out


_LOTES: list[tuple[int, int]] = []
_ANEL_DO_LOTE: list[int] = []
_ANEIS_FEITOS = [0]


def _garantir(n: int) -> None:
    while len(_LOTES) < n:
        k = _ANEIS_FEITOS[0]
        for c in vagas_do_anel(k):
            if not reservado(*c):
                _LOTES.append(c)
                _ANEL_DO_LOTE.append(k)
        _ANEIS_FEITOS[0] += 1


def casa_do_id(id_: int) -> tuple[int, int]:
    id_ = max(1, int(id_))
    _garantir(id_)
    return _LOTES[id_ - 1]


def anel_do_id(id_: int) -> int:
    id_ = max(1, int(id_))
    _garantir(id_)
    return _ANEL_DO_LOTE[id_ - 1]


def casa_do_codigo(codigo: str) -> tuple[int, int]:
    return casa_do_id(int("".join(ch for ch in codigo if ch.isdigit()) or 1))


def mapinha(n: int, crateras: int = 6) -> str:
    casas = {casa_do_id(i): i for i in range(1, n + 1)}
    kmax = anel_do_id(n) + 1
    r = rua_do_anel(kmax) + 2
    col = config.colonia()
    linhas = []
    for y in range(CENTRO[1] - r, CENTRO[1] + r + 1):
        s = ""
        for x in range(CENTRO[0] - r, CENTRO[0] + r + 1):
            dx, dy = x - CENTRO[0], y - CENTRO[1]
            ch = " ."[(x + y) % 2 == 0 and False]
            ch = " "
            if any(o["x"] <= x < o["x"] + o["w"] and o["y"] <= y < o["y"] + o["h"] for o in [col["base"], col["praca"], *col["obras"]]):
                ch = "#"
            elif (x, y) in casas:
                ch = "h"
            elif any(max(abs(dx), abs(dy)) == rua_do_anel(k) for k in range(kmax)) or (dx == 0 and abs(dy) > 2) or dy == AV_Y:
                ch = "·"
            for i in range(1, crateras + 1):
                c = pos_cratera(i)
                if (x, y) == (c["x"], c["y"]):
                    ch = "O"
            s += ch
        linhas.append(s)
    return "\n".join(linhas)


if __name__ == "__main__":
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 20
    for i in range(1, min(n, 12) + 1):
        print(f"colono {i:>4} → {casa_do_id(i)}")
    print(mapinha(n))
