"""Agenda o episódio aprovado como YouTube Short pelo fluxo do n8n.

    python producao/youtube.py --checar                 # confere FFmpeg e variáveis do .env
    python producao/youtube.py --episodio 1 --ensaio    # compacta e monta o envio, sem mandar nada
    python producao/youtube.py --episodio 1             # compacta, envia e agenda para daqui a 30 min
    python producao/youtube.py --episodio 2 --extra pov_colonia   # vídeo extra (POV) aprovado no painel

1. FFmpeg gera saida/epNNN/episodio_yt.mp4 abaixo de 15 MB (limite do webhook do n8n),
   em 2 passadas e sem reduzir a resolução, para a pixel art não borrar.
2. POST multipart para N8N_WEBHOOK_PUBLICAR com o cabeçalho X-Painel-Chave: N8N_PAINEL_CHAVE.
   Campos: veja CONTRATO abaixo e docs/PUBLICACAO.md.
3. Agenda para +30 min (o fluxo recusa menos de 20 min).

Travas: só roda com episódio e copy do YouTube aprovados; status enviando/agendado/conferir
nunca é reenviado sozinho. Resposta incerta (tempo esgotado, erro 5xx) → "⚠ conferir".
"""
from __future__ import annotations

import argparse
import hashlib
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

PRODUCAO = Path(__file__).resolve().parent
sys.path.insert(0, str(PRODUCAO.parent / "fabrica"))
sys.path.insert(0, str(PRODUCAO))

import config  # noqa: E402
import publicacao as pub  # noqa: E402

LIMITE_BYTES = 15 * 1000 * 1000        # "abaixo de 15 MB" (usa a conta menor: 15 milhões de bytes)
ALVO_BYTES = int(LIMITE_BYTES * 0.92)   # folga para o cabeçalho do MP4 e a variação do encoder
AUDIO_KBPS = 128
SHORTS_MAX_S = 178.0    # Shorts aceita até 3 min (180 s): folga de 2 s
SHORTS_FATOR_MAX = 1.10  # acelera no máximo 10% (voz ainda natural); passou disso, o episódio precisa ser encurtado
MINUTOS_AGENDAMENTO = 30
MINUTOS_MINIMO = 20
FUSO_BR = timezone(timedelta(hours=-3))   # America/Sao_Paulo (sem horário de verão desde 2019)

CONTRATO = """campos do POST (multipart/form-data):
  video             arquivo episodio_yt.mp4 (video/mp4, < 15 MB)
  titulo            até 100 caracteres
  descricao         até 5000 caracteres (sem link, a não ser com YOUTUBE_LINK_NA_DESCRICAO=1; menos de 15 hashtags)
  tags              separadas por vírgula (até 500 caracteres no total)
  publicar_em       ISO 8601 com fuso de Brasília, ex.: 2026-11-19T19:30:00-03:00
  publicar_em_utc   o mesmo horário em UTC, ex.: 2026-11-19T22:30:00Z
  episodio          número do episódio
  chave             identificador único deste envio (o n8n pode usar para recusar duplicado)
cabeçalho:
  X-Painel-Chave    valor de N8N_PAINEL_CHAVE"""


# ------------------------------------------------------------------ FFmpeg
def ffmpeg() -> str | None:
    return shutil.which("ffmpeg")


def duracao(video: Path) -> float:
    r = subprocess.run([shutil.which("ffprobe") or "ffprobe", "-v", "error", "-show_entries", "format=duration",
                        "-of", "csv=p=0", str(video)], capture_output=True, text=True, timeout=60)
    return float(r.stdout.strip())


def compactar(origem: Path, log=print) -> Path:
    destino = origem.with_name("episodio_yt.mp4" if origem.stem.startswith("episodio") else f"{origem.stem}_yt.mp4")
    seg_origem = duracao(origem)
    fator = fator_shorts(seg_origem)
    if (destino.exists() and destino.stat().st_mtime >= origem.stat().st_mtime and destino.stat().st_size < LIMITE_BYTES
            and duracao(destino) <= SHORTS_MAX_S + 0.5):
        log(f"  cópia compactada já existe e está em dia: {destino.name} ({destino.stat().st_size / 1e6:.1f} MB)")
        return destino
    if fator > 1:
        log(f"  {seg_origem:.0f} s passa de 3 min (limite do Shorts): acelero {(fator - 1) * 100:.1f}% → {seg_origem / fator:.0f} s")
    if fator == 1 and origem.stat().st_size < ALVO_BYTES:
        log(f"  o original já tem {origem.stat().st_size / 1e6:.1f} MB: só copio com faststart")
        subprocess.run([ffmpeg(), "-y", "-v", "error", "-i", str(origem), "-c", "copy", "-movflags", "+faststart",
                        str(destino)], check=True, timeout=300)
        return destino

    seg = seg_origem / fator
    total_kbps = ALVO_BYTES * 8 / 1000 / seg
    video_kbps = int(total_kbps - AUDIO_KBPS)
    with tempfile.TemporaryDirectory() as tmp:
        passlog = str(Path(tmp) / "passe")
        for tentativa in range(4):
            # pixel art: mantém 1080x1920; só reduz (sem borrar: neighbor) se o bitrate ficar baixo demais
            filtros = ([f"setpts=PTS/{fator:.5f}"] if fator > 1 else []) + ([] if video_kbps >= 900 else ["scale=720:1280:flags=neighbor"])
            escala = (["-vf", ",".join(filtros)] if filtros else []) + (["-af", f"atempo={fator:.5f}"] if fator > 1 else [])
            log(f"  FFmpeg 2 passadas: vídeo {video_kbps} kbps + áudio {AUDIO_KBPS} kbps ({seg:.0f} s)"
                + (" · 720x1280" if video_kbps < 900 else ""))
            base = [ffmpeg(), "-y", "-v", "error", "-i", str(origem), *escala, "-c:v", "libx264", "-preset", "slow",
                    "-tune", "animation", "-pix_fmt", "yuv420p", "-b:v", f"{video_kbps}k",
                    "-maxrate", f"{int(video_kbps * 1.4)}k", "-bufsize", f"{video_kbps * 2}k", "-passlogfile", passlog]
            subprocess.run([*base, "-pass", "1", "-an", "-f", "mp4", os.devnull], check=True, timeout=1800, cwd=tmp)
            subprocess.run([*base, "-pass", "2", "-c:a", "aac", "-b:a", f"{AUDIO_KBPS}k", "-movflags", "+faststart",
                            str(destino)], check=True, timeout=1800, cwd=tmp)
            tam = destino.stat().st_size
            log(f"  resultado: {tam / 1e6:.2f} MB")
            if tam < LIMITE_BYTES:
                return destino
            video_kbps = int(video_kbps * 0.85)
    destino.unlink(missing_ok=True)
    raise RuntimeError("não consegui deixar o vídeo abaixo de 15 MB")


def fator_shorts(seg: float) -> float:
    """Quanto acelerar para caber no Shorts (1 = nada). Os episódios são Shorts diários, nunca vídeo normal."""
    if seg <= SHORTS_MAX_S:
        return 1.0
    fator = seg / SHORTS_MAX_S
    if fator > SHORTS_FATOR_MAX:
        raise RuntimeError(f"o vídeo tem {seg:.0f} s: nem acelerando {(SHORTS_FATOR_MAX - 1) * 100:.0f}% cabe nos 3 min do "
                           "Shorts. Encurte o episódio antes de mandar.")
    return fator


def ajustar_capitulos(descricao: str, fator: float) -> str:
    """Com o vídeo acelerado, os tempos dos capítulos (m:ss no começo da linha) encolhem junto."""
    if fator <= 1:
        return descricao
    def troca(m):
        t = int((int(m.group(1)) * 60 + int(m.group(2))) / fator)
        return f"{t // 60}:{t % 60:02d}"
    return re.sub(r"(?m)^(\d{1,2}):(\d{2})(?=\s)", troca, descricao)


# ------------------------------------------------------------------ texto
def limpar(texto: str) -> str:
    return re.sub(r"[<>]", "", texto or "").strip()


def limitar_hashtags(texto: str) -> str:
    vistos = 0

    def troca(m):
        nonlocal vistos
        vistos += 1
        return m.group(0) if vistos <= pub.MAX_HASHTAGS else ""
    return re.sub(r"[ \t]{2,}", " ", pub.RE_HASHTAG.sub(troca, texto))


def copy_extra(numero: int, item: str, legenda: str) -> dict:
    """Copy do YouTube para um vídeo extra (POV), a partir da legenda aprovada no painel. Se houver
    <item>.youtube.json ao lado do vídeo (título, descrição e tags pensados para busca), vale ele."""
    seo = pub.pasta_extra(numero, item) / f"{item}.youtube.json"
    if seo.exists():
        import json
        j = json.loads(seo.read_text(encoding="utf-8"))
        return {"titulo": j["titulo"], "descricao": j["descricao"], "tags": j["tags"]}
    linhas = [l for l in legenda.strip().splitlines()]
    primeira = linhas[0] if linhas else "POV em Marte"
    titulo = re.split(r"(?<=[🚀👀🏗️🐞🔦👋💬])\s", primeira, maxsplit=1)[0].strip()
    if len(titulo) > 80:
        titulo = titulo[:77].rsplit(" ", 1)[0] + "…"
    titulo = f"{titulo} | Operação Marte Zero #{numero}"
    chamada = (f"Procure seu nome no mapa: https://{config.SITE_TELA}/l/yt-ep{numero:03d}-pov 🚀"
               if pub.YT_LINK_NA_DESCRICAO else "Link no perfil do canal 👆")
    descricao = legenda.strip().replace("Link na bio 👆", chamada)
    tags = "operação marte zero, pixel art, marte, pov, colônia espacial, jogo indie"
    return {"titulo": titulo, "descricao": descricao, "tags": tags}


def montar(numero: int, copy: dict, video: Path, minutos: int, item: str = "", fator: float = 1.0) -> dict:
    titulo = limpar(copy["titulo"])
    if "#shorts" not in titulo.lower() and len(titulo) + 8 <= 100:
        titulo += " #Shorts"   # a série principal no YouTube é Shorts
    titulo = titulo[:100]
    descricao = limitar_hashtags(ajustar_capitulos(limpar(copy["descricao"]), fator))[:5000]
    tags, total = [], 0
    for t in (x.strip().lstrip("#") for x in copy.get("tags", "").split(",")):
        if t and total + len(t) + 1 <= 500:
            tags.append(t)
            total += len(t) + 1
    # minuto cheio para cima: nunca fica abaixo do pedido
    quando = (datetime.now(FUSO_BR) + timedelta(minutes=minutos, seconds=59)).replace(second=0, microsecond=0)
    chave = hashlib.sha1(f"{numero}|{titulo}|{descricao}|{video.stat().st_size}".encode()).hexdigest()[:16]
    return {
        "titulo": titulo, "descricao": descricao, "tags": ", ".join(tags),
        "publicar_em": quando.isoformat(),
        "publicar_em_utc": quando.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "episodio": str(numero), "chave": f"omz-ep{numero:03d}-{item + '-' if item else ''}yt-{chave}",
    }


# ------------------------------------------------------------------ comandos
def _checar_status(url: str, chave: str) -> tuple[str, bool, str]:
    nome = "webhook de status no n8n"
    if not (url.startswith("https://") and chave):
        return nome, False, "configure as duas variáveis acima primeiro"
    try:
        s = consultar(url, {"X-Painel-Chave": chave, "User-Agent": config.USER_AGENT}, "teste-checar", timeout=15)
        return nome, s.get("status") == "desconhecido", f"respondendo ({url_status(url)})"
    except Exception as e:  # noqa: BLE001
        dica = " · importe a versão nova de n8n/publicar-youtube-shorts.json e clique em Publish" if "404" in str(e) else ""
        return nome, False, f"{e}"[:160] + dica


def checar() -> list[tuple[str, bool, str]]:
    url = (os.environ.get("N8N_WEBHOOK_PUBLICAR") or "").strip()
    chave = (os.environ.get("N8N_PAINEL_CHAVE") or "").strip()
    return [
        ("FFmpeg", bool(ffmpeg()), ffmpeg() or "instale: winget install --id Gyan.FFmpeg -e"),
        ("N8N_WEBHOOK_PUBLICAR", url.startswith("https://"), "configurado" if url.startswith("https://")
         else ("precisa começar com https://" if url else "falta no .env.local")),
        ("N8N_PAINEL_CHAVE (X-Painel-Chave)", bool(chave), "configurado" if chave else "falta no .env.local"),
        _checar_status(url, chave),
    ]


def postar(numero: int, ensaio: bool, minutos: int = MINUTOS_AGENDAMENTO, log=print, extra: str | None = None) -> bool:
    """extra="pov_colonia" envia o vídeo extra do episódio (saida/epNNN/pov/) em vez do episódio."""
    import requests

    chave_pub = pub.chave_extra(numero, extra) if extra else numero

    if minutos < MINUTOS_MINIMO:
        raise pub.Recusado(f"o agendamento precisa ser de pelo menos {MINUTOS_MINIMO} minutos (o fluxo recusa menos)")
    with pub.trava_postagem("youtube.py"):
        try:
            if extra:
                lib = pub.exigir_liberado_extra(numero, extra, "youtube", ensaio=ensaio)
                lib["copy"] = copy_extra(numero, extra, lib["copy"]["legenda"])
                problemas = pub.validar_copy("youtube", lib["copy"])
                if problemas:
                    raise pub.Recusado("copy do YouTube fora das regras: " + "; ".join(problemas))
            else:
                lib = pub.exigir_liberado(numero, "youtube", ensaio=ensaio)
        except pub.Recusado as e:
            log(f"[YouTube] não executado: {e}")
            return False
        if not ensaio:
            faltando = [n for n, ok, _ in checar() if not ok]
            if faltando:
                log(f"[YouTube] não executado: falta configurar {', '.join(faltando)}")
                return False
        log("[YouTube] gerando a cópia compactada…")
        try:
            video = compactar(lib["video"], log)
        except Exception as e:  # noqa: BLE001
            if not ensaio:
                pub.marcar(chave_pub, "youtube", "erro", origem="youtube", detalhe=f"compactação: {e}"[:300])
            log(f"[YouTube] ✖ falhou ao compactar (pode tentar de novo): {e}")
            return False
        fator = fator_shorts(duracao(lib["video"]))
        campos = montar(numero, lib["copy"], video, minutos, extra or "", fator)
        log(f"  título: {campos['titulo']}")
        log(f"  agendado para: {campos['publicar_em']} · {len(campos['tags'].split(','))} tags · "
            f"{pub.contar_hashtags(campos['descricao'])} hashtags na descrição")
        if ensaio:
            log(f"  ENSAIO: nada foi enviado. Iria para o n8n: {video.name} ({video.stat().st_size / 1e6:.2f} MB) + "
                + ", ".join(k for k in campos))
            pub.anotar(chave_pub, "youtube", ultimo_ensaio=pub.agora(), ultimo_ensaio_resultado="ensaio ok")
            return True

        url = os.environ["N8N_WEBHOOK_PUBLICAR"].strip()
        headers = {"X-Painel-Chave": os.environ["N8N_PAINEL_CHAVE"].strip(), "User-Agent": config.USER_AGENT}
        pub.marcar(chave_pub, "youtube", "enviando", origem="youtube", detalhe="enviando ao n8n",
                   publicar_em=campos["publicar_em"], chave=campos["chave"])
        log("  enviando ao n8n…")
        try:
            with open(video, "rb") as f:
                r = requests.post(url, headers=headers, data=campos, timeout=(15, 600),
                                  files={"video": (video.name, f, "video/mp4")})
        except requests.exceptions.ConnectionError as e:
            # Conexão nem chegou a abrir (recusada, DNS, tempo para conectar): nada chegou ao n8n → pode tentar de novo.
            # Decide pelo TIPO do erro do urllib3, não pelo texto (que muda com o idioma do Windows).
            import urllib3
            motivo = getattr(e.args[0], "reason", None) if e.args else None
            nao_conectou = isinstance(e, requests.exceptions.ConnectTimeout) or isinstance(
                motivo, (urllib3.exceptions.NewConnectionError, urllib3.exceptions.ConnectTimeoutError))
            if nao_conectou:
                pub.marcar(chave_pub, "youtube", "erro", origem="youtube", detalhe=f"n8n inacessível: {e}"[:300])
                log(f"[YouTube] ✖ n8n inacessível, nada foi enviado (pode tentar de novo): {e}")
            else:
                pub.marcar(chave_pub, "youtube", "conferir", origem="youtube", detalhe=f"conexão caiu durante o envio: {e}"[:300])
                log(f"[YouTube] ⚠ CONFERIR: a conexão caiu durante o envio. Veja no n8n/YouTube antes de tentar de novo.")
            return False
        except requests.exceptions.Timeout as e:
            pub.marcar(chave_pub, "youtube", "conferir", origem="youtube", detalhe=f"sem resposta do n8n: {e}"[:300])
            log("[YouTube] ⚠ CONFERIR: o n8n não respondeu a tempo. Pode ter agendado; veja antes de tentar de novo.")
            return False

        corpo = r.text[:500]
        try:
            j = r.json()
        except ValueError:
            j = {}
        if r.ok and isinstance(j, dict) and j.get("recebido"):
            # fluxo novo: o n8n respondeu antes do upload → acompanha pelo webhook de status
            log(f"  o n8n recebeu (HTTP {r.status_code}); subindo para o YouTube, confirmando a cada {INTERVALO_STATUS} s…")
            return acompanhar(chave_pub, campos, url, headers, log)
        if r.ok and (not isinstance(j, dict) or j.get("ok", True) is not False):
            extra = {k: j.get(k) for k in ("video_id", "url") if isinstance(j, dict) and j.get(k)}
            pub.marcar(chave_pub, "youtube", "agendado", origem="youtube", detalhe=f"n8n HTTP {r.status_code}",
                       publicar_em=campos["publicar_em"], chave=campos["chave"], **extra)
            log(f"[YouTube] 🕒 agendado para {campos['publicar_em']}" + (f" · {extra.get('url')}" if extra.get("url") else ""))
            return True
        if 400 <= r.status_code < 500 and r.status_code not in (408, 409):
            pub.marcar(chave_pub, "youtube", "erro", origem="youtube", detalhe=f"n8n recusou (HTTP {r.status_code}): {corpo}"[:300])
            log(f"[YouTube] ✖ o n8n recusou (HTTP {r.status_code}), nada foi agendado: {corpo}")
        else:
            pub.marcar(chave_pub, "youtube", "conferir", origem="youtube", detalhe=f"n8n HTTP {r.status_code}: {corpo}"[:300])
            log(f"[YouTube] ⚠ CONFERIR: resposta incerta do n8n (HTTP {r.status_code}). Veja antes de tentar de novo.")
        return False


INTERVALO_STATUS = 15          # segundos entre consultas
ESPERA_STATUS = 20 * 60        # desiste de esperar (e marca ⚠ conferir) depois disso


def url_status(url_publicar: str) -> str:
    """N8N_WEBHOOK_STATUS, ou a URL de publicar trocando o final /publicar por /status."""
    proprio = (os.environ.get("N8N_WEBHOOK_STATUS") or "").strip()
    if proprio:
        return proprio
    base = url_publicar.rstrip("/")
    return (base[: -len("/publicar")] if base.endswith("/publicar") else base) + "/status"


def consultar(url: str, headers: dict, chave: str, timeout: float = 20) -> dict:
    import requests
    r = requests.get(url_status(url), headers=headers, params={"chave": chave}, timeout=timeout)
    r.raise_for_status()
    return r.json()


def acompanhar(numero: int, campos: dict, url: str, headers: dict, log=print) -> bool:
    """Depois do 202: pergunta ao n8n como terminou o upload, até ESPERA_STATUS."""
    chave, fim, falhas, ultimo = campos["chave"], time.monotonic() + ESPERA_STATUS, 0, ""
    while time.monotonic() < fim:
        time.sleep(INTERVALO_STATUS)
        try:
            s = consultar(url, headers, chave)
            falhas = 0
        except Exception as e:  # noqa: BLE001  (rede piscando: tenta de novo até o prazo)
            falhas += 1
            ultimo = str(e)
            if falhas in (1, 5, 20):
                log(f"    não consegui consultar o status ({e}); tentando de novo…")
            continue
        st = s.get("status")
        if st == "agendado":
            extra = {k: s.get(k) for k in ("video_id", "url") if s.get(k)}
            pub.marcar(numero, "youtube", "agendado", origem="youtube", detalhe="confirmado pelo status do n8n",
                       publicar_em=campos["publicar_em"], chave=chave, **extra)
            log(f"[YouTube] 🕒 agendado para {campos['publicar_em']}" + (f" · {extra['url']}" if extra.get("url") else ""))
            return True
        if st in ("falhou", "conferir"):
            # 'falhou' no upload: em geral nada foi criado, mas o YouTube às vezes cria o vídeo antes do erro.
            erro = s.get("erro") or st
            pub.marcar(numero, "youtube", "conferir", origem="youtube", detalhe=f"n8n: {erro}"[:300])
            log(f"[YouTube] ⚠ CONFERIR: {erro}. Veja no YouTube Studio; se não estiver lá, clique em Liberar e reenvie.")
            return False
        # 'desconhecido' = ainda subindo (o n8n só grava o resultado quando a execução termina)
    pub.marcar(numero, "youtube", "conferir", origem="youtube",
               detalhe=f"o n8n recebeu mas não confirmou em {ESPERA_STATUS // 60} min {ultimo}"[:300])
    log(f"[YouTube] ⚠ CONFERIR: o n8n recebeu o vídeo mas não confirmou em {ESPERA_STATUS // 60} min. "
        "Veja Executions no n8n e o YouTube Studio antes de tentar de novo.")
    return False


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--episodio", type=int)
    ap.add_argument("--ensaio", action="store_true", help="compacta e monta o envio, sem mandar")
    ap.add_argument("--checar", action="store_true")
    ap.add_argument("--minutos", type=int, default=MINUTOS_AGENDAMENTO, help="agendar para daqui a N minutos (mín. 20)")
    ap.add_argument("--contrato", action="store_true", help="mostra os campos enviados ao n8n")
    ap.add_argument("--extra", help="envia um vídeo extra do episódio (ex.: pov_colonia) em vez do episódio")
    a = ap.parse_args()
    if a.contrato:
        print(CONTRATO)
        return 0
    if a.checar:
        itens = checar()
        for nome, ok, det in itens:
            print(f"{'✅' if ok else '❌'} {nome}: {det}")
        return 0 if all(ok for _, ok, _ in itens) else 1
    if a.episodio is None or (a.episodio == 0 and not (a.extra or "").startswith("construcao_")):
        ap.error("informe --episodio N (ou use --checar); 0 só com --extra construcao_<obra>")
    try:
        return 0 if postar(a.episodio, a.ensaio, a.minutos, extra=a.extra) else 1
    except pub.Recusado as e:
        print(f"✖ {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
