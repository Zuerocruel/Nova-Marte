"""Motor dos VÍDEOS LONGOS (série secundária "Expedição Norte", só YouTube, 16:9).

Separado da fábrica dos Shorts: lê partes/parteNN/roteiro.json e gera saida/parteNN/parteNN.mp4.

    python motor/longo.py --parte 1 --md               # roteiro.md para ler/aprovar (com tempos estimados)
    python motor/longo.py --parte 1 --sem-voz          # vídeo de prévia sem narração (não gasta créditos)
    python motor/longo.py --parte 1 --previa 5 60 300  # PNGs de instantes soltos (usa a última linha do tempo)
    python motor/longo.py --parte 1                    # voz (ElevenLabs) + filmagem + montagem
    python motor/longo.py --parte 1 --a-partir-de filmagem

Etapas: voz → tempo → filmagem → montagem. A voz fica em cache (motor/cache_voz/): mudar uma fala só regenera ela.
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

# Narrador da série longa: calmo e grave, diferente do narrador dos Shorts (identidade própria)
VOZ = {"voice_id": "JBFqnCBsd6RMkjVDRZzb", "nome": "George"}
MODELO = "eleven_multilingual_v2"
AJUSTES = {"stability": 0.55, "similarity_boost": 0.8, "style": 0.15, "use_speaker_boost": True, "speed": 0.95}
PAUSA = 0.45          # silêncio padrão depois de cada fala (s); a fala pode pedir mais ("pausa")
ABERTURA = 0.6        # respiro antes da primeira fala
FIM = 4.0             # tela final depois da pergunta


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


def falas_planas(rot: dict) -> list[dict]:
    """As falas em ordem, cada uma com o bloco, o relógio e o HUD herdados da anterior."""
    out, relogio, hud = [], "", {}
    for bi, b in enumerate(rot["blocos"]):
        for fi, f in enumerate(b["falas"]):
            relogio = f.get("r", relogio)
            hud = {**hud, **f.get("h", {})}
            out.append({"id": f"{bi:02d}-{fi:02d}", "bloco": b["id"], "bloco_nome": b["nome"], "primeira_do_bloco": fi == 0,
                        "texto": f["t"], "cena": f["c"], "p": f.get("p", {}), "relogio": relogio, "hud": dict(hud),
                        "pausa": f.get("pausa", PAUSA)})
    return out


def mmss(s: float) -> str:
    return f"{int(s // 60)}:{int(s % 60):02d}"


# ------------------------------------------------------------------ voz (ElevenLabs, cache próprio)
def chave(texto: str) -> str:
    return hashlib.sha1(json.dumps([VOZ["voice_id"], MODELO, AJUSTES, texto], ensure_ascii=False).encode()).hexdigest()[:20]


def palavras_de(chars, ini, fim) -> list[dict]:
    ps, atual = [], None
    for ch, a, b in zip(chars, ini, fim):
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


def estimar(texto: str) -> dict:
    ws = texto.split()
    dur = max(0.8, len(texto) / 14.5)
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
        return {f["id"]: estimar(f["texto"]) for f in falas}
    import requests
    ler_env()
    chave_api = os.environ.get("ELEVENLABS_API_KEY", "")
    if not chave_api.startswith("sk_"):
        raise SystemExit("Falta ELEVENLABS_API_KEY (sk_...) no .env.local da raiz.")
    CACHE.mkdir(exist_ok=True)
    s = requests.Session()
    s.headers.update({"xi-api-key": chave_api})
    pend = [f for f in falas if not (CACHE / f"{chave(f['texto'])}.json").exists()]
    custo = sum(len(f["texto"]) for f in pend)
    cred = creditos(s)
    print(f"  voz: {VOZ['nome']} · {len(pend)} falas novas = {custo} caracteres" + (f" (conta: {cred[0]}/{cred[1]})" if cred else ""))
    if cred and cred[0] + custo > cred[1]:
        raise SystemExit("  créditos da ElevenLabs insuficientes para esta parte")
    out = {}
    for f in falas:
        h = chave(f["texto"])
        mp3, meta = CACHE / f"{h}.mp3", CACHE / f"{h}.json"
        if not meta.exists():
            r = s.post(f"https://api.elevenlabs.io/v1/text-to-speech/{VOZ['voice_id']}/with-timestamps",
                       params={"output_format": "mp3_44100_128"}, timeout=180,
                       json={"text": f["texto"], "model_id": MODELO, "language_code": "pt", "voice_settings": AJUSTES})
            r.raise_for_status()
            j = r.json()
            mp3.write_bytes(base64.b64decode(j["audio_base64"]))
            al = j.get("normalized_alignment") or j["alignment"]
            ps = palavras_de(al["characters"], al["character_start_times_seconds"], al["character_end_times_seconds"])
            gravar_json(meta, {"texto": f["texto"], "duracao": duracao(mp3), "palavras": ps})
            print(f"  [{f['id']}] gerada")
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
        fim = ini + v["duracao"] + f["pausa"]
        cenas.append({**{k: f[k] for k in ("id", "bloco", "texto", "cena", "p", "relogio", "hud")},
                      "inicio": round(ini, 3), "fim": round(fim, 3),
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
            "cenas": cenas, "capitulos": capitulos, "sfx": efeitos(cenas)}


def efeitos(cenas: list[dict]) -> list[dict]:
    """Efeitos sonoros pontuais: o tique, os pulsos 4-1-7, alarmes e o motor do rover."""
    sfx = []
    for c in cenas:
        p, a = c["p"], c["inicio"]
        if c["cena"] == "chao" and p.get("tic"):
            sfx.append({"tipo": "tic", "t": a})
        if c["cena"] == "pulsos" and p.get("n") == 3 and not p.get("base") and not p.get("some"):
            k = a + 0.1
            for grupo in (4, 1, 7):
                for _ in range(grupo):
                    sfx.append({"tipo": "pulso", "t": round(k, 3)}); k += 0.16
                k += 0.5
        if c["cena"] in ("vazamento",) and p.get("fase") == "cai" or (c["cena"] == "barraca" and p.get("alarme")):
            for i in range(4):
                sfx.append({"tipo": "alarme", "t": round(a + i * 0.5, 3)})
        if c["cena"] == "traje" and p.get("pct") == 12:
            for i in range(3):
                sfx.append({"tipo": "alarme", "t": round(a + i * 0.45, 3)})
        if c["cena"] == "roverPainel" and p.get("contagem") == "VOLTA-CASA":
            sfx.append({"tipo": "motor", "t": a})
    return sfx


# ------------------------------------------------------------------ roteiro.md (para ler e aprovar)
def escrever_md(n: int, rot: dict, lt: dict) -> Path:
    c = rot["campos"]
    linhas = [f"# Expedição Norte · Parte {n}: {rot['titulo']}", "",
              f"Você é o **{rot['voce']}** (o nome só aparece pelo rádio). Parceiro: **{rot['parceiro']}**. "
              f"Duração {'estimada' if not lt['cenas'][0].get('audio') else 'real'}: **{mmss(lt['duracao'])}**.", "",
              "## Campos do molde", "",
              f"- **Relógio-motivo:** {c['relogio_motivo']}", f"- **Plantado no início:** {c['plantado']}",
              f"- **Anomalia:** {c['anomalia']}", "- **Fatos reais:** " + "; ".join(c["fatos_reais"]),
              "- **Loops abertos:** " + "; ".join(c["loops"]), f"- **Cruzamento com os Shorts:** {c['cruzamento']}",
              f"- **Twist:** {c['twist']}", f"- **Pergunta final:** {c['pergunta']}", "", "## Roteiro", ""]
    bloco = None
    for cena in lt["cenas"]:
        if cena["bloco"] != bloco:
            bloco = cena["bloco"]
            b = next(x for x in rot["blocos"] if x["id"] == bloco)
            pct = 100 * cena["inicio"] / lt["duracao"]
            linhas += ["", f"### {mmss(cena['inicio'])} ({pct:.0f}%) · {b['nome']}", ""]
        visual = f"[{cena['cena']}" + (f" · {', '.join(f'{k}={v}' for k, v in cena['p'].items())}" if cena["p"] else "") + "]"
        linhas.append(f"- `{mmss(cena['inicio'])}` {visual} {cena['relogio']} — {cena['texto']}  ")
        linhas.append(f"  **{cena['texto'].upper()}**")
    linhas += ["", "## Checklist", "",
               "- [x] Primeira frase com horário exato e evento acontecendo (SOL 11 · 19:42, a voz some)",
               "- [x] Prazo concreto até 4% (38 minutos até a tempestade; VOLTA-CASA em 36 h)",
               "- [x] Plantado no começo volta no fim (VOLTA-CASA dispara às 07:42 e o rover parte sem eles)",
               "- [x] 4 loops abertos; as marcas frescas, o 4-1-7 e a frase da Vega ficam para a Parte 2",
               "- [x] 5 fatos reais (sem GPS, pressão/ebulição, poeira e o Opportunity, rotina no isolamento, 0,84 kg O₂/dia)",
               "- [x] Virada a cada ~60–90 s (11 blocos)", "- [x] Respiro: o filtro e a semente do VinnY",
               "- [x] 2ª pessoa, sem metalinguagem", "- [x] Pergunta de duas opções no fim e na descrição",
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


# ------------------------------------------------------------------ montagem (narração + ambiente + efeitos + quadros)
def montar(n: int, sem_voz: bool) -> Path:
    saida = pasta_saida(n)
    lt = ler_json(saida / "linha_do_tempo.json")
    dur = lt["duracao"]
    sfx_dir = saida / "sfx"
    sfx_dir.mkdir(exist_ok=True)
    gerar_sfx(sfx_dir)
    entradas, filtros, rotulos = [], [], []
    for c in lt["cenas"]:
        if c.get("audio"):
            entradas.append(c["audio"])
            k = len(entradas) - 1
            filtros.append(f"[{k}:a]adelay={int(c['inicio'] * 1000)}:all=1,aformat=sample_rates=44100:channel_layouts=stereo[v{k}]")
            rotulos.append(f"[v{k}]")
    for s in lt["sfx"]:
        entradas.append(str(sfx_dir / f"{s['tipo']}.wav"))
        k = len(entradas) - 1
        filtros.append(f"[{k}:a]adelay={int(s['t'] * 1000)}:all=1,aformat=sample_rates=44100:channel_layouts=stereo[v{k}]")
        rotulos.append(f"[v{k}]")
    voz_wav, amb_wav, mix = saida / "narracao.wav", saida / "ambiente.wav", saida / "mix.wav"
    if rotulos:
        script = saida / "mix_filtro.txt"
        script.write_text(";\n".join(filtros) + f";\n{''.join(rotulos)}amix=inputs={len(rotulos)}:normalize=0,apad=whole_dur={dur}[o]", encoding="utf-8")
        cmd = ["ffmpeg", "-y", "-loglevel", "error"]
        for e in entradas:
            cmd += ["-i", e]
        cmd += ["-/filter_complex", str(script), "-map", "[o]", "-t", str(dur), str(voz_wav)]
        subprocess.run(cmd, check=True)
    else:
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", f"anullsrc=r=44100:cl=stereo", "-t", str(dur), str(voz_wav)], check=True)
    # ambiente: vento grave (ruído marrom filtrado) + um zumbido baixo; abaixa sob a narração
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", f"anoisesrc=color=brown:amplitude=0.5:d={dur}",
                    "-f", "lavfi", "-i", f"sine=frequency=55:d={dur}",
                    "-filter_complex", "[0]lowpass=f=380,volume=0.35[a];[1]volume=0.04[b];[a][b]amix=2:normalize=0,"
                    "tremolo=f=0.1:d=0.5,aformat=channel_layouts=stereo[o]", "-map", "[o]", str(amb_wav)], check=True)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(voz_wav), "-i", str(amb_wav), "-filter_complex",
                    "[1][0]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=400[d];[0][d]amix=2:normalize=0,"
                    "loudnorm=I=-15:TP=-1.5:LRA=11[o]", "-map", "[o]", "-ar", "44100", str(mix)], check=True)
    final = saida / (f"parte{n:02d}" + ("_previa_sem_voz" if sem_voz else "") + ".mp4")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(FPS), "-i", str(saida / "quadros" / "%06d.jpg"),
                    "-i", str(mix), "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
                    "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", str(final)], check=True)
    shutil.rmtree(saida / "quadros", ignore_errors=True)
    return final


def gerar_sfx(d: Path) -> None:
    """Efeitos sintetizados (sem banco de sons): tique seco, pulso de rádio, alarme e motor elétrico."""
    receitas = {
        "tic": "sine=frequency=2400:d=0.03,afade=t=out:st=0.005:d=0.025,volume=0.9",
        "pulso": "sine=frequency=880:d=0.09,afade=t=in:d=0.005,afade=t=out:st=0.06:d=0.03,volume=0.35",
        "alarme": "sine=frequency=1320:d=0.22,afade=t=out:st=0.17:d=0.05,volume=0.3",
        "motor": "sine=frequency=110:d=3.5,vibrato=f=6:d=0.4,afade=t=in:d=0.6,afade=t=out:st=2.4:d=1.1,volume=0.5",
    }
    for nome, f in receitas.items():
        arq = d / f"{nome}.wav"
        if not arq.exists():
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", f, "-ar", "44100", "-ac", "2", str(arq)], check=True)


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
        com_voz = all((CACHE / f"{chave(f['texto'])}.json").exists() for f in falas)
        vozes = {f["id"]: ({**ler_json(CACHE / f"{chave(f['texto'])}.json"), "audio": None} if com_voz else estimar(f["texto"])) for f in falas}
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
        print(f"  duração: {mmss(lt['duracao'])} · {len(lt['cenas'])} falas · {len(lt['capitulos'])} capítulos")
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
