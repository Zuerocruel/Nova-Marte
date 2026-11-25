"""Comentários do Instagram e do TikTok pelo SITE das redes (sem API e sem Facebook).

A fábrica tem um navegador só dela (perfil em saida/navegador_redes/, fora do git). Você entra UMA vez no
Instagram e no TikTok com a conta da série; depois a coleta roda sozinha, sem janela, a cada episódio.

    python redes_web.py --login                 # abre o navegador da fábrica: entre no Instagram e no TikTok e feche
    python redes_web.py --episodio 6            # mostra os comentários do vídeo do episódio 6 nas duas redes
    python redes_web.py --episodio 6 --ver      # o mesmo, com a janela aberta (para conferir)

Só LÊ: abre o perfil, acha o vídeo do episódio pela legenda e lê os comentários da página. Nunca curte, responde
ou publica. Vale só o vídeo do episódio (não o carrossel, não os POVs).
"""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import re
import unicodedata

import config

PERFIL = config.SAIDA / "navegador_redes"
IG_PERFIL = "https://www.instagram.com/operacaomartezero/"
TT_PERFIL = "https://www.tiktok.com/@operacaomartezero"

# lê os comentários de um post do Instagram aberto: cada comentário tem um link próprio ".../c/<id>/"
JS_IG_COMENTARIOS = r"""() => {
  const LIXO = /^(Responder|Curtir|Ocultar|Ver tradução|\d+ curtidas?|Ver todas.*|Ocultar respostas|\d+ ?(s|min|h|d|sem)|Editado)$/i;
  const perfil = (box) => ([...box.querySelectorAll('a[href^="/"]')].map((x) => x.getAttribute('href'))
    .find((h) => /^\/[\w.]+\/$/.test(h)) || '').replace(/\//g, '');
  const itens = [], vistos = new Set();
  for (const a of document.querySelectorAll('a[href*="/c/"]')) {
    const id = (a.getAttribute('href').split('/c/')[1] || '').replace(/\//g, '');
    if (!id || vistos.has(id)) continue;
    vistos.add(id);
    let box = a, texto = '', autor = '';
    for (let i = 0; i < 8 && box.parentElement; i++) {
      box = box.parentElement; autor = perfil(box);
      const t = [...box.querySelectorAll('span')].map((s) => s.innerText.trim()).filter((t) => t && t !== autor && !LIXO.test(t));
      if (autor && t.length) { texto = t.sort((x, y) => y.length - x.length)[0]; break; }
    }
    if (autor && texto) itens.push({ id, autor, texto, em: (box.querySelector('time') || {}).getAttribute?.('datetime') || null });
  }
  return itens;
}"""

JS_TT_COMENTARIOS = r"""() => {
  const nomes = [...document.querySelectorAll('[data-e2e="comment-username-1"]')].map((e) => e.innerText.trim());
  const textos = [...document.querySelectorAll('[data-e2e="comment-level-1"]')].map((e) => e.innerText.trim());
  return textos.map((texto, i) => ({ autor: (nomes[i] || '').replace(/^@/, ''), texto }));
}"""


def _chave(texto: str) -> str:
    t = unicodedata.normalize("NFKD", texto or "")
    return re.sub(r"[^a-z0-9]", "", "".join(ch for ch in t if not unicodedata.combining(ch)).lower())


def legendas_do_episodio(n: int) -> dict:
    """1ª linha da legenda postada em cada rede (copies.json do episódio)."""
    arq = config.SAIDA / f"ep{n:03d}" / "copies.json"
    if not arq.exists():
        return {}
    c = config.ler_json(arq)
    return {"instagram": c["instagram"]["legenda"].splitlines()[0], "tiktok": c["tiktok"]["legenda"][:60]}


def e_do_episodio(texto: str, alvo: str | None, n: int) -> bool:
    """O post é o VÍDEO do episódio? Bate a 1ª linha da legenda (ou "Episódio N"/"Ep. N"); nunca carrossel/POV."""
    t = (texto or "").strip()
    if re.match(r"\W*(arrasta|pov\b|como se constr)", t, re.I):
        return False
    if alvo and _chave(t).startswith(_chave(alvo)[:30]) and len(_chave(alvo)) >= 12:
        return True
    return re.search(rf"\b(Epis[oó]dio|Ep\.)\s*{n}\b", t) is not None


async def _contexto(pw, ver: bool):
    PERFIL.mkdir(parents=True, exist_ok=True)
    for canal in ("chrome", "msedge", None):
        try:
            return await pw.chromium.launch_persistent_context(
                str(PERFIL), channel=canal, headless=not ver, locale="pt-BR", viewport={"width": 1280, "height": 900})
        except Exception:
            continue
    raise SystemExit("Nenhum navegador encontrado (Chrome, Edge ou: python -m playwright install chromium)")


async def _instagram(ctx, n: int, alvo: str | None) -> tuple[list[dict], str]:
    pg = await ctx.new_page()
    await pg.goto(IG_PERFIL, wait_until="domcontentloaded")
    await pg.wait_for_timeout(4000)
    if "accounts/login" in pg.url or await pg.locator('input[name="password"]').count():
        return [], "Instagram: o navegador da fábrica não está logado (rode: python redes_web.py --login)"
    links = await pg.evaluate("""() => [...new Set([...document.querySelectorAll('a[href*="/reel/"],a[href*="/p/"]')]
        .map(a => a.getAttribute('href')).filter(h => /\\/(p|reel)\\/[\\w-]+\\/?$/.test(h)))].slice(0, 12)""")
    for href in links:
        codigo = href.rstrip("/").split("/")[-1]
        await pg.goto(f"https://www.instagram.com/p/{codigo}/", wait_until="domcontentloaded")
        await pg.wait_for_timeout(3000)
        legenda = await pg.evaluate("""() => { const t = (document.querySelector('main') || document.body).innerText;
            const i = t.indexOf('operacaomartezero', 20); return t.slice(0, 600); }""")
        linhas = [x for x in legenda.splitlines() if x.strip() and x.strip() not in ("operacaomartezero", "Áudio original")
                  and not re.fullmatch(r"\d+ ?(s|min|h|d|sem)", x.strip())]
        if not linhas or not e_do_episodio(linhas[0] + " " + " ".join(linhas[1:3]), alvo, n):
            continue
        for _ in range(8):   # "Carregar mais comentários"
            mais = pg.locator('svg[aria-label="Carregar mais comentários"], svg[aria-label="Load more comments"]')
            if not await mais.count():
                break
            await mais.first.click()
            await pg.wait_for_timeout(1500)
        itens = await pg.evaluate(JS_IG_COMENTARIOS)
        out = [{"rede": "instagram", "id": f"ig:{x['id']}", "autor": x["autor"], "texto": x["texto"], "curtidas": 0,
                "em": x.get("em"), "post": linhas[0][:60]} for x in itens if x["autor"] != "operacaomartezero"]
        return out, f"Instagram: {len(out)} comentários (episódio {n}, pelo site)"
    return [], f"Instagram: não achei o vídeo do episódio {n} no perfil"


async def _tiktok(ctx, n: int, alvo: str | None) -> tuple[list[dict], str]:
    pg = await ctx.new_page()
    await pg.goto(TT_PERFIL, wait_until="domcontentloaded")
    await pg.wait_for_timeout(6000)
    videos = await pg.evaluate("""() => [...document.querySelectorAll('[data-e2e="user-post-item"] a[href*="/video/"]')]
        .map(a => ({ href: a.getAttribute('href'), alt: (a.querySelector('img') || {}).alt || '' }))""")
    if not videos:
        return [], "TikTok: não consegui ver os vídeos do perfil (login? rode: python redes_web.py --login)"
    alvo_v = next((v for v in videos if e_do_episodio(v["alt"], alvo, n)), None)
    if not alvo_v:
        return [], f"TikTok: não achei o vídeo do episódio {n} no perfil"
    # abrir o link direto falha às vezes: clicar no vídeo da grade (navegação de dentro do site) funciona
    await pg.locator(f'[data-e2e="user-post-item"] a[href="{alvo_v["href"]}"]').first.click()
    await pg.wait_for_timeout(5000)
    for _ in range(6):   # rola a lista de comentários para carregar mais
        await pg.mouse.wheel(0, 2500)
        await pg.wait_for_timeout(1200)
    itens = await pg.evaluate(JS_TT_COMENTARIOS)
    out = []
    for x in itens:
        if not x["autor"] or x["autor"].lower() in ("operacaomartezero", "operao.marte.zero"):
            continue
        h = hashlib.sha1(f"{alvo_v['href']}|{x['autor']}|{x['texto']}".encode()).hexdigest()[:16]
        out.append({"rede": "tiktok", "id": f"tt:{h}", "autor": x["autor"], "texto": x["texto"], "curtidas": 0,
                    "em": None, "post": alvo_v["alt"][:60]})
    return out, f"TikTok: {len(out)} comentários (episódio {n}, pelo site)"


async def _coletar(n: int, ver: bool) -> tuple[list[dict], list[str]]:
    from playwright.async_api import async_playwright
    alvos = legendas_do_episodio(n)
    todos, avisos = [], []
    async with async_playwright() as pw:
        ctx = await _contexto(pw, ver)
        try:
            for nome, fn in (("Instagram", _instagram), ("TikTok", _tiktok)):
                try:
                    lista, aviso = await fn(ctx, n, alvos.get(nome.lower()))
                except Exception as e:   # a coleta é um extra: nunca derruba o episódio
                    lista, aviso = [], f"{nome}: erro lendo o site ({type(e).__name__}: {str(e)[:100]})"
                todos += lista
                avisos.append(aviso)
        finally:
            await ctx.close()
    return todos, avisos


def coletar(n: int, ver: bool = False) -> tuple[list[dict], list[str]]:
    """Comentários do vídeo do episódio n no Instagram e no TikTok (lista no formato do correio.py) + avisos."""
    if not PERFIL.exists():
        return [], ["Instagram/TikTok: o navegador da fábrica ainda não foi logado (rode: python redes_web.py --login)"]
    return asyncio.run(_coletar(n, ver))


async def _login() -> None:
    from playwright.async_api import async_playwright
    async with async_playwright() as pw:
        ctx = await _contexto(pw, ver=True)
        p1 = await ctx.new_page()
        await p1.goto("https://www.instagram.com/accounts/login/")
        p2 = await ctx.new_page()
        await p2.goto("https://www.tiktok.com/login")
        print("Entre no Instagram e no TikTok (conta da Operação Marte Zero) nas duas abas e FECHE a janela.")
        await ctx.wait_for_event("close", timeout=0)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--login", action="store_true")
    ap.add_argument("--episodio", type=int)
    ap.add_argument("--ver", action="store_true")
    a = ap.parse_args()
    if a.login:
        asyncio.run(_login())
    elif a.episodio:
        cs, avs = coletar(a.episodio, a.ver)
        print("\n".join(avs))
        for c in cs:
            print(f"[{c['rede']}] @{c['autor']}: {c['texto'][:120]}")
    else:
        ap.print_help()
