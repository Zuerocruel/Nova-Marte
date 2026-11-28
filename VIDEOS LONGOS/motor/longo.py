"""Motor dos VÍDEOS LONGOS (série secundária "Expedição Norte", só YouTube, 16:9).

Separado da fábrica dos Shorts: lê partes/parteNN/roteiro.json e gera saida/parteNN/parteNN.mp4.

    python motor/longo.py --parte 1 --md               # roteiro.md para ler/aprovar (com tempos estimados)
    python motor/longo.py --parte 1 --sem-voz          # vídeo de prévia sem narração (não gasta créditos)
    python motor/longo.py --parte 1 --previa 5 60 300  # PNGs de instantes soltos (usa a última linha do tempo)
    python motor/longo.py --parte 1                    # voz (ElevenLabs) + filmagem + montagem
    python motor/longo.py --parte 1 --a-partir-de montagem

Etapas: voz → tempo → filmagem → montagem. A voz fica em cache (motor/cache_voz/): mudar uma fala só regenera ela.

Voz: modelo eleven_v3 (emoção pelas [marcas] em inglês no começo/meio da fala, que não aparecem na legenda).
Som: cada fala pode agendar efeitos ("sons"); cada cenário tem um ambiente próprio (vento, tempestade, barraca,
estática, espaço, respiração no capacete). Regra do dono: o som é dito uma vez e depois age sozinho, na pausa.
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import functools
import hashlib
import http.server
import json
import math
import os
import re
import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path

MOTOR = Path(__file__).resolve().parent
RAIZ_LONGOS = MOTOR.parent
RAIZ = RAIZ_LONGOS.parent
CACHE = MOTOR / "cache_voz"
FPS = 30
LARGURA, ALTURA = 1920, 1080

MODELO = "eleven_v3"
AJUSTES = {"stability": 0.5, "similarity_boost": 0.8, "use_speaker_boost": True}
VOZES = {   # narrador intenso e urgente; a Vega e o Batata só aparecem pelo rádio / gravador
    "narrador": {"voice_id": "N2lVS1w4EtoT3dr4eOWO", "nome": "Callum"},
    "vega": {"voice_id": "nPczCjzI2devNBz1zQrb", "nome": "Brian"},
    "batata": {"voice_id": "TX3LPaxmHKxFdv7VOQHJ", "nome": "Liam"},
}
PAUSA = 0.45          # silêncio padrão depois de cada fala (s); a fala pode pedir mais ("pausa")
ABERTURA = 0.8        # respiro antes da primeira fala
FIM = 4.0             # tela final depois da pergunta
TAG = re.compile(r"\[[^\]]*\]\s*")

# ambiente de cada cenário: (tipo, volume)
AMBIENTE = {
    "radio": ("estatica", 0.35), "frente": ("vento", 0.55), "roverPainel": ("vento", 0.35), "gravacao": ("vento", 0.5),
    "acampamento": ("tempestade", 1.0), "barraca": ("barraca", 1.0), "item": ("barraca", 0.7), "alcance": ("barraca", 0.7),
    "semente": ("barraca", 0.7), "chao": ("barraca", 0.5), "fato": ("barraca", 0.45), "vazamento": ("barraca", 0.8),
    "filtro": ("barraca", 0.8), "estatica": ("estatica", 0.8), "mapa": ("espaco", 1.0), "planeta": ("espaco", 1.0),
    "pulsos": ("estatica", 0.35), "dunas": ("vento", 0.35), "caminhada": ("capacete", 1.0), "traje": ("coracao", 1.0),
    "topo": ("capacete", 0.8), "partindo": ("capacete", 1.0), "marcas": ("vento", 0.4), "pergunta": ("espaco", 0.7),
}


# ------------------------------------------------------------------ util
def ler_env() -> None:
    for nome in (".env.local", ".env"):
        arq = RAIZ / nome
        if not arq.exists():
            continue
        for linha in arq.read_text(encoding="utf-8").splitlines():
            if "=" in linha and not linha.lstrip().startswith("#"):
                k, v = linha.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"'))


def ler_json(p: Path):
    return json.loads(Path(p).read_text(encoding="utf-8"))


def gravar_json(p: Path, d) -> None:
    Path(p).write_text(json.dumps(d, ensure_ascii=False, indent=2), encoding="utf-8")


def pasta_parte(n: int) -> Path:
    return RAIZ_LONGOS / "partes" / f"parte{n:02d}"


def pasta_saida(n: int) -> Path:
    p = RAIZ_LONGOS / "saida" / f"parte{n:02d}"
    p.mkdir(parents=True, exist_ok=True)
    return p


def limpo(texto: str) -> str:
    """Texto sem as marcas de emoção ([urgent]...): é o que vai para a legenda e para o roteiro.md."""
    return TAG.sub("", texto).strip()


def falas_planas(rot: dict) -> list[dict]:
    """As falas em ordem, cada uma com o bloco, o relógio e o HUD herdados da anterior."""
    out, relogio, hud = [], "", {}
    for bi, b in enumerate(rot["blocos"]):
        for fi, f in enumerate(b["falas"]):
            relogio = f.get("r", relogio)
            hud = {**hud, **f.get("h", {})}
            out.append({"id": f"{bi:02d}-{fi:02d}", "ref": f"{b['id']}-{fi}", "bloco": b["id"], "bloco_nome": b["nome"],
                        "primeira_do_bloco": fi == 0, "texto": f["t"], "legenda": limpo(f["t"]), "cena": f["c"],
                        "p": f.get("p", {}), "relogio": relogio, "hud": dict(hud), "pausa": f.get("pausa", PAUSA),
                        "voz": f.get("voz", "narrador"), "radio": bool(f.get("radio")), "mix": f.get("mix", 1.0),
                        "sons": f.get("sons", [])})
    return out


def mmss(s: float) -> str:
    return f"{int(s // 60)}:{int(s % 60):02d}"


# ------------------------------------------------------------------ voz (ElevenLabs, cache próprio)
def chave(f: dict) -> str:
    v = VOZES[f["voz"]]["voice_id"]
    return hashlib.sha1(json.dumps([v, MODELO, AJUSTES, f["texto"]], ensure_ascii=False).encode()).hexdigest()[:20]


def palavras_de(chars, ini, fim) -> list[dict]:
    """Agrupa os tempos por caractere em palavras, pulando as [marcas] de emoção."""
    ps, atual, dentro = [], None, False
    for ch, a, b in zip(chars, ini, fim):
        if ch == "[":
            dentro = True
        if dentro:
            if ch == "]":
                dentro = False
            continue
        if ch.isspace():
            if atual:
                ps.append(atual)
            atual = None
            continue
        if atual is None:
            atual = {"p": ch, "i": a, "f": b}
        else:
            atual["p"] += ch
            atual["f"] = b
    if atual:
        ps.append(atual)
    return ps


def estimar(f: dict) -> dict:
    ws = f["legenda"].split()
    dur = max(0.6, len(f["legenda"]) / 14.0)
    passo = dur / max(1, len(ws))
    return {"duracao": dur, "palavras": [{"p": w, "i": i * passo, "f": (i + 1) * passo} for i, w in enumerate(ws)], "audio": None}


def creditos(s) -> tuple[int, int] | None:
    try:
        r = s.get("https://api.elevenlabs.io/v1/user/subscription", timeout=30)
        r.raise_for_status()
        j = r.json()
        return j["character_count"], j["character_limit"]
    except Exception:
        return None


def gerar_voz(falas: list[dict], sem_voz: bool) -> dict:
    if sem_voz:
        print("  sem voz: tempos estimados")
        return {f["id"]: estimar(f) for f in falas}
    import requests
    ler_env()
    chave_api = os.environ.get("ELEVENLABS_API_KEY", "")
    if not chave_api.startswith("sk_"):
        raise SystemExit("Falta ELEVENLABS_API_KEY (sk_...) no .env.local da raiz.")
    CACHE.mkdir(exist_ok=True)
    s = requests.Session()
    s.headers.update({"xi-api-key": chave_api})
    pend = [f for f in falas if not (CACHE / f"{chave(f)}.json").exists()]
    custo = sum(len(f["texto"]) for f in pend)
    cred = creditos(s)
    print(f"  voz: {MODELO} · {len(pend)} falas novas = {custo} caracteres" + (f" (conta: {cred[0]}/{cred[1]})" if cred else ""))
    if cred and cred[0] + custo > cred[1]:
        raise SystemExit("  créditos da ElevenLabs insuficientes para esta parte")
    out = {}
    for f in falas:
        h = chave(f)
        mp3, meta = CACHE / f"{h}.mp3", CACHE / f"{h}.json"
        if not meta.exists():
            r = s.post(f"https://api.elevenlabs.io/v1/text-to-speech/{VOZES[f['voz']]['voice_id']}/with-timestamps",
                       params={"output_format": "mp3_44100_128"}, timeout=240,
                       json={"text": f["texto"], "model_id": MODELO, "language_code": "pt", "voice_settings": AJUSTES})
            r.raise_for_status()
            j = r.json()
            mp3.write_bytes(base64.b64decode(j["audio_base64"]))
            al = j.get("alignment") or j["normalized_alignment"]
            ps = palavras_de(al["characters"], al["character_start_times_seconds"], al["character_end_times_seconds"])
            gravar_json(meta, {"texto": f["texto"], "voz": f["voz"], "duracao": duracao(mp3), "palavras": ps})
            print(f"  [{f['id']}] {f['voz']}: gerada")
        m = ler_json(meta)
        out[f["id"]] = {"duracao": m["duracao"], "palavras": m["palavras"], "audio": str(mp3)}
    return out


def duracao(arq: Path) -> float:
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(arq)],
                       capture_output=True, text=True)
    return round(float(r.stdout.strip()), 3)


# ------------------------------------------------------------------ linha do tempo
def linha_do_tempo(rot: dict, falas: list[dict], vozes: dict) -> dict:
    t = ABERTURA
    cenas, capitulos = [], []
    for f in falas:
        v = vozes[f["id"]]
        if f["primeira_do_bloco"]:
            capitulos.append({"t": round(t, 2), "nome": f"{f['relogio']} — {f['bloco_nome']}" if f["relogio"] else f["bloco_nome"]})
        ini = t
        fim_voz = ini + v["duracao"]
        fim = fim_voz + f["pausa"]
        cenas.append({**{k: f[k] for k in ("id", "ref", "bloco", "cena", "p", "relogio", "hud", "voz", "radio", "mix", "sons")},
                      "texto": f["legenda"], "inicio": round(ini, 3), "fim_voz": round(fim_voz, 3), "fim": round(fim, 3),
                      "palavras": [{"p": w["p"], "i": round(ini + w["i"], 3), "f": round(ini + w["f"], 3)} for w in v["palavras"]],
                      "audio": v["audio"]})
        t = fim
    # cenas seguidas com o mesmo cenário viram um "plano" contínuo (a animação não recomeça a cada frase)
    for i, c in enumerate(cenas):
        c["plano_ini"] = cenas[i - 1]["plano_ini"] if i and cenas[i - 1]["cena"] == c["cena"] else c["inicio"]
    for i in range(len(cenas) - 1, -1, -1):
        c = cenas[i]
        c["plano_fim"] = cenas[i + 1]["plano_fim"] if i + 1 < len(cenas) and cenas[i + 1]["cena"] == c["cena"] else c["fim"]
    total = t + FIM
    cenas[-1]["fim"] = cenas[-1]["plano_fim"] = round(total, 3)
    return {"parte": rot["parte"], "titulo": rot["titulo"], "fps": FPS, "duracao": round(total, 3),
            "cenas": cenas, "capitulos": capitulos, "sfx": efeitos(cenas), "ambiente": ambientes(cenas)}


def efeitos(cenas: list[dict]) -> list[dict]:
    """Os sons agendados em cada fala ("sons"). 'pulsos417' vira 4 + 1 + 7 pulsos de rádio; 'assobio' dura até a
    fala indicada em 'ate'; os repetidos ('cada') seguem até 'vezes' ou até a fala de 'ate'."""
    por_ref = {c["ref"]: c for c in cenas}
    sfx = []
    for c in cenas:
        for s in c.get("sons", []):
            base = c["fim_voz"] if s.get("de") == "fim" else c["inicio"]
            t0 = max(0.0, base + s.get("t", 0.0))
            vol = s.get("vol", 1.0)
            ate = por_ref[s["ate"]]["inicio"] if s.get("ate") else None
            if s["s"] == "assobio":
                sfx.append({"tipo": "assobio", "t": round(t0, 3), "dur": round((ate or t0 + 4) - t0, 3), "vol": vol})
                continue
            tempos = [t0]
            if s.get("cada"):
                n = s.get("vezes") or 999
                while len(tempos) < n and (ate is None or tempos[-1] + s["cada"] < ate):
                    tempos.append(tempos[-1] + s["cada"])
            for tt in tempos:
                if s["s"] == "pulsos417":
                    k = tt
                    for grupo in (4, 1, 7):
                        for _ in range(grupo):
                            sfx.append({"tipo": "pulso", "t": round(k, 3), "vol": vol}); k += 0.17
                        k += 0.55
                else:
                    sfx.append({"tipo": s["s"], "t": round(tt, 3), "vol": vol})
    return sfx


def ambientes(cenas: list[dict]) -> list[dict]:
    """Um trecho de ambiente por plano (cenário contínuo), com o tipo e o volume do cenário."""
    out, vistos = [], set()
    for c in cenas:
        if c["plano_ini"] in vistos:
            continue
        vistos.add(c["plano_ini"])
        tipo, vol = AMBIENTE.get(c["cena"], ("vento", 0.4))
        if c["cena"] == "acampamento":
            vol = 0.35 + 0.65 * c["p"].get("tempestade", 0.5)
        out.append({"tipo": tipo, "t": c["plano_ini"], "dur": round(c["plano_fim"] - c["plano_ini"], 3), "vol": vol})
    return out


# ------------------------------------------------------------------ roteiro.md (para ler e aprovar)
def escrever_md(n: int, rot: dict, lt: dict) -> Path:
    c = rot["campos"]
    linhas = [f"# Expedição Norte · Parte {n}: {rot['titulo']}", "",
              f"Você é o **{rot['voce']}** (o nome só aparece pelo rádio). Parceiro: **{rot['parceiro']}**. "
              f"Duração {'estimada' if not lt['cenas'][0].get('audio') else 'real'}: **{mmss(lt['duracao'])}**.", "",
              "Voz: narrador intenso (eleven_v3, emoção entre [colchetes]); a Vega e o Batata pelo rádio. "
              "Os sons são ditos uma vez e depois agem sozinhos, nas pausas.", "",
              "## Campos do molde", "",
              f"- **Relógio-motivo:** {c['relogio_motivo']}", f"- **Plantado no início:** {c['plantado']}",
              f"- **Anomalia:** {c['anomalia']}", "- **Fatos reais:** " + "; ".join(c["fatos_reais"]),
              "- **Loops abertos:** " + "; ".join(c["loops"]), f"- **Cruzamento com os Shorts:** {c['cruzamento']}",
              f"- **Twist:** {c['twist']}", f"- **Pergunta final:** {c['pergunta']}", "", "## Roteiro", ""]
    bloco = None
    falas = {f["id"]: f for f in falas_planas(rot)}
    for cena in lt["cenas"]:
        if cena["bloco"] != bloco:
            bloco = cena["bloco"]
            b = next(x for x in rot["blocos"] if x["id"] == bloco)
            pct = 100 * cena["inicio"] / lt["duracao"]
            linhas += ["", f"### {mmss(cena['inicio'])} ({pct:.0f}%) · {b['nome']}", ""]
        visual = f"[{cena['cena']}" + (f" · {', '.join(f'{k}={v}' for k, v in cena['p'].items())}" if cena["p"] else "") + "]"
        quem = "" if cena["voz"] == "narrador" else f" **({cena['voz'].upper()}{', rádio' if cena['radio'] else ''})**"
        sons = ", ".join(s["s"] for s in cena.get("sons", []))
        linhas.append(f"- `{mmss(cena['inicio'])}` {visual} {cena['relogio']}{quem} — {falas[cena['id']]['texto']}"
                      + (f" 🔊 {sons}" if sons else "") + "  ")
        linhas.append(f"  **{cena['texto'].upper()}**")
    linhas += ["", "## Checklist", "",
               "- [x] Primeira frase com horário exato e evento acontecendo (SOL 11 · 19:42, a voz some)",
               "- [x] Prazo concreto até 4% (38 minutos até a tempestade; VOLTA-CASA em 36 h)",
               "- [x] Plantado no começo volta no fim (VOLTA-CASA dispara às 07:42 e o rover parte sem eles)",
               "- [x] 4 loops abertos; as marcas frescas, o 4-1-7 e a frase da Vega ficam para a Parte 2",
               "- [x] 5 fatos reais (sem GPS, pressão/ebulição, poeira e o Opportunity, rotina no isolamento, 0,84 kg O₂/dia)",
               "- [x] Virada a cada ~60–90 s (11 blocos)", "- [x] Respiro: o filtro e a semente do VinnY",
               "- [x] 2ª pessoa, sem metalinguagem; ninguém tira o traje", "- [x] Pergunta de duas opções no fim e na descrição",
               "- [x] Nada do vídeo de referência", "- [x] Bate com a bíblia e com o ep. 13 dos Shorts (mesma gravação)"]
    arq = pasta_parte(n) / "roteiro.md"
    arq.write_text("\n".join(linhas) + "\n", encoding="utf-8")
    return arq


# ------------------------------------------------------------------ filmagem (Chrome/Edge headless, quadro a quadro)
class _Quieto(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


def servidor():
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(_Quieto, directory=str(MOTOR)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, f"http://127.0.0.1:{srv.server_address[1]}/render.html"


async def _abrir(pw):
    for canal in ("chrome", "msedge", None):
        try:
            return await (pw.chromium.launch(channel=canal, headless=True) if canal else pw.chromium.launch(headless=True))
        except Exception:
            continue
    raise SystemExit("Nenhum navegador (Chrome/Edge) encontrado.")


async def _aba(browser, url, lt):
    pg = await browser.new_page(viewport={"width": LARGURA, "height": ALTURA}, device_scale_factor=1)
    erros = []
    pg.on("pageerror", lambda e: erros.append(str(e)))
    await pg.goto(url)
    await pg.wait_for_function("window.pronto === true")
    await pg.evaluate("lt => carregar(lt)", lt)
    if erros:
        raise RuntimeError("erro no longo.js: " + erros[0])
    return pg


async def _filmar(n: int, abas: int) -> None:
    from playwright.async_api import async_playwright
    saida = pasta_saida(n)
    lt = ler_json(saida / "linha_do_tempo.json")
    quadros = saida / "quadros"
    shutil.rmtree(quadros, ignore_errors=True)
    quadros.mkdir()
    total = math.ceil(lt["duracao"] * FPS)
    srv, url = servidor()
    try:
        async with async_playwright() as pw:
            b = await _abrir(pw)
            pgs = [await _aba(b, url, lt) for _ in range(abas)]
            feitos, t0, faixa = 0, time.time(), math.ceil(total / abas)

            async def trabalhar(pg, de, ate):
                nonlocal feitos
                for i in range(de, ate, 6):
                    urls = await pg.evaluate("([a,b]) => { const r=[]; for (let i=a;i<b;i++) r.push(quadro(i)); return r; }", [i, min(i + 6, ate)])
                    for k, u in enumerate(urls):
                        (quadros / f"{i + k:06d}.jpg").write_bytes(base64.b64decode(u.split(",", 1)[1]))
                    antes = feitos * 20 // total
                    feitos += len(urls)
                    if feitos * 20 // total > antes:
                        el = time.time() - t0
                        print(f"  {feitos}/{total} quadros · {feitos / el:.0f} q/s · faltam ~{(total - feitos) / max(1, feitos / el):.0f}s")
            await asyncio.gather(*(trabalhar(pg, j * faixa, min(total, (j + 1) * faixa)) for j, pg in enumerate(pgs)))
            await b.close()
    finally:
        srv.shutdown()


async def _previa(n: int, tempos: list[float]) -> list[Path]:
    from playwright.async_api import async_playwright
    saida = pasta_saida(n)
    lt = ler_json(saida / "linha_do_tempo.json")
    srv, url = servidor()
    out = []
    try:
        async with async_playwright() as pw:
            b = await _abrir(pw)
            pg = await _aba(b, url, lt)
            for t in tempos:
                u = await pg.evaluate("t => (desenhar(t), document.getElementById('tela').toDataURL('image/png'))", t)
                d = saida / f"previa_{t:07.2f}s.png"
                d.write_bytes(base64.b64decode(u.split(",", 1)[1]))
                out.append(d)
            await b.close()
    finally:
        srv.shutdown()
    return out


# ------------------------------------------------------------------ som
# efeitos curtos sintetizados (sem banco de sons); fórmulas do aevalsrc com t em segundos
SFX = {
    "tic": ("aevalsrc=0.9*sin(2*PI*3100*t)*exp(-90*t)+0.5*sin(2*PI*5200*t)*exp(-140*t):s=44100:d=0.18",
            "aecho=0.7:0.6:70|160:0.35|0.2,lowpass=f=4200"),
    "pulso": ("aevalsrc=0.45*sin(2*PI*1050*t)*lt(t\\,0.1)+0.05*(random(0)-0.5):s=44100:d=0.14", "highpass=f=400,lowpass=f=2800"),
    "bipe": ("aevalsrc=0.35*sin(2*PI*1760*t)*lt(t\\,0.11):s=44100:d=0.14", "afade=t=out:st=0.09:d=0.05"),
    "alarme": ("aevalsrc=0.32*sin(2*PI*if(lt(t\\,0.2)\\,1400\\,1050)*t)*lt(t\\,0.4):s=44100:d=0.45", "afade=t=out:st=0.36:d=0.08"),
    "corte": ("anoisesrc=color=white:amplitude=0.6:d=0.7", "highpass=f=900,afade=t=out:st=0.05:d=0.6"),
    "ziper": ("anoisesrc=color=white:amplitude=0.5:d=1.0", "highpass=f=1800,tremolo=f=38:d=0.9,afade=t=in:d=0.05,afade=t=out:st=0.7:d=0.3"),
    "clique": ("aevalsrc=0.7*sin(2*PI*2100*t)*exp(-220*t):s=44100:d=0.06", "anull"),
    "fita": ("anoisesrc=color=pink:amplitude=1.0:d=0.55", "volume=2.5,bandpass=f=3200:t=h:w=2500,tremolo=f=55:d=0.8,afade=t=out:st=0.3:d=0.25"),
    "batida": ("aevalsrc=0.9*sin(2*PI*85*t)*exp(-22*t)+0.25*(random(0)-0.5)*exp(-40*t):s=44100:d=0.3", "lowpass=f=900"),
    "gota": ("aevalsrc=0.5*sin(2*PI*(1500-2600*t)*t)*exp(-28*t):s=44100:d=0.22", "aecho=0.6:0.4:40:0.25"),
    "motor": ("aevalsrc=0.22*sin(2*PI*(170+50*t)*t)+0.12*sin(2*PI*(340+100*t)*t)+0.18*(random(0)-0.5):s=44100:d=4.5",
              "lowpass=f=1400,afade=t=in:d=0.8,afade=t=out:st=3.2:d=1.3"),
}
# ambientes (camas longas); {d} = duração
AMB = {
    "vento": "anoisesrc=color=brown:amplitude=0.6:d={d}[a];[a]lowpass=f=520,volume='0.45+0.35*sin(t*0.53)*sin(t*0.21)':eval=frame",
    "tempestade": "anoisesrc=color=pink:amplitude=0.6:d={d}[a];[a]bandpass=f=700:t=h:w=900,volume='1.4+1.1*abs(sin(t*0.9)*sin(t*0.37))':eval=frame",
    "barraca": "anoisesrc=color=brown:amplitude=0.5:d={d}[a];sine=f=118:d={d}[b];[a]lowpass=f=230,volume='0.35+0.2*abs(sin(t*0.8))':eval=frame[a2];"
               "[b]volume=0.035[b2];[a2][b2]amix=2:normalize=0",
    "estatica": "anoisesrc=color=white:amplitude=0.4:d={d}[a];[a]bandpass=f=2400:t=h:w=2600,volume='0.5+0.25*abs(sin(t*7.3)*sin(t*3.1))':eval=frame",
    "espaco": "sine=f=41:d={d}[a];sine=f=61.5:d={d}[b];[a][b]amix=2:normalize=0,volume='0.5*(0.7+0.3*sin(t*0.4))':eval=frame",
    "capacete": "anoisesrc=color=pink:amplitude=0.5:d={d}[a];anoisesrc=color=brown:amplitude=0.5:d={d}[b];"
                "[a]bandpass=f=900:t=h:w=1200,volume='0.7*pow(max(0\\,sin(2*PI*t*0.3))\\,2)':eval=frame[a2];[b]lowpass=f=300,volume=0.25[b2];[a2][b2]amix=2:normalize=0",
    "coracao": "aevalsrc=0.8*sin(2*PI*52*t)*exp(-28*mod(t\\,0.72))+0.55*sin(2*PI*48*t)*exp(-28*mod(t-0.22\\,0.72))*gte(mod(t\\,0.72)\\,0.22):s=44100:d={d}[c];"
               "anoisesrc=color=pink:amplitude=0.5:d={d}[a];[a]bandpass=f=900:t=h:w=1200,volume='0.38*pow(max(0\\,sin(2*PI*t*0.55))\\,2)':eval=frame[a2];[c][a2]amix=2:normalize=0",
}


def ff(*args) -> None:
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *map(str, args)], check=True)


def gerar_sfx(d: Path) -> None:
    for nome, (fonte, filtro) in SFX.items():
        arq = d / f"{nome}.wav"
        if not arq.exists():
            ff("-f", "lavfi", "-i", fonte, "-af", f"{filtro},aformat=channel_layouts=stereo", "-ar", 44100, arq)


def trecho_assobio(d: Path, dur: float) -> Path:
    arq = d / f"assobio_{dur:.2f}.wav"
    if not arq.exists():
        ff("-f", "lavfi", "-i", f"sine=f=2750:d={dur}", "-f", "lavfi", "-i", f"anoisesrc=color=white:amplitude=0.3:d={dur}",
           "-filter_complex", "[0]vibrato=f=7:d=0.3,volume=0.12[a];[1]highpass=f=3500,volume=0.3[b];[a][b]amix=2:normalize=0,"
           f"afade=t=in:d=0.3,afade=t=out:st={max(0, dur - 0.25)}:d=0.25,alimiter=limit=0.2:level=false,aformat=channel_layouts=stereo", "-ar", 44100, arq)
    return arq


def trecho_ambiente(d: Path, tipo: str, dur: float, vol: float) -> Path:
    arq = d / f"amb_{tipo}_{dur:.2f}_{vol:.2f}.wav"
    if not arq.exists():
        grafo = AMB[tipo].format(d=dur + 0.6)
        ff("-filter_complex", f"{grafo},volume={vol},afade=t=in:d=0.5,afade=t=out:st={dur}:d=0.6,"
                              "aformat=sample_rates=44100:channel_layouts=stereo[o]", "-map", "[o]", "-t", dur + 0.6, arq)
    return arq


def montar(n: int, sem_voz: bool) -> Path:
    saida = pasta_saida(n)
    lt = ler_json(saida / "linha_do_tempo.json")
    dur = lt["duracao"]
    sd = saida / "sfx"
    sd.mkdir(exist_ok=True)
    gerar_sfx(sd)

    def mixar(itens: list[tuple[str, float, str]], destino: Path) -> None:
        """itens = (arquivo, início em s, filtro extra). Mistura tudo numa faixa do tamanho do vídeo."""
        filtros, rot = [], []
        for k, (arq, t0, extra) in enumerate(itens):
            filtros.append(f"[{k}:a]{extra + ',' if extra else ''}adelay={int(t0 * 1000)}:all=1,"
                           f"aformat=sample_rates=44100:channel_layouts=stereo[v{k}]")
            rot.append(f"[v{k}]")
        script = destino.with_suffix(".filtro.txt")
        script.write_text(";\n".join(filtros) + f";\n{''.join(rot)}amix=inputs={len(rot)}:normalize=0,apad=whole_dur={dur}[o]", encoding="utf-8")
        cmd = []
        for arq, _, _ in itens:
            cmd += ["-i", arq]
        ff(*cmd, "-/filter_complex", script, "-map", "[o]", "-t", dur, destino)

    RADIO = "highpass=f=320,lowpass=f=3100,acrusher=bits=10:mix=0.25,volume=1.4"
    voz = [(c["audio"], c["inicio"], ",".join(x for x in (RADIO if c.get("radio") else "", f"volume={c.get('mix', 1.0)}" if c.get("mix", 1.0) != 1.0 else "") if x))
           for c in lt["cenas"] if c.get("audio")]
    efeitos = [(str(trecho_assobio(sd, s["dur"])) if s["tipo"] == "assobio" else str(sd / f"{s['tipo']}.wav"), s["t"],
                f"volume={s.get('vol', 1.0)}" if s.get("vol", 1.0) != 1.0 else "") for s in lt["sfx"]]
    amb = [(str(trecho_ambiente(sd, a["tipo"], a["dur"], a["vol"])), a["t"], "") for a in lt["ambiente"]]
    voz_wav, fx_wav, amb_wav, mix = saida / "voz.wav", saida / "efeitos.wav", saida / "ambiente.wav", saida / "mix.wav"
    if voz:
        mixar(voz, voz_wav)
    else:
        ff("-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo", "-t", dur, voz_wav)
    mixar(efeitos, fx_wav)
    mixar(amb, amb_wav)
    # ambiente abaixa quando a voz entra (sidechain); efeitos ficam por cima, sem abaixar
    ff("-i", voz_wav, "-i", fx_wav, "-i", amb_wav, "-filter_complex",
       "[0]asplit=2[v][sc];[2][sc]sidechaincompress=threshold=0.04:ratio=5:attack=25:release=500[a];"
       "[v][1][a]amix=3:normalize=0:weights=1 0.9 0.8,loudnorm=I=-15:TP=-1.5:LRA=13[o]", "-map", "[o]", "-ar", 44100, mix)
    final = saida / (f"parte{n:02d}" + ("_previa_sem_voz" if sem_voz else "") + ".mp4")
    ff("-framerate", FPS, "-i", saida / "quadros" / "%06d.jpg", "-i", mix, "-c:v", "libx264", "-preset", "medium", "-crf", 18,
       "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", final)
    shutil.rmtree(saida / "quadros", ignore_errors=True)
    return final


# ------------------------------------------------------------------ principal
ETAPAS = ["voz", "tempo", "filmagem", "montagem"]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--parte", type=int, required=True)
    ap.add_argument("--md", action="store_true", help="só gera o roteiro.md (tempos estimados, ou reais se já tem voz)")
    ap.add_argument("--sem-voz", action="store_true")
    ap.add_argument("--previa", type=float, nargs="+")
    ap.add_argument("--a-partir-de", choices=ETAPAS, default="voz")
    ap.add_argument("--abas", type=int, default=4)
    a = ap.parse_args()
    n = a.parte
    rot = ler_json(pasta_parte(n) / "roteiro.json")
    falas = falas_planas(rot)
    saida = pasta_saida(n)
    faz = lambda e: ETAPAS.index(e) >= ETAPAS.index(a.a_partir_de)

    if a.md:
        com_voz = all((CACHE / f"{chave(f)}.json").exists() for f in falas)
        vozes = {f["id"]: ({**ler_json(CACHE / f"{chave(f)}.json"), "audio": None} if com_voz else estimar(f)) for f in falas}
        print(escrever_md(n, rot, linha_do_tempo(rot, falas, vozes)))
        return
    if a.previa:
        for p in asyncio.run(_previa(n, a.previa)):
            print(p)
        return
    t0 = time.time()
    if faz("voz"):
        print("1/4 voz")
        gravar_json(saida / "voz.json", gerar_voz(falas, a.sem_voz))
    if faz("tempo"):
        print("2/4 linha do tempo")
        lt = linha_do_tempo(rot, falas, ler_json(saida / "voz.json"))
        gravar_json(saida / "linha_do_tempo.json", lt)
        escrever_md(n, rot, lt)
        (saida / "capitulos.txt").write_text("\n".join(f"{mmss(c['t'])} {c['nome']}" for c in lt["capitulos"]) + "\n",
                                             encoding="utf-8")
        print(f"  duração: {mmss(lt['duracao'])} · {len(lt['cenas'])} falas · {len(lt['sfx'])} efeitos · {len(lt['capitulos'])} capítulos")
    if faz("filmagem"):
        print("3/4 filmagem")
        asyncio.run(_filmar(n, a.abas))
    if faz("montagem"):
        print("4/4 montagem")
        sem = all(not c.get("audio") for c in ler_json(saida / "linha_do_tempo.json")["cenas"])
        print(f"  pronto: {montar(n, sem)}")
    print(f"Pronto em {time.time() - t0:.0f}s")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
