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
import unicodedata
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
    "extras": {},        # "2": {"pov_obra": {aprovado_em}} (vídeos em primeira pessoa)
    "checklist": {},     # "NM000001": {"revisado": true, ...}
    "testes": {"personagens": [], "pedidos": []},
    "cargos": {
        "catalogo": [
            {"id": "destaque", "emoji": "⭐", "nome": "Destaque da semana"},
        ],
        "atribuicoes": {},  # codigo → [ids]
    },
    "site": {},          # aprovado_hash, aprovado_em, publicado_em, previa_pid
    # Aprovar o episódio = postar sozinho no próximo horário de madrugada (Instagram + TikTok pelo celular,
    # YouTube pelo n8n já agendado para o mesmo horário). Ver agenda_automatica().
    "auto_postar": {"ligado": True, "horario": "03:00"},
    "divulgacao": {},
    "produtos_novos": [],   # propostas de produto pago (aba Produtos novos): aprovar = cria na Cakto pela API    # apresentacao/{aprovado_em}, stories/{"3": {aprovado_em, enviado_em}}, institucional/{aprovado_em}
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
            # cortes curtos do Instagram/TikTok (cortes.py); o vídeo acima é o completo, que vai para o YouTube
            "cortes": {r: f"/midia/{pasta.name}/{c.name}?v={int(c.stat().st_mtime)}"
                       for r in ("instagram", "tiktok") if (c := pasta / f"episodio_{n:03d}_{r}.mp4").exists()},
            "cortes_desde": pub.CORTES_DESDE, "cortes_ate": pub.CORTES_ATE,
            "gerado_em": datetime.fromtimestamp(v.stat().st_mtime, timezone.utc).isoformat(timespec="seconds") if v else None,
            "aprovado_em": e.get("aprovado_em"),
            "agendado_para": e.get("agendado_para"),
            "agendamento": e.get("agendamento"),
            "publicado_em": e.get("publicado_em") or (no_banco.get(n) or {}).get("publicado_em"),
            "copies": (pasta / "copies.json").exists(),
            "resumo": resumo_copies(n),
            "gerando": FILA.ocupada(f"Gerar episódio {n} "),
            "redes": redes_de(n),
            "postando": FILA.ocupada(f"Postar episódio {n} "),
            "copies_aprovadas": {p: bool(est["copies"].get(str(n), {}).get(p, {}).get("aprovado_em")) for p in pub.REDES},
            "extras": dados_extras(n, pasta, est),
            "votacao": dados_votacao(pasta),
        })
    publicados = [n for n, e in no_banco.items() if e.get("publicado_em")]
    return {"episodios": lista[::-1], "proximo": (max(publicados) + 1) if publicados else 1, "auto": est["auto_postar"]}


def dados_votacao(pasta: Path) -> dict | None:
    """Pergunta SIM ou NÃO do fim do episódio e o resultado marcado (abre o próximo episódio)."""
    rot = pasta / "roteiro.json"
    v = config.ler_json(rot).get("votacao") if rot.exists() else None
    if not v:
        return None
    arq = pasta / "votacao.json"
    marcado = config.ler_json(arq) if arq.exists() else {}
    return {"tela": v["tela"], "resultado": marcado.get("resultado") if marcado.get("id") == v["id"] else None}


def dados_extras(n: int, pasta: Path, est: dict) -> dict:
    """Imagens (thumbnail, capa, carrossel) e vídeos em primeira pessoa do episódio, com aprovação e redes."""
    img = pasta / "imagens"
    imagens = [{"nome": p.name, "url": f"/midia/{pasta.name}/imagens/{p.name}?v={int(p.stat().st_mtime)}"}
               for p in sorted(img.glob("*.png"))] if img.exists() else []
    aprov = est.get("extras", {}).get(str(n), {})
    todas = pub.ler()
    povs = []
    for v in sorted((pasta / "pov").glob("pov_*.mp4")) if (pasta / "pov").exists() else []:
        item = v.stem
        txt = v.with_suffix(".txt")
        st = todas.get(pub.chave_extra(n, item), {})
        povs.append({
            "item": item, "cena": item[4:],
            "url": f"/midia/{pasta.name}/pov/{v.name}?v={int(v.stat().st_mtime)}",
            "legenda": txt.read_text(encoding="utf-8") if txt.exists() else "",
            "aprovado_em": aprov.get(item, {}).get("aprovado_em"),
            "redes": {r: {k: st.get(r, {}).get(k) for k in CAMPOS_REDE} | {"status": st.get(r, {}).get("status", "pendente")}
                      for r in ("instagram", "tiktok")},
        })
    return {"imagens": imagens, "povs": povs, "carrossel": dados_carrossel(n, est), "gerando": FILA.ocupada(f"Gerar extras {n} "),
            "postando": FILA.ocupada(f"Postar extra {n}-")}


def resumo_copies(numero: int) -> dict | None:
    """Manchete, pauta (o que vai no episódio) e ganchos. copies.json antigo (sem esses campos): calcula na hora."""
    arq = config.pasta_episodio(numero) / "copies.json"
    if not arq.exists():
        return None
    c = config.ler_json(arq)
    if "pauta" not in c:
        try:
            c = copies.gerar(numero)
        except Exception:   # episódio antigo sem algum arquivo: sem resumo
            return None
    return {k: c[k] for k in ("manchete", "pauta", "ganchos")}


def dados_copies(numero: int) -> dict:
    arq = config.pasta_episodio(numero) / "copies.json"
    est = ESTADO.ler()["copies"].get(str(numero), {})
    if not arq.exists():
        return {"existe": False}
    c = config.ler_json(arq)
    auto = redes_de(numero)
    return {"existe": True, "resumo": resumo_copies(numero), "copies": {p: {**c[p], **est.get(p, {}), "rotulo": copies.PLATAFORMAS[p]["rotulo"],
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


ROBO_UA = re.compile(r"bot|crawl|spider|slurp|google-safety|googleother|google-inspectiontool|facebookexternalhit|"
                     r"facebookcatalog|meta-externalagent|whatsapp|telegrambot|twitterbot|discordbot|slackbot|"
                     r"headless|phantom|curl/|wget|python-|go-http|okhttp|axios|node-fetch|java/|preview", re.I)


def marcar_robos(cliques: list[dict]) -> dict[int, str]:
    """id do clique → motivo, para as visitas suspeitas de robô (o resto é visita real).
    Regras: user-agent de robô conhecido (Google-Safety, facebookexternalhit, curl...), user-agent vazio ou
    genérico ("Mozilla/5.0 (compatible)"), e rajada: 2+ cliques no MESMO link em até 5 s, sem site de origem,
    de visitantes diferentes (é o YouTube/Google conferindo o link logo depois que a descrição é salva)."""
    motivo = {}
    for c in cliques:
        ua = (c.get("user_agent") or "").strip()
        if not ua:
            motivo[c["id"]] = "sem user-agent"
        elif m := ROBO_UA.search(ua):
            motivo[c["id"]] = f"robô declarado ({m.group(0)})"
        elif re.fullmatch(r"Mozilla/5\.0 \(compatible\)", ua):
            motivo[c["id"]] = "user-agent genérico de verificador de links"
    links = [c for c in cliques if c["tipo"] == "link"]
    for a in links:
        par = [b for b in links if b["id"] != a["id"] and b["alvo"] == a["alvo"] and not a.get("referer") and not b.get("referer")
               and b.get("visitante_id") != a.get("visitante_id") and abs((ts(b["created_at"]) - ts(a["created_at"])).total_seconds()) <= 5]
        if par and a["id"] not in motivo:
            motivo[a["id"]] = "rajada: 2+ acessos no mesmo segundo, sem origem (verificador automático)"
    return motivo


def dados_visao(ocultar: bool) -> dict:
    est = ESTADO.ler()
    testes = est["testes"]
    pers = db().todos("personagens", {"select": "id,codigo,created_at,origem_source,origem_campaign,visitante_id", "order": "id.asc"})
    peds = db().todos("pedidos", {"select": "id,status,valor_centavos,personagem_id,created_at", "order": "id.asc"})
    clqs = db().todos("cliques", {"select": "id,tipo,alvo,visitante_id,referer,user_agent,created_at", "order": "id.asc"})
    robos = marcar_robos(clqs)
    lista_visitas = [{"id": c["id"], "quando": c["created_at"], "link": c["alvo"], "referer": c.get("referer"),
                      "ua": (c.get("user_agent") or "")[:140], "robo": robos.get(c["id"])}
                     for c in reversed(clqs) if c["tipo"] == "link"][:200]
    clqs = [c for c in clqs if c["id"] not in robos]   # daqui para baixo: só visitas reais
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
        "obs": "Visitas = cliques em links rastreáveis (/l/…), SEM os robôs (listados abaixo, separados).",
        "visitas": lista_visitas,
        "robos": sum(1 for v in lista_visitas if v["robo"]),
    }


# Distintivos manuais antigos que eram "cargos" de mentira (os cargos de verdade vêm do site: fabrica/cargos.json)
_DISTINTIVOS_VELHOS = {"engenheiro", "botanico", "comunicacoes", "explorador"}


def distintivos(est: dict) -> list[dict]:
    return [c for c in est["cargos"]["catalogo"] if c["id"] not in _DISTINTIVOS_VELHOS]


def cargos_do_site() -> list[dict]:
    """A MESMA lista que aparece no cadastro do site (fabrica/cargos.json), na mesma ordem."""
    return [{k: c[k] for k in ("id", "emoji", "nome", "descricao")} for c in config.cargos().values()]


def dados_colonos() -> dict:
    est = ESTADO.ler()
    pers = db().todos("personagens", {"select": (
        "id,codigo,nome,handle,handle_plataforma,status,oculto,aceita_whatsapp,sprite_url,created_at,cargo,"
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
    return {"colonos": pers, "itens": ITENS_CHECKLIST, "catalogo": distintivos(est), "cargos_site": cargos_do_site()}


# ---------------------------------------------------------------- aba Cadastros (ao vivo)
REDE_DO_PREFIXO = {"ig": "Instagram", "tt": "TikTok", "yt": "YouTube"}
REDE_DO_SOURCE = {"instagram": "Instagram", "tiktok": "TikTok", "youtube": "YouTube"}


def origem_legivel(p: dict) -> dict:
    """De onde a pessoa veio, em português: rede + lugar (bio/canal, descrição ou post do episódio, POV, comentário).
    Usa o 1º toque gravado no cadastro (link rastreável /l/<slug>, UTM ou site de onde veio)."""
    slug = (p.get("origem_link_slug") or "").lower()
    src = (p.get("origem_source") or "").lower()
    ref = (p.get("origem_referer") or "").lower()
    med = (p.get("origem_medium") or "").lower()
    m = re.fullmatch(r"(ig|tt|yt)-(.+)", slug)
    if m:
        rede, resto = REDE_DO_PREFIXO[m.group(1)], m.group(2)
        ep = re.fullmatch(r"ep0*(\d+)(-pov)?", resto)
        if resto == "bio":
            lugar = "canal (link do perfil)" if rede == "YouTube" else "link da bio"
        elif ep:
            lugar = (f"POV do ep. {ep.group(1)}" if ep.group(2)
                     else f"descrição do ep. {ep.group(1)}" if rede == "YouTube" else f"post do ep. {ep.group(1)}")
        elif resto.startswith("coment"):
            lugar = "comentário"
        else:
            lugar = f"link /l/{slug}"
        return {"rede": rede, "lugar": lugar, "rotulo": f"{rede} · {lugar}"}
    rede = REDE_DO_SOURCE.get(src) or next((v for k, v in REDE_DO_SOURCE.items() if k in ref), None)
    if rede:
        lugar = "comentário" if "coment" in med else "sem link rastreado"
        return {"rede": rede, "lugar": lugar, "rotulo": f"{rede} · {lugar}"}
    if "vercel" in src or "vercel" in ref:
        return {"rede": "Direto", "lugar": "abriu pelo painel da Vercel (teste)", "rotulo": "Link direto · pela Vercel"}
    if src in ("", "direto"):
        return {"rede": "Direto", "lugar": "digitou ou abriu o link do site" + (f" (vindo de {ref})" if ref else ""),
                "rotulo": "Link direto"}
    return {"rede": "Outro", "lugar": src or ref, "rotulo": f"Outro · {src or ref}"}


def aparicoes_nos_episodios() -> dict:
    """O que apareceu em cada episódio PUBLICADO (lido de saida/epNNN): quem foi chamado pelo nome, quem tinha
    casa no mapa, itens nas casas, Fúria, Destaque e crateras. Base do checklist automático."""
    publicados = sorted(int(e["numero"]) for e in db().get("episodios", {"select": "numero", "publicado_em": "not.is.null"}))
    nomeados, com_casa, itens, servicos, crateras = {}, {}, {}, {}, {}
    for n in publicados:
        pasta = config.pasta_episodio(n)
        if not (pasta / "dados.json").exists():
            continue
        d = config.ler_json(pasta / "dados.json")
        r = config.ler_json(pasta / "roteiro.json") if (pasta / "roteiro.json").exists() else {}
        for c in d.get("novos", []):
            nomeados.setdefault(c["codigo"], n)
        for c in d.get("mundo", []):
            com_casa.setdefault(c["codigo"], n)
        for c in d.get("compras", []):
            itens.setdefault((c["codigo"], c["produto_slug"]), n)
        if (r.get("problema") or {}).get("furia"):
            servicos.setdefault(r["problema"]["furia"]["pedido"], n)
        for x in r.get("destaques", []):
            servicos.setdefault(x["pedido"], n)
        for c in d.get("crateras", []):
            if c.get("nova"):
                crateras.setdefault(c["id"], n)
    return {"nomeados": nomeados, "com_casa": com_casa, "itens": itens, "servicos": servicos, "crateras": crateras}


def dados_cadastros() -> dict:
    est = ESTADO.ler()
    pers = db().todos("personagens", {"select": (
        "id,codigo,nome,apelido,handle,handle_plataforma,status,oculto,aceita_whatsapp,cargo,created_at,"
        "origem_source,origem_medium,origem_campaign,origem_content,origem_link_slug,origem_referer"), "order": "id.desc"})
    peds = db().todos("pedidos", {"select": "id,status,personagem_id,opcao,texto_personalizado,created_at,produto:produtos(slug,nome)",
                                  "personagem_id": "not.is.null", "order": "id.asc"})
    try:
        resg = db().get("resgates", {"select": "id,status,texto,personagem_id,produto:produtos(slug,nome)", "order": "id.asc"})
    except Exception:   # noqa: BLE001  (sem a tabela resgates)
        resg = []
    ap = aparicoes_nos_episodios()
    servico = set(episodio.SERVICOS)
    cargos = config.cargos()
    agora_ts = datetime.now(timezone.utc)
    saida, por_origem = [], {}
    for p in pers:
        cod = p["codigo"]
        ck = est["checklist"].get(cod, {})
        nomeado, casa = ap["nomeados"].get(cod), ap["com_casa"].get(cod)
        itens = []
        for x in (x for x in peds if x["personagem_id"] == p["id"]):
            slug = (x.get("produto") or {}).get("slug", "")
            pago = x["status"] in episodio.STATUS_PAGOS
            ep = (ap["servicos"].get(x["id"]) if slug in servico else ap["itens"].get((cod, slug))) if pago else None
            itens.append({"pedido": x["id"], "produto": (x.get("produto") or {}).get("nome", "?"), "status": x["status"],
                          "pago": pago, "opcao": x.get("opcao"), "texto": x.get("texto_personalizado"),
                          "apareceu_ep": ep, "no_site": pago and slug not in servico})
        for x in (x for x in resg if x["personagem_id"] == p["id"]):
            ok = x["status"] == "aprovado"
            itens.append({"pedido": f"R{x['id']}", "produto": (x.get("produto") or {}).get("nome", "Item grátis"),
                          "status": x["status"], "pago": ok, "opcao": None, "texto": x.get("texto"),
                          "apareceu_ep": ap["crateras"].get(x["id"]) if ok else None, "no_site": ok})
        o = origem_legivel(p)
        por_origem[o["rotulo"]] = por_origem.get(o["rotulo"], 0) + 1
        criado = datetime.fromisoformat(p["created_at"].replace("Z", "+00:00"))
        cg = cargos.get(p.get("cargo") or "")
        saida.append({
            "codigo": cod, "nome": p["nome"], "apelido": p.get("apelido"), "handle": p["handle"],
            "plataforma": p["handle_plataforma"], "oculto": p["oculto"], "status": p["status"],
            "cargo": f"{cg['emoji']} {cg['nome']}" if cg else None, "created_at": p["created_at"],
            "novo": (agora_ts - criado).total_seconds() < 24 * 3600, "teste": cod in est["testes"]["personagens"],
            "origem": o, "aceita_whatsapp": p["aceita_whatsapp"], "itens": itens,
            "auto": {"nomeado_ep": nomeado, "casa_ep": casa},
            "manual": {k: bool(ck.get(k)) for k in ("revisado", "aviso")},
        })
    hoje = agora_ts.astimezone().date()
    return {"cadastros": saida, "por_origem": sorted(por_origem.items(), key=lambda kv: -kv[1]),
            "hoje": sum(1 for c in saida if datetime.fromisoformat(c["created_at"].replace("Z", "+00:00")).astimezone().date() == hoje)}


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
    pers = {p["codigo"]: p for p in db().todos("personagens", {"select": "id,codigo,nome,cargo,oculto", "order": "id.asc"})}
    por_id = {p["id"]: p for p in pers.values()}
    pagos = db().get("pedidos", {"select": "personagem_id", "status": f"in.({','.join(episodio.STATUS_PAGOS)})"})
    apoiadores = sorted({por_id[p["personagem_id"]]["codigo"] for p in pagos if p.get("personagem_id") in por_id})
    cat = distintivos(est)
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
        # cargos de verdade: o que cada colono escolheu no site (personagens.cargo)
        "cargos": [{**c, "membros": [{"codigo": x["codigo"], "nome": x["nome"]} for x in pers.values()
                                      if x.get("cargo") == c["id"] and not x.get("oculto")]} for c in cargos_do_site()],
        "sem_cargo": [{"codigo": x["codigo"], "nome": x["nome"]} for x in pers.values() if not x.get("cargo") and not x.get("oculto")],
        "catalogo": [{**c, "membros": membros[c["id"]]} for c in cat],
        "obs": "Distintivos ficam guardados neste computador (o site não mostra).",
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


def proximo_horario(hhmm: str, de: datetime | None = None) -> datetime:
    """Próximo horário de postagem (hora do PC). Aprovou já de madrugada, depois do horário? Vai em 40 min."""
    de = de or datetime.now().astimezone()
    h, m = (int(x) for x in hhmm.split(":"))
    alvo = de.replace(hour=h, minute=m, second=0, microsecond=0)
    if alvo <= de:
        alvo = de + timedelta(minutes=40) if de.hour < 6 else alvo + timedelta(days=1)
    return alvo


def acao_aprovar_episodio(d: dict):
    n = _ep(d)
    pasta = config.pasta_episodio(n)
    v = video_de(pasta)
    if not v:
        raise ValueError("o episódio ainda não tem vídeo")
    faltam = [pub.ROTULOS[r] for r in ("instagram", "tiktok") if "sem_voz" not in v.name and not pub.video_da_rede(n, r).exists()]
    if faltam:
        raise ValueError(f"faltam os cortes curtos ({', '.join(faltam)}): rode  python cortes.py --episodio {n}  na pasta fabrica")
    auto = ESTADO.ler()["auto_postar"]
    if not auto.get("ligado") or "sem_voz" in v.name:
        ESTADO.mudar(lambda e: e["episodios"].setdefault(str(n), {}).update(aprovado_em=agora()))
        return {"msg": "Aprovado (prévia sem voz: nada é postado)" if "sem_voz" in v.name else "Aprovado"}
    if FILA.ocupada(f"Postar episódio {n} ") or ESTADO.ler()["episodios"].get(str(n), {}).get("publicado_em"):
        raise ValueError("este episódio já foi publicado/está postando: use as ações de publicação")
    if not (pasta / "copies.json").exists():
        copies.gravar(n)
    todas = config.ler_json(pasta / "copies.json")
    problemas = [f"{pub.ROTULOS[r]}: {x}" for r in pub.REDES for x in pub.validar_copy(r, todas[r])]
    if problemas:
        raise ValueError("não aprovei (corrija as copies na Divulgação): " + "; ".join(problemas))
    alvo = proximo_horario(auto.get("horario") or "03:00")

    def fn(e):
        ep = e["episodios"].setdefault(str(n), {})
        ep.update(aprovado_em=agora(), agendado_para=alvo.isoformat(timespec="minutes"))
        ep.pop("agendamento", None)
        for r in pub.REDES:   # aprovar o vídeo aprova as copies como estão agora
            e["copies"].setdefault(str(n), {}).setdefault(r, {}).setdefault("aprovado_em", agora())
    ESTADO.mudar(fn)
    return {"msg": f"Aprovado! Posta sozinho {alvo:%d/%m às %H:%M} no Instagram, TikTok e YouTube "
                   "(deixe o PC ligado e o celular no cabo)."}


def acao_desaprovar_episodio(d: dict):
    n = _ep(d)
    if (ESTADO.ler()["episodios"].get(str(n), {}).get("agendamento") or {}).get("estado") == "rodando":
        raise ValueError("a postagem automática já começou: espere terminar")

    def fn(e):
        ep = e["episodios"].get(str(n), {})
        for k in ("aprovado_em", "agendado_para", "agendamento"):
            ep.pop(k, None)
    ESTADO.mudar(fn)


def acao_auto_postar(d: dict):
    """Liga/desliga a postagem automática e muda o horário (HH:MM, hora do PC)."""
    hor = str(d.get("horario") or "03:00")
    if not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", hor):
        raise ValueError("horário no formato HH:MM")
    ESTADO.mudar(lambda e: e["auto_postar"].update(ligado=bool(d.get("ligado", True)), horario=hor))


def acao_adiar_agendamento(d: dict):
    """Troca o horário de um episódio já aprovado (antes de começar a postar)."""
    n, hor = _ep(d), str(d.get("horario") or "")
    ep = ESTADO.ler()["episodios"].get(str(n), {})
    if not ep.get("agendado_para") or ep.get("agendamento"):
        raise ValueError("não há agendamento esperando para este episódio")
    alvo = proximo_horario(hor)
    ESTADO.mudar(lambda e: e["episodios"][str(n)].update(agendado_para=alvo.isoformat(timespec="minutes")))
    return {"msg": f"Agora posta {alvo:%d/%m às %H:%M}"}


ANTECEDENCIA_YT = 30   # minutos: o YouTube sobe antes e já fica agendado para o horário (o n8n exige ≥ 20)


def agenda_automatica() -> None:
    """Chamada pela vigia: dispara a postagem dos episódios aprovados quando chega a hora. Uma vez só por
    episódio (estado "agendamento"); as travas de publicacao.py continuam valendo (nada é reenviado)."""
    agora_ = datetime.now().astimezone()
    for num, ep in ESTADO.ler()["episodios"].items():
        if not ep.get("agendado_para") or ep.get("agendamento") or not ep.get("aprovado_em"):
            continue
        alvo = datetime.fromisoformat(ep["agendado_para"])
        if agora_ < alvo - timedelta(minutes=ANTECEDENCIA_YT):
            continue
        n = int(num)
        if FILA.ocupada("Postar episódio ") or FILA.ocupada("Postar extra "):
            continue   # tenta de novo na próxima volta

        def marcar(estado, **kw):
            ESTADO.mudar(lambda e: e["episodios"][str(n)].setdefault("agendamento", {}).update(estado=estado, em=agora(), **kw))
        marcar("rodando")

        def fn(job, n=n, alvo=alvo, marcar=marcar):
            try:
                if not ESTADO.ler()["episodios"].get(str(n), {}).get("publicado_em"):
                    _registrar(job, n)
                falhas = []
                minutos = max(20, int((alvo - datetime.now().astimezone()).total_seconds() // 60))
                job.log(f"YouTube: envio agora, agendado para {alvo:%H:%M} (daqui a {minutos} min)")
                try:
                    rodar(job, [sys.executable, "youtube.py", "--episodio", str(n), "--minutos", str(minutos)], PRODUCAO)
                except RuntimeError:
                    falhas.append("youtube")
                SINAL.mudou()
                espera = (alvo - datetime.now().astimezone()).total_seconds()
                if espera > 0:
                    job.log(f"esperando {alvo:%H:%M} para postar no Instagram e no TikTok…")
                    time.sleep(espera)
                try:
                    rodar(job, [sys.executable, "celular.py", "--episodio", str(n)], PRODUCAO)
                except RuntimeError:
                    falhas.append("celular")
                SINAL.mudou()
                resumo = " · ".join(f"{pub.ROTULOS[r]}: {pub.status(n, r)['status']}" for r in pub.REDES)
                job.log(resumo)
                marcar("erro" if falhas else "feito", resumo=resumo)
                if falhas:
                    raise RuntimeError(f"problema em: {', '.join(falhas)} (veja o log acima)")
            except Exception as ex:
                if not isinstance(ex, RuntimeError):
                    marcar("erro", resumo=str(ex)[:300])
                raise
        FILA.adicionar(f"Postar episódio {n} (automático {alvo:%H:%M}) · Instagram, TikTok, YouTube", fn)


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
                                  resumo={k: rot.get(k) for k in ("estacao", "problema") if rot.get(k)} or None,
                                  obra_extra=rot.get("obra_extra"))
    job.log(f"episódio {n} registrado como publicado no Supabase")
    ep_id = db().get("episodios", {"select": "id", "numero": f"eq.{n}"})[0]["id"]
    for plat, info in copies.PLATAFORMAS.items():
        slug = copies.slug_link(plat, n)
        db().escrever("POST", "links", {"on_conflict": "slug"},
                      {"slug": slug, "destino": "/", "plataforma": info["plataforma"], "campanha": f"ep{n:03d}",
                       "episodio_id": ep_id, "descricao": f"Descrição do episódio {n} no {info['rotulo']}"},
                      prefer="resolution=merge-duplicates,return=minimal")
        job.log(f"link rastreável criado: /l/{slug}")
    db().escrever("POST", "links", {"on_conflict": "slug"},   # vídeos extras (POV) no YouTube
                  {"slug": f"yt-ep{n:03d}-pov", "destino": "/", "plataforma": "youtube", "campanha": f"ep{n:03d}-pov",
                   "episodio_id": ep_id, "descricao": f"Descrição do POV do episódio {n} no YouTube"},
                  prefer="resolution=merge-duplicates,return=minimal")
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


def acao_votacao(d: dict):
    """Marca o que os comentários decidiram (sim/nao) — o episódio seguinte começa com a decisão. Vazio desmarca."""
    n, res = _ep(d), str(d.get("resultado") or "")
    pasta = config.pasta_episodio(n)
    v = config.ler_json(pasta / "roteiro.json").get("votacao")
    if not v:
        raise ValueError("este episódio não tem votação")
    arq = pasta / "votacao.json"
    if res not in ("sim", "nao"):
        arq.unlink(missing_ok=True)
        return
    config.gravar_json(arq, {"id": v["id"], "tela": v["tela"], "resultado": res, "marcado_em": agora()})


def acao_gerar_copies(d: dict):
    n = _ep(d)
    copies.gravar(n)
    ESTADO.mudar(lambda e: e["copies"].pop(str(n), None))


def acao_refazer_copies(d: dict):
    """Refaz as 3 copies a partir da manchete, da pauta e dos ganchos editados no painel (as copies precisam de
    aprovação de novo; edições feitas direto nas copies são substituídas)."""
    n = _ep(d)
    g = d.get("ganchos") or {}
    ganchos = {k: str(g[k])[:300] for k in ("historia", "comentar", "curtir", "seguir", "inscrever") if k in g}
    pauta = [x.strip()[:300] for x in str(d.get("pauta") or "").splitlines() if x.strip()][:20]
    copies.gravar(n, pauta_editada=pauta, ganchos_editados=ganchos, manchete_editada=str(d.get("manchete") or "")[:90])
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


def acao_cargo_definir(d: dict):
    """Dá o cargo a quem ainda não escolheu no site (o banco não deixa trocar um cargo já escolhido)."""
    codigo, cid = str(d["codigo"]).upper(), str(d.get("cargo") or "")
    if not re.fullmatch(r"NM\d{6}", codigo):
        raise ValueError("código inválido")
    if cid not in config.cargos():
        raise ValueError("cargo não existe")
    feito = db().escrever("PATCH", "personagens", {"codigo": f"eq.{codigo}", "cargo": "is.null"},
                          {"cargo": cid, "cargo_em": datetime.now(timezone.utc).isoformat()}, prefer="return=representation")
    if not feito:
        raise ValueError("esse colono já escolheu o cargo (não pode trocar)")
    SINAL.mudou()


def acao_cargo_criar(d: dict):
    nome = str(d.get("nome", "")).strip()[:40]
    if not nome:
        raise ValueError("dê um nome ao cargo")
    cid = re.sub(r"[^a-z0-9]+", "-", nome.lower()).strip("-") or secrets.token_hex(3)

    def fn(e):
        if any(c["id"] == cid for c in e["cargos"]["catalogo"]) or cid in config.cargos():
            raise ValueError("já existe um cargo/distintivo com esse nome")
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


# ---------------------------------------------------------------- peças de divulgação (Aprovações)
PASTA_DIVULGACAO = config.SAIDA / "divulgacao"


def _url_saida(arq: Path) -> str:
    return f"/midia/{arq.relative_to(config.SAIDA).as_posix()}?v={int(arq.stat().st_mtime)}"


def dados_pecas() -> dict:
    est = ESTADO.ler()["divulgacao"]
    imgs, txt = pub.arquivos_apresentacao()
    st = pub.ler().get("apresentacao", {}).get("instagram", {})
    eps = sorted(int(x.parent.name[2:]) for x in config.SAIDA.glob("ep[0-9][0-9][0-9]/linha_do_tempo.json") if int(x.parent.name[2:]) < 900)
    ult = eps[-1] if eps else None
    stories = sorted((config.pasta_episodio(ult) / "stories").glob("story_*.png")) if ult else []
    inst = PASTA_DIVULGACAO / "institucional" / "institucional.mp4"
    conv = sorted((PASTA_DIVULGACAO / "convite").glob("convite_*.png"))
    leg_conv = PASTA_DIVULGACAO / "convite" / "legenda.txt"
    return {
        "videos": dados_videos(),
        "convite": {"imagens": [_url_saida(i) for i in conv], "legenda": leg_conv.read_text(encoding="utf-8") if leg_conv.exists() else "",
                    **est.get("convite", {}), "gerando": FILA.ocupada("Gerar posts de convite")},
        "apresentacao": {"imagens": [_url_saida(i) for i in imgs],
                         "legenda": txt.read_text(encoding="utf-8") if txt.exists() else "",
                         "aprovado_em": est.get("apresentacao", {}).get("aprovado_em"),
                         "instagram": {k: st.get(k) for k in CAMPOS_REDE} | {"status": st.get("status", "pendente")},
                         "gerando": FILA.ocupada("Gerar apresentação")},
        "stories": {"episodio": ult, "imagens": [_url_saida(i) for i in stories],
                    **est.get("stories", {}).get(str(ult), {}), "gerando": FILA.ocupada("Gerar stories")},
        "institucional": {"video": _url_saida(inst) if inst.exists() else None,
                          "roteiro": (inst.with_name("roteiro.txt").read_text(encoding="utf-8")
                                      if inst.with_name("roteiro.txt").exists() else ""),
                          **est.get("institucional", {}), "gerando": FILA.ocupada("Gerar vídeo institucional")},
    }


NOMES_VIDEOS = {"cargos": "👑 Cargos de Nova Marte (cada um dá uma voltinha)", "convite": "🤝 Como convidar com o seu link",
                "novidade_chat": "💬 Novidade: chat ao vivo + online agora", "novidade_central": "🎮 Novidade: central do colono",
                "novidade_moedas": "🪙 Novidade: loja de moedas", "youtube_longo": "📺 YouTube longo (horizontal, guia completo)"}


def dados_videos() -> list[dict]:
    est = ESTADO.ler()["divulgacao"].get("videos", {})
    pasta = PASTA_DIVULGACAO / "videos"
    saida = []
    for nome, titulo in NOMES_VIDEOS.items():
        d = pasta / nome
        v = d / "video.mp4"
        ler = lambda arq: (d / arq).read_text(encoding="utf-8") if (d / arq).exists() else ""
        saida.append({"nome": nome, "titulo": titulo, "video": _url_saida(v) if v.exists() else None,
                      "thumb": _url_saida(d / "thumb.png") if (d / "thumb.png").exists() else None,
                      "roteiro": ler("roteiro.txt"), "copies": ler("copies.txt"),
                      "horizontal": nome == "youtube_longo", "gerando": FILA.ocupada(f"Gerar vídeo {nome}"), **est.get(nome, {})})
    return saida


def acao_gerar_video(d: dict):
    nome = d.get("nome")
    if nome not in NOMES_VIDEOS:
        raise ValueError("vídeo inválido")

    def fn(job):
        ESTADO.mudar(lambda e: e["divulgacao"].setdefault("videos", {}).pop(nome, None))
        rodar(job, [sys.executable, "explicativos.py", nome, "--site", site_teste()], FABRICA)
        if nome == "youtube_longo":
            rodar(job, [sys.executable, "divulgacao.py", "--thumb-longo"], FABRICA)
    return {"job": FILA.adicionar(f"Gerar vídeo {nome}", fn).id}


def acao_aprovar_video(d: dict):
    nome = d.get("nome")
    if nome not in NOMES_VIDEOS or not (PASTA_DIVULGACAO / "videos" / nome / "video.mp4").exists():
        raise ValueError("gere o vídeo antes")
    ESTADO.mudar(lambda e: e["divulgacao"].setdefault("videos", {}).setdefault(nome, {}).update(aprovado_em=agora()))
    return {"msg": "Aprovado. Nada é postado sozinho: o vídeo está na pasta saida/divulgacao/videos/" + nome}


def acao_desaprovar_video(d: dict):
    ESTADO.mudar(lambda e: e["divulgacao"].get("videos", {}).pop(d.get("nome"), None))


def acao_aprovar_convite(d: dict):
    """Posts de convite aprovados → as 5 imagens vão para a galeria do celular (prontas para postar)."""
    imgs = sorted((PASTA_DIVULGACAO / "convite").glob("convite_*.png"))
    if not imgs:
        raise ValueError("gere os posts de convite antes")
    ESTADO.mudar(lambda e: e["divulgacao"].setdefault("convite", {}).update(aprovado_em=agora()))

    def fn(job):
        rodar(job, [sys.executable, "celular.py", "--galeria", *map(str, imgs)], PRODUCAO)
        ESTADO.mudar(lambda e: e["divulgacao"]["convite"].update(enviado_em=agora()))
    return {"job": FILA.adicionar("Mandar posts de convite para o celular", fn).id, "msg": "Aprovado: mandando para o celular"}


def acao_gerar_convite(d: dict):
    def fn(job):
        ESTADO.mudar(lambda e: e["divulgacao"].pop("convite", None))
        rodar(job, [sys.executable, "divulgacao.py", "--convite"], FABRICA)
    return {"job": FILA.adicionar("Gerar posts de convite", fn).id}


def acao_gerar_apresentacao(d: dict):
    def fn(job):
        ESTADO.mudar(lambda e: e["divulgacao"].pop("apresentacao", None))
        rodar(job, [sys.executable, "divulgacao.py", "--apresentacao"], FABRICA)
    return {"job": FILA.adicionar("Gerar apresentação (carrossel)", fn).id}


def acao_aprovar_apresentacao(d: dict):
    imgs, txt = pub.arquivos_apresentacao()
    if len(imgs) < 2:
        raise ValueError("gere a apresentação antes")
    if isinstance(d.get("legenda"), str):
        txt.write_text(d["legenda"].strip() + "\n", encoding="utf-8")
    problemas = pub.validar_copy("instagram", {"legenda": txt.read_text(encoding="utf-8")})
    if problemas:
        raise ValueError("não aprovei: " + "; ".join(problemas))
    ESTADO.mudar(lambda e: e["divulgacao"].setdefault("apresentacao", {}).update(aprovado_em=agora()))


def acao_desaprovar_apresentacao(d: dict):
    ESTADO.mudar(lambda e: e["divulgacao"].pop("apresentacao", None))


def acao_postar_apresentacao(d: dict):
    """📤 Carrossel de apresentação no feed do Instagram, pelo celular (mesmas travas do carrossel do episódio)."""
    ensaio = bool(d.get("ensaio"))
    if FILA.ocupada("Postar "):
        raise ValueError("já tem uma postagem na fila: espere terminar")
    if not ensaio:
        pub.exigir_liberado_apresentacao("instagram")

    def fn(job):
        rodar(job, [sys.executable, "celular.py", "--apresentacao"] + (["--ensaio"] if ensaio else []), PRODUCAO)
        SINAL.mudou()
    return {"job": FILA.adicionar("Postar apresentação " + ("(ensaio)" if ensaio else "· Instagram"), fn).id,
            "msg": "Ensaio na fila" if ensaio else "Postagem na fila"}


def acao_gerar_stories(d: dict):
    n = _ep(d)

    def fn(job):
        ESTADO.mudar(lambda e: e["divulgacao"].setdefault("stories", {}).pop(str(n), None))
        rodar(job, [sys.executable, "divulgacao.py", "--stories", str(n)], FABRICA)
    return {"job": FILA.adicionar(f"Gerar stories {n}", fn).id}


def acao_aprovar_stories(d: dict):
    """Aprovar os stories = mandar TODOS para a galeria do celular (prontos para postar no Instagram e no TikTok)."""
    n = _ep(d)
    imgs = sorted((config.pasta_episodio(n) / "stories").glob("story_*.png"))
    if not imgs:
        raise ValueError("gere os stories antes")
    ESTADO.mudar(lambda e: e["divulgacao"].setdefault("stories", {}).setdefault(str(n), {}).update(aprovado_em=agora()))

    def fn(job):
        rodar(job, [sys.executable, "celular.py", "--galeria", *map(str, imgs)], PRODUCAO)
        ESTADO.mudar(lambda e: e["divulgacao"]["stories"][str(n)].update(enviado_em=agora()))
    return {"job": FILA.adicionar(f"Mandar stories {n} para o celular", fn).id, "msg": "Aprovado: mandando para o celular"}


def acao_gerar_institucional(d: dict):
    def fn(job):
        ESTADO.mudar(lambda e: e["divulgacao"].pop("institucional", None))
        rodar(job, [sys.executable, "institucional.py"], FABRICA)
    return {"job": FILA.adicionar("Gerar vídeo institucional", fn).id}


def acao_aprovar_institucional(d: dict):
    if not (PASTA_DIVULGACAO / "institucional" / "institucional.mp4").exists():
        raise ValueError("gere o vídeo antes")
    ESTADO.mudar(lambda e: e["divulgacao"].setdefault("institucional", {}).update(aprovado_em=agora()))


def acao_desaprovar_institucional(d: dict):
    ESTADO.mudar(lambda e: e["divulgacao"].pop("institucional", None))


# ---------------------------------------------------------------- site para testar (minigames / entrada)
def site_teste() -> str:
    """Endereço para os iframes de teste: a prévia local (npm run dev, porta 3000) se estiver no ar; senão o site."""
    try:
        import requests as _rq
        if _rq.get("http://127.0.0.1:3000/entrada", timeout=1.5).status_code < 500:
            return "http://127.0.0.1:3000"
    except Exception:  # noqa: BLE001
        pass
    return f"https://{config.SITE_TELA}"


# ---------------------------------------------------------------- Convites (quem trouxe quem)
def dados_convites() -> dict:
    try:
        pers = db().todos("personagens", {"select": "id,codigo,nome,apelido,created_at,convidado_por,origem_source,"
                                                    "origem_campaign,oculto", "order": "id.asc"})
        falta = None
    except Exception as e:  # noqa: BLE001
        pers = db().todos("personagens", {"select": "id,codigo,nome,apelido,created_at,origem_source,origem_campaign,oculto",
                                          "order": "id.asc"})
        falta = f"rode supabase/migrations/013_jogo_convites_online.sql ({str(e)[:60]})"
    clq = db().todos("cliques", {"select": "id,tipo,alvo,referer,user_agent,visitante_id,created_at", "alvo": "like.convite-*"})
    robos = marcar_robos(clq)
    nome = lambda x: (x.get("apelido") or "").strip() or episodio.nome_exibicao(x["nome"])
    por_id = {x["id"]: x for x in pers}
    base = f"https://{config.SITE_TELA}"
    linhas = []
    for x in pers:
        trouxe = [y for y in pers if y.get("convidado_por") == x["id"] or
                  (not y.get("convidado_por") and y.get("origem_source") == "convite" and y.get("origem_campaign") == x["codigo"])]
        cliques = [c for c in clq if c["alvo"] == f"convite-{x['codigo']}"]
        reais = [c for c in cliques if c["id"] not in robos]
        linhas.append({
            "codigo": x["codigo"], "nome": nome(x), "oculto": x.get("oculto"),
            "link": f"{base}/c/{x['codigo']}",
            "utm": f"utm_source=convite&utm_medium=colono&utm_campaign={x['codigo']}",
            "cliques": len(reais), "robos": len(cliques) - len(reais),
            "cadastros": len(trouxe),
            "trouxe": [{"codigo": y["codigo"], "nome": nome(y), "em": y["created_at"]} for y in trouxe],
            "convidado_por": (lambda c: {"codigo": c["codigo"], "nome": nome(c)} if c else None)(por_id.get(x.get("convidado_por"))),
        })
    linhas.sort(key=lambda l: (-l["cadastros"], -l["cliques"], l["codigo"]))
    return {"colonos": linhas, "falta": falta, "total_convidados": sum(1 for x in pers if x.get("convidado_por"))}


# ---------------------------------------------------------------- Minigames (testar, aprovar, ligar no site)
def dados_minigames() -> dict:
    try:
        jogos = db().get("minigames", {"select": "*", "order": "slug"})
        partidas = db().todos("minigame_partidas", {"select": "minigame,pontos,resultado,moedas,created_at", "order": "id.desc"})
        falta = None
    except Exception as e:  # noqa: BLE001
        jogos, partidas, falta = [], [], f"rode supabase/migrations/013_jogo_convites_online.sql ({str(e)[:60]})"
    for j in jogos:
        pj = [x for x in partidas if x["minigame"] == j["slug"]]
        j["estatisticas"] = {"partidas": len(pj), "media": round(sum(x["pontos"] for x in pj) / len(pj)) if pj else 0,
                             "perderam": sum(1 for x in pj if x["resultado"] != "terminou"),
                             "moedas": sum(x["moedas"] for x in pj)}
    return {"jogos": jogos, "falta": falta, "site": site_teste()}


def acao_minigame(d: dict):
    """Aprovar / ligar / desligar um minigame (sem confirmação; o site muda na hora)."""
    slug, o = str(d.get("slug") or ""), d.get("o")
    if not re.fullmatch(r"[a-z]+", slug):
        raise ValueError("minigame inválido")
    if o == "aprovar":
        mud = {"aprovado_em": agora()}
    elif o == "desaprovar":
        mud = {"aprovado_em": None, "ativo": False}
    elif o in ("ligar", "desligar"):
        if o == "ligar" and not (db().get("minigames", {"select": "aprovado_em", "slug": f"eq.{slug}"}) or [{}])[0].get("aprovado_em"):
            raise ValueError("aprove (depois de testar) antes de ligar no site")
        mud = {"ativo": o == "ligar"}
    elif o == "ajustar":
        mud = {k: max(1, min(int(d[k]), 500)) for k in ("moedas_max", "partidas_dia") if k in d}
    else:
        raise ValueError("ação inválida")
    db().escrever("PATCH", "minigames", {"slug": f"eq.{slug}"}, mud, prefer="return=minimal")
    SINAL.mudou()
    return {"msg": {"aprovar": "Aprovado", "ligar": "Ligado no site", "desligar": "Desligado do site"}.get(o, "Salvo")}


# ---------------------------------------------------------------- Loja de moedas (aprovar itens e preços)
def dados_loja_moedas() -> dict:
    prop = config.ler_json(FABRICA / "loja_moedas.json")["itens"]
    try:
        no_banco = {x["slug"]: x for x in db().get("loja_moedas", {"select": "*"})}
        vendas = db().todos("loja_moedas_compras", {"select": "item"})
        falta = None
    except Exception as e:  # noqa: BLE001
        no_banco, vendas, falta = {}, [], f"rode supabase/migrations/013_jogo_convites_online.sql ({str(e)[:60]})"
    itens = []
    for i, x in enumerate(prop):
        b = no_banco.get(x["slug"], {})
        itens.append({**x, "ordem": i, "preco": b.get("preco", x["preco"]), "preco_sugerido": x["preco"],
                      "aprovado_em": b.get("aprovado_em"), "ativo": b.get("ativo", False),
                      "vendas": sum(1 for v in vendas if v["item"] == x["slug"])})
    return {"itens": itens, "falta": falta,
            "economia": "Um dia bom rende ~150 moedas (missões ~60 + minigames). Cor ≈ 2 dias · traje ≈ 1 semana · especial ≈ 3–4 semanas."}


def acao_loja_moedas(d: dict):
    """Aprovar item + preço, ligar/desligar no site (sem confirmação)."""
    slug, o = str(d.get("slug") or ""), d.get("o")
    prop = {x["slug"]: x for x in config.ler_json(FABRICA / "loja_moedas.json")["itens"]}
    if slug not in prop:
        raise ValueError("item não existe em fabrica/loja_moedas.json")
    x = prop[slug]
    if o == "aprovar":
        preco = int(d.get("preco") or x["preco"])
        if not 10 <= preco <= 100000:
            raise ValueError("preço entre 10 e 100000 moedas")
        ordem = list(prop).index(slug)
        db().escrever("POST", "loja_moedas", {"on_conflict": "slug"},
                      {"slug": slug, "nome": x["nome"], "tipo": x["tipo"], "preco": preco, "traje": x["traje"],
                       "aprovado_em": agora(), "ordem": ordem}, prefer="resolution=merge-duplicates,return=minimal")
    elif o in ("ligar", "desligar"):
        if o == "ligar" and not (db().get("loja_moedas", {"select": "aprovado_em", "slug": f"eq.{slug}"}) or [{}])[0].get("aprovado_em"):
            raise ValueError("aprove o item e o preço antes de ligar")
        db().escrever("PATCH", "loja_moedas", {"slug": f"eq.{slug}"}, {"ativo": o == "ligar"}, prefer="return=minimal")
    else:
        raise ValueError("ação inválida")
    SINAL.mudou()


# ---------------------------------------------------------------- Produtos novos (aprovar → Cakto pela API)
def dados_produtos_novos() -> dict:
    import cakto_api
    imagens = sorted(f"/itens/{x.name}" for x in (RAIZ / "public" / "itens").glob("*.png"))
    return {"propostas": ESTADO.ler()["produtos_novos"], "imagens": imagens,
            "cakto": cakto_api.Cakto().configurada(), "site": f"https://{config.SITE_TELA}"}


def acao_produto_novo(d: dict):
    """Cria/edita uma proposta de produto (fica em rascunho até aprovar)."""
    nome = str(d.get("nome") or "").strip()[:80]
    if not nome:
        raise ValueError("dê um nome ao produto")
    preco = round(float(str(d.get("preco") or "0").replace(",", ".")), 2)
    if not 1 <= preco <= 5000:
        raise ValueError("preço entre R$ 1 e R$ 5.000")
    slug = re.sub(r"[^a-z0-9]+", "-", unicodedata.normalize("NFKD", nome).encode("ascii", "ignore").decode().lower()).strip("-")
    prop = {"id": d.get("id") or secrets.token_hex(4), "slug": slug, "nome": nome, "descricao": str(d.get("descricao") or "")[:500],
            "preco": preco, "imagem": str(d.get("imagem") or ""), "criado_em": agora(), "status": "rascunho"}

    def fn(e):
        e["produtos_novos"] = [x for x in e["produtos_novos"] if x["id"] != prop["id"]] + [prop]
    ESTADO.mudar(fn)


def acao_produto_novo_remover(d: dict):
    ESTADO.mudar(lambda e: e.update(produtos_novos=[x for x in e["produtos_novos"] if x["id"] != d.get("id") or x.get("status") == "criado"]))


def acao_produto_novo_aprovar(d: dict):
    """Aprovar = criar na Cakto pela API (com a imagem) e cadastrar na loja do site (desligado até você ligar)."""
    import cakto_api
    prop = next((x for x in ESTADO.ler()["produtos_novos"] if x["id"] == d.get("id")), None)
    if not prop or prop.get("status") == "criado":
        raise ValueError("proposta não encontrada (ou já criada)")
    if not prop["imagem"]:
        raise ValueError("escolha a imagem do produto")
    c = cakto_api.Cakto()
    if not c.configurada():
        raise ValueError("para criar na Cakto pela API, coloque CAKTO_CLIENT_ID e CAKTO_CLIENT_SECRET no .env.local "
                         "(Cakto → Integrações → API) e reinicie o painel")
    url_img = f"https://{config.SITE_TELA}{prop['imagem']}"
    criado = c.criar_produto(prop["nome"], prop["descricao"], prop["preco"], url_img)
    checkout = criado.get("checkoutUrl") or criado.get("checkout_url") or ""
    if not checkout:
        raise ValueError(f"criado na Cakto (id {criado.get('id')}), mas a API não devolveu o link de checkout: copie o link "
                         "da oferta na Cakto e cadastre o produto na aba Produtos")
    db().escrever("POST", "produtos", {"on_conflict": "slug"},
                  {"slug": prop["slug"], "nome": prop["nome"], "descricao": prop["descricao"],
                   "preco_centavos": int(round(prop["preco"] * 100)), "imagem_url": prop["imagem"],
                   "tipo": "pago", "ativo": False, "checkout_url": checkout},
                  prefer="resolution=merge-duplicates,return=minimal")

    def fn(e):
        for x in e["produtos_novos"]:
            if x["id"] == prop["id"]:
                x.update(status="criado", cakto_id=criado.get("id"), checkout=checkout, aprovado_em=agora())
    ESTADO.mudar(fn)
    return {"msg": "Criado na Cakto e na loja (desligado: ligue na aba Produtos quando quiser)"}


# ---------------------------------------------------------------- Cargos de Nova Marte (liderança)
def dados_liderancas() -> dict:
    """Catálogo (fabrica/liderancas.json) + quem ocupa cada cargo + candidatos (quem entrou pelo site primeiro)."""
    cat = list(config.liderancas().values())
    try:
        pers = db().todos("personagens", {"select": (
            "codigo,nome,apelido,seed,lideranca,oculto,origem_source,origem_medium,origem_link_slug,origem_referer"),
            "order": "id.asc"})
        falta = None
    except Exception as e:  # noqa: BLE001  (sem a coluna lideranca: migração 012)
        pers = db().todos("personagens", {"select": "codigo,nome,apelido,seed,oculto,origem_source,origem_medium,"
                                                    "origem_link_slug,origem_referer", "order": "id.asc"})
        falta = f"rode supabase/migrations/012_liderancas.sql no SQL Editor ({str(e)[:80]})"
    colonos = []
    for x in pers:
        if x.get("oculto"):
            continue
        org = origem_legivel(x)
        colonos.append({"codigo": x["codigo"], "nome": (x.get("apelido") or "").strip() or episodio.nome_exibicao(x["nome"]),
                        "seed": x["seed"], "lideranca": x.get("lideranca"), "origem": org["rotulo"],
                        "pelo_site": org["rede"] == "Direto"})
    ocupante = {c["lideranca"]: c for c in colonos if c.get("lideranca")}
    return {"cargos": [{**c, "ocupante": ocupante.get(c["id"])} for c in cat], "colonos": colonos, "falta": falta}


def acao_lideranca_nomear(d: dict):
    """Nomeia alguém para um cargo de liderança (tira de quem estava; cada pessoa tem no máximo um cargo)."""
    cid, codigo = str(d.get("cargo") or ""), str(d.get("codigo") or "").upper()
    lid = config.liderancas().get(cid)
    if not lid:
        raise ValueError("cargo não existe")
    if not re.fullmatch(r"NM\d{6}", codigo):
        raise ValueError("escolha um colono (código NM000123)")
    try:
        db().escrever("PATCH", "personagens", {"lideranca": f"eq.{cid}"}, {"lideranca": None, "lideranca_em": None},
                      prefer="return=minimal")
        db().escrever("PATCH", "personagens", {"codigo": f"eq.{codigo}"}, {"lideranca": None}, prefer="return=minimal")
        feito = db().escrever("PATCH", "personagens", {"codigo": f"eq.{codigo}"},
                              {"lideranca": cid, "lideranca_em": datetime.now(timezone.utc).isoformat()},
                              prefer="return=representation")
    except Exception as e:  # noqa: BLE001
        if "lideranca" in str(e):
            raise ValueError("falta a coluna: rode supabase/migrations/012_liderancas.sql no SQL Editor") from e
        raise
    if not feito:
        raise ValueError("colono não encontrado")
    SINAL.mudou()
    return {"msg": f"{lid['titulo']} {feito[0].get('apelido') or episodio.nome_exibicao(feito[0]['nome'])} agora é {lid['nome']}!"}


def acao_lideranca_remover(d: dict):
    cid = str(d.get("cargo") or "")
    if cid not in config.liderancas():
        raise ValueError("cargo não existe")
    db().escrever("PATCH", "personagens", {"lideranca": f"eq.{cid}"}, {"lideranca": None, "lideranca_em": None},
                  prefer="return=minimal")
    SINAL.mudou()


def script_traje() -> bytes:
    """gerarSprite (do diretor.js) + vestirTraje (traje.js): a prévia do painel usa o MESMO boneco do vídeo."""
    dj = (FABRICA / "diretor.js").read_text(encoding="utf-8")
    ini = dj.index("const PELES")                       # paletas, rng, pick e gerarSprite, em sequência no diretor
    fim = dj.index("\n}\n", dj.index("function gerarSprite(seed)")) + 3
    return (dj[ini:fim] + "\n" + (FABRICA / "traje.js").read_text(encoding="utf-8")).encode("utf-8")


def acao_chat_ocultar(d: dict):
    db().escrever("PATCH", "chat_mensagens", {"id": f"eq.{int(d['id'])}"}, {"oculto": True}, prefer="return=minimal")
    SINAL.mudou()


def acao_chat_limpar(d: dict):
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


# ---------------------------------------------------------------- conteúdo extra (imagens e POVs)
def _item_extra(d: dict) -> str:
    item = str(d.get("item", ""))
    if not re.fullmatch(r"pov_[a-z]+|carrossel", item):
        raise ValueError("item inválido")
    return item


def legenda_carrossel_padrao(n: int) -> str:
    """Legenda inicial do carrossel: a do Instagram do episódio (copies.json) com o convite para arrastar."""
    arq = config.pasta_episodio(n) / "copies.json"
    base = config.ler_json(arq)["instagram"]["legenda"] if arq.exists() else f"Operação Marte Zero · Episódio {n}"
    return "👉 Arrasta pro lado: o resumo do episódio em imagens!\n\n" + base


def dados_carrossel(n: int, est: dict) -> dict | None:
    imagens, txt = pub.arquivos_carrossel(n)
    if n < pub.CARROSSEL_DESDE or not imagens:
        return None
    pasta = config.pasta_episodio(n)
    st = pub.ler().get(pub.chave_extra(n, "carrossel"), {}).get("instagram", {})
    return {"item": "carrossel",
            "imagens": [f"/midia/{pasta.name}/imagens/{i.name}?v={int(i.stat().st_mtime)}" for i in imagens],
            "legenda": txt.read_text(encoding="utf-8") if txt.exists() else legenda_carrossel_padrao(n),
            "aprovado_em": est.get("extras", {}).get(str(n), {}).get("carrossel", {}).get("aprovado_em"),
            "instagram": {k: st.get(k) for k in CAMPOS_REDE} | {"status": st.get("status", "pendente")}}


def acao_gerar_extras(d: dict):
    """🎨 Thumbnail, capa, carrossel e os vídeos em primeira pessoa (imagens.py + pov.py), sem IA."""
    n = _ep(d)
    if not (config.pasta_episodio(n) / "dados.json").exists():
        raise ValueError("gere o episódio antes")
    if FILA.ocupada(f"Gerar extras {n} "):
        raise ValueError("os extras deste episódio já estão na fila")
    so_imagens = bool(d.get("so_imagens"))

    def fn(job):
        ESTADO.mudar(lambda e: e["extras"].pop(str(n), None))   # vídeo novo precisa de aprovação nova
        rodar(job, [sys.executable, "imagens.py", "--episodio", str(n)], FABRICA)
        if not so_imagens:
            rodar(job, [sys.executable, "pov.py", "--episodio", str(n)], FABRICA)
        job.log("Pronto: confira as imagens e aprove cada vídeo em primeira pessoa no card do episódio.")
    j = FILA.adicionar(f"Gerar extras {n} " + ("(só imagens)" if so_imagens else "(imagens + POVs)"), fn)
    return {"job": j.id}


def acao_aprovar_extra(d: dict):
    n, item = _ep(d), _item_extra(d)
    if item == "carrossel" and n < pub.CARROSSEL_DESDE:
        raise ValueError(f"o carrossel só começa no episódio {pub.CARROSSEL_DESDE}")
    if item == "carrossel":
        imagens, txt = pub.arquivos_carrossel(n)
        if len(imagens) < 2:
            raise ValueError("imagens do carrossel não encontradas: gere os extras")
        if isinstance(d.get("legenda"), str):
            txt.write_text(d["legenda"].strip() + "\n", encoding="utf-8")
        elif not txt.exists():
            txt.write_text(legenda_carrossel_padrao(n).strip() + "\n", encoding="utf-8")
        problemas = pub.validar_copy("instagram", {"legenda": txt.read_text(encoding="utf-8")})
        if problemas:
            raise ValueError("não aprovei: " + "; ".join(problemas))
        ESTADO.mudar(lambda e: e["extras"].setdefault(str(n), {}).setdefault(item, {}).update(aprovado_em=agora()))
        return
    pasta = config.pasta_episodio(n) / "pov"
    if not (pasta / f"{item}.mp4").exists():
        raise ValueError("vídeo não encontrado")
    if isinstance(d.get("legenda"), str):
        (pasta / f"{item}.txt").write_text(d["legenda"].strip() + "\n", encoding="utf-8")
    leg = (pasta / f"{item}.txt").read_text(encoding="utf-8")
    problemas = sorted({p for r in ("instagram", "tiktok") for p in pub.validar_copy(r, {"legenda": leg})})
    if problemas:
        raise ValueError("não aprovei: " + "; ".join(problemas))
    ESTADO.mudar(lambda e: e["extras"].setdefault(str(n), {}).setdefault(item, {}).update(aprovado_em=agora()))


def acao_desaprovar_extra(d: dict):
    n, item = _ep(d), _item_extra(d)
    ESTADO.mudar(lambda e: e["extras"].get(str(n), {}).pop(item, None))


def acao_postar_extra(d: dict):
    """📤 Posta um vídeo em primeira pessoa no Instagram/TikTok pelo celular (mesmas travas do episódio)."""
    n, item = _ep(d), _item_extra(d)
    ensaio = bool(d.get("ensaio"))
    redes = [r for r in d.get("redes", []) if r in ("instagram", "tiktok")]
    if item == "carrossel":
        redes = ["instagram"]          # carrossel é só do Instagram
    if not redes:
        raise ValueError("marque pelo menos uma rede")
    if FILA.ocupada("Postar episódio ") or FILA.ocupada("Postar extra "):
        raise ValueError("já tem uma postagem na fila: espere terminar")
    if not ESTADO.ler()["extras"].get(str(n), {}).get(item, {}).get("aprovado_em"):
        raise ValueError("aprove o vídeo antes de publicar")
    chave = pub.chave_extra(n, item)
    for r in redes:
        s = pub.status(chave, r)["status"]
        if s in pub.TRAVADOS and not ensaio:
            raise ValueError(f"{pub.ROTULOS[r]} está '{s}': nada é reenviado sozinho. Confira no app e use Liberar.")
    cmd = [sys.executable, "celular.py", "--episodio", str(n), "--extra", item] \
        + (["--so", redes[0]] if len(redes) == 1 else []) + (["--ensaio"] if ensaio else [])

    def fn(job):
        try:
            rodar(job, cmd, PRODUCAO)
        finally:
            SINAL.mudou()
        job.log(("ENSAIO terminado. " if ensaio else "") + " · ".join(f"{pub.ROTULOS[r]}: {pub.status(chave, r)['status']}" for r in redes))
    j = FILA.adicionar(f"Postar extra {chave} " + ("(ensaio) " if ensaio else "") + "· " + ", ".join(pub.ROTULOS[r] for r in redes), fn)
    return {"job": j.id, "msg": "Postagem na fila" + (" (ensaio)" if ensaio else "")}


def acao_liberar_extra(d: dict):
    """Volta a rede de um vídeo extra para 'pendente' depois que VOCÊ conferiu no app."""
    n, item, r = _ep(d), _item_extra(d), d.get("plataforma")
    if r not in ("instagram", "tiktok"):
        raise ValueError("rede inválida")
    if FILA.ocupada(f"Postar extra {pub.chave_extra(n, item)} "):
        raise ValueError("espere a postagem em andamento terminar")
    pub.liberar(pub.chave_extra(n, item), r, "liberado no painel depois de conferir")
    SINAL.mudou()


def acao_marcar_extra_publicado(d: dict):
    """Depois de conferir no app (status 'conferir'), marca como publicado."""
    n, item, r = _ep(d), _item_extra(d), d.get("plataforma")
    if r not in ("instagram", "tiktok"):
        raise ValueError("rede inválida")
    pub.marcar(pub.chave_extra(n, item), r, "publicado", origem="painel", detalhe="conferido no app pelo dono")
    SINAL.mudou()


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
    "/api/cadastros": lambda q: dados_cadastros(),
    "/api/liderancas": lambda q: dados_liderancas(),
    "/api/pecas": lambda q: dados_pecas(),
    "/api/convites": lambda q: dados_convites(),
    "/api/minigames": lambda q: dados_minigames(),
    "/api/loja-moedas": lambda q: dados_loja_moedas(),
    "/api/produtos-novos": lambda q: dados_produtos_novos(),
    "/api/site-teste": lambda q: {"site": site_teste()},
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
            elif u.path == "/traje.js":
                corpo = script_traje()
                self.send_response(200)
                self.send_header("Content-Type", "text/javascript; charset=utf-8")
                self.send_header("Cache-Control", "no-store")
                self.send_header("Content-Length", str(len(corpo)))
                self.end_headers()
                self.wfile.write(corpo)
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
        divulg = (partes[0] == "divulgacao" and ((len(partes) == 3 and partes[1] in ("apresentacao", "institucional", "convite"))
                                                 or (len(partes) == 4 and partes[1] == "videos" and re.fullmatch(r"[a-z_]+", partes[2]))))
        sub_ok = divulg or (re.fullmatch(r"ep\d{3}", partes[0]) and
                            (len(partes) == 2 or (len(partes) == 3 and partes[1] in ("imagens", "pov", "stories"))))
        if not sub_ok or not re.fullmatch(r"[\w.\-]+\.(mp4|png|txt)", partes[-1]):
            return self.send_error(404)
        p = config.SAIDA.joinpath(*partes)
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
            if time.time() - getattr(vigia, "ultima_limpeza", 0) > 600:   # chat: apaga o que passou de 10 min
                vigia.ultima_limpeza = time.time()
                try:
                    antes = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
                    db().s.delete(f"{db().url}/chat_mensagens", params={"created_at": f"lt.{antes}"}, timeout=30)
                except Exception:  # noqa: BLE001
                    pass
            try:
                agenda_automatica()
            except Exception as ex:  # noqa: BLE001
                print("agenda automática:", ex, file=sys.stderr)
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
