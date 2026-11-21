"""Onde mora cada colono: a MESMA conta de lib/mundo.ts (casaDoId) e da função casa_pos() do banco
(supabase/migrations/009_bairro_perto.sql). Bairro em espiral colado no Módulo de Pouso, pulando os lotes
que caem nas construções (colonia.json) ou a até MARGEM casas delas.

    python bairro.py 20      # mostra as 20 primeiras casas e um mapinha
"""
from __future__ import annotations

import math
import sys
from functools import lru_cache

import config

CENTRO = (5, -8)
ANEL_INICIAL = 2
MARGEM = 2
ANEL_RESERVAS = 12


def _expandir(u: int) -> int:
    return u + u // 3          # // arredonda para baixo, igual a Math.floor


def _lote(m: int) -> tuple[int, int, int]:
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


def _casa_do_lote(m: int) -> tuple[int, int]:
    u, v, _ = _lote(m)
    return CENTRO[0] + _expandir(u), CENTRO[1] + _expandir(v)


@lru_cache(maxsize=1)
def reservas() -> list[tuple[int, int, int, int]]:
    col = config.colonia()
    b, p = col["base"], col["praca"]
    rs = [(o["x"] - MARGEM, o["y"] - MARGEM, o["x"] + o["w"] + MARGEM, o["y"] + o["h"] + MARGEM)
          for o in [b, p, *col["obras"]]]
    rs.append((CENTRO[0], b["y"] + b["h"], CENTRO[0] + 1, p["y"]))   # trilha do módulo até a praça
    return rs


def reservado(x: int, y: int) -> bool:
    return any(x0 <= x < x1 and y0 <= y < y1 for x0, y0, x1, y1 in reservas())


@lru_cache(maxsize=1)
def _livres() -> list[int]:
    m0, mfim = (2 * ANEL_INICIAL - 1) ** 2, (2 * ANEL_RESERVAS + 1) ** 2
    return [m for m in range(m0, mfim) if not reservado(*_casa_do_lote(m))]


def casa_do_id(id_: int) -> tuple[int, int]:
    id_ = max(1, int(id_))
    livres, mfim = _livres(), (2 * ANEL_RESERVAS + 1) ** 2
    return _casa_do_lote(livres[id_ - 1] if id_ <= len(livres) else mfim + (id_ - len(livres)) - 1)


def casa_do_codigo(codigo: str) -> tuple[int, int]:
    return casa_do_id(int("".join(ch for ch in codigo if ch.isdigit()) or 1))


if __name__ == "__main__":
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 20
    casas = [casa_do_id(i) for i in range(1, n + 1)]
    for i, c in enumerate(casas[:n], 1):
        print(f"colono {i:>4} → {c}")
