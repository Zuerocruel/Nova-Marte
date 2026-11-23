"""Copies de divulgação por template (sem IA): YouTube, Instagram e TikTok.

Lê o que a fábrica gerou para o episódio (dados.json, roteiro.json, linha_do_tempo.json)
e grava saida/epNNN/copies.json. O painel deixa editar e aprovar cada uma.

Cada rede usa o seu link rastreável (/l/yt-ep001, /l/ig-ep001, /l/tt-ep001): é assim
que o painel mostra qual post trouxe cadastros e vendas. O Publicar do episódio cria
esses links na tabela `links`.

    python copies.py --episodio 1
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "fabrica"))
import config  # noqa: E402  (config da fábrica: nome do site, pastas)
from publicacao import sem_link  # noqa: E402  (Instagram/TikTok nunca levam link)

NOME = "Operação Marte Zero"
PLATAFORMAS = {
    "youtube": {"rotulo": "YouTube", "prefixo": "yt", "plataforma": "youtube"},
    "instagram": {"rotulo": "Instagram", "prefixo": "ig", "plataforma": "instagram"},
    "tiktok": {"rotulo": "TikTok", "prefixo": "tt", "plataforma": "tiktok"},
}
# O YouTube só aceita link externo na descrição depois que o canal libera os recursos
# avançados (verificação por telefone + histórico). Até lá: 0 → "link no perfil do canal".
import os  # noqa: E402
YT_LINK_NA_DESCRICAO = (os.environ.get("YOUTUBE_LINK_NA_DESCRICAO") or "0").strip() == "1"

HASHTAGS = ["#operacaomartezero", "#pixelart", "#marte", "#colonia", "#jogoindie"]


def slug_link(plataforma: str, numero: int) -> str:
    return f"{PLATAFORMAS[plataforma]['prefixo']}-ep{numero:03d}"


def link(plataforma: str, numero: int) -> str:
    return f"{config.SITE_TELA}/l/{slug_link(plataforma, numero)}"


def _mmss(s: float) -> str:
    s = int(s)
    return f"{s // 60}:{s % 60:02d}"


ROTULO_CENA = {"abertura": "Abertura", "populacao": "População", "boas_vindas": "Boas-vindas",
               "compras": "Novidades na vizinhança", "cratera": "Nome novo no mapa", "destaque": "Destaque do dia",
               "problema": "Alerta: problema do dia", "solucao": "Problema resolvido", "gancho": "Próximo episódio",
               "votacao": "Votação: SIM ou NÃO?", "resultado": "A colônia decidiu"}


def capitulos(lt: dict) -> list[str]:
    linhas, missao = [], False
    for c in lt["cenas"]:
        if c["tipo"] == "missao":
            if missao:
                continue
            missao = True
            linhas.append(f"{_mmss(c['inicio'])} Missão do Dia: {lt['missao_titulo']}")
        else:
            linhas.append(f"{_mmss(c['inicio'])} {ROTULO_CENA.get(c['tipo'], c['tipo'])}")
    return linhas


def _obra(r: dict) -> str:
    """Nome da obra do episódio (sem o "Inauguração da" do título do dia em que ela fica pronta)."""
    return re.sub(r"^Inauguração d[ao] ", "", r["titulo"].split(" · ", 1)[-1])


# ---------------------------------------------------------------- pauta: o que vai no episódio
def pauta(d: dict, r: dict) -> list[str]:
    """Tudo o que acontece no episódio, na ordem do vídeo (uma linha por momento). Vai para o painel e para as copies."""
    out = []
    e, prob = r.get("estacao"), r.get("problema")
    if e and r["numero"] >= 2:
        out.append(f"{'❄️' if e['efeito'] == 'geada' else '🌡️'} {e['nome']} em Marte, dia {e['dia']}: {e['temp']}°C")
    out.append(f"👥 População: {d['populacao']} colonos")
    if d["novos"]:
        nomes = ", ".join(c["nome"] for c in d["novos"][:6])
        resto = d["novos_total"] - min(6, len(d["novos"]))
        out.append(f"👋 Chegaram: {nomes}" + (f" e mais {resto}" if resto > 0 else ""))
    if d["compras"]:
        grupos: dict[str, list[str]] = {}
        for c in d["compras"]:
            grupos.setdefault(c["produto"], []).append(c["nome"])
        partes = [f"{len(v)}× {k}" if len(v) > 1 else f"{v[0]} ({k})"
                  for k, v in sorted(grupos.items(), key=lambda kv: -len(kv[1]))]
        out.append("🛒 Novidades: " + ", ".join(partes[:5]))
    for c in [c for c in d.get("crateras", []) if c.get("nova")]:
        out.append(f"🕳️ Nome novo no mapa: {c['nome']}, batizada por {c['dono']}")
    if r.get("destaques"):
        out.append("⭐ Destaque do dia: " + ", ".join(x["nome"] for x in r["destaques"]))
    if prob:
        if prob.get("furia"):
            out.append(f"🔥 Fúria de Marte chamada por {prob['furia']['nome']}: {prob['titulo']}!")
        out.append(f"⚠️ Problema do dia: {prob['titulo']}. Resolvido por {prob['heroi']}!")
    if r.get("obra_progresso"):
        p0, p1 = r["obra_progresso"]
        out.append(f"🎉 {_obra(r)} INAUGURADA!" if r.get("obra_concluida") else f"🏗️ {_obra(r)}: {p0}% → {p1}%")
    return out


def manchete(d: dict, r: dict) -> str:
    """O momento mais forte do episódio (vira o título do YouTube e a 1ª linha do Instagram/TikTok)."""
    prob = r.get("problema")
    if prob and prob.get("furia"):
        return f"{prob['titulo']} na colônia!"
    if r.get("obra_concluida"):
        return f"{_obra(r)} inaugurada!"
    novas = [c for c in d.get("crateras", []) if c.get("nova")]
    if novas:
        return f"{novas[0]['dono']} batizou uma cratera em Marte"
    if d["novos_total"] >= 3:
        return f"{d['novos_total']} colonos novos chegaram a Marte"
    if prob:
        return f"{prob['titulo']}!"
    return r["missao_titulo"]


# ---------------------------------------------------------------- ganchos: seguir, inscrever, curtir, comentar
def ganchos(d: dict, r: dict) -> dict:
    """Chamadas para a pessoa agir. A pergunta para comentar muda com o que aconteceu no episódio."""
    n, prob = r["numero"], r.get("problema")
    perguntas = []
    if prob and prob.get("furia"):
        perguntas.append("Qual a próxima Fúria de Marte: meteoros, nevasca ou aliens? Vota nos comentários! 👇")
    if prob:
        perguntas.append(f"{prob['titulo']}: se você morasse na colônia, qual cargo teria para resolver? Comenta! 👇")
    if r.get("obra_concluida"):
        perguntas.append("Qual deve ser a próxima construção da colônia? Comenta! 👇")
    if d["novos"]:
        perguntas.append("Comenta EU se você quer ser o próximo colono a chegar em Marte! 👇")
    if any(c.get("nova") for c in d.get("crateras", [])):
        perguntas.append("Que nome você daria para uma cratera de Marte? Comenta! 👇")
    perguntas.append("Você moraria em Marte? Comenta SIM ou NÃO! 👇")
    v = r.get("votacao")   # o episódio pergunta SIM ou NÃO: a copy pede o mesmo voto
    voto = f"🗳️ Votação da colônia: {v['fala']} A maioria decide o próximo episódio 👇" if v and v.get("fala") else None
    return {
        "historia": f"Amanhã: {r['proxima']}." if n >= 2 else f"No próximo episódio: {r['proxima']}.",
        "comentar": voto or perguntas[n % len(perguntas)],
        "curtir": "Curte se você quer ver a colônia crescer! ❤️",
        "seguir": "Segue o perfil para não perder o episódio de amanhã 🚀",
        "inscrever": "Inscreva-se e ative o 🔔 para acompanhar a colônia todo dia",
    }


# ---------------------------------------------------------------- copies das 3 redes
def montar(n: int, r: dict, lt: dict | None, linhas_pauta: list[str], g: dict, titulo: str) -> dict:
    tags = " ".join(HASHTAGS)
    missao, diario = r["missao_titulo"], n >= 2          # do episódio 2 em diante a série é diária
    corpo = "\n".join(linhas_pauta)

    yt_desc = [f"Episódio {n} da {NOME}: {missao}.", "", corpo, "", f"➡️ {g['historia']}", "",
               f"💬 {g['comentar']}", g["inscrever"], g["curtir"], "",
               (f"🚀 Vire personagem e procure seu nome no mapa: https://{link('youtube', n)}" if YT_LINK_NA_DESCRICAO
                else "🚀 Vire personagem e procure seu nome no mapa: link no perfil do canal 👆")]
    if diario:
        yt_desc += ["📺 Episódio novo todo dia."]
    if lt:
        yt_desc += ["", "Capítulos:", *capitulos(lt)]
    yt_desc += ["", tags]

    ig = [f"🚀 {titulo}", f"{NOME} · Episódio {n} · Missão do Dia: {missao}.", "", corpo, "",
          f"➡️ {g['historia']}", "", f"💬 {g['comentar']}", g["curtir"], g["seguir"], "",
          *(["📺 Episódio novo todo dia!"] if diario else []),
          "Quer virar personagem? Link na bio 👆 Cadastre-se e procure seu nome no mapa.", "", tags]

    tt = (f"{titulo} 🚀 Ep. {n} da {NOME}. {g['historia']} {g['comentar']} {g['seguir']} "
          f"Vire personagem: link na bio! {tags}")

    return {
        "youtube": {"titulo": f"{titulo} | {NOME} #{n}"[:100], "descricao": "\n".join(yt_desc),
                    "tags": "operação marte zero, pixel art, marte, colônia espacial, " + missao.lower(),
                    "link": f"https://{link('youtube', n)}"},
        "instagram": {"legenda": sem_link("\n".join(ig)), "link": f"https://{link('instagram', n)}",
                      "obs": "Instagram não deixa link clicável na legenda: use este link na bio ou no story."},
        "tiktok": {"legenda": sem_link(tt)[:2200], "link": f"https://{link('tiktok', n)}",
                   "obs": "Coloque o link na bio do TikTok antes de postar."},
    }


def gerar(numero: int, pauta_editada: list[str] | None = None, ganchos_editados: dict | None = None,
          manchete_editada: str | None = None) -> dict:
    """Pauta + ganchos + as 3 copies. Com os parâmetros, refaz as copies a partir do que foi editado no painel."""
    pasta = config.pasta_episodio(numero)
    d = config.ler_json(pasta / "dados.json")
    r = config.ler_json(pasta / "roteiro.json")
    lt = config.ler_json(pasta / "linha_do_tempo.json") if (pasta / "linha_do_tempo.json").exists() else None
    p = [x for x in (pauta_editada if pauta_editada is not None else pauta(d, r)) if x.strip()]
    g = {**ganchos(d, r), **{k: v.strip() for k, v in (ganchos_editados or {}).items()
                             if isinstance(v, str) and v.strip()}}
    t = (manchete_editada or "").strip() or manchete(d, r)
    return {"numero": numero, "manchete": t, "pauta": p, "ganchos": g, **montar(numero, r, lt, p, g, t)}


def gravar(numero: int, **editado) -> Path:
    destino = config.pasta_episodio(numero) / "copies.json"
    config.gravar_json(destino, gerar(numero, **editado))
    return destino


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--episodio", type=int, required=True)
    print(gravar(ap.parse_args().episodio))
