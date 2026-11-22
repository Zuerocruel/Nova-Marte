"""
Operação Marte Zero · vídeo institucional (~1min30, 1080x1920) chamando para o site.

    python fabrica/institucional.py                 # grava, narra e monta → saida/divulgacao/institucional/institucional.mp4
    python fabrica/institucional.py --sem-voz       # prévia sem gastar créditos da ElevenLabs (tempos estimados)
    python fabrica/institucional.py --site URL      # outro endereço do site (padrão: o site no ar)

Usa partes REAIS do site (gravadas num navegador automático: home, cadastro SEM enviar, Mundo ao vivo, pop-up
da loja, cápsula e outdoor), um trecho de episódio de verdade e as imagens da apresentação. Narração com a mesma
voz dos episódios, legendas em pixel e a música da série. Só vai para Aprovações: nada é postado.
"""
from __future__ import annotations

import argparse
import asyncio
import shutil
import time
from pathlib import Path

from playwright.async_api import async_playwright

import audio
import config
import voz

PASTA = config.SAIDA / "divulgacao" / "institucional"
APRESENTACAO = config.SAIDA / "divulgacao" / "apresentacao"
W, H = 1080, 1920
SITE = f"https://{config.SITE_TELA}"
S = config.SITE_FALADO

# (id, fala, como mostrar)
ROTEIRO = [
    ("abertura", "Essa é a Operação Marte Zero: uma série diária em pixel art onde cada seguidor vira colono em Marte.",
     {"site": "/", "acao": "home"}),
    ("episodio", "Todo dia sai um episódio novo. A colônia levanta uma obra, enfrenta os perigos de Marte e chama os colonos pelo nome.",
     {"clip": "missao"}),
    ("entrar", f"Para entrar é simples: acesse {S} e insira o seu nome. É grátis e leva trinta segundos.",
     {"site": "/", "acao": "cadastro"}),
    ("ao_vivo", "Na hora, você ganha uma casa na colônia. E a colônia está ao vivo: procure o seu nome no mapa e veja os colonos vivendo o dia.",
     {"site": "/mundo", "acao": "mapa"}),
    ("loja", "Quer ir além? Na loja da colônia tem cápsula, pet, foguete, rover, outdoor e até eventos que mudam o episódio.",
     {"site": "/mundo", "acao": "loja"}),
    ("capsula", "Escolha a sua cápsula: clássica, estufa, observatório ou dupla. Ela vira a sua casa, no mapa e no vídeo.",
     {"site": "/mundo", "acao": "capsula"}),
    ("outdoor", "No outdoor holográfico, você escreve a sua mensagem e ela aparece na colônia.",
     {"site": "/mundo", "acao": "outdoor"}),
    ("pago", "Tudo o que você compra aparece depois do pagamento aprovado, e entra nos próximos episódios.",
     {"clip": "compras"}),
    ("lider", "E quem entra pelo site concorre a líder da colônia, com traje e tag exclusivos.",
     {"imagem": "apresentacao_4_todo_dia.png"}),
    ("fim", f"Acesse {S}, vire colono e siga a Operação Marte Zero para não perder o próximo episódio!",
     {"imagem": "apresentacao_5_acesse.png"}),
]
FOLGA = 0.45   # respiro entre as falas


# ---------------------------------------------------------------- ações no site (duram `dur` segundos)
async def esperar_ate(t_fim: float):
    resta = t_fim - time.monotonic()
    if resta > 0:
        await asyncio.sleep(resta)


async def home(pg, t_fim):
    await asyncio.sleep(2.5)                 # o topo do site (título e contador) aparece primeiro
    for _ in range(5):
        await pg.mouse.wheel(0, 70)
        await asyncio.sleep(0.6)
    await esperar_ate(t_fim)


async def cadastro(pg, t_fim):
    campo = pg.locator("#nome")
    await campo.scroll_into_view_if_needed()
    await asyncio.sleep(0.6)
    await campo.click()
    await campo.type("Ana Colona", delay=140)          # só digita para mostrar: o formulário NUNCA é enviado
    await asyncio.sleep(0.4)
    h = pg.locator("#handle")
    if await h.count():
        await h.click()
        await h.type("@ana.colona", delay=120)
    await esperar_ate(t_fim)


async def mapa(pg, t_fim):
    await asyncio.sleep(0.8)
    caixa = await pg.locator("canvas").first.bounding_box()
    if caixa:
        cx, cy = caixa["x"] + caixa["width"] / 2, caixa["y"] + caixa["height"] / 2
        await pg.mouse.move(cx, cy)
        for _ in range(4):
            await pg.mouse.wheel(0, -160)
            await asyncio.sleep(0.5)
        await pg.mouse.down()
        await pg.mouse.move(cx - 90, cy - 40, steps=25)
        await pg.mouse.up()
        await asyncio.sleep(0.8)
        await pg.mouse.down()                # passeia pelo bairro (sem buscar ninguém: nada de @ de colono real no vídeo)
        await pg.mouse.move(cx + 60, cy - 120, steps=40)
        await pg.mouse.up()
    await esperar_ate(t_fim)


async def abrir_loja(pg):
    b = pg.locator(".btn-comprar-vivo")
    await b.scroll_into_view_if_needed()
    await asyncio.sleep(0.5)
    for _ in range(8):   # o botão só responde depois que a página "acorda" (hidratação): tenta de novo
        await b.click()
        try:
            await pg.wait_for_selector(".modal-produto", timeout=4000)
            return
        except Exception:  # noqa: BLE001
            await pg.keyboard.press("Escape")
    raise RuntimeError("o pop-up da loja não abriu")


async def loja(pg, t_fim):
    caixa = pg.locator(".modal-caixa")
    for _ in range(10):
        await caixa.evaluate("e => e.scrollBy({top: 120, behavior: 'smooth'})")
        await asyncio.sleep(0.55)
    await esperar_ate(t_fim)


async def capsula(pg, t_fim):
    radios = pg.get_by_role("radio")
    n = await radios.count()
    while n and time.monotonic() < t_fim - 0.3:
        for i in range(n):
            await radios.nth(i).click()
            await asyncio.sleep(1.1)
            if time.monotonic() >= t_fim - 0.3:
                break
    await esperar_ate(t_fim)


async def outdoor(pg, t_fim):
    campo = pg.locator(".modal-caixa input[type=text], .modal-caixa input:not([type])").first
    await campo.click()
    await campo.type("ALÔ MARTE! SOU EU", delay=170)
    await esperar_ate(t_fim)


VARIANTES = [{"valor": "classica", "rotulo": "Clássica"}, {"valor": "estufa", "rotulo": "Estufa"},
             {"valor": "observatorio", "rotulo": "Observatório"}, {"valor": "dupla", "rotulo": "Dupla"}]


async def _com_variantes(route):
    """Se o banco ainda não tem as variantes da cápsula (migração 011), mostra as mesmas que a 011 grava."""
    import json
    r = await route.fetch()
    d = await r.json()
    lista = d if isinstance(d, list) else d.get("produtos", [])
    for x in lista:
        if x.get("slug") == "capsula-habitacional" and not x.get("opcoes"):
            x["opcoes"] = VARIANTES
    await route.fulfill(response=r, body=json.dumps(d))


async def abrir_produto(pg, texto):
    await abrir_loja(pg)
    await pg.locator(".modal-produto", has_text=texto).first.click()
    await asyncio.sleep(0.8)


# o que acontece ANTES de começar a contar (o vídeo começa já com o pop-up aberto e carregado)
PREPARO = {"loja": abrir_loja, "capsula": lambda pg: abrir_produto(pg, "abitacional"), "outdoor": lambda pg: abrir_produto(pg, "utdoor")}

ACOES = {"home": home, "cadastro": cadastro, "mapa": mapa, "loja": loja, "capsula": capsula, "outdoor": outdoor}


async def gravar_site(caminho: str, acao: str, dur: float, base: str, destino: Path) -> Path:
    """Grava a tela do site (celular de 540x960 em resolução 2x → 1080x1920) fazendo a ação por `dur` segundos."""
    tmp = PASTA / "tmp_video"
    tmp.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as pw:
        br = await pw.chromium.launch(channel="msedge")
        # celular de 540x960 (layout de celular do site); a montagem amplia 2x para 1080x1920
        ctx = await br.new_context(viewport={"width": W // 2, "height": H // 2}, is_mobile=True,
                                   record_video_dir=str(tmp), record_video_size={"width": W // 2, "height": H // 2})
        pg = await ctx.new_page()
        await pg.route("**/api/produtos*", _com_variantes)
        t_abre = time.monotonic()
        await pg.goto(base + caminho, wait_until="networkidle", timeout=90000)
        await pg.add_style_tag(content="nextjs-portal{display:none!important}")   # selo do modo de desenvolvimento
        await asyncio.sleep(1.2)
        if acao in PREPARO:
            await PREPARO[acao](pg)
            await asyncio.sleep(0.6)
        t0 = time.monotonic()
        await ACOES[acao](pg, t0 + dur)
        video = pg.video
        await ctx.close()
        await br.close()
        bruto = Path(await video.path())
    audio.ffmpeg("-ss", f"{t0 - t_abre:.2f}", "-i", bruto, "-t", f"{dur:.3f}", "-an",
                 "-vf", f"scale={W}:{H}:flags=lanczos,fps={config.FPS},format=yuv420p",
                 "-c:v", "libx264", "-preset", "medium", "-crf", "20", destino)
    bruto.unlink(missing_ok=True)
    return destino


def trecho_do_episodio(tipo: str, dur: float, destino: Path) -> Path:
    eps = sorted(p for p in config.SAIDA.glob("ep[0-9][0-9][0-9]/episodio_[0-9][0-9][0-9].mp4") if int(p.parent.name[2:]) < 900)
    if not eps:
        raise SystemExit("precisa de um episódio com voz pronto (o vídeo usa um trecho dele)")
    ep = eps[-1]
    lt = config.ler_json(ep.parent / "linha_do_tempo.json")
    cenas = [c for c in lt["cenas"] if c["id"].startswith(tipo)] or [c for c in lt["cenas"] if c["id"].startswith("missao")]
    ini = cenas[0]["inicio"] + 0.5
    audio.ffmpeg("-ss", f"{ini:.2f}", "-i", ep, "-t", f"{dur:.3f}", "-an",
                 "-filter_complex", f"[0:v]scale={W}:{H},split[a][b];[b]crop={W}:420:0:1180,boxblur=24:4,eq=brightness=-0.15[c];"
                 f"[a][c]overlay=0:1180,fps={config.FPS},format=yuv420p[v]", "-map", "[v]",
                 "-c:v", "libx264", "-preset", "medium", "-crf", "20", destino)
    return destino


def imagem_em_video(nome: str, dur: float, destino: Path) -> Path:
    """Slide 4:5 no meio da tela 9:16, com fundo desfocado dele mesmo e um zoom lento."""
    arq = APRESENTACAO / nome
    if not arq.exists():
        raise SystemExit("gere a apresentação antes (python fabrica/divulgacao.py --apresentacao)")
    frames = int(dur * config.FPS) + 1
    grafo = (f"[0:v]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},boxblur=30:3,eq=brightness=-0.25[fundo];"
             f"[0:v]scale=1000:-1:flags=neighbor,zoompan=z='min(1.0+on*0.0009,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
             f":d={frames}:s=1000x1250:fps={config.FPS}[slide];"
             f"[fundo][slide]overlay=(W-w)/2:(H-h)/2-60,format=yuv420p[v]")
    audio.ffmpeg("-loop", "1", "-t", f"{dur:.3f}", "-i", arq, "-filter_complex", grafo, "-map", "[v]",
                 "-t", f"{dur:.3f}", "-r", config.FPS, "-c:v", "libx264", "-preset", "medium", "-crf", "20", destino)
    return destino


# ---------------------------------------------------------------- montagem
def gerar(sem_voz: bool = False, base: str = SITE) -> Path:
    PASTA.mkdir(parents=True, exist_ok=True)
    roteiro = {"cenas": [{"id": i, "fala": f} for i, f, _ in ROTEIRO]}
    falas = voz.gerar_falas(roteiro, sem_voz)
    cenas, t = [], 0.0
    for i, fala, como in ROTEIRO:
        fv = falas[i]
        dur = round(fv["duracao"] + FOLGA, 3)
        cenas.append({"id": i, "fala": fala, "como": como, "inicio": t, "fim": t + dur, "fala_inicio": t + 0.15,
                      "audio": fv.get("audio"),
                      "palavras": [{"p": w["p"], "i": w["i"] + t + 0.15, "f": w["f"] + t + 0.15} for w in fv["palavras"]]})
        t += dur
    lt = {"cenas": cenas, "duracao": round(t, 3)}
    print(f"duração: {t:.1f}s")

    partes = []
    for k, c in enumerate(cenas):
        dur, destino = c["fim"] - c["inicio"], PASTA / f"parte_{k:02d}.mp4"
        como = c["como"]
        print(f"  [{c['id']}] {dur:.1f}s · {como}")
        if "site" in como:
            asyncio.run(gravar_site(como["site"], como["acao"], dur, base, destino))
        elif "clip" in como:
            trecho_do_episodio(como["clip"], dur, destino)
        else:
            imagem_em_video(como["imagem"], dur, destino)
        partes.append(destino)

    lista = PASTA / "partes.txt"
    lista.write_text("".join(f"file '{p.name}'\n" for p in partes), encoding="utf-8")
    audio.ffmpeg("-f", "concat", "-safe", "0", "-i", lista.name, "-c", "copy", "video.mp4", cwd=PASTA)
    print(f"  música: {audio.gerar_musica(PASTA / 'musica.wav', lt['duracao'])}")
    tem_voz = audio.gerar_narracao(PASTA / "narracao.wav", lt)
    audio.mixar(PASTA / "musica.wav", PASTA / "narracao.wav", PASTA / "mix.wav", tem_voz)
    print(f"  legendas: {audio.gerar_legendas(PASTA / 'legendas.ass', lt)} eventos")
    fontes = Path("..", "..", "..", "fontes").as_posix()
    final = PASTA / ("institucional.mp4" if not sem_voz else "institucional_previa_sem_voz.mp4")
    audio.ffmpeg("-i", "video.mp4", "-i", "mix.wav", "-vf", f"ass=legendas.ass:fontsdir={fontes},format=yuv420p",
                 "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-profile:v", "high", "-r", config.FPS,
                 "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", final.name, cwd=PASTA)
    (PASTA / "roteiro.txt").write_text("\n\n".join(f"[{c['id']}] {c['fala']}" for c in cenas) + "\n", encoding="utf-8")
    for p in [*partes, lista, PASTA / "video.mp4", PASTA / "musica.wav", PASTA / "narracao.wav", PASTA / "mix.wav"]:
        p.unlink(missing_ok=True)
    shutil.rmtree(PASTA / "tmp_video", ignore_errors=True)
    return final


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--sem-voz", action="store_true")
    ap.add_argument("--site", default=SITE)
    a = ap.parse_args()
    print(gerar(a.sem_voz, a.site.rstrip("/")))
