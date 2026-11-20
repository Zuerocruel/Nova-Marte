"""Configuração comum da Fábrica de Vídeos da Operação Marte Zero.

Tudo o que é caminho, constante de vídeo ou chave de ambiente mora aqui,
para os outros scripts não repetirem nada.
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

# Windows: o console padrão não é UTF-8; sem isso "ã" e "→" quebram o print.
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass

FABRICA = Path(__file__).resolve().parent
RAIZ = FABRICA.parent

# .env tem prioridade menor que .env.local (mesmo padrão do Next.js)
load_dotenv(RAIZ / ".env")
load_dotenv(RAIZ / ".env.local", override=True)

USER_AGENT = "OperacaoMarteZeroPainel/1.0"   # só ASCII em cabeçalho HTTP

# ---------- vídeo ----------
LARGURA, ALTURA = 1080, 1920
FPS = 30
CASA = 16  # tamanho de uma casa em "pixels do mundo" (igual a components/Mundo.tsx)

# respiro antes/depois de cada fala, em segundos
PAUSA_ANTES = 0.25
PAUSA_DEPOIS = 0.45
CENA_MINIMA = 2.6       # nenhuma cena fica mais curta que isso
FINAL_EXTRA = 1.6       # música e imagem continuam um pouco depois da última fala

# ---------- site ----------
SITE_TELA = "operacao-marte-zero.vercel.app"         # como aparece escrito no vídeo
SITE_FALADO = "operação marte zero ponto vercel ponto app"   # como o narrador fala

# ---------- pastas ----------
CACHE_VOZ = FABRICA / "cache_voz"
SAIDA = FABRICA / "saida"
FONTES = FABRICA / "fontes"
MUSICA = FABRICA / "musica"     # coloque um .mp3/.wav aqui para trocar a trilha gerada
COLONIA_JSON = FABRICA / "colonia.json"

# ---------- ElevenLabs ----------
ELEVEN_URL = "https://api.elevenlabs.io"
ELEVEN_MODELO = "eleven_multilingual_v2"
# Voz do narrador: "Mark" (biblioteca da ElevenLabs). ELEVENLABS_VOICE_ID no .env troca a voz.
# Vozes da biblioteca só funcionam pela API em plano pago (Starter ou acima).
ELEVEN_VOZ_ID = "cBo6vpxtMw5JEsfjIpAL"
ELEVEN_VOZ_NOME = "Mark"
ELEVEN_AJUSTES = {             # narrador grave, firme e claro
    "stability": 0.50,
    "similarity_boost": 0.80,
    "style": 0.15,
    "use_speaker_boost": True,
    "speed": 1.0,
}

# ---------- vozes dos POVs (vídeos em primeira pessoa) ----------
# Flash v2.5 custa metade dos créditos por caractere do multilingual_v2. Vozes padrão da
# ElevenLabs (funcionam em qualquer plano e não precisam de voices_read na chave).
# Cada colono ganha sempre a mesma voz; homem/mulher vem de fabrica/vozes_pov.json.
POV_MODELO = "eleven_flash_v2_5"
POV_AJUSTES = {"stability": 0.45, "similarity_boost": 0.75, "style": 0.0, "use_speaker_boost": True, "speed": 1.05}
POV_VOZES = {
    "m": [("Liam", "TX3LPaxmHKxFdv7VOQHJ"), ("Brian", "nPczCjzI2devNBz1zQrb"), ("Will", "bIHbv24MWmeRgasZH58o"),
          ("Eric", "cjVigY5qzO86Huf0OWal"), ("Chris", "iP95p4xoKVk53GoZ742B"), ("Daniel", "onwK4e9ZLuTAKqWW03F9"),
          ("Callum", "N2lVS1w4EtoT3dr4eOWO"), ("Roger", "CwhRBWXzGAHq8TxYjLs2")],
    "f": [("Laura", "FGY2WhTYpPnrIDTdsKH5"), ("Sarah", "EXAVITQu4vr4xnSDxMaL"), ("Jessica", "cgSgspJ2msm6clMCkdW9"),
          ("Alice", "Xb7hH8MSUJpSbSDYk0k2"), ("Matilda", "XrExE9yKIg1WjnnlVkGX"), ("Lily", "pFZP5JQG7iMjIs1ITVd8")],
}
VOZES_POV_JSON = FABRICA / "vozes_pov.json"


def env(nome: str, obrigatoria: bool = True) -> str:
    valor = (os.environ.get(nome) or "").strip().strip('"')
    if obrigatoria and not valor:
        raise SystemExit(f"Falta a variável {nome} no .env/.env.local da raiz do projeto.")
    return valor


def pasta_episodio(numero: int) -> Path:
    p = SAIDA / f"ep{numero:03d}"
    p.mkdir(parents=True, exist_ok=True)
    return p


def ler_json(caminho: Path):
    return json.loads(Path(caminho).read_text(encoding="utf-8"))


def gravar_json(caminho: Path, dados) -> None:
    Path(caminho).write_text(json.dumps(dados, ensure_ascii=False, indent=2), encoding="utf-8")


def colonia() -> dict:
    return ler_json(COLONIA_JSON)


def cargos() -> dict:
    """Cargos da colônia (fabrica/cargos.json), por id."""
    return {c["id"]: c for c in ler_json(FABRICA / "cargos.json")["cargos"]}
