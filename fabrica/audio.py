"""Montagem: música + narração + legendas + quadros → vídeo vertical 1080x1920.

1. musica.wav     trilha de fundo. Se houver um .mp3/.wav/.ogg em fabrica/musica/, usa
                  (em loop); senão gera um pad espacial com o próprio FFmpeg (custo zero).
2. narracao.wav   cada fala colocada no instante exato da sua cena.
3. mix.wav        música abaixa sozinha quando o narrador fala (sidechain) + volume
                  normalizado para redes sociais (-14 LUFS).
4. legendas.ass   legenda dourada, palavra a palavra. Os tempos de cada palavra são
                  presos à cena dela (início da cena + tempo da palavra na fala), então
                  um erro numa cena nunca empurra as outras.
5. episodio_NNN.mp4  quadros + mix + legendas queimadas.
"""
from __future__ import annotations

import re
import subprocess
from pathlib import Path

import config

SR = 44100


def ffmpeg(*args, cwd: Path | None = None) -> None:
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", *map(str, args)]
    r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        raise SystemExit(f"FFmpeg falhou:\n{' '.join(cmd)[:600]}\n{r.stderr[-1500:]}")


# ---------------------------------------------------------------- música
NOTAS = {  # Lá menor → Fá → Dó → Sol (8 s cada), clima de exploração
    "acordes": [(110.00, 130.81, 164.81), (87.31, 110.00, 130.81), (130.81, 164.81, 196.00), (98.00, 123.47, 146.83)],
}


def _escolha(idx: str, valores: list[str]) -> str:
    expr = valores[-1]
    for i in range(len(valores) - 2, -1, -1):
        expr = f"if(eq({idx},{i}),{valores[i]},{expr})"
    return expr


def expressao_musica() -> str:
    c = "floor(mod(t,32)/8)"
    ac = NOTAS["acordes"]
    raiz = _escolha(c, [f"{a[0]}" for a in ac])
    terca = _escolha(c, [f"{a[1]}" for a in ac])
    quinta = _escolha(c, [f"{a[2]}" for a in ac])
    env = "(min(1,mod(t,8)/1.6)*min(1,(8-mod(t,8))/1.6)*0.7+0.3)"
    pad = (f"0.10*sin(2*PI*2*({raiz})*t)+0.08*sin(2*PI*2*({terca})*t*1.003)+0.08*sin(2*PI*2*({quinta})*t*0.997)"
           f"+0.05*sin(2*PI*4*({raiz})*t*1.002)")
    baixo = f"0.16*sin(2*PI*({raiz})*t)"
    # arpejo leve (entra depois de 4 s)
    j = "floor(mod(t,1)/0.25)"
    nota = _escolha(j, [f"4*({raiz})", f"4*({terca})", f"4*({quinta})", f"4*({terca})"])
    arp = f"gte(t,4)*0.045*sin(2*PI*({nota})*t)*exp(-7*mod(t,0.25))"
    lento = "(1+0.25*sin(2*PI*0.11*t))"
    return f"({pad})*{env}*{lento}+{baixo}*{env}+{arp}"


def gerar_musica(destino: Path, duracao: float) -> str:
    arquivos = sorted(p for p in config.MUSICA.glob("*") if p.suffix.lower() in (".mp3", ".wav", ".ogg", ".m4a", ".flac"))
    fade = f"afade=t=in:d=1.5,afade=t=out:st={max(0, duracao - 2.5):.2f}:d=2.5"
    if arquivos:
        ffmpeg("-stream_loop", -1, "-i", arquivos[0], "-t", f"{duracao:.3f}",
               "-af", f"aformat=sample_rates={SR}:channel_layouts=stereo,{fade}", destino)
        return f"arquivo {arquivos[0].name}"
    expr = expressao_musica()
    ffmpeg("-f", "lavfi", "-i", f"aevalsrc='{expr}':s={SR}:d={duracao:.3f}",
           "-af", f"lowpass=f=2600,aecho=0.8:0.6:380|610:0.3|0.2,pan=stereo|c0=c0|c1=c0,"
                  f"aformat=sample_rates={SR}:channel_layouts=stereo,{fade}",
           destino)
    return "gerada (pad espacial)"


# ---------------------------------------------------------------- narração e mix
def gerar_narracao(destino: Path, lt: dict) -> bool:
    cenas = [c for c in lt["cenas"] if c.get("audio")]
    if not cenas:
        ffmpeg("-f", "lavfi", "-i", f"anullsrc=r={SR}:cl=stereo", "-t", f"{lt['duracao']:.3f}", destino)
        return False
    entradas, filtros = [], []
    for i, c in enumerate(cenas):
        entradas += ["-i", c["audio"]]
        ms = int(round(c["fala_inicio"] * 1000))
        filtros.append(f"[{i}:a]aformat=sample_rates={SR}:channel_layouts=stereo,adelay={ms}|{ms}[n{i}]")
    junta = "".join(f"[n{i}]" for i in range(len(cenas)))
    filtros.append(f"{junta}amix=inputs={len(cenas)}:normalize=0:duration=longest,apad,atrim=0:{lt['duracao']:.3f}[out]")
    ffmpeg(*entradas, "-filter_complex", ";".join(filtros), "-map", "[out]", destino)
    return True


def mixar(musica: Path, narracao: Path, destino: Path, tem_voz: bool) -> None:
    if tem_voz:
        grafo = ("[1:a]asplit=2[voz][chave];"
                 "[0:a]volume=0.55[m];"
                 "[m][chave]sidechaincompress=threshold=0.02:ratio=8:attack=20:release=400[mduck];"
                 "[voz]volume=1.0[v];"
                 "[mduck][v]amix=inputs=2:normalize=0:duration=first,"
                 "loudnorm=I=-14:TP=-1.5:LRA=11,aformat=sample_rates=48000[out]")
    else:
        grafo = "[0:a]volume=0.55,loudnorm=I=-18:TP=-1.5:LRA=11,aformat=sample_rates=48000[out]"
    ffmpeg("-i", musica, "-i", narracao, "-filter_complex", grafo, "-map", "[out]", destino)


# ---------------------------------------------------------------- legendas
OURO = "&H003DC8FF"      # #FFC83D em BGR
BRANCO = "&H00FFFFFF"
CONTORNO = "&H00260F14"  # #140F26
MAX_LINHA = 18           # Press Start 2P é monoespaçada: ~18 letras cabem em 1080 px a 46 px
MAX_BLOCO = 32


def _ass_tempo(s: float) -> str:
    s = max(0.0, s)
    h, s = divmod(s, 3600)
    m, s = divmod(s, 60)
    return f"{int(h)}:{int(m):02d}:{s:05.2f}"


def _limpa(p: str) -> str:
    return re.sub(r"[{}\\]", "", p)


def _blocos(palavras: list[dict]) -> list[list[dict]]:
    blocos, atual, tam = [], [], 0
    for w in palavras:
        extra = len(w["p"]) + (1 if atual else 0)
        if atual and (tam + extra > MAX_BLOCO):
            blocos.append(atual)
            atual, tam = [], 0
            extra = len(w["p"])
        atual.append(w)
        tam += extra
        if w["p"][-1] in ".!?:" and tam >= 8:
            blocos.append(atual)
            atual, tam = [], 0
    if atual:
        blocos.append(atual)
    return blocos


def _linhas(bloco: list[dict]) -> list[list[int]]:
    """Quebra o bloco em até 2 linhas equilibradas (índices das palavras)."""
    total = sum(len(w["p"]) for w in bloco) + len(bloco) - 1
    if total <= MAX_LINHA:
        return [list(range(len(bloco)))]
    melhor, corte = None, 1
    for k in range(1, len(bloco)):
        a = sum(len(w["p"]) for w in bloco[:k]) + k - 1
        b = total - a - 1
        nota = max(a, b)
        if melhor is None or nota < melhor:
            melhor, corte = nota, k
    return [list(range(corte)), list(range(corte, len(bloco)))]


def gerar_legendas(destino: Path, lt: dict) -> int:
    cab = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {config.LARGURA}
PlayResY: {config.ALTURA}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Legenda,Press Start 2P,46,{OURO},{OURO},{CONTORNO},&H99000000,0,0,0,0,100,100,0,0,1,7,4,2,60,60,520,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    eventos = []
    for c in lt["cenas"]:
        fim_cena = c["fim"] - 0.05
        blocos = _blocos(c["palavras"])
        for j, b in enumerate(blocos):
            fim_bloco = min(fim_cena, blocos[j + 1][0]["i"] if j + 1 < len(blocos) else b[-1]["f"] + 0.5)
            linhas = _linhas(b)
            for k, w in enumerate(b):
                ini = w["i"] if k else min(w["i"], b[0]["i"])
                fim = b[k + 1]["i"] if k + 1 < len(b) else fim_bloco
                if fim - ini < 0.01:
                    continue
                partes = []
                for li in linhas:
                    partes.append(" ".join(
                        (f"{{\\c{BRANCO}}}{_limpa(b[i]['p'])}{{\\c{OURO}}}" if i == k else _limpa(b[i]["p"])) for i in li))
                texto = r"\N".join(partes)
                eventos.append(f"Dialogue: 0,{_ass_tempo(ini)},{_ass_tempo(fim)},Legenda,,0,0,0,,{texto}")
    destino.write_text(cab + "\n".join(eventos) + "\n", encoding="utf-8")
    return len(eventos)


# ---------------------------------------------------------------- vídeo final
def montar(numero: int, manter_quadros: bool = False, sufixo: str = "") -> Path:
    return montar_pasta(config.pasta_episodio(numero), f"episodio_{numero:03d}{sufixo}.mp4", manter_quadros)


def montar_pasta(pasta: Path, nome_final: str, manter_quadros: bool = False) -> Path:
    """Monta o vídeo da pasta (episódio ou corte curto) e grava como pasta/nome_final."""
    lt = config.ler_json(pasta / "linha_do_tempo.json")
    quadros = pasta / "quadros"
    n = len(list(quadros.glob("*.jpg")))
    esperado = int(-(-lt["duracao"] * config.FPS // 1))
    if n < esperado:
        raise SystemExit(f"Faltam quadros: {n} de {esperado}. Rode a filmagem de novo.")

    print(f"  música: {gerar_musica(pasta / 'musica.wav', lt['duracao'])}")
    tem_voz = gerar_narracao(pasta / "narracao.wav", lt)
    mixar(pasta / "musica.wav", pasta / "narracao.wav", pasta / "mix.wav", tem_voz)
    print(f"  legendas: {gerar_legendas(pasta / 'legendas.ass', lt)} eventos")

    final = pasta / nome_final
    ffmpeg("-framerate", config.FPS, "-i", "quadros/%05d.jpg", "-i", "mix.wav",
           # o texto grande da narração já vem desenhado nos quadros (diretor.js → legendaGrande);
           # legendas.ass continua sendo gerada (serve de legenda/CC), mas não é mais queimada no vídeo
           "-vf", "format=yuv420p",
           "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-profile:v", "high", "-r", config.FPS,
           "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart",
           final.name, cwd=pasta)
    if not manter_quadros:
        for q in quadros.glob("*.jpg"):
            q.unlink()
        quadros.rmdir()
    return final


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--episodio", type=int, required=True)
    ap.add_argument("--manter-quadros", action="store_true")
    ap.add_argument("--so-legendas", action="store_true", help="só regera legendas.ass")
    a = ap.parse_args()
    pasta = config.pasta_episodio(a.episodio)
    if a.so_legendas:
        print(gerar_legendas(pasta / "legendas.ass", config.ler_json(pasta / "linha_do_tempo.json")), "eventos")
    else:
        print(montar(a.episodio, a.manter_quadros))
