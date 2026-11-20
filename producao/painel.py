"""Painel de Controle local da Operação Marte Zero  →  http://127.0.0.1:8800

    python producao/painel.py            # supervisor: reinicia sozinho quando o código muda
    python producao/painel.py --abrir    # idem + abre o navegador (é o que o ABRIR_PAINEL.bat usa)

Regras:
- A chave secreta do Supabase só existe aqui no servidor local. O navegador recebe dados prontos.
- Aprovar e Publicar são botões separados. Nada publica sozinho: Publicar só funciona
  depois de Aprovar e só quando você clica.
- A aba Conexões mostra só "configurado/pendente". Nenhum valor de chave sai do servidor.
- Só aceita conexões de 127.0.0.1. Toda ação exige o token da sessão (outro site aberto no
  navegador não consegue disparar nada).

Estado local (aprovações, checklist, cargos, testes) fica em producao/dados/estado.json.
"""
from __future__ import annotations

import hashlib
import json
import mimetypes
import os
import queue
import re
import secrets
import shutil
import socket
import subprocess
import sys
import threading
import time
import traceback
import webbrowser
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

PRODUCAO = Path(__file__).resolve().parent
RAIZ = PRODUCAO.parent
FABRICA = RAIZ / "fabrica"
sys.path.insert(0, str(FABRICA))
sys.path.insert(0, str(PRODUCAO))

import config  # noqa: E402  (carrega .env/.env.local e o User-Agent)
import copies  # noqa: E402
import episodio  # noqa: E402
import publicacao as pub  # noqa: E402  (status de cada rede, travas contra post duplicado)

HOST, PORTA = "127.0.0.1", 8800
URL = f"http://{HOST}:{PORTA}"
DADOS = PRODUCAO / "dados"
OCUPADO = DADOS / ".ocupado"           # existe enquanto a fila roda: o supervisor espera para reiniciar
PORTA_PREVIA = 3000
FUSO = timezone(timedelta(hours=-3))   # America/Sao_Paulo (sem horário de verão desde 2019)
GIT = shutil.which("git") or "git"
NPM = shutil.which("npm") or "npm"


# =====================================================================
# Supervisor (reinício automático quando o código muda)
# =====================================================================
def porta_aberta(porta: int) -> bool:
    with socket.socket() as s:
        s.settimeout(0.3)
        return s.connect_ex((HOST, porta)) == 0


def assinatura_codigo() -> tuple:
    arquivos = sorted([*PRODUCAO.glob("*.py"), *FABRICA.glob("*.py")])
    return tuple((p.name, p.stat().st_mtime) for p in arquivos)


def supervisor(abrir: bool) -> None:
    if porta_aberta(PORTA):
        print(f"O painel já está rodando em {URL}")
        if abrir:
            webbrowser.open(URL)
        return
    DADOS.mkdir(exist_ok=True)
    OCUPADO.unlink(missing_ok=True)
    filho, assinatura, aberto = None, assinatura_codigo(), False
    print(f"Painel em {URL}  (Ctrl+C para parar)")
    try:
        while True:
            if filho is None or filho.poll() is not None:
                if filho is not None:
                    print(f"  servidor parou (código {filho.returncode}); reiniciando em 2 s…")
                    time.sleep(2)
                filho = subprocess.Popen([sys.executable, str(Path(__file__)), "--filho"])
                if abrir and not aberto:
                    for _ in range(50):
                        if porta_aberta(PORTA):
                            break
                        time.sleep(0.2)
                    webbrowser.open(URL)
                    aberto = True
            time.sleep(1)
            nova = assinatura_codigo()
            if nova != assinatura and not OCUPADO.exists():
                print("  código mudou → reiniciando o servidor")
                assinatura = nova
                filho.terminate()
                try:
                    filho.wait(10)
                except subprocess.TimeoutExpired:
                    filho.kill()
                filho = None
                time.sleep(0.3)
    except KeyboardInterrupt:
        print("\nPainel encerrado.")
        if filho:
            filho.terminate()


# =====================================================================
# Estado local, sinal de atualização e fila de produção
# =====================================================================
class Sinal:
    """Contador de versão: qualquer mudança incrementa e acorda o SSE do navegador."""

    def __init__(self) -> None:
        self.versao = 0        # qualquer novidade (inclui linha de log)
        self.dados = 0         # dado mudou → a aba aberta busca de novo
        self.recarregar = 0    # painel.html mudou → o navegador recarrega
        self.cond = threading.Condition()

    def mudou(self, recarregar: bool = False, dados: bool = True) -> None:
        with self.cond:
            self.versao += 1
            if dados:
                self.dados += 1
            if recarregar:
                self.recarregar += 1
            self.cond.notify_all()


SINAL = Sinal()

PADRAO_ESTADO = {
    "episodios": {},     # "1": {aprovado_em, publicado_em}
    "copies": {},        # "1": {"youtube": {aprovado_em, postado_url}}
    "checklist": {},     # "NM000001": {"revisado": true, ...}
    "testes": {"personagens": [], "pedidos": []},
    "cargos": {
        "catalogo": [
            {"id": "engenheiro", "emoji": "🛠️", "nome": "Engenheiro(a)"},
            {"id": "botanico", "emoji": "🌱", "nome": "Botânico(a)"},
            {"id": "comunicacoes", "emoji": "📡", "nome": "Comunicações"},
            {"id": "explorador", "emoji": "🧭", "nome": "Explorador(a)"},
            {"id": "destaque", "emoji": "⭐", "nome": "Destaque da semana"},
        ],
        "atribuicoes": {},  # codigo → [ids]
    },
    "site": {},          # aprovado_hash, aprovado_em, publicado_em, previa_pid
}
ITENS_CHECKLIST = [
    ("revisado", "Nome revisado"),
    ("sprite", "Sprite desenhado"),
    ("episodio", "Apareceu num episódio"),
    ("aviso", "Aviso no WhatsApp enviado"),
]


class Estado:
    def __init__(self) -> None:
        self.arq = DADOS / "estado.json"
        self.lock = threading.RLock()

    def ler(self) -> dict:
        with self.lock:
            d = json.loads(self.arq.read_text(encoding="utf-8")) if self.arq.exists() else {}
            for k, v in PADRAO_ESTADO.items():
                d.setdefault(k, json.loads(json.dumps(v)))
            return d

    def mudar(self, fn) -> dict:
        with self.lock:
            d = self.ler()
            fn(d)
            tmp = self.arq.with_suffix(".tmp")
            tmp.write_text(json.dumps(d, ensure_ascii=False, indent=2), encoding="utf-8")
            tmp.replace(self.arq)
        SINAL.mudou()
        return d


ESTADO = Estado()


def agora() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Job:
    def __init__(self, titulo: str, fn) -> None:
        self.id = secrets.token_hex(4)
        self.titulo, self.fn = titulo, fn
        self.status, self.linhas = "na fila", []
        self.inicio = self.fim = None

    def log(self, linha: str) -> None:
        self.linhas.append(linha.rstrip())
        del self.linhas[:-400]
        SINAL.mudou(dados=False)

    def json(self, completo: bool = False) -> dict:
        return {"id": self.id, "titulo": self.titulo, "status": self.status, "inicio": self.inicio, "fim": self.fim,
                "log": self.linhas if completo else self.linhas[-6:]}


class Fila:
    """Trabalhos longos (gerar episódio, publicar) rodam um por vez em segundo plano."""

    def __init__(self) -> None:
        self.q: queue.Queue[Job] = queue.Queue()
        self.jobs: list[Job] = []
        threading.Thread(target=self._trabalhar, daemon=True).start()

    def adicionar(self, titulo: str, fn) -> Job:
        j = Job(titulo, fn)
        self.jobs.append(j)
        del self.jobs[:-25]
        self.q.put(j)
        SINAL.mudou()
        return j

    def ocupada(self, prefixo: str) -> bool:
        return any(j.titulo.startswith(prefixo) and j.status in ("na fila", "rodando") for j in self.jobs)

    def _trabalhar(self) -> None:
        while True:
            j = self.q.get()
            OCUPADO.touch()
            j.status, j.inicio = "rodando", agora()
            SINAL.mudou()
            try:
                j.fn(j)
                j.status = "ok"
            except Exception as e:  # noqa: BLE001
                j.status = "erro"
                j.log(f"ERRO: {e}")
            finally:
                j.fim = agora()
                if self.q.empty():
                    OCUPADO.unlink(missing_ok=True)
                SINAL.mudou()


FILA = Fila()


def rodar(job: Job, cmd: list[str], cwd: Path) -> None:
    job.log("$ " + " ".join(Path(c).name if i == 0 else c for i, c in enumerate(cmd)))
    env = {**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUNBUFFERED": "1"}
    p = subprocess.Popen(cmd, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env=env,
                         text=True, encoding="utf-8", errors="replace")
    for linha in p.stdout:
        if linha.strip():
            job.log(linha)
    if p.wait() != 0:
        raise RuntimeError(f"comando terminou com código {p.returncode}")


def sh(*args: str, cwd: Path = RAIZ) -> str:
    r = subprocess.run(list(args), cwd=cwd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    return r.stdout.strip()


# =====================================================================
# Supabase (só aqui no servidor)
# =====================================================================
_db = None


def db() -> episodio.Supabase:
    global _db
    if _db is None:
        _db = episodio.Supabase()   # User-Agent: config.USER_AGENT
    return _db


def iso_dias(dias: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=dias)).isoformat()


def inicio_hoje_utc() -> datetime:
    local = datetime.now(FUSO).replace(hour=0, minute=0, second=0, microsecond=0)
    return local.astimezone(timezone.utc)


def data_local(iso: str) -> str:
    return datetime.fromisoformat(iso).astimezone(FUSO).date().isoformat()


def ts(iso: str) -> datetime:
    return datetime.fromisoformat(iso)


# =====================================================================
# Dados de cada aba
# =====================================================================
def pastas_episodios() -> list[tuple[int, Path]]:
    out = []
    for p in sorted(config.SAIDA.glob("ep[0-9][0-9][0-9]")):
        out.append((int(p.name[2:]), p))
    return out


def video_de(pasta: Path) -> Path | None:
    n = pasta.name[2:]
    for nome in (f"episodio_{n}.mp4", f"episodio_{n}_previa_sem_voz.mp4"):
        if (pasta / nome).exists():
            return pasta / nome
    return None


CAMPOS_REDE = ("status", "em", "detalhe", "publicar_em", "url", "ultimo_ensaio", "ultimo_ensaio_resultado")


def redes_de(numero: int) -> dict:
    todas = pub.ler().get(str(numero), {})
    return {r: {k: todas.get(r, {}).get(k) for k in CAMPOS_REDE} | {"status": todas.get(r, {}).get("status", "pendente")}
            for r in pub.REDES}


def dados_episodios() -> dict:
    est = ESTADO.ler()
    try:
        no_banco = {e["numero"]: e for e in db().get("episodios", {"select": "numero,titulo,publicado_em,url_youtube,url_instagram,url_tiktok"})}
    except Exception:  # noqa: BLE001
        no_banco = {}
    lista = []
    for n, pasta in pastas_episodios():
        rot = pasta / "roteiro.json"
        lt = pasta / "linha_do_tempo.json"
        v = video_de(pasta)
        e = est["episodios"].get(str(n), {})
        lista.append({
            "numero": n,
            "titulo": config.ler_json(rot)["titulo"] if rot.exists() else f"Episódio {n}",
            "duracao": config.ler_json(lt)["duracao"] if lt.exists() else None,
            "falas": [{"id": c["id"], "fala": c["fala"]} for c in config.ler_json(rot)["cenas"]] if rot.exists() else [],
            "video": f"/midia/{pasta.name}/{v.name}?v={int(v.stat().st_mtime)}" if v else None,
            "sem_voz": bool(v and "sem_voz" in v.name),
            "gerado_em": datetime.fromtimestamp(v.stat().st_mtime, timezone.utc).isoformat(timespec="seconds") if v else None,
            "aprovado_em": e.get("aprovado_em"),
            "publicado_em": e.get("publicado_em") or (no_banco.get(n) or {}).get("publicado_em"),
            "copies": (pasta / "copies.json").exists(),
            "gerando": FILA.ocupada(f"Gerar episódio {n} "),
            "redes": redes_de(n),
            "postando": FILA.ocupada(f"Postar episódio {n} "),
            "copies_aprovadas": {p: bool(est["copies"].get(str(n), {}).get(p, {}).get("aprovado_em")) for p in pub.REDES},
        })
    publicados = [n for n, e in no_banco.items() if e.get("publicado_em")]
    return {"episodios": lista[::-1], "proximo": (max(publicados) + 1) if publicados else 1}


def dados_copies(numero: int) -> dict:
    arq = config.pasta_episodio(numero) / "copies.json"
    est = ESTADO.ler()["copies"].get(str(numero), {})
    if not arq.exists():
        return {"existe": False}
    c = config.ler_json(arq)
    auto = redes_de(numero)
    return {"existe": True, "copies": {p: {**c[p], **est.get(p, {}), "rotulo": copies.PLATAFORMAS[p]["rotulo"],
                                           "auto": auto[p], "regras": pub.validar_copy(p, c[p])}
                                       for p in copies.PLATAFORMAS}}


def hash_site() -> str:
    """Identidade do que seria publicado: commit atual + mudanças pendentes."""
    h = hashlib.sha1()
    h.update(sh(GIT, "rev-parse", "HEAD").encode())
    h.update(sh(GIT, "status", "--porcelain").encode())
    h.update(sh(GIT, "diff", "HEAD").encode("utf-8", "replace"))
    for linha in sh(GIT, "ls-files", "--others", "--exclude-standard").splitlines():
        p = RAIZ / linha
        if p.is_file():
            h.update(f"{linha}:{p.stat().st_size}:{p.stat().st_mtime}".encode())
    return h.hexdigest()


def dados_site() -> dict:
    est = ESTADO.ler()["site"]
    mudancas = [l for l in sh(GIT, "status", "--porcelain").splitlines() if l.strip()]
    contagem = sh(GIT, "rev-list", "--left-right", "--count", "@{u}...HEAD")
    atras, frente = (contagem.split() + ["0", "0"])[:2] if contagem else ("?", "?")
    atual = hash_site()
    return {
        "branch": sh(GIT, "branch", "--show-current"),
        "ultimo_commit": sh(GIT, "log", "-1", "--format=%h · %s · %cr"),
        "mudancas": mudancas[:200],
        "commits_nao_enviados": frente,
        "commits_remotos_novos": atras,
        "aprovado": bool(est.get("aprovado_hash")) and est.get("aprovado_hash") == atual,
        "aprovado_em": est.get("aprovado_em"),
        "aprovacao_vencida": bool(est.get("aprovado_hash")) and est.get("aprovado_hash") != atual,
        "publicado_em": est.get("publicado_em"),
        "previa_rodando": porta_aberta(PORTA_PREVIA),
        "previa_url": f"http://127.0.0.1:{PORTA_PREVIA}",
        "producao_url": f"https://{config.SITE_TELA}",
        "publicando": FILA.ocupada("Publicar site"),
    }


def eh_teste_pedido(p: dict, testes: dict, ids_teste: set) -> bool:
    return p["id"] in testes["pedidos"] or (p.get("personagem_id") in ids_teste)


def dados_visao(ocultar: bool) -> dict:
    est = ESTADO.ler()
    testes = est["testes"]
    pers = db().todos("personagens", {"select": "id,codigo,created_at,origem_source,origem_campaign,visitante_id", "order": "id.asc"})
    peds = db().todos("pedidos", {"select": "id,status,valor_centavos,personagem_id,created_at", "order": "id.asc"})
    clqs = db().todos("cliques", {"select": "id,tipo,visitante_id,created_at", "order": "id.asc"})
    ids_teste = {p["id"] for p in pers if p["codigo"] in testes["personagens"]}
    visit_teste = {p["visitante_id"] for p in pers if p["id"] in ids_teste and p.get("visitante_id")}
    if ocultar:
        pers = [p for p in pers if p["id"] not in ids_teste]
        peds = [p for p in peds if not eh_teste_pedido(p, testes, ids_teste)]
        clqs = [c for c in clqs if c.get("visitante_id") not in visit_teste]
    pagos = [p for p in peds if p["status"] in episodio.STATUS_PAGOS]

    agora_utc = datetime.now(timezone.utc)
    periodos = {"hoje": inicio_hoje_utc(), "7 dias": agora_utc - timedelta(days=7),
                "30 dias": agora_utc - timedelta(days=30), "total": datetime.min.replace(tzinfo=timezone.utc)}

    def contar(lista, desde, filtro=lambda x: True):
        return sum(1 for x in lista if ts(x["created_at"]) >= desde and filtro(x))

    tabela = []
    for nome, desde in periodos.items():
        tabela.append({
            "periodo": nome,
            "visitas": contar(clqs, desde, lambda c: c["tipo"] == "link"),
            "cliques_comprar": contar(clqs, desde, lambda c: c["tipo"] == "checkout"),
            "cadastros": contar(pers, desde),
            "vendas": contar(pagos, desde),
            "receita_centavos": sum(p["valor_centavos"] for p in pagos if ts(p["created_at"]) >= desde),
        })

    dias = [(datetime.now(FUSO).date() - timedelta(days=i)).isoformat() for i in range(13, -1, -1)]
    por_dia = {d: {"dia": d, "visitas": 0, "cadastros": 0, "vendas": 0, "receita_centavos": 0} for d in dias}
    for c in clqs:
        if c["tipo"] == "link" and (d := data_local(c["created_at"])) in por_dia:
            por_dia[d]["visitas"] += 1
    for p in pers:
        if (d := data_local(p["created_at"])) in por_dia:
            por_dia[d]["cadastros"] += 1
    for p in pagos:
        if (d := data_local(p["created_at"])) in por_dia:
            por_dia[d]["vendas"] += 1
            por_dia[d]["receita_centavos"] += p["valor_centavos"]

    origens: dict[str, dict] = {}
    compradores = {p["personagem_id"] for p in pagos if p.get("personagem_id")}
    for p in pers:
        k = p.get("origem_source") or "direto"
        o = origens.setdefault(k, {"origem": k, "cadastros": 0, "compradores": 0})
        o["cadastros"] += 1
        o["compradores"] += p["id"] in compradores
    return {
        "ocultando_testes": ocultar,
        "testes_marcados": len(testes["personagens"]) + len(testes["pedidos"]),
        "periodos": tabela,
        "dias": list(por_dia.values())[::-1],
        "origens": sorted(origens.values(), key=lambda o: -o["cadastros"]),
        "obs": "Visitas = cliques em links rastreáveis (/l/…). O site ainda não conta visitas de página.",
    }


def dados_colonos() -> dict:
    est = ESTADO.ler()
    pers = db().todos("personagens", {"select": (
        "id,codigo,nome,handle,handle_plataforma,status,oculto,aceita_whatsapp,sprite_url,created_at,"
        "origem_source,origem_medium,origem_campaign,origem_content,origem_link_slug,origem_referer,"
        "ultimo_source,ultimo_campaign,ultimo_link_slug"), "order": "id.desc"})
    pagos = db().get("pedidos", {"select": "personagem_id", "status": f"in.({','.join(episodio.STATUS_PAGOS)})"})
    compras = {}
    for p in pagos:
        if p.get("personagem_id"):
            compras[p["personagem_id"]] = compras.get(p["personagem_id"], 0) + 1
    for p in pers:
        p["compras"] = compras.get(p["id"], 0)
        p["checklist"] = est["checklist"].get(p["codigo"], {})
        p["teste"] = p["codigo"] in est["testes"]["personagens"]
        p["cargos"] = est["cargos"]["atribuicoes"].get(p["codigo"], [])
    return {"colonos": pers, "itens": ITENS_CHECKLIST, "catalogo": est["cargos"]["catalogo"]}


def dados_compras() -> dict:
    est = ESTADO.ler()
    peds = db().todos("pedidos", {"select": (
        "id,cakto_order_id,status,valor_centavos,metodo,cliente_nome,utm_source,utm_campaign,opcao,"
        "texto_personalizado,created_at,atualizado_em,personagem_id,"
        "produto:produtos(nome,slug),personagem:personagens(codigo,nome)"), "order": "id.desc"})
    testes_p = set(est["testes"]["personagens"])
    for p in peds:
        p["pago"] = p["status"] in episodio.STATUS_PAGOS
        p["teste"] = p["id"] in est["testes"]["pedidos"] or ((p.get("personagem") or {}).get("codigo") in testes_p)
    return {"compras": peds}


def dados_produtos() -> dict:
    prods = db().get("produtos", {"select": "id,slug,nome,descricao,preco_centavos,tipo,ativo,ordem,checkout_url,cakto_product_id,imagem_url", "order": "ordem.asc,id.asc"})
    desemp = {d["slug"]: d for d in db().get("v_produtos_desempenho", {"select": "*"})}
    for p in prods:
        d = desemp.get(p["slug"], {})
        p.update({k: d.get(k, 0) for k in ("cliques_comprar", "vendas", "resgates", "receita_centavos")})
        p["checkout_configurado"] = bool(p.pop("checkout_url", None))
        p["cakto_configurado"] = bool(p.pop("cakto_product_id", None))
    return {"produtos": prods}


def dados_cargos() -> dict:
    est = ESTADO.ler()
    pers = {p["codigo"]: p for p in db().todos("personagens", {"select": "id,codigo,nome", "order": "id.asc"})}
    por_id = {p["id"]: p for p in pers.values()}
    pagos = db().get("pedidos", {"select": "personagem_id", "status": f"in.({','.join(episodio.STATUS_PAGOS)})"})
    apoiadores = sorted({por_id[p["personagem_id"]]["codigo"] for p in pagos if p.get("personagem_id") in por_id})
    cat = est["cargos"]["catalogo"]
    membros = {c["id"]: [] for c in cat}
    for codigo, ids in est["cargos"]["atribuicoes"].items():
        for i in ids:
            if i in membros and codigo in pers:
                membros[i].append({"codigo": codigo, "nome": pers[codigo]["nome"]})
    fundadores = [{"codigo": f["id"], "nome": f["nome"]} for f in config.colonia()["fundadores"]]
    return {
        "automaticos": [
            {"id": "fundador", "emoji": "🚀", "nome": "Fundador(a)", "regra": "Personagens da história", "membros": fundadores},
            {"id": "apoiador", "emoji": "💎", "nome": "Apoiador(a)", "regra": "Tem compra paga",
             "membros": [{"codigo": c, "nome": pers[c]["nome"]} for c in apoiadores]},
        ],
        "catalogo": [{**c, "membros": membros[c["id"]]} for c in cat],
        "obs": "Cargos manuais ficam guardados neste computador (o site ainda não mostra cargos).",
    }


def dados_chat() -> dict:
    try:
        msgs = db().get("chat_mensagens", {"select": "*", "order": "id.desc", "limit": 200})
        return {"existe": True, "mensagens": msgs}
    except episodio.TabelaAusente:
        return {"existe": False, "obs": "O site ainda não tem chat (não existe a tabela chat_mensagens no Supabase). "
                                        "Quando o chat for criado, a moderação aparece aqui."}


def dados_aprovacoes() -> dict:
    pend, prontos = [], []
    est = ESTADO.ler()
    for e in dados_episodios()["episodios"]:
        if not e["video"] or e["gerando"]:
            continue
        if not e["aprovado_em"]:
            pend.append({"tipo": "episodio", "id": e["numero"], "titulo": f"🎬 {e['titulo']}",
                         "detalhe": "Vídeo pronto para revisão" + (" (prévia SEM voz)" if e["sem_voz"] else "")})
        elif not e["publicado_em"]:
            prontos.append({"tipo": "episodio", "id": e["numero"], "titulo": f"🎬 {e['titulo']}", "detalhe": "Aprovado"})
        for p, s in e["redes"].items():
            if s["status"] == "conferir":
                pend.append({"tipo": "conferir", "id": e["numero"], "plataforma": p,
                             "titulo": f"⚠ Conferir {pub.ROTULOS[p]} · ep. {e['numero']}",
                             "detalhe": (s.get("detalhe") or "pode ter publicado") + " · abra o app e confira antes de liberar"})
        if e["copies"]:
            c = dados_copies(e["numero"])["copies"]
            for p, v in c.items():
                feito = v.get("postado_url") or v["auto"]["status"] in pub.TRAVADOS
                if not v.get("aprovado_em"):
                    pend.append({"tipo": "copy", "id": e["numero"], "plataforma": p,
                                 "titulo": f"📢 Copy {v['rotulo']} · ep. {e['numero']}", "detalhe": "Texto de divulgação"})
                elif not feito:
                    prontos.append({"tipo": "copy", "id": e["numero"], "plataforma": p,
                                    "titulo": f"📢 {v['rotulo']} · ep. {e['numero']}",
                                    "detalhe": "Aprovada, falta postar" + (" (última tentativa falhou antes de publicar)"
                                                                          if v["auto"]["status"] == "erro" else "")})
    s = dados_site()
    if s["mudancas"] or s["commits_nao_enviados"] not in ("0", "?"):
        (prontos if s["aprovado"] else pend).append(
            {"tipo": "site", "id": 0, "titulo": "🌐 Site", "detalhe": f"{len(s['mudancas'])} arquivo(s) alterado(s)"})
    try:
        resg = db().get("resgates", {"select": "id,texto,created_at,produto:produtos(nome),personagem:personagens(codigo,nome)",
                                     "status": "eq.pendente", "order": "id.asc"})
        for r in resg:
            pend.append({"tipo": "resgate", "id": r["id"], "titulo": f"🎁 {(r.get('produto') or {}).get('nome', 'Item grátis')}",
                         "detalhe": f"{(r.get('personagem') or {}).get('nome', '?')} pediu: “{r['texto']}”"})
        novos = db().get("personagens", {"select": "codigo,nome,handle,handle_plataforma,created_at",
                                         "oculto": "eq.false", "order": "id.desc", "limit": 100})
        for p in novos:
            if not est["checklist"].get(p["codigo"], {}).get("revisado"):
                pend.append({"tipo": "colono", "id": p["codigo"], "titulo": f"👥 {p['nome']}",
                             "detalhe": f"@{p['handle']} ({p['handle_plataforma']}) · nome aparece no site e nos vídeos"})
    except Exception as e:  # noqa: BLE001
        pend.append({"tipo": "erro", "id": 0, "titulo": "Supabase indisponível", "detalhe": str(e)[:200]})
    return {"pendentes": pend, "prontos": prontos}


# ---------- Conexões (nunca devolve valores) ----------
_cache_conexoes: dict = {}


def _env_ok(nome: str) -> bool:
    return bool((os.environ.get(nome) or "").strip())


def dados_conexoes(forcar: bool = False) -> dict:
    if not forcar and _cache_conexoes.get("em", 0) > time.time() - 120:
        return _cache_conexoes["dados"]
    import requests
    itens = []

    def add(grupo, nome, status, detalhe=""):
        itens.append({"grupo": grupo, "nome": nome, "status": status, "detalhe": detalhe})

    def env(grupo, nome, obrigatoria=True, detalhe=""):
        add(grupo, nome, "configurado" if _env_ok(nome) else ("pendente" if obrigatoria else "opcional"), detalhe)

    # Supabase
    env("Supabase", "SUPABASE_URL")
    env("Supabase", "SUPABASE_SERVICE_ROLE_KEY", detalhe="usada só por este servidor local")
    try:
        n = db().contar("personagens", {})
        add("Supabase", "Conexão com o banco", "ok", f"{n} personagens")
        try:
            db().get("colonia_obras", {"select": "slug", "limit": 1})
            add("Supabase", "Tabela colonia_obras (migração 004)", "ok")
        except episodio.TabelaAusente:
            add("Supabase", "Tabela colonia_obras (migração 004)", "pendente", "rode supabase/migrations/004_colonia_obras.sql")
    except Exception as e:  # noqa: BLE001
        add("Supabase", "Conexão com o banco", "erro", str(e)[:160])

    # ElevenLabs
    chave = (os.environ.get("ELEVENLABS_API_KEY") or "").strip()
    if not chave:
        add("ElevenLabs", "ELEVENLABS_API_KEY", "pendente")
    elif not chave.startswith("sk_"):
        add("ElevenLabs", "ELEVENLABS_API_KEY", "erro", "não começa com sk_ (parece o ID da chave)")
    else:
        try:
            r = requests.get(f"{config.ELEVEN_URL}/v1/user/subscription", timeout=15,
                             headers={"xi-api-key": chave, "User-Agent": config.USER_AGENT})
            if r.ok:
                s = r.json()
                add("ElevenLabs", "ELEVENLABS_API_KEY", "ok", f"plano {s.get('tier')} · {s.get('character_count')}/{s.get('character_limit')} caracteres")
            elif "missing_permissions" in r.text:
                add("ElevenLabs", "ELEVENLABS_API_KEY", "ok", "chave válida (sem permissão para ver o saldo)")
            else:
                add("ElevenLabs", "ELEVENLABS_API_KEY", "erro", f"recusada ({r.status_code})")
        except Exception as e:  # noqa: BLE001
            add("ElevenLabs", "ELEVENLABS_API_KEY", "erro", str(e)[:120])
    env("ElevenLabs", "ELEVENLABS_VOICE_ID", obrigatoria=False, detalhe=f"sem ela, usa a voz {config.ELEVEN_VOZ_NOME}")

    # Cakto, site e painel do site
    env("Cakto", "CAKTO_WEBHOOK_TOKEN")
    env("Cakto", "CAKTO_WEBHOOK_SECRET", obrigatoria=False)
    env("Site", "NEXT_PUBLIC_SITE_URL")
    env("Site", "PAINEL_USER")
    env("Site", "PAINEL_PASS")
    env("Site", "CRON_SECRET")
    site = (os.environ.get("NEXT_PUBLIC_SITE_URL") or "").strip()
    if site:
        try:
            r = requests.get(site, timeout=15, headers={"User-Agent": config.USER_AGENT})
            add("Site", "Site no ar", "ok" if r.ok else "erro", f"{urlparse(site).netloc} → HTTP {r.status_code}")
        except Exception as e:  # noqa: BLE001
            add("Site", "Site no ar", "erro", str(e)[:120])

    # Redes (opcionais)
    for nome in ("YOUTUBE_API_KEY", "YOUTUBE_CHANNEL_ID", "IG_USER_ID", "IG_ACCESS_TOKEN",
                 "TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET", "TIKTOK_REFRESH_TOKEN"):
        env("Redes sociais", nome, obrigatoria=False)

    # Publicação automática (Capítulo 09)
    try:
        import youtube as yt_mod
        for nome, ok, det in yt_mod.checar():
            if nome != "FFmpeg":
                add("Publicação: YouTube (n8n)", nome, "configurado" if ok else "pendente", "" if ok else det)
    except Exception as e:  # noqa: BLE001
        add("Publicação: YouTube (n8n)", "youtube.py", "erro", str(e)[:120])
    try:
        import celular as cel_mod
        for nome, ok, det in cel_mod.checar():
            add("Publicação: celular (ADB)", nome, "ok" if ok else "pendente", det)
    except Exception as e:  # noqa: BLE001
        add("Publicação: celular (ADB)", "celular.py", "erro", str(e)[:120])

    # Ferramentas locais
    add("Ferramentas", "FFmpeg", "ok" if shutil.which("ffmpeg") else "pendente")
    nav = next((n for n, c in (("Chrome", r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
                               ("Edge", r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe")) if Path(c).exists()), None)
    add("Ferramentas", "Navegador para filmagem", "ok" if nav else "pendente", nav or "instale o Chrome")
    remoto = sh(GIT, "remote", "get-url", "origin")
    add("Ferramentas", "Git (GitHub)", "ok" if remoto else "pendente", re.sub(r"https://[^@]*@", "https://", remoto))
    add("Ferramentas", "npm (prévia do site)", "ok" if shutil.which("npm") else "pendente")

    dados = {"itens": itens, "testado_em": agora()}
    _cache_conexoes.update(em=time.time(), dados=dados)
    return dados


# =====================================================================
# Ações (POST /api/acao)
# =====================================================================
def _ep(d: dict) -> int:
    n = int(d["numero"])
    if not 1 <= n <= 999:
        raise ValueError("número de episódio inválido")
    return n


def acao_gerar_episodio(d: dict):
    n = _ep(d)
    if FILA.ocupada(f"Gerar episódio {n} "):
        raise ValueError("este episódio já está na fila")
    args = [sys.executable, "fabricar.py", "--episodio", str(n)]
    if d.get("so_fundadores"):
        args.append("--so-fundadores")
    if d.get("sem_voz"):
        args.append("--sem-voz")

    def fn(job):
        ESTADO.mudar(lambda e: e["episodios"].pop(str(n), None))   # vídeo novo precisa de aprovação nova
        ESTADO.mudar(lambda e: e["copies"].pop(str(n), None))
        rodar(job, args, FABRICA)
        job.log(f"copies: {copies.gravar(n)}")
    j = FILA.adicionar(f"Gerar episódio {n} " + ("(sem voz)" if d.get("sem_voz") else ""), fn)
    return {"job": j.id}


def acao_aprovar_episodio(d: dict):
    n = _ep(d)
    if not video_de(config.pasta_episodio(n)):
        raise ValueError("o episódio ainda não tem vídeo")
    ESTADO.mudar(lambda e: e["episodios"].setdefault(str(n), {}).update(aprovado_em=agora()))


def acao_desaprovar_episodio(d: dict):
    n = _ep(d)
    ESTADO.mudar(lambda e: e["episodios"].get(str(n), {}).pop("aprovado_em", None))


def acao_publicar_episodio(d: dict):
    n = _ep(d)
    est = ESTADO.ler()["episodios"].get(str(n), {})
    if not est.get("aprovado_em"):
        raise ValueError("aprove o episódio antes de publicar")
    pasta = config.pasta_episodio(n)
    v = video_de(pasta)
    if v and "sem_voz" in v.name:
        raise ValueError("este vídeo é a prévia SEM voz: gere com voz antes de publicar")

    def fn(job):
        _registrar(job, n)
        job.log("Pronto. Agora use 📤 Publicar nas redes (ou poste à mão e marque na aba Divulgação).")
    j = FILA.adicionar(f"Publicar episódio {n}", fn)
    return {"job": j.id}


def _registrar(job: Job, n: int) -> None:
    """Registra o episódio como publicado no Supabase e cria os links /l/ de cada rede."""
    pasta = config.pasta_episodio(n)
    rot = config.ler_json(pasta / "roteiro.json")
    episodio.registrar_publicacao(n, rot["titulo"], rot.get("missao_obra"),
                                  progresso=(rot.get("obra_progresso") or [0, 100])[1], dias=rot.get("obra_dia"),
                                  resumo={k: rot.get(k) for k in ("estacao", "problema") if rot.get(k)} or None)
    job.log(f"episódio {n} registrado como publicado no Supabase")
    ep_id = db().get("episodios", {"select": "id", "numero": f"eq.{n}"})[0]["id"]
    for plat, info in copies.PLATAFORMAS.items():
        slug = copies.slug_link(plat, n)
        db().escrever("POST", "links", {"on_conflict": "slug"},
                      {"slug": slug, "destino": "/", "plataforma": info["plataforma"], "campanha": f"ep{n:03d}",
                       "episodio_id": ep_id, "descricao": f"Descrição do episódio {n} no {info['rotulo']}"},
                      prefer="resolution=merge-duplicates,return=minimal")
        job.log(f"link rastreável criado: /l/{slug}")
    dados = config.ler_json(pasta / "dados.json")

    def marcar(e):
        e["episodios"].setdefault(str(n), {})["publicado_em"] = agora()
        for c in dados.get("novos", []):
            e["checklist"].setdefault(c["codigo"], {})["episodio"] = True
    ESTADO.mudar(marcar)


def acao_postar_redes(d: dict):
    """📤 Publicar nas redes: celular.py (Instagram/TikTok) e youtube.py (n8n), com log ao vivo."""
    n = _ep(d)
    ensaio = bool(d.get("ensaio"))
    redes = [r for r in d.get("redes", []) if r in pub.REDES]
    if not redes:
        raise ValueError("marque pelo menos uma rede")
    if FILA.ocupada("Postar episódio "):
        raise ValueError("já tem uma postagem na fila: espere terminar")
    est = ESTADO.ler()
    if not est["episodios"].get(str(n), {}).get("aprovado_em"):
        raise ValueError("aprove o episódio antes de publicar")
    v = video_de(config.pasta_episodio(n))
    if not v or "sem_voz" in v.name:
        raise ValueError("o episódio precisa do vídeo COM voz")
    for r in redes:
        if not est["copies"].get(str(n), {}).get(r, {}).get("aprovado_em"):
            raise ValueError(f"aprove a copy do {pub.ROTULOS[r]} antes (aba Divulgação)")
        s = pub.status(n, r)["status"]
        if s in pub.TRAVADOS and not ensaio:
            raise ValueError(f"{pub.ROTULOS[r]} está '{s}': nada é reenviado sozinho. Confira no app e use Liberar se precisar.")
    cel = [r for r in redes if r in ("instagram", "tiktok")]

    def fn(job):
        if not ensaio and not ESTADO.ler()["episodios"].get(str(n), {}).get("publicado_em"):
            job.log("episódio ainda não registrado → registrando antes de postar (cria os links /l/)")
            _registrar(job, n)
        falhas = []
        etapas = []
        if cel:
            etapas.append(("celular", [sys.executable, "celular.py", "--episodio", str(n)]
                           + (["--so", cel[0]] if len(cel) == 1 else []) + (["--ensaio"] if ensaio else [])))
        if "youtube" in redes:
            etapas.append(("youtube", [sys.executable, "youtube.py", "--episodio", str(n)] + (["--ensaio"] if ensaio else [])))
        for nome, cmd in etapas:
            try:
                rodar(job, cmd, PRODUCAO)
            except RuntimeError:
                falhas.append(nome)
            SINAL.mudou()
        resumo = " · ".join(f"{pub.ROTULOS[r]}: {pub.status(n, r)['status']}" for r in redes)
        job.log(("ENSAIO terminado. " if ensaio else "") + resumo)
        if falhas:
            raise RuntimeError(f"problema em: {', '.join(falhas)} (veja o log acima)")
    j = FILA.adicionar(f"Postar episódio {n} " + ("(ensaio) " if ensaio else "") + "· " + ", ".join(pub.ROTULOS[r] for r in redes), fn)
    return {"job": j.id, "msg": "Postagem na fila" + (" (ensaio)" if ensaio else "")}


def acao_liberar_rede(d: dict):
    """Volta uma rede para 'pendente' depois que VOCÊ conferiu no app. Única forma de reenviar."""
    n, r = _ep(d), d.get("plataforma")
    if r not in pub.REDES:
        raise ValueError("rede inválida")
    if FILA.ocupada(f"Postar episódio {n} "):
        raise ValueError("espere a postagem em andamento terminar")
    pub.liberar(n, r, "liberado no painel depois de conferir")
    SINAL.mudou()


def acao_gerar_copies(d: dict):
    n = _ep(d)
    copies.gravar(n)
    ESTADO.mudar(lambda e: e["copies"].pop(str(n), None))


def _salvar_copy(n: int, plat: str, campos: dict) -> None:
    if plat not in copies.PLATAFORMAS:
        raise ValueError("plataforma inválida")
    arq = config.pasta_episodio(n) / "copies.json"
    c = config.ler_json(arq)
    for k, v in campos.items():
        if k in c[plat] and k not in ("link", "obs") and isinstance(v, str):
            c[plat][k] = v
    config.gravar_json(arq, c)


def acao_salvar_copy(d: dict):
    n, plat = _ep(d), d["plataforma"]
    _salvar_copy(n, plat, d.get("campos", {}))
    ESTADO.mudar(lambda e: e["copies"].setdefault(str(n), {}).pop(plat, None))   # texto mudou → aprovar de novo


def acao_aprovar_copy(d: dict):
    n, plat = _ep(d), d["plataforma"]
    if d.get("campos"):
        _salvar_copy(n, plat, d["campos"])
    problemas = pub.validar_copy(plat, config.ler_json(config.pasta_episodio(n) / "copies.json")[plat])
    if problemas:
        raise ValueError("não aprovei: " + "; ".join(problemas))
    ESTADO.mudar(lambda e: e["copies"].setdefault(str(n), {}).setdefault(plat, {}).update(aprovado_em=agora()))


def acao_marcar_postado(d: dict):
    n, plat = _ep(d), d["plataforma"]
    url = (d.get("url") or "").strip()
    if not re.match(r"^https://", url):
        raise ValueError("cole o link do post (começando com https://)")
    est = ESTADO.ler()
    if not est["copies"].get(str(n), {}).get(plat, {}).get("aprovado_em"):
        raise ValueError("aprove a copy antes")
    if not est["episodios"].get(str(n), {}).get("publicado_em"):
        raise ValueError("publique o episódio antes (aba Episódios)")
    db().escrever("PATCH", "episodios", {"numero": f"eq.{n}"}, {f"url_{plat}": url}, prefer="return=minimal")
    ESTADO.mudar(lambda e: e["copies"][str(n)][plat].update(postado_url=url, postado_em=agora()))


def acao_colono(d: dict):
    codigo = str(d["codigo"]).upper()
    if not re.fullmatch(r"NM\d{6}", codigo):
        raise ValueError("código inválido")
    mud = {}
    if d.get("status") in ("fila", "desenhado", "estreou"):
        mud["status"] = d["status"]
    if "oculto" in d:
        mud["oculto"] = bool(d["oculto"])
    if mud:
        db().escrever("PATCH", "personagens", {"codigo": f"eq.{codigo}"}, mud, prefer="return=minimal")
        SINAL.mudou()


def acao_checklist(d: dict):
    codigo, item = str(d["codigo"]).upper(), d["item"]
    if item not in dict(ITENS_CHECKLIST):
        raise ValueError("item inválido")
    ESTADO.mudar(lambda e: e["checklist"].setdefault(codigo, {}).update({item: bool(d["valor"])}))


def acao_aprovar_colono(d: dict):
    acao_checklist({"codigo": d["codigo"], "item": "revisado", "valor": True})


def acao_teste(d: dict):
    tipo, valor = d["tipo"], bool(d["valor"])
    ident = str(d["id"]).upper() if tipo == "personagens" else int(d["id"])
    if tipo not in ("personagens", "pedidos"):
        raise ValueError("tipo inválido")

    def fn(e):
        lista = e["testes"][tipo]
        if valor and ident not in lista:
            lista.append(ident)
        if not valor and ident in lista:
            lista.remove(ident)
    ESTADO.mudar(fn)


def acao_resgate(d: dict):
    rid, status = int(d["id"]), d["status"]
    if status not in ("aprovado", "recusado"):
        raise ValueError("status inválido")
    if status == "recusado" and d.get("liberar"):
        db().s.delete(f"{db().url}/resgates", params={"id": f"eq.{rid}"}, timeout=30).raise_for_status()
    else:
        db().escrever("PATCH", "resgates", {"id": f"eq.{rid}"}, {"status": status, "revisado_em": agora()}, prefer="return=minimal")
    SINAL.mudou()


def acao_produto(d: dict):
    pid = int(d["id"])
    mud = {}
    if "ativo" in d:
        mud["ativo"] = bool(d["ativo"])
    if "ordem" in d:
        mud["ordem"] = int(d["ordem"])
    if "descricao" in d:
        mud["descricao"] = str(d["descricao"])[:1000] or None
    if mud:
        db().escrever("PATCH", "produtos", {"id": f"eq.{pid}"}, mud, prefer="return=minimal")
        SINAL.mudou()


def acao_cargo_criar(d: dict):
    nome = str(d.get("nome", "")).strip()[:40]
    if not nome:
        raise ValueError("dê um nome ao cargo")
    cid = re.sub(r"[^a-z0-9]+", "-", nome.lower()).strip("-") or secrets.token_hex(3)

    def fn(e):
        if any(c["id"] == cid for c in e["cargos"]["catalogo"]):
            raise ValueError("já existe um cargo com esse nome")
        e["cargos"]["catalogo"].append({"id": cid, "emoji": str(d.get("emoji") or "🏅")[:4], "nome": nome})
    ESTADO.mudar(fn)


def acao_cargo_remover(d: dict):
    cid = d["id"]

    def fn(e):
        e["cargos"]["catalogo"] = [c for c in e["cargos"]["catalogo"] if c["id"] != cid]
        for k in e["cargos"]["atribuicoes"]:
            e["cargos"]["atribuicoes"][k] = [x for x in e["cargos"]["atribuicoes"][k] if x != cid]
    ESTADO.mudar(fn)


def acao_cargo_atribuir(d: dict):
    codigo, cid, valor = str(d["codigo"]).upper(), d["cargo"], bool(d["valor"])

    def fn(e):
        if not any(c["id"] == cid for c in e["cargos"]["catalogo"]):
            raise ValueError("cargo não existe")
        lista = e["cargos"]["atribuicoes"].setdefault(codigo, [])
        if valor and cid not in lista:
            lista.append(cid)
        if not valor and cid in lista:
            lista.remove(cid)
    ESTADO.mudar(fn)


def acao_chat_ocultar(d: dict):
    db().escrever("PATCH", "chat_mensagens", {"id": f"eq.{int(d['id'])}"}, {"oculto": True}, prefer="return=minimal")
    SINAL.mudou()


def acao_chat_limpar(d: dict):
    if d.get("confirmar") != "LIMPAR":
        raise ValueError("digite LIMPAR para confirmar")
    db().s.delete(f"{db().url}/chat_mensagens", params={"id": "gt.0"}, timeout=30).raise_for_status()
    SINAL.mudou()


def acao_previa_iniciar(d: dict):
    if porta_aberta(PORTA_PREVIA):
        return {"msg": "a prévia já está rodando"}
    flags = subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0
    log = open(DADOS / "previa_site.log", "w", encoding="utf-8")
    p = subprocess.Popen([NPM, "run", "dev", "--", "-p", str(PORTA_PREVIA), "-H", "127.0.0.1"], cwd=RAIZ,
                         stdout=log, stderr=subprocess.STDOUT, creationflags=flags)
    ESTADO.mudar(lambda e: e["site"].update(previa_pid=p.pid))
    return {"msg": "iniciando a prévia (leva uns 10 s)"}


def acao_previa_parar(d: dict):
    pid = ESTADO.ler()["site"].get("previa_pid")
    if pid:
        if os.name == "nt":
            subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], capture_output=True)
        else:
            os.kill(pid, 15)
    ESTADO.mudar(lambda e: e["site"].pop("previa_pid", None))


def acao_aprovar_site(d: dict):
    h = hash_site()
    ESTADO.mudar(lambda e: e["site"].update(aprovado_hash=h, aprovado_em=agora()))


def acao_publicar_site(d: dict):
    est = ESTADO.ler()["site"]
    if not est.get("aprovado_hash"):
        raise ValueError("aprove o site antes de publicar")
    if est["aprovado_hash"] != hash_site():
        raise ValueError("o site mudou depois da aprovação: revise e aprove de novo")

    def fn(job):
        if ESTADO.ler()["site"].get("aprovado_hash") != hash_site():
            raise RuntimeError("o site mudou depois da aprovação")
        rodar(job, [NPM, "run", "typecheck"], RAIZ)
        if sh(GIT, "status", "--porcelain"):
            rodar(job, [GIT, "add", "-A"], RAIZ)
            rodar(job, [GIT, "commit", "-m", "Atualiza o site (publicado pelo painel)"], RAIZ)
        rodar(job, [GIT, "push", "origin", "HEAD"], RAIZ)
        ESTADO.mudar(lambda e: e["site"].update(publicado_em=agora(), aprovado_hash=None))
        job.log("Enviado ao GitHub. A Vercel publica em 1–2 minutos.")
    j = FILA.adicionar("Publicar site", fn)
    return {"job": j.id}


def acao_testar_conexoes(d: dict):
    dados_conexoes(forcar=True)
    SINAL.mudou()


ACOES = {k[5:]: v for k, v in globals().items() if k.startswith("acao_")}


# =====================================================================
# Servidor HTTP
# =====================================================================
TOKEN = secrets.token_urlsafe(24)
BOOT = secrets.token_hex(6)
HOSTS_OK = {f"127.0.0.1:{PORTA}", f"localhost:{PORTA}"}

GETS = {
    "/api/aprovacoes": lambda q: dados_aprovacoes(),
    "/api/episodios": lambda q: dados_episodios(),
    "/api/copies": lambda q: dados_copies(int(q.get("ep", ["1"])[0])),
    "/api/colonos": lambda q: dados_colonos(),
    "/api/visao": lambda q: dados_visao(q.get("ocultar", ["1"])[0] == "1"),
    "/api/compras": lambda q: dados_compras(),
    "/api/site": lambda q: dados_site(),
    "/api/chat": lambda q: dados_chat(),
    "/api/produtos": lambda q: dados_produtos(),
    "/api/cargos": lambda q: dados_cargos(),
    "/api/conexoes": lambda q: dados_conexoes(),
    "/api/jobs": lambda q: {"jobs": [j.json(True) for j in FILA.jobs[::-1]]},
}


class Handler(BaseHTTPRequestHandler):
    server_version = "PainelMarteZero"

    def log_message(self, *a):
        pass

    def _json(self, dados, codigo=200):
        corpo = json.dumps(dados, ensure_ascii=False, default=str).encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)

    def _host_ok(self) -> bool:
        if self.headers.get("Host", "") not in HOSTS_OK:
            self.send_error(403, "Somente acesso local")
            return False
        return True

    def do_GET(self):
        if not self._host_ok():
            return
        u = urlparse(self.path)
        try:
            if u.path in ("/", "/index.html"):
                html = (PRODUCAO / "painel.html").read_text(encoding="utf-8")
                corpo = html.replace("__TOKEN__", TOKEN).replace("__BOOT__", BOOT).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Cache-Control", "no-store")
                self.send_header("Content-Length", str(len(corpo)))
                self.end_headers()
                self.wfile.write(corpo)
            elif u.path == "/api/eventos":
                self._sse()
            elif u.path in GETS:
                self._json(GETS[u.path](parse_qs(u.query)))
            elif u.path.startswith("/midia/"):
                self._midia(unquote(u.path[len("/midia/"):]))
            elif u.path.startswith("/fontes/"):
                self._arquivo(FABRICA / "fontes" / Path(u.path).name)
            else:
                self.send_error(404)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as e:  # noqa: BLE001
            traceback.print_exc()
            try:
                self._json({"erro": str(e)}, 500)
            except Exception:  # noqa: BLE001
                pass

    def do_POST(self):
        if not self._host_ok():
            return
        if self.headers.get("X-Painel-Token") != TOKEN:
            return self._json({"erro": "token inválido: recarregue a página"}, 403)
        if urlparse(self.path).path != "/api/acao":
            return self.send_error(404)
        try:
            tam = int(self.headers.get("Content-Length") or 0)
            d = json.loads(self.rfile.read(min(tam, 1_000_000)) or b"{}")
            fn = ACOES.get(d.get("acao", ""))
            if not fn:
                return self._json({"erro": "ação desconhecida"}, 400)
            r = fn(d) or {}
            self._json({"ok": True, **r})
        except (ValueError, KeyError) as e:
            self._json({"erro": str(e)}, 400)
        except Exception as e:  # noqa: BLE001
            traceback.print_exc()
            self._json({"erro": str(e)[:300]}, 500)

    def _sse(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        ultima = -1
        while True:
            with SINAL.cond:
                if SINAL.versao == ultima:
                    SINAL.cond.wait(15)
                v, rec, dados = SINAL.versao, SINAL.recarregar, SINAL.dados
            msg = {"boot": BOOT, "versao": v, "dados": dados, "recarregar": rec,
                   "jobs": [j.json() for j in FILA.jobs[::-1][:6]]}
            self.wfile.write(f"data: {json.dumps(msg, ensure_ascii=False)}\n\n".encode("utf-8"))
            self.wfile.flush()
            ultima = v

    def _arquivo(self, p: Path):
        if not p.is_file():
            return self.send_error(404)
        corpo = p.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mimetypes.guess_type(p.name)[0] or "application/octet-stream")
        self.send_header("Content-Length", str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)

    def _midia(self, rel: str):
        """Serve vídeo/prévias de saida/epNNN com suporte a Range (para o player avançar)."""
        partes = rel.split("/")
        if len(partes) != 2 or not re.fullmatch(r"ep\d{3}", partes[0]) or not re.fullmatch(r"[\w.\-]+\.(mp4|png|txt)", partes[1]):
            return self.send_error(404)
        p = config.SAIDA / partes[0] / partes[1]
        if not p.is_file():
            return self.send_error(404)
        tam = p.stat().st_size
        ini, fim = 0, tam - 1
        m = re.match(r"bytes=(\d*)-(\d*)", self.headers.get("Range", ""))
        if m:
            if m.group(1):
                ini = int(m.group(1))
                fim = int(m.group(2)) if m.group(2) else tam - 1
            else:
                ini = max(0, tam - int(m.group(2)))
            fim = min(fim, tam - 1)
            self.send_response(206)
            self.send_header("Content-Range", f"bytes {ini}-{fim}/{tam}")
        else:
            self.send_response(200)
        self.send_header("Content-Type", mimetypes.guess_type(p.name)[0] or "application/octet-stream")
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(fim - ini + 1))
        self.end_headers()
        with open(p, "rb") as f:
            f.seek(ini)
            falta = fim - ini + 1
            while falta > 0:
                bloco = f.read(min(256 * 1024, falta))
                if not bloco:
                    break
                try:
                    self.wfile.write(bloco)
                except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError):
                    return   # o navegador cancelou (pulou o vídeo ou fechou a aba): normal, sem erro no console
                falta -= len(bloco)


def vigia() -> None:
    """Atualização em tempo real: HTML mudou → navegador recarrega; banco mudou → abas atualizam."""
    html = PRODUCAO / "painel.html"
    mt = html.stat().st_mtime
    assinatura, ultima_consulta = None, 0.0
    while True:
        time.sleep(1.5)
        try:
            if html.stat().st_mtime != mt:
                mt = html.stat().st_mtime
                SINAL.mudou(recarregar=True)
            if time.time() - ultima_consulta > 15:
                ultima_consulta = time.time()
                nova = (db().contar("personagens", {}), db().contar("pedidos", {}),
                        db().contar("cliques", {}), db().contar("resgates", {"status": "eq.pendente"}),
                        json.dumps(db().get("pedidos", {"select": "atualizado_em", "order": "atualizado_em.desc", "limit": 1})))
                if assinatura is not None and nova != assinatura:
                    SINAL.mudou()
                assinatura = nova
        except Exception:  # noqa: BLE001
            pass


def servidor() -> None:
    DADOS.mkdir(exist_ok=True)
    OCUPADO.unlink(missing_ok=True)
    threading.Thread(target=vigia, daemon=True).start()
    srv = ThreadingHTTPServer((HOST, PORTA), Handler)
    srv.daemon_threads = True
    srv.serve_forever()


if __name__ == "__main__":
    if "--filho" in sys.argv:
        servidor()
    else:
        supervisor("--abrir" in sys.argv)
