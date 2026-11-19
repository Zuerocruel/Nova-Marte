"""Coleta: busca no Supabase tudo o que um episódio precisa.

- total de colonos (personagens visíveis) + os fundadores fixos
- novos colonos desde o último episódio publicado
- compras PAGAS desde o último episódio (status aprovado/pago; pendentes NUNCA entram)
- estágio das obras da colônia (tabela colonia_obras; sem ela, usa colonia.json)

Só lê campos públicos: nome de exibição, código, posição, seed, sprite e status.
WhatsApp, e-mail e telefone nunca são pedidos ao banco.

Uso direto:
    python episodio.py --episodio 2
    python episodio.py --registrar-publicacao 1 --titulo "A Fazenda Solar"
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone

import requests

import config

# A Cakto grava a venda paga como "aprovado" (lib/cakto.ts). "pago" fica aceito
# por segurança. Qualquer outro status (pendente, recusado, reembolsado...) fica de fora.
STATUS_PAGOS = ("aprovado", "pago")


class Supabase:
    def __init__(self) -> None:
        self.url = config.env("SUPABASE_URL").rstrip("/") + "/rest/v1"
        chave = config.env("SUPABASE_SERVICE_ROLE_KEY")
        self.s = requests.Session()
        self.s.headers.update({
            "apikey": chave,
            "Authorization": f"Bearer {chave}",
            "User-Agent": config.USER_AGENT,
            "Accept": "application/json",
        })

    def get(self, tabela: str, params: dict, contar: bool = False):
        headers = {"Prefer": "count=exact"} if contar else {}
        r = self.s.get(f"{self.url}/{tabela}", params=params, headers=headers, timeout=30)
        if r.status_code == 404 and "PGRST205" in r.text:
            raise TabelaAusente(tabela)
        r.raise_for_status()
        if contar:
            return r.json(), int(r.headers.get("Content-Range", "*/0").split("/")[-1])
        return r.json()

    def todos(self, tabela: str, params: dict, lote: int = 1000) -> list:
        saida, inicio = [], 0
        while True:
            pagina = self.get(tabela, {**params, "offset": inicio, "limit": lote})
            saida += pagina
            if len(pagina) < lote:
                return saida
            inicio += lote

    def contar(self, tabela: str, params: dict) -> int:
        return self.get(tabela, {**params, "select": "id", "limit": 1}, contar=True)[1]

    def escrever(self, metodo: str, tabela: str, params: dict, corpo, prefer: str = "return=representation"):
        r = self.s.request(metodo, f"{self.url}/{tabela}", params=params, json=corpo,
                           headers={"Prefer": prefer, "Content-Type": "application/json"}, timeout=30)
        if r.status_code == 404 and "PGRST205" in r.text:
            raise TabelaAusente(tabela)
        r.raise_for_status()
        return r.json() if r.text else None


class TabelaAusente(Exception):
    pass


# ---------- nomes (mesma regra da função SQL nome_exibicao) ----------
def nome_exibicao(nome: str) -> str:
    partes = (nome or "").split()
    if not partes:
        return "Colono"
    return partes[0] + (f" {partes[1][0]}." if len(partes) > 1 and partes[1] else "")


def primeiro_nome(nome: str) -> str:
    partes = (nome or "").split()
    return partes[0] if partes else "Colono"


def colono_publico(p: dict) -> dict:
    return {
        "codigo": p["codigo"],
        "nome": nome_exibicao(p["nome"]),
        "falado": primeiro_nome(p["nome"]),
        "x": p["pos_x"], "y": p["pos_y"],
        "seed": p["seed"],
        "status": p["status"],
        "sprite_url": p.get("sprite_url"),
    }


# ---------- coleta ----------
def ultimo_episodio(db: Supabase, numero: int) -> dict | None:
    linhas = db.get("episodios", {
        "select": "numero,titulo,publicado_em",
        "numero": f"lt.{numero}",
        "publicado_em": "not.is.null",
        "order": "numero.desc",
        "limit": 1,
    })
    return linhas[0] if linhas else None


def obras(db: Supabase, catalogo: list[dict]) -> tuple[list[dict], str]:
    try:
        try:
            linhas = {o["slug"]: o for o in db.get("colonia_obras", {"select": "slug,status,progresso,dias"})}
        except requests.HTTPError:   # coluna "dias" ainda não existe (falta a 005_obras_ritmo.sql)
            linhas = {o["slug"]: o for o in db.get("colonia_obras", {"select": "slug,status,progresso"})}
        fonte = "supabase"
    except TabelaAusente:
        linhas, fonte = {}, "colonia.json (tabela colonia_obras ainda não existe)"
    saida = []
    for o in catalogo:
        estado = linhas.get(o["slug"], o["estado_inicial"])
        saida.append({k: o[k] for k in ("slug", "nome", "tipo", "x", "y", "w", "h")}
                     | {"status": estado["status"], "progresso": int(estado.get("progresso") or 0),
                        "dias": int(estado.get("dias") or 0), "trabalho": o.get("trabalho")})
    return saida, fonte


def coletar(numero: int, so_fundadores: bool = False) -> dict:
    db = Supabase()
    col = config.colonia()
    ultimo = ultimo_episodio(db, numero)
    desde = ultimo["publicado_em"] if ultimo else None

    campos = "codigo,nome,pos_x,pos_y,seed,status,sprite_url"
    visiveis = {"oculto": "eq.false"}

    total_colonos = db.contar("personagens", visiveis)
    novos_total = db.contar("personagens", {**visiveis, **({"created_at": f"gt.{desde}"} if desde else {})})
    novos = db.get("personagens", {
        "select": campos, **visiveis,
        **({"created_at": f"gt.{desde}"} if desde else {}),
        "order": "id.asc", "limit": 12,
    })
    mundo = db.todos("personagens", {"select": campos, **visiveis, "order": "id.asc"})

    # compras pagas desde o último episódio. "atualizado_em" pega o Pix gerado antes
    # e pago depois do episódio anterior. Só entram status pagos.
    filtro_compras = {"status": f"in.({','.join(STATUS_PAGOS)})"}
    if desde:
        filtro_compras["atualizado_em"] = f"gt.{desde}"
    compras_linhas = db.get("pedidos", {
        "select": "id,status,atualizado_em,produto:produtos(slug,nome),"
                  "personagem:personagens(codigo,nome,pos_x,pos_y,seed,status,sprite_url,oculto)",
        **filtro_compras,
        "order": "atualizado_em.asc",
    })
    assert all(c["status"] in STATUS_PAGOS for c in compras_linhas)
    compras = []
    for c in compras_linhas:
        p = c.get("personagem")
        if not p or p.get("oculto") or not c.get("produto"):
            continue  # venda sem personagem ligado só entra na contagem
        compras.append({**colono_publico(p), "produto": c["produto"]["nome"], "produto_slug": c["produto"]["slug"]})

    lista_obras, fonte_obras = obras(db, col["obras"])
    if ultimo and fonte_obras != "supabase":
        # sem a tabela, a fábrica voltaria ao estado inicial e reconstruiria a obra do episódio 1
        raise SystemExit("A tabela colonia_obras não existe no Supabase: rode supabase/migrations/004_colonia_obras.sql "
                         "e 005_obras_ritmo.sql no SQL Editor antes de gerar o episódio "
                         f"{numero} (senão ele repete a obra de episódios já publicados).")

    dados = {
        "numero": numero,
        "gerado_em": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "ultimo_episodio": ultimo,
        "so_fundadores": so_fundadores,
        "fundadores": col["fundadores"],
        "base": col["base"],
        "praca": col.get("praca"),
        "obras": lista_obras,
        "fonte_obras": fonte_obras,
        "no_banco": {  # sempre registrado, mesmo quando o episódio ignora (modo só fundadores)
            "colonos": total_colonos, "novos": novos_total, "compras_pagas": len(compras_linhas),
        },
    }
    if so_fundadores:
        dados |= {"colonos_total": 0, "novos_total": 0, "novos": [], "compras_total": 0,
                  "compras": [], "mundo": [], "populacao_anterior": 0}
    else:
        dados |= {
            "colonos_total": total_colonos,
            "novos_total": novos_total,
            "novos": [colono_publico(p) for p in novos],
            "compras_total": len(compras_linhas),
            "compras": compras,
            "mundo": [colono_publico(p) for p in mundo],
            "populacao_anterior": len(col["fundadores"]) + total_colonos - novos_total,
        }
    dados["populacao"] = len(col["fundadores"]) + dados["colonos_total"]
    return dados


def registrar_publicacao(numero: int, titulo: str, obra_slug: str | None,
                         progresso: int = 100, dias: int | None = None, resumo: dict | None = None) -> None:
    """Marca o episódio como publicado (vira o ponto de corte do próximo) e grava até onde a obra chegou.
    progresso/dias vêm do roteiro (obra_progresso / obra_dia): a obra só fica concluída quando chega a 100."""
    db = Supabase()
    agora = datetime.now(timezone.utc).isoformat()
    db.escrever("POST", "episodios", {"on_conflict": "numero"},
                {"numero": numero, "titulo": titulo, "publicado_em": agora},
                prefer="resolution=merge-duplicates,return=representation")
    print(f"episódio {numero} marcado como publicado em {agora}")
    if resumo:
        registrar_resumo(db, numero, resumo)
    if obra_slug:
        try:
            progresso = max(0, min(100, int(progresso)))
            corpo = {"status": "concluida" if progresso >= 100 else "em_obra", "progresso": progresso,
                     "atualizado_em": agora}
            if dias is not None:
                corpo["dias"] = int(dias)
            # upsert: obras novas do colonia.json ainda não têm linha na tabela (PATCH não faria nada)
            nome = next((o["nome"] for o in config.colonia()["obras"] if o["slug"] == obra_slug), obra_slug)
            linha = {"slug": obra_slug, "nome": nome, **corpo}
            try:
                db.escrever("POST", "colonia_obras", {"on_conflict": "slug"}, linha,
                            prefer="resolution=merge-duplicates,return=minimal")
            except requests.HTTPError:
                if "dias" not in linha:
                    raise
                linha.pop("dias")       # sem a 005_obras_ritmo.sql: grava o resto
                db.escrever("POST", "colonia_obras", {"on_conflict": "slug"}, linha,
                            prefer="resolution=merge-duplicates,return=minimal")
                print("aviso: rode supabase/migrations/005_obras_ritmo.sql para contar os dias de cada obra")
            print(f"obra {obra_slug} → {corpo['status']} ({progresso}%)")
        except TabelaAusente:
            print("aviso: rode supabase/migrations/004_colonia_obras.sql para guardar o estágio das obras")


def registrar_resumo(db: Supabase, numero: int, resumo: dict) -> None:
    """Site ("Mundo ao vivo" e perfis): estação/temperatura e problema do dia + feito do herói."""
    try:
        db.escrever("PATCH", "episodios", {"numero": f"eq.{numero}"}, {"resumo": resumo}, prefer="return=minimal")
    except requests.HTTPError:
        print("aviso: rode supabase/migrations/006_perfil_chat.sql para o site mostrar a estação e o problema do dia")
        return
    p = resumo.get("problema") or {}
    if not p.get("heroi_codigo"):
        return
    linhas = db.get("personagens", {"select": "id", "codigo": f"eq.{p['heroi_codigo']}", "limit": 1})
    if not linhas:
        return
    try:
        db.escrever("POST", "feitos", {"on_conflict": "personagem_id,tipo,episodio"},
                    {"personagem_id": linhas[0]["id"], "tipo": "heroi", "titulo": p["titulo"], "episodio": numero},
                    prefer="resolution=ignore-duplicates,return=minimal")
        print(f"feito: {p['heroi']} ({p['heroi_codigo']}) resolveu \"{p['titulo']}\"")
    except (requests.HTTPError, TabelaAusente):
        print("aviso: tabela feitos ausente (migração 006)")


def resumo(d: dict) -> str:
    ult = d["ultimo_episodio"]
    linhas = [
        f"Episódio {d['numero']} · último publicado: {ult['numero'] if ult else 'nenhum'}",
        f"População: {d['populacao']} ({len(d['fundadores'])} fundadores + {d['colonos_total']} colonos)",
        f"Novos colonos: {d['novos_total']}" + (f" → {', '.join(n['nome'] for n in d['novos'])}" if d["novos"] else ""),
        f"Compras pagas: {d['compras_total']}" + (f" → {', '.join(c['nome'] + ': ' + c['produto'] for c in d['compras'])}" if d["compras"] else ""),
        f"Obras ({d['fonte_obras']}): " + ", ".join(f"{o['nome']} {o['status']} {o['progresso']}%" for o in d["obras"]),
    ]
    if d["so_fundadores"]:
        nb = d["no_banco"]
        linhas.append(f"(modo só fundadores: ignorados {nb['colonos']} colonos e {nb['compras_pagas']} compras pagas do banco)")
    return "\n".join(linhas)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--episodio", type=int)
    ap.add_argument("--so-fundadores", action="store_true")
    ap.add_argument("--registrar-publicacao", type=int, metavar="N")
    ap.add_argument("--titulo", default="")
    ap.add_argument("--obra", help="slug da obra concluída no episódio (padrão: a do roteiro)")
    a = ap.parse_args()
    if a.registrar_publicacao:
        n = a.registrar_publicacao
        rot = config.pasta_episodio(n) / "roteiro.json"
        r = config.ler_json(rot) if rot.exists() else {}
        obra = a.obra or r.get("missao_obra")
        titulo = a.titulo or r.get("titulo") or f"Episódio {n}"
        registrar_publicacao(n, titulo, obra, progresso=(r.get("obra_progresso") or [0, 100])[1], dias=r.get("obra_dia"),
                             resumo={k: r.get(k) for k in ("estacao", "problema") if r.get(k)} or None)
    elif a.episodio:
        d = coletar(a.episodio, a.so_fundadores)
        config.gravar_json(config.pasta_episodio(a.episodio) / "dados.json", d)
        print(resumo(d))
    else:
        ap.print_help()
