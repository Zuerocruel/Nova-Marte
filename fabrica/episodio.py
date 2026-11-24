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

import bairro
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
    # no vídeo e no post vai o NICK (o nome real fica só no cadastro); quem não tem nick usa o primeiro nome
    nick = (p.get("apelido") or "").strip()
    lid = config.liderancas().get(p.get("lideranca") or "")
    titulo = f"{lid['titulo']} " if lid else ""   # nomeado no painel: "Líder Ana"
    return {
        "codigo": p["codigo"],
        "nome": titulo + (nick or nome_exibicao(p["nome"])),
        "falado": titulo + (nick or primeiro_nome(p["nome"])),
        "lideranca": lid["id"] if lid else None,
        # casa calculada aqui (bairro.py, a mesma conta do banco e do site): o vídeo não depende de a
        # migração do bairro já ter rodado no Supabase
        "x": bairro.casa_do_codigo(p["codigo"])[0], "y": bairro.casa_do_codigo(p["codigo"])[1],
        "seed": p["seed"],
        "status": p["status"],
        "sprite_url": p.get("sprite_url"),
        "cargo": p.get("cargo"),
        # profissão: o vídeo mostra o nome do cargo e a narração apresenta a equipe ("da equipe de Engenharia")
        "cargo_nome": (config.cargos().get(p.get("cargo") or "") or {}).get("nome"),
        "equipe": (config.cargos().get(p.get("cargo") or "") or {}).get("equipe"),
    }


def nome_da_cratera(texto: str) -> str:
    """"BuracoNegrote" → "Cratera BuracoNegrote" (quem já escreveu "Cratera ..." fica como escreveu)."""
    t = " ".join((texto or "").split())
    return t if t.lower().startswith("cratera") else f"Cratera {t}"


def crateras(db: Supabase, campos: str, ultimo: dict | None) -> list[dict]:
    """Crateras batizadas (resgates aprovados de "Nomeie sua Cratera"). Ficam no mapa para sempre; 'nova' = ainda
    não apareceu no episódio anterior (comparando com o dados.json dele), e ganha a cena de batismo."""
    try:
        linhas = db.get("resgates", {
            "select": f"id,texto,revisado_em,produto:produtos!inner(slug),personagem:personagens({campos},oculto)",
            "status": "eq.aprovado", "produto.slug": "eq.nomeie-sua-cratera", "order": "id.asc",
        })
    except requests.HTTPError as e:   # sem a tabela resgates (falta a 002): segue sem crateras
        print(f"aviso: não li as crateras batizadas ({e})")
        return []
    vistas: set[int] = set()
    if ultimo:
        anterior = config.SAIDA / f"ep{ultimo['numero']:03d}" / "dados.json"
        if anterior.exists():
            vistas = {c["id"] for c in config.ler_json(anterior).get("crateras", [])}
    saida = []
    for r in linhas:
        p = r.get("personagem")
        if not p or p.get("oculto") or not (r.get("texto") or "").strip():
            continue
        dono = colono_publico(p)
        saida.append({"id": r["id"], "nome": nome_da_cratera(r["texto"]), **bairro.pos_cratera(r["id"]),
                      "codigo": dono["codigo"], "dono": dono["nome"], "dono_falado": dono["falado"],
                      "nova": r["id"] not in vistas})
    return saida


# Produtos que não são objeto na casa: cada compra vira um momento num próximo episódio (um "serviço").
FURIA, DESTAQUE = "eventos-furia-marte", "destaque-proximo-ep"
SERVICOS = (FURIA, DESTAQUE)


def ja_usados(numero: int) -> dict[str, set[int]]:
    """Pedidos de Fúria/Destaque já usados nos episódios ANTERIORES a `numero` (lidos dos roteiro.json)."""
    usados = {FURIA: set(), DESTAQUE: set()}
    for arq in config.SAIDA.glob("ep[0-9][0-9][0-9]/roteiro.json"):
        if int(arq.parent.name[2:]) >= numero:
            continue
        r = config.ler_json(arq)
        if (r.get("problema") or {}).get("furia"):
            usados[FURIA].add(r["problema"]["furia"]["pedido"])
        usados[DESTAQUE] |= {x["pedido"] for x in r.get("destaques", [])}
    return usados


def fila_de_servicos(db: Supabase, campos: str, numero: int) -> dict[str, list[dict]]:
    """Compras pagas de Fúria de Marte e Destaque que ainda não apareceram (em ordem de compra), de QUALQUER
    data: quem comprou na véspera e ficou de fora por fila continua esperando a vez."""
    linhas = db.get("pedidos", {
        "select": f"id,opcao,produto:produtos!inner(slug),personagem:personagens({campos},oculto)",
        "status": f"in.({','.join(STATUS_PAGOS)})", "produto.slug": f"in.({','.join(SERVICOS)})",
        "order": "id.asc",
    })
    usados = ja_usados(numero)
    fila = {FURIA: [], DESTAQUE: []}
    for c in linhas:
        p, slug = c.get("personagem"), c["produto"]["slug"]
        if not p or p.get("oculto") or c["id"] in usados[slug]:
            continue
        fila[slug].append({"pedido": c["id"], "opcao": c.get("opcao"), **colono_publico(p)})
    return fila


def especie_do_pet(slug: str, opcao: str | None) -> str:
    """Mesma regra de lib/colonia.ts: macaco é um produto próprio; no Pet do Colono a opção escolhe cachorro ou gato."""
    return "macaco" if "macaco" in slug else "gato" if opcao == "gato" else "cachorro"


def com_pet(db: Supabase) -> dict[str, str]:
    """codigo do colono → espécie do pet (pedido pago de QUALQUER data; vale o mais recente): o pet aparece em
    todo episódio."""
    linhas = db.get("pedidos", {
        "select": "id,opcao,produto:produtos!inner(slug),personagem:personagens(codigo,oculto)",
        "status": f"in.({','.join(STATUS_PAGOS)})", "produto.slug": "ilike.*pet*", "order": "id.asc",
    })
    return {c["personagem"]["codigo"]: especie_do_pet(c["produto"]["slug"], c.get("opcao"))
            for c in linhas if c.get("personagem") and not c["personagem"].get("oculto")}


CAPSULA = "capsula-habitacional"
VARIANTES_CAPSULA = ("classica", "estufa", "observatorio", "dupla")   # mesma lista de lib/colonia-arte.ts


# Vila das Cápsulas: MESMA conta de lib/mundo.ts (VILA / loteDaVila). Quem compra a cápsula sai da casinha grátis
# e ganha um lote 2x2 na vila, na ordem da 1ª compra de cada um.
VILA = {"x": bairro.CENTRO[0] + 27, "y": bairro.CENTRO[1] - 7, "colunas": 5, "passo": 3}


def lote_da_vila(i: int) -> tuple[int, int]:
    return (VILA["x"] + (i % VILA["colunas"]) * VILA["passo"], VILA["y"] + (i // VILA["colunas"]) * VILA["passo"])


def capsulas(db: Supabase) -> dict[str, dict]:
    """codigo do colono → {"variante", "vila": [x, y]} da cápsula comprada, de QUALQUER data: a casa fica trocada
    para sempre. A variante vale a da compra mais recente (sem opção = clássica); o lote na vila, a ordem da 1ª."""
    linhas = db.get("pedidos", {
        "select": "id,opcao,produto:produtos!inner(slug),personagem:personagens(codigo,oculto)",
        "status": f"in.({','.join(STATUS_PAGOS)})", "produto.slug": f"eq.{CAPSULA}", "order": "id.asc",
    })
    saida: dict[str, dict] = {}
    for c in linhas:
        p = c.get("personagem")
        if not p or p.get("oculto"):
            continue
        variante = c.get("opcao") if c.get("opcao") in VARIANTES_CAPSULA else "classica"
        if p["codigo"] not in saida:
            saida[p["codigo"]] = {"vila": list(lote_da_vila(len(saida)))}
        saida[p["codigo"]]["variante"] = variante
    return saida


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
                     | ({"colina": o["colina"]} if o.get("colina") else {})
                     | {"status": estado["status"], "progresso": int(estado.get("progresso") or 0),
                        "dias": int(estado.get("dias") or 0), "trabalho": o.get("trabalho")})
    return saida, fonte


def coletar(numero: int, so_fundadores: bool = False) -> dict:
    db = Supabase()
    col = config.colonia()
    ultimo = ultimo_episodio(db, numero)
    desde = ultimo["publicado_em"] if ultimo else None
    # o episódio anterior só mostrou os fundadores (ex.: ep. 1)? Então ninguém foi apresentado ainda:
    # todos os colonos contam como novos e ganham as boas-vindas neste episódio
    if ultimo:
        anterior = config.SAIDA / f"ep{ultimo['numero']:03d}" / "dados.json"
        if anterior.exists() and config.ler_json(anterior).get("so_fundadores"):
            desde = None

    campos = "codigo,nome,pos_x,pos_y,seed,status,sprite_url"
    visiveis = {"oculto": "eq.false"}
    try:                                   # cargo e nick (migração 008); sem as colunas, segue sem eles
        db.get("personagens", {"select": "cargo,apelido", "limit": 1})
        campos += ",cargo,apelido"
    except requests.HTTPError:
        print("aviso: coluna personagens.cargo ainda não existe (rode supabase/migrations/008_cargos_nick.sql)")
    try:                                   # cargos de liderança (migração 012)
        db.get("personagens", {"select": "lideranca", "limit": 1})
        campos += ",lideranca"
    except requests.HTTPError:
        print("aviso: coluna personagens.lideranca ainda não existe (rode supabase/migrations/012_liderancas.sql)")

    total_colonos = db.contar("personagens", visiveis)
    novos_total = db.contar("personagens", {**visiveis, **({"created_at": f"gt.{desde}"} if desde else {})})
    novos = db.get("personagens", {
        "select": campos, **visiveis,
        **({"created_at": f"gt.{desde}"} if desde else {}),
        "order": "id.asc", "limit": 12,
    })
    mundo = db.todos("personagens", {"select": campos, **visiveis, "order": "id.asc"})
    if any((p["pos_x"], p["pos_y"]) != bairro.casa_do_codigo(p["codigo"]) for p in mundo):
        print("aviso: as casas no banco ainda estão no bairro antigo: rode supabase/migrations/009_bairro_perto.sql "
              "no SQL Editor do Supabase (o vídeo já usa o bairro novo; o site só muda depois disso)")

    # compras pagas desde o último episódio. "atualizado_em" pega o Pix gerado antes
    # e pago depois do episódio anterior. Só entram status pagos.
    filtro_compras = {"status": f"in.({','.join(STATUS_PAGOS)})"}
    if desde:
        filtro_compras["atualizado_em"] = f"gt.{desde}"
    compras_linhas = db.get("pedidos", {
        "select": "id,status,opcao,atualizado_em,produto:produtos(slug,nome),"
                  f"personagem:personagens({campos},oculto)",
        **filtro_compras,
        "order": "atualizado_em.asc",
    })
    assert all(c["status"] in STATUS_PAGOS for c in compras_linhas)
    compras = []
    for c in compras_linhas:
        p = c.get("personagem")
        if not p or p.get("oculto") or not c.get("produto"):
            continue  # venda sem personagem ligado só entra na contagem
        if c["produto"]["slug"] in SERVICOS:
            continue  # Fúria e Destaque não viram objeto na casa: têm o momento deles (fila_de_servicos)
        compras.append({**colono_publico(p), "produto": c["produto"]["nome"], "produto_slug": c["produto"]["slug"],
                        "opcao": c.get("opcao"),
                        **({"especie": especie_do_pet(c["produto"]["slug"], c.get("opcao"))} if "pet" in c["produto"]["slug"] else {})})

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
        "crateras": [] if so_fundadores else crateras(db, campos, ultimo),
        "servicos": {FURIA: [], DESTAQUE: []} if so_fundadores else fila_de_servicos(db, campos, numero),
        "no_banco": {  # sempre registrado, mesmo quando o episódio ignora (modo só fundadores)
            "colonos": total_colonos, "novos": novos_total, "compras_pagas": len(compras_linhas),
        },
    }
    if so_fundadores:
        dados |= {"colonos_total": 0, "novos_total": 0, "novos": [], "compras_total": 0,
                  "compras": [], "mundo": [], "populacao_anterior": 0}
    else:
        cap = capsulas(db)
        pets = com_pet(db)
        dados |= {
            "colonos_total": total_colonos,
            "novos_total": novos_total,
            "novos": [colono_publico(p) for p in novos],
            "compras_total": len(compras_linhas),
            "compras": compras,
            "mundo": [colono_publico(p)
                      | ({"capsula": cap[p["codigo"]]["variante"], "vila": cap[p["codigo"]]["vila"]} if p["codigo"] in cap else {})
                      | ({"pet": pets[p["codigo"]]} if p["codigo"] in pets else {}) for p in mundo],
            "populacao_anterior": len(col["fundadores"]) + total_colonos - novos_total,
        }
    dados["populacao"] = len(col["fundadores"]) + dados["colonos_total"]
    return dados


def registrar_publicacao(numero: int, titulo: str, obra_slug: str | None,
                         progresso: int = 100, dias: int | None = None, resumo: dict | None = None,
                         obra_extra: dict | None = None) -> None:
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
    if obra_extra and obra_extra.get("slug"):   # obra pronta hoje → a próxima já começou (fundação)
        registrar_publicacao_obra(db, obra_extra["slug"], obra_extra.get("progresso", 0), obra_extra.get("dias"), agora)


def registrar_publicacao_obra(db: "Supabase", slug: str, progresso: int, dias: int | None, agora: str) -> None:
    """Grava a obra que começou no fim do episódio (só a fundação; status em_obra)."""
    progresso = max(0, min(99, int(progresso)))
    nome = next((o["nome"] for o in config.colonia()["obras"] if o["slug"] == slug), slug)
    linha = {"slug": slug, "nome": nome, "status": "em_obra", "progresso": progresso, "atualizado_em": agora}
    if dias is not None:
        linha["dias"] = int(dias)
    try:
        db.escrever("POST", "colonia_obras", {"on_conflict": "slug"}, linha, prefer="resolution=merge-duplicates,return=minimal")
        print(f"obra {slug} → em_obra ({progresso}%, fundação)")
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
        f"Fúria de Marte na fila: {len(d.get('servicos', {}).get(FURIA, []))} · "
        f"Destaques na fila: {len(d.get('servicos', {}).get(DESTAQUE, []))}",
        f"Crateras batizadas: {len(d.get('crateras', []))}" + "".join(
            f" · {c['nome']} ({c['dono']}{', NOVA' if c['nova'] else ''})" for c in d.get("crateras", [])),
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
                             resumo={k: r.get(k) for k in ("estacao", "problema") if r.get(k)} or None,
                             obra_extra=r.get("obra_extra"))
    elif a.episodio:
        d = coletar(a.episodio, a.so_fundadores)
        config.gravar_json(config.pasta_episodio(a.episodio) / "dados.json", d)
        print(resumo(d))
    else:
        ap.print_help()
