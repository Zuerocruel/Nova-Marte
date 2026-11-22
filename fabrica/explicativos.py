"""
Operação Marte Zero · vídeos explicativos (mesmo motor do institucional.py), vertical OU horizontal:

    python fabrica/explicativos.py cargos          # cargos de Nova Marte, cada um dá uma voltinha (vertical)
    python fabrica/explicativos.py convite         # como convidar pessoas com o seu link (vertical)
    python fabrica/explicativos.py novidade_chat   # chat ao vivo + online agora (vertical)
    python fabrica/explicativos.py novidade_central  # central do colono: missões, épicas, minigames, ranking
    python fabrica/explicativos.py novidade_moedas # loja de moedas x loja paga (vertical)
    python fabrica/explicativos.py youtube_longo   # 5–10 min HORIZONTAL para o YouTube (com os eps. 1 e 2)
    ... --sem-voz  (prévia sem gastar ElevenLabs)   --site URL (padrão: o site no ar)

Saída em saida/divulgacao/videos/<nome>/: video.mp4, roteiro.txt, copies.txt (e thumb.png no longo). Tudo vai para
Aprovações no painel: nada é postado sozinho. Partes que dependem de login ou da migração 013 (convite, central, loja
de moedas, chat) são gravadas com DADOS DE DEMONSTRAÇÃO (nomes fictícios; nada é gravado no banco).
"""
from __future__ import annotations

import argparse
import asyncio
import json
import re
import shutil
import time
from pathlib import Path

from playwright.async_api import async_playwright

import audio
import config
import institucional as I
import voz

SAIDA = config.SAIDA / "divulgacao" / "videos"
S = config.SITE_FALADO
L = config.liderancas()

# ---------------------------------------------------------------- dados de demonstração (sem gente de verdade)
DEMO = {
    "/api/convite": {"logado": True, "codigo": "NM000123", "link": f"https://{config.SITE_TELA}/c/NM000123", "trouxe": 4},
    "/api/presenca": {"online": 3, "colonos_online": [], "total_colonos": 0},   # total real preenchido em gerar()
    "/api/jogo": {
        "logado": True, "codigo": "NM000123", "nome": "Astro_Ana", "moedas": 640, "xp": 520, "nivel": 4, "xp_nivel": 450, "xp_proximo": 800,
        "diarias": [{"id": "d1", "titulo": "Visitar a colônia hoje", "moedas": 15, "xp": 10, "feita": True, "resgatada": True},
                    {"id": "d2", "titulo": "Jogar 2 partidas de minigame", "moedas": 20, "xp": 15, "feita": True, "resgatada": False, "progresso": "2/2"},
                    {"id": "d3", "titulo": "Fazer 100 pontos numa partida", "moedas": 25, "xp": 20, "feita": False, "resgatada": False, "progresso": "64/100"}],
        "epicas": [{"id": "e1", "titulo": "ÉPICA · Trazer 1 colono novo com o seu link de convite", "moedas": 300, "xp": 150, "feita": True, "resgatada": False, "progresso": "1/1"},
                   {"id": "e2", "titulo": "ÉPICA · Jogar os 3 minigames na semana", "moedas": 120, "xp": 80, "feita": False, "resgatada": False, "progresso": "2/3"},
                   {"id": "e3", "titulo": "ÉPICA · Resgatar a visita diária em 5 dias da semana", "moedas": 200, "xp": 120, "feita": False, "resgatada": False, "progresso": "3/5"}],
        "minigames": [{"slug": "laser", "nome": "Laser de Precisão", "descricao": "Acerte o laser no alvo que se mexe.", "moedas_max": 30},
                      {"slug": "meteoros", "nome": "Chuva de Meteoros", "descricao": "Desvie dos meteoros e pegue os cristais.", "moedas_max": 30},
                      {"slug": "reator", "nome": "Estabilize o Reator", "descricao": "Toque na faixa verde.", "moedas_max": 30, "travado_ate": None}],
        "ranking": [{"posicao": i + 1, "codigo": f"NM9{i:05d}", "nome": n, "xp": x} for i, (n, x) in enumerate(
            [("Astro_Ana", 520), ("Capitão Léo", 470), ("Mari.Rover", 410), ("Zeca do Gelo", 360), ("Bia Orbital", 300)])],
    },
    "/api/jogo/missao": {"ok": True, "moedas": 660, "xp": 535, "ganhou": {"moedas": 20, "xp": 15}},
    "/api/loja-moedas": {"logado": True, "moedas": 1180, "seed": 7, "vestido": None, "meus": ["cor-azul-orbita"],
                         "itens": [{k: v for k, v in x.items()} for x in config.ler_json(config.FABRICA / "loja_moedas.json")["itens"]]},
    "/api/chat": {"mensagens": [
        {"id": 900 + i, "texto": t, "em": "", "codigo": f"NM9{i:05d}", "nome": n, "seed": 11 + i * 7, "sprite_url": None, "pos_x": 2 + i, "pos_y": -4}
        for i, (n, t) in enumerate([("Astro_Ana", "bom dia, colônia! 🚀"), ("Capitão Léo", "alguém viu a tempestade de ontem?"),
                                    ("Mari.Rover", "minha cápsula estufa ficou linda"), ("Zeca do Gelo", "bora bater o recorde do laser hoje"),
                                    ("Bia Orbital", "cheguei agora, oi gente! 👋")])]},
}


async def _demo(route, chave):
    corpo = json.loads(json.dumps(DEMO[chave]))
    if chave == "/api/chat":
        from datetime import datetime, timezone
        for m in corpo["mensagens"]:
            m["em"] = datetime.now(timezone.utc).isoformat()
    if chave == "/api/loja-moedas" and route.request.method == "POST":
        corpo = {"ok": True, "moedas": 280}
    await route.fulfill(status=200, content_type="application/json", body=json.dumps(corpo))


# ---------------------------------------------------------------- ações novas (somam às do institucional)
async def rolar(pg, t_fim, passos=8, px=110, pausa=0.7):
    for _ in range(passos):
        if time.monotonic() > t_fim - 0.5:
            break
        await pg.mouse.wheel(0, px)
        await asyncio.sleep(pausa)
    await I.esperar_ate(t_fim)


async def convite(pg, t_fim):
    box = pg.locator(".convite")
    await box.scroll_into_view_if_needed()
    await asyncio.sleep(1.5)
    await pg.locator(".convite .btn").click()          # "Copiar" (só copia: nada é enviado)
    await I.esperar_ate(t_fim)


async def central(pg, t_fim):
    await asyncio.sleep(1.2)
    b = pg.locator(".missao .btn:not([disabled])").first
    if await b.count():
        await b.click()
    await rolar(pg, t_fim, passos=10, px=120, pausa=0.8)


async def jogar(pg, t_fim):
    await pg.locator("text=▶ Jogar").click()
    cv = await pg.locator(".minigame canvas").bounding_box()
    cx, cy = cv["x"] + cv["width"] / 2, cv["y"] + cv["height"] * 0.55
    while time.monotonic() < t_fim - 0.3:
        await pg.mouse.click(cx, cy)
        await asyncio.sleep(0.55)
    await I.esperar_ate(t_fim)


async def chat(pg, t_fim):
    lista = pg.locator(".chat-lista")
    if await lista.count():
        await lista.scroll_into_view_if_needed()
    await I.esperar_ate(t_fim)


async def loja_moedas(pg, t_fim):
    await asyncio.sleep(1.5)
    await rolar(pg, t_fim, passos=6, px=140, pausa=0.9)


async def loja_paga(pg, t_fim):
    await rolar(pg, t_fim, passos=10, px=160, pausa=0.7)


async def esperar(pg, t_fim):
    await I.esperar_ate(t_fim)


I.ACOES.update({"convite": convite, "central": central, "jogar": jogar, "chat": chat, "loja_moedas": loja_moedas,
                "loja_paga": loja_paga, "esperar": esperar})
DEMO_DA_ACAO = {"convite": ["/api/convite"], "central": ["/api/jogo", "/api/jogo/missao", "/api/convite"],
                "chat": ["/api/chat", "/api/presenca"], "loja_moedas": ["/api/loja-moedas"], "mapa": ["/api/presenca"]}


async def gravar(caminho: str, acao: str, dur: float, base: str, destino: Path, demos: list[str]) -> Path:
    """Igual ao institucional.gravar_site, mais as respostas de demonstração e o formato (vertical/horizontal)."""
    tmp = destino.parent / "tmp_video"
    tmp.mkdir(parents=True, exist_ok=True)
    vw, vh = I.W // 2, I.H // 2
    async with async_playwright() as pw:
        br = await pw.chromium.launch(channel="msedge")
        ctx = await br.new_context(viewport={"width": vw, "height": vh}, is_mobile=I.W < I.H,
                                   record_video_dir=str(tmp), record_video_size={"width": vw, "height": vh})
        await ctx.add_init_script("try{sessionStorage.setItem('omz_entrada','1')}catch(e){}")
        pg = await ctx.new_page()
        await pg.route("**/api/produtos*", I._com_variantes)
        for chave in demos:
            await pg.route(f"**{chave}", lambda r, _req=None, c=chave: _demo(r, c))
            await pg.route(f"**{chave}?*", lambda r, _req=None, c=chave: _demo(r, c))
        t_abre = time.monotonic()
        url = caminho if caminho.startswith(("file:", "http")) else base + caminho
        await pg.goto(url, wait_until="load", timeout=120000)   # o mapa e o chat ficam buscando dados: "networkidle" nunca chega
        await asyncio.sleep(2.0)
        await pg.add_style_tag(content="nextjs-portal{display:none!important}")
        await asyncio.sleep(1.2)
        if acao in I.PREPARO:
            await I.PREPARO[acao](pg)
            await asyncio.sleep(0.6)
        t0 = time.monotonic()
        await I.ACOES[acao](pg, t0 + dur)
        video = pg.video
        await pg.unroute_all(behavior="ignoreErrors")   # respostas de demonstração pendentes não derrubam o fechamento
        await ctx.close()
        await br.close()
        bruto = Path(await video.path())
    audio.ffmpeg("-ss", f"{t0 - t_abre:.2f}", "-i", bruto, "-t", f"{dur:.3f}", "-an",
                 "-vf", f"scale={I.W}:{I.H}:flags=lanczos,fps={config.FPS},format=yuv420p",
                 "-c:v", "libx264", "-preset", "medium", "-crf", "20", destino)
    bruto.unlink(missing_ok=True)
    return destino


# ---------------------------------------------------------------- animação dos cargos (cada um dá uma voltinha)
def pagina_cargos(pasta: Path) -> Path:
    dj = (config.FABRICA / "diretor.js").read_text(encoding="utf-8")
    sprite = dj[dj.index("const PELES"):dj.index("\n}\n", dj.index("function gerarSprite(seed)")) + 3]
    traje = (config.FABRICA / "traje.js").read_text(encoding="utf-8")
    fonte = (config.FABRICA / "fontes" / "PressStart2P-Regular.ttf").as_uri()
    html = f"""<!doctype html><meta charset="utf-8"><style>@font-face{{font-family:P;src:url('{fonte}')}}html,body{{margin:0;background:#140f26;overflow:hidden}}canvas{{width:100vw;height:100vh;display:block}}</style>
<canvas id=c></canvas><script>{sprite}
{traje}
const CARGOS = {json.dumps(list(L.values()), ensure_ascii=False)};
const q = new URLSearchParams(location.search), I = +q.get('i'), cv = document.getElementById('c'), x = cv.getContext('2d');
const spr = (seed, lid) => {{ const g = vestirTraje(gerarSprite(seed), lid), c = document.createElement('canvas'); c.width = c.height = 12; const k = c.getContext('2d');
  g.forEach((l, j) => l.forEach((cor, i) => {{ if (cor) {{ k.fillStyle = cor; k.fillRect(i, j, 1, 1); }} }})); return c; }};
const S = CARGOS.map((c, k) => spr(7 + k * 13, c));
const t0 = performance.now();
function txt(s, X, Y, tam, cor, max) {{ let t = tam; x.font = t + 'px P'; while (x.measureText(s).width > max && t > 8) {{ t -= 1; x.font = t + 'px P'; }}
  x.fillStyle = '#0009'; x.fillText(s, X + 3, Y + 3); x.fillStyle = cor; x.fillText(s, X, Y); }}
function quadro() {{
  const W = cv.width = innerWidth * 2, H = cv.height = innerHeight * 2, t = (performance.now() - t0) / 1000, u = Math.min(W, H) / 100;
  x.imageSmoothingEnabled = false; x.textAlign = 'center';
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#140f26'); g.addColorStop(0.6, '#3a1f3a'); g.addColorStop(1, '#a94f33');
  x.fillStyle = g; x.fillRect(0, 0, W, H); x.fillStyle = '#a94f33'; x.fillRect(0, H * 0.72, W, H * 0.28);
  for (let i = 0; i < 60; i++) {{ x.fillStyle = '#ffffff44'; x.fillRect((i * 97.3 % 1) * W || (i * 131) % W, (i * 57) % (H * 0.6), u * 0.4, u * 0.4); }}
  const c = CARGOS[I];
  // a fila da cadeia de comando, pequenina, embaixo (o cargo da vez em destaque)
  const n = CARGOS.length, passo = Math.min(u * 7, (W - u * 8) / n);
  CARGOS.forEach((o, k) => {{ const px = W / 2 + (k - (n - 1) / 2) * passo, py = H * 0.93; x.globalAlpha = k === I ? 1 : 0.45;
    x.drawImage(S[k], px - u * 2.4, py - u * 4.8, u * 4.8, u * 4.8); if (k < n - 1) {{ x.fillStyle = '#ffffff33'; x.fillRect(px + u * 2.6, py - u * 2.4, passo - u * 5.2, u * 0.4); }} }});
  x.globalAlpha = 1;
  // a voltinha: anda em elipse, vira de lado, pula de leve
  const a = t * 1.6, cx = W / 2 + Math.cos(a) * W * 0.22, cy = H * 0.62 + Math.sin(a) * H * 0.05, esc = u * (W < H ? 4.2 : 3.4), dir = -Math.sin(a) >= 0 ? 1 : -1;
  const pulo = Math.abs(Math.sin(t * 9)) * esc * 0.6;
  x.fillStyle = '#0005'; x.beginPath(); x.ellipse(cx, cy + esc * 6.2, esc * 4, esc * 1.1, 0, 0, 7); x.fill();
  x.save(); x.translate(cx, cy - pulo); x.scale(dir, 1); x.drawImage(S[I], -esc * 6, -esc * 6, esc * 12, esc * 12); x.restore();
  const tamTag = u * 2.4; x.font = tamTag + 'px P'; const tw = x.measureText(c.tag).width + u * 3;
  x.fillStyle = '#140f26e6'; x.fillRect(cx - tw / 2, cy - pulo - esc * 6 - u * 6, tw, u * 4.2); x.fillStyle = c.cor; x.fillRect(cx - tw / 2, cy - pulo - esc * 6 - u * 6, tw, u * 0.5);
  x.fillStyle = c.cor; x.fillText(c.tag, cx, cy - pulo - esc * 6 - u * 2.8);
  txt('CARGOS DE NOVA MARTE', W / 2, H * 0.08, u * 3.2, '#ffc83d', W * 0.9);
  txt((I + 1) + 'º · ' + c.nome.toUpperCase(), W / 2, H * 0.16, u * 3.6, c.cor, W * 0.92);
  x.font = (u * 2.1) + 'px system-ui'; x.fillStyle = '#f3eefe'; x.fillText(c.descricao, W / 2, H * 0.21, W * 0.92);
  requestAnimationFrame(quadro);
}}
requestAnimationFrame(quadro);
</script>"""
    arq = pasta / "cargos.html"
    arq.write_text(html, encoding="utf-8")
    return arq


# ---------------------------------------------------------------- imagens e episódios em qualquer formato
def imagem(arq: Path, dur: float, destino: Path) -> Path:
    frames = int(dur * config.FPS) + 1
    sw = int(min(I.W * 0.92, (I.H - 120) * 0.8)) // 2 * 2
    sh = int(sw * 1.25) // 2 * 2
    if sh > I.H - 80:
        sh = (I.H - 80) // 2 * 2
        sw = int(sh * 0.8) // 2 * 2
    grafo = (f"[0:v]scale={I.W}:{I.H}:force_original_aspect_ratio=increase,crop={I.W}:{I.H},boxblur=30:3,eq=brightness=-0.25[fundo];"
             f"[0:v]scale={sw}:-1:flags=neighbor,zoompan=z='min(1.0+on*0.0009,1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
             f":d={frames}:s={sw}x{sh}:fps={config.FPS}[slide];[fundo][slide]overlay=(W-w)/2:(H-h)/2,format=yuv420p[v]")
    audio.ffmpeg("-loop", "1", "-t", f"{dur:.3f}", "-i", arq, "-filter_complex", grafo, "-map", "[v]",
                 "-t", f"{dur:.3f}", "-r", config.FPS, "-c:v", "libx264", "-preset", "medium", "-crf", "20", destino)
    return destino


def episodio_inteiro(n: int, destino: Path) -> tuple[Path, float]:
    """Episódio completo (com o áudio dele). No horizontal, o vídeo 9:16 fica no meio com o fundo desfocado."""
    ep = config.pasta_episodio(n) / f"episodio_{n:03d}.mp4"
    dur = audio_dur(ep)
    if I.W > I.H:
        grafo = (f"[0:v]scale={I.W}:{I.H}:force_original_aspect_ratio=increase,crop={I.W}:{I.H},boxblur=40:3,eq=brightness=-0.3[f];"
                 f"[0:v]scale=-2:{I.H}[e];[f][e]overlay=(W-w)/2:0,fps={config.FPS},format=yuv420p[v]")
    else:
        grafo = f"[0:v]scale={I.W}:{I.H},fps={config.FPS},format=yuv420p[v]"
    # o áudio do episódio pode ser mais longo que a imagem: estica o último quadro até o fim do áudio (sincronia)
    grafo = grafo.replace("[v]", ",tpad=stop_mode=clone:stop_duration=60[v]")
    audio.ffmpeg("-i", ep, "-filter_complex", grafo, "-map", "[v]", "-an", "-t", f"{dur:.3f}",
                 "-c:v", "libx264", "-preset", "medium", "-crf", "20", destino)
    audio.ffmpeg("-i", ep, "-vn", "-ac", "2", "-ar", "48000", destino.with_suffix(".wav"))
    return destino, dur


def audio_dur(arq: Path) -> float:
    return voz.duracao_mp3(arq)


# ---------------------------------------------------------------- roteiros
def _cargos():
    r = [("abertura", "Nova Marte tem uma cadeia de comando. Conheça os cargos de liderança da colônia, cada um com traje e tag exclusivos.", {"anim": 0})]
    for k, c in enumerate(L.values()):
        r.append((c["id"], f"{c['nome']}. {c['descricao']}", {"anim": k}))
    r.append(("fim", f"Quem entra pelo site e convida mais gente concorre a um cargo. Acesse {S} e vire colono!", {"imagem": "apresentacao_5_acesse.png"}))
    return r


ROTEIROS = {
    "cargos": {"formato": "vertical", "titulo": "Cargos de Nova Marte", "roteiro": _cargos},
    "convite": {"formato": "vertical", "titulo": "Como convidar pessoas com o seu link", "roteiro": lambda: [
        ("o_que", "Sabia que você tem um link de convite só seu? Quem entra por ele vira colono e conta pontos para você.", {"site": "/mundo", "acao": "convite"}),
        ("onde", "É fácil achar: entre na Colônia ao vivo com a sua conta. Logo abaixo do chat está o seu link.", {"site": "/mundo", "acao": "convite"}),
        ("copiar", "Toque em copiar. Pronto: o link está guardado no seu celular.", {"site": "/mundo", "acao": "convite"}),
        ("mandar", "Agora é só colar e mandar no grupo da família, para os amigos, ou nos seus stories.", {"imagem": "@stories/story_2_como_funciona.png"}),
        ("conta", "Cada pessoa que se cadastrar pelo seu link aparece na sua conta, e ela já nasce com uma casa na colônia.", {"site": "/central", "acao": "central"}),
        ("premio", "Quem mais convida concorre a cargos de verdade: líder, embaixador, festas. Com traje e tag exclusivos.", {"anim": 0}),
        ("fim", f"Copie o seu link agora em {S} e traga a sua tripulação para Marte!", {"imagem": "apresentacao_5_acesse.png"}),
    ]},
    "novidade_chat": {"formato": "vertical", "titulo": "Novidade: chat ao vivo e online agora", "roteiro": lambda: [
        ("novo", "Novidade na colônia: agora dá para ver quem está online agora!", {"site": "/mundo", "acao": "chat"}),
        ("online", "No topo do mapa aparecem quantas pessoas estão no site neste minuto e quantos colonos a série já tem.", {"site": "/mundo", "acao": "mapa"}),
        ("chat", "E o chat ao vivo está do lado do mapa: converse com quem está online. As mensagens viram balões em cima das casas.", {"site": "/mundo", "acao": "chat"}),
        ("limpo", "O chat se limpa sozinho a cada dez minutos: sempre conversa fresca.", {"site": "/mundo", "acao": "chat"}),
        ("fim", f"Entre agora em {S} e diga oi para a colônia!", {"imagem": "apresentacao_5_acesse.png"}),
    ]},
    "novidade_central": {"formato": "vertical", "titulo": "Novidade: central do colono", "roteiro": lambda: [
        ("novo", "Chegou a Central do Colono! Ganhe moedas e experiência todo dia.", {"site": "/central", "acao": "central"}),
        ("missoes", "Cumpra as missões diárias: visitar a colônia, jogar partidas e fazer pontos. Elas renovam à meia-noite.", {"site": "/central", "acao": "central"}),
        ("epicas", "E tem as missões épicas da semana, que pagam muito mais: como trazer um colono novo com o seu link.", {"site": "/central", "acao": "central"}),
        ("jogos", "Três minigames: acerte o laser no alvo que se mexe, desvie dos meteoros e estabilize o reator.", {"site": "/jogar/laser", "acao": "jogar"}),
        ("coracoes", "Cuidado: você tem três corações. Perdeu os três, aquele jogo descansa por doze horas.", {"site": "/jogar/reator", "acao": "jogar"}),
        ("ranking", "E o ranking da semana mostra os melhores colonos. Os três primeiros aparecem no episódio!", {"site": "/central", "acao": "central"}),
        ("fim", f"Abra a Central em {S} e comece a juntar moedas hoje!", {"imagem": "apresentacao_5_acesse.png"}),
    ]},
    "novidade_moedas": {"formato": "vertical", "titulo": "Novidade: loja de moedas", "roteiro": lambda: [
        ("novo", "Juntou moedas nos minigames? Agora elas têm onde ser gastas: a Loja de Moedas!", {"site": "/loja-moedas", "acao": "loja_moedas"}),
        ("itens", "Cores e trajes espaciais para o seu colono, e alguns trajes especiais raríssimos.", {"site": "/loja-moedas", "acao": "loja_moedas"}),
        ("paga", "Mas a loja da colônia continua sendo a que dá mais: o seu item aparece no episódio, muda a sua casa no mapa e tem eventos que mudam a história.", {"site": "/loja", "acao": "loja_paga"}),
        ("capsula", "Cápsula, pet, foguete, rover, outdoor com o seu texto e até a Fúria de Marte.", {"site": "/mundo", "acao": "loja"}),
        ("fim", f"Jogue, junte moedas e vista o seu colono em {S}!", {"imagem": "apresentacao_5_acesse.png"}),
    ]},
}


def _longo():
    return [
        ("abertura", "Bem-vindo à Operação Marte Zero! Uma série diária em pixel art onde cada pessoa que entra no site vira colono em Marte. Neste vídeo eu te mostro tudo: como entrar, a colônia ao vivo, os cargos, como convidar, a loja e as novidades. E no meio, os dois primeiros episódios completos.", {"site": "/", "acao": "home"}),
        ("ep1_intro", "Mas antes, vamos ver como tudo começou. Este é o episódio um.", {"imagem": "apresentacao_4_todo_dia.png"}),
        ("ep1", "", {"episodio": 1}),
        ("ep2_intro", "No episódio dois, a colônia já tinha os primeiros colonos de verdade. Olha só.", {"imagem": "apresentacao_3_colonia_ao_vivo.png"}),
        ("ep2", "", {"episodio": 2}),
        ("cadastro", f"Gostou? Então vamos entrar. Acesse {S}. Na página inicial tem o formulário: coloque o seu nome, o seu nick, o seu WhatsApp para entrar na conta e o seu arroba da rede social. Escolha o que você quer ser na colônia: engenheiro, piloto, botânico, médico. Pronto: em trinta segundos você vira colono.", {"site": "/", "acao": "cadastro"}),
        ("casa", "Na mesma hora você ganha uma casa no bairro da colônia. E todo colono novo aparece nos próximos episódios: a narradora fala o seu nome e a câmera vai até a sua casa.", {"site": "/mundo", "acao": "mapa"}),
        ("ao_vivo", "A colônia está ao vivo. No Mundo ao vivo você procura o seu nome, vê a sua casa e os colonos vivendo o dia: indo para a obra, para a praça, para a cantina. Tudo de verdade, no mesmo horário para todo mundo.", {"site": "/mundo", "acao": "mapa"}),
        ("chat", "Do lado do mapa tem o chat ao vivo e quantas pessoas estão online agora. As mensagens viram balões em cima das casas.", {"site": "/mundo", "acao": "chat"}),
        ("cargos", "A colônia tem uma cadeia de comando: líder, vice, engenharia mecânica, engenharia civil, plantação, saúde, guarda, ciência e mais. Cada cargo tem um traje e uma tag exclusivos, e quem é nomeado muda na hora, no site e no vídeo.", {"anim": 0}),
        ("cargos2", "Quem entra pelo site concorre a líder da colônia.", {"anim": 1}),
        ("convite", "E como subir? Convidando gente. Cada colono tem um link de convite só seu, logo abaixo do chat. Toque em copiar, mande para os amigos, e cada pessoa que entrar pelo seu link conta para você. Quem mais convida concorre a cargos: líder, embaixador, festas.", {"site": "/mundo", "acao": "convite"}),
        ("loja", "Agora a loja da colônia. É ela que muda a história: a cápsula vira a sua casa no mapa e no vídeo, o pet passeia no seu quintal, o foguete e o rover aparecem na frente da sua casa, o outdoor holográfico mostra o seu texto, e a Fúria de Marte muda o problema do episódio.", {"site": "/mundo", "acao": "loja"}),
        ("capsula", "Na cápsula você escolhe o modelo: clássica, estufa, observatório ou dupla.", {"site": "/mundo", "acao": "capsula"}),
        ("outdoor", "No outdoor você escreve a mensagem e já vê como vai ficar.", {"site": "/mundo", "acao": "outdoor"}),
        ("pagamento", "O pagamento é pela Cakto, por Pix ou cartão. O item só aparece depois que o pagamento é aprovado, e entra nos próximos episódios.", {"site": "/loja", "acao": "loja_paga"}),
        ("central", "Novidade: a Central do Colono. Missões diárias, missões épicas da semana, minigames e ranking. Você ganha moedas e experiência todo dia.", {"site": "/central", "acao": "central"}),
        ("jogos", "São três minigames: o laser, os meteoros e o reator. Você tem três corações: perdeu os três, aquele jogo descansa por doze horas.", {"site": "/jogar/laser", "acao": "jogar"}),
        ("moedas", "As moedas se gastam na loja de moedas: cores e trajes para o seu colono. E a loja paga continua sendo a que mais dá benefício.", {"site": "/loja-moedas", "acao": "loja_moedas"}),
        ("novidades", "E vem mais por aí: novos minigames, classes de colono, temporadas e eventos ao vivo. Episódio novo todo dia nos Shorts, e um resumo longo toda semana aqui no canal.", {"imagem": "apresentacao_4_todo_dia.png"}),
        ("fim", f"Então já sabe: acesse {S}, vire colono, convide a sua tripulação e se inscreva no canal para não perder nada. Até o próximo episódio!", {"imagem": "apresentacao_5_acesse.png"}),
    ]


ROTEIROS["youtube_longo"] = {"formato": "horizontal", "titulo": "Operação Marte Zero: o guia completo", "roteiro": _longo}

COPIES = {
    "cargos": "👑 Os cargos de Nova Marte!\n\nLíder, vice, engenharia, plantação, saúde, guarda... cada cargo tem traje e tag exclusivos.\nQuem entra pelo site e convida mais gente concorre a um cargo!\n\n💬 Qual cargo é a sua cara? Comenta!\n➡️ Vire colono: link na bio\n\n#pixelart #marte #serie #operacaomartezero",
    "convite": "🤝 Como convidar a sua tripulação para Marte\n\n1️⃣ Entre na Colônia ao vivo\n2️⃣ Toque em copiar no seu link\n3️⃣ Mande para os amigos\n\nQuem mais convida concorre a líder, embaixador e festas 👑\n➡️ Link na bio\n\n#pixelart #marte #operacaomartezero",
    "novidade_chat": "💬 NOVIDADE: chat ao vivo + online agora na colônia!\n\nVeja quem está no site neste minuto e converse com a colônia. As mensagens viram balões em cima das casas 🏠\n➡️ Link na bio\n\n#pixelart #marte #operacaomartezero",
    "novidade_central": "🎮 NOVIDADE: Central do Colono!\n\nMissões diárias, épicas, 3 minigames e ranking semanal. Os 3 primeiros aparecem no episódio 🏆\n❤️ Cuidado com os 3 corações!\n➡️ Link na bio\n\n#pixelart #minigame #marte #operacaomartezero",
    "novidade_moedas": "🪙 NOVIDADE: Loja de Moedas!\n\nGaste as moedas dos minigames em cores e trajes espaciais.\nE a loja da colônia continua dando MUITO mais: seu item aparece no episódio 🚀\n➡️ Link na bio\n\n#pixelart #marte #operacaomartezero",
}


CAPITULOS = [("abertura", "O que é a Operação Marte Zero"), ("ep1_intro", "Episódio 1 completo"), ("ep2_intro", "Episódio 2 completo"),
             ("cadastro", "Como se cadastrar (30 segundos)"), ("ao_vivo", "Colônia ao vivo e sua casa no mapa"), ("chat", "Chat ao vivo e online agora"),
             ("cargos", "Cargos de Nova Marte"), ("convite", "Como convidar com o seu link"), ("loja", "Loja da colônia: cápsula, pet, foguete…"),
             ("pagamento", "Pagamento e quando o item aparece"), ("central", "Central do colono: missões e minigames"),
             ("moedas", "Loja de moedas"), ("novidades", "Novidades que vêm por aí")]


def copies_longo(pasta: Path) -> Path:
    """Título, descrição COM link, capítulos (tempos reais do vídeo), hashtags e gancho de novidades. Não posta nada."""
    ini = {c["id"]: c["inicio"] for c in json.loads((pasta / "cenas.json").read_text(encoding="utf-8"))}
    mmss = lambda t: f"{int(t // 60)}:{int(t % 60):02d}"
    caps = "\n".join(f"{mmss(ini[i] if i != 'abertura' else 0)} {nome}" for i, nome in CAPITULOS if i in ini)
    link = f"https://{config.SITE_TELA}/l/yt-bio"
    texto = f"""TÍTULO (até 100 caracteres):
Vire PERSONAGEM de uma série em Marte! Guia completo da Operação Marte Zero 🚀

DESCRIÇÃO:
🚀 A Operação Marte Zero é uma série diária em pixel art onde CADA PESSOA que entra no site vira colono em Marte.
Neste guia: como se cadastrar, a colônia ao vivo, os cargos, como convidar, a loja e as novidades, com os episódios 1 e 2 completos.

👉 Vire personagem agora (grátis, 30 segundos): {link}

⏱️ CAPÍTULOS
{caps}

🔥 NOVIDADES QUE VÊM POR AÍ
Novos minigames, classes de colono, temporadas com itens que só existem naquele mês e eventos ao vivo na colônia.
Quem entra pelo site e convida mais gente concorre a líder da colônia 👑

📺 Episódio novo TODO DIA nos Shorts · resumo longo toda semana aqui no canal.
🔔 Inscreva-se e ative o sininho para acompanhar a colônia crescer.

#pixelart #marte #animação #serie #operacaomartezero

TAGS:
operação marte zero, pixel art, marte, série animada, colônia em marte, vire personagem, minigame, animação brasileira

COMENTÁRIO FIXADO:
Já é colono? 🚀 Entra aqui e procura o seu nome no mapa: {link}
"""
    arq = pasta / "copies.txt"
    arq.write_text(texto, encoding="utf-8")
    return arq


def legendas_no_formato(arq: Path) -> None:
    """O ASS da fábrica é feito para 1080x1920; no horizontal ajusta a tela, a fonte e a altura."""
    if I.W <= I.H:
        return
    s = arq.read_text(encoding="utf-8")
    s = re.sub(r"PlayResX: \d+", f"PlayResX: {I.W}", s)
    s = re.sub(r"PlayResY: \d+", f"PlayResY: {I.H}", s)
    s = s.replace("Style: Legenda,Press Start 2P,46,", "Style: Legenda,Press Start 2P,40,").replace(",60,60,520,1", ",160,160,70,1")
    arq.write_text(s, encoding="utf-8")


def gerar(nome: str, sem_voz: bool = False, base: str = I.SITE) -> Path:
    cfg = ROTEIROS[nome]
    try:   # nada de número inventado: o total de colonos é o de verdade
        import episodio
        DEMO["/api/presenca"]["total_colonos"] = episodio.Supabase().contar("personagens", {"oculto": "eq.false"})
    except Exception:  # noqa: BLE001
        pass
    I.W, I.H = (1920, 1080) if cfg["formato"] == "horizontal" else (1080, 1920)
    pasta = SAIDA / nome
    pasta.mkdir(parents=True, exist_ok=True)
    roteiro = cfg["roteiro"]()
    falas = voz.gerar_falas({"cenas": [{"id": i, "fala": f} for i, f, _ in roteiro if f]}, sem_voz)
    html_cargos = pagina_cargos(pasta) if any("anim" in c for _, _, c in roteiro) else None
    ult = max(int(p.parent.name[2:]) for p in config.SAIDA.glob("ep[0-9][0-9][0-9]/stories") if int(p.parent.name[2:]) < 900) \
        if list(config.SAIDA.glob("ep[0-9][0-9][0-9]/stories")) else None

    cenas, partes, faixas, t = [], [], [], 0.0
    for k, (i, fala, como) in enumerate(roteiro):
        destino = pasta / f"parte_{k:02d}.mp4"
        if "episodio" in como:
            _, dur = episodio_inteiro(como["episodio"], destino)
            faixas.append((destino.with_suffix(".wav"), t, dur))
            cenas.append({"id": i, "fala": "", "inicio": t, "fim": t + dur, "fala_inicio": t, "audio": None, "palavras": [], "episodio": como["episodio"]})
        else:
            fv = falas[i]
            dur = round(fv["duracao"] + I.FOLGA, 3)
            print(f"  [{i}] {dur:.1f}s · {como}")
            if "site" in como:
                acao = como["acao"]
                asyncio.run(gravar(como["site"], acao, dur, base, destino, DEMO_DA_ACAO.get(acao, [])))
            elif "anim" in como:
                asyncio.run(gravar(html_cargos.as_uri() + f"?i={como['anim']}", "esperar", dur, base, destino, []))
            else:
                nome_img = como["imagem"]
                arq = (config.pasta_episodio(ult) / "stories" / nome_img[len("@stories/"):]) if nome_img.startswith("@stories/") and ult \
                    else I.APRESENTACAO / nome_img
                imagem(arq, dur, destino)
            cenas.append({"id": i, "fala": fala, "inicio": t, "fim": t + dur, "fala_inicio": t + 0.15, "audio": fv.get("audio"),
                          "palavras": [{"p": w["p"], "i": w["i"] + t + 0.15, "f": w["f"] + t + 0.15} for w in fv["palavras"]]})
        partes.append(destino)
        t += cenas[-1]["fim"] - cenas[-1]["inicio"]
    lt = {"cenas": cenas, "duracao": round(t, 3)}
    print(f"duração: {t:.1f}s")

    (pasta / "partes.txt").write_text("".join(f"file '{p.name}'\n" for p in partes), encoding="utf-8")
    audio.ffmpeg("-f", "concat", "-safe", "0", "-i", "partes.txt", "-c", "copy", "video.mp4", cwd=pasta)
    audio.gerar_musica(pasta / "musica.wav", lt["duracao"])
    tem_voz = audio.gerar_narracao(pasta / "narracao.wav", lt)
    audio.mixar(pasta / "musica.wav", pasta / "narracao.wav", pasta / "mix.wav", tem_voz)
    if faixas:   # episódios inteiros: a trilha da série some e entra o áudio do episódio
        entradas, filtros = ["-i", "mix.wav"], []
        cala = "+".join(f"between(t,{a:.2f},{a + d:.2f})" for _, a, d in faixas)
        filtros.append(f"[0:a]volume=enable='{cala}':volume=0[base]")
        for j, (w, a, _) in enumerate(faixas, 1):
            entradas += ["-i", w.name]
            filtros.append(f"[{j}:a]adelay={int(a * 1000)}|{int(a * 1000)}[e{j}]")
        filtros.append("[base]" + "".join(f"[e{j}]" for j in range(1, len(faixas) + 1)) +
                       f"amix=inputs={len(faixas) + 1}:normalize=0:duration=first[out]")
        audio.ffmpeg(*entradas, "-filter_complex", ";".join(filtros), "-map", "[out]", "mix2.wav", cwd=pasta)
        (pasta / "mix2.wav").replace(pasta / "mix.wav")
    audio.gerar_legendas(pasta / "legendas.ass", lt)
    legendas_no_formato(pasta / "legendas.ass")
    fontes = Path("..", "..", "..", "..", "fontes").as_posix()
    final = pasta / ("video.final.mp4")
    audio.ffmpeg("-i", "video.mp4", "-i", "mix.wav", "-vf", f"ass=legendas.ass:fontsdir={fontes},format=yuv420p",
                 "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-profile:v", "high", "-r", config.FPS,
                 "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", final.name, cwd=pasta)
    saida = pasta / ("video.mp4" if not sem_voz else "video_previa_sem_voz.mp4")
    final.replace(saida)
    (pasta / "roteiro.txt").write_text("\n\n".join(f"[{c['id']}] {c['fala'] or '(episódio ' + str(c.get('episodio')) + ' completo)'}"
                                                   for c in cenas) + "\n", encoding="utf-8")
    (pasta / "cenas.json").write_text(json.dumps([{"id": c["id"], "inicio": round(c["inicio"], 1)} for c in cenas]), encoding="utf-8")
    if nome in COPIES:
        (pasta / "copies.txt").write_text(COPIES[nome] + "\n", encoding="utf-8")
    if nome == "youtube_longo":
        copies_longo(pasta)
    for p in [*partes, *[f for f, _, _ in faixas], pasta / "partes.txt", pasta / "musica.wav", pasta / "narracao.wav", pasta / "mix.wav"]:
        p.unlink(missing_ok=True)
    shutil.rmtree(pasta / "tmp_video", ignore_errors=True)
    return saida


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("nome", choices=list(ROTEIROS))
    ap.add_argument("--sem-voz", action="store_true")
    ap.add_argument("--site", default=I.SITE)
    ap.add_argument("--so-copies", action="store_true", help="só refaz o copies.txt (o longo usa os tempos do vídeo)")
    a = ap.parse_args()
    if a.so_copies:
        p = SAIDA / a.nome
        print(copies_longo(p) if a.nome == "youtube_longo" else (p / "copies.txt").write_text(COPIES[a.nome] + "\n", encoding="utf-8"))
        raise SystemExit(0)
    print(gerar(a.nome, a.sem_voz, a.site.rstrip("/")))
