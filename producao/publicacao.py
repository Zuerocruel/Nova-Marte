"""Estado da postagem nas redes — compartilhado por painel.py, celular.py, youtube.py e postar_avulso.py.

Arquivo: producao/dados/publicacoes.json
    {"1": {"instagram": {"status": "publicado", "em": "...", "historico": [...]}, ...}}

Status de cada rede:
    pendente   nunca tentou (ou foi liberada à mão no painel)
    erro       falhou ANTES do toque final / do envio → pode tentar de novo
    enviando   o toque final / o envio aconteceu e o script não terminou de confirmar
    publicado  confirmado no app (Instagram/TikTok)
    agendado   aceito pelo n8n com horário marcado (YouTube)
    conferir   ⚠ algo deu errado DEPOIS do toque final: pode ter publicado. Nunca reenvia sozinho.

Regra de ouro (evita post duplicado): enviando/publicado/agendado/conferir ficam TRAVADOS.
Só um clique em "Liberar" no painel devolve a rede para pendente.
"""
from __future__ import annotations

import json
import os
import re
import secrets
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

PRODUCAO = Path(__file__).resolve().parent
DADOS = PRODUCAO / "dados"
ARQ = DADOS / "publicacoes.json"
ARQ_ESTADO_PAINEL = DADOS / "estado.json"
_TRAVA_ARQ = DADOS / ".publicacoes.lock"
_TRAVA_POSTAGEM = DADOS / ".postando"
ENV_TRAVA = "OMZ_TRAVA_POSTAGEM"

REDES = ("instagram", "tiktok", "youtube")
ROTULOS = {"instagram": "Instagram", "tiktok": "TikTok", "youtube": "YouTube"}
TRAVADOS = {"enviando", "publicado", "agendado", "conferir"}
MAX_HASHTAGS = 14          # "menos de 15"
# 1 só quando o canal do YouTube já aceita link externo na descrição (veja docs/PUBLICACAO.md)
YT_LINK_NA_DESCRICAO = (os.environ.get("YOUTUBE_LINK_NA_DESCRICAO") or "0").strip() == "1"


class Recusado(Exception):
    """A trava não deixou seguir (não aprovado, já publicado, …). Não é falha de execução."""


def agora() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# ---------------------------------------------------------------- arquivo com trava
@contextmanager
def _trava_arquivo(espera: float = 15.0):
    DADOS.mkdir(exist_ok=True)
    limite = time.time() + espera
    while True:
        try:
            fd = os.open(_TRAVA_ARQ, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.close(fd)
            break
        except FileExistsError:
            try:
                if time.time() - _TRAVA_ARQ.stat().st_mtime > 30:   # sobra de processo que morreu
                    _TRAVA_ARQ.unlink(missing_ok=True)
                    continue
            except FileNotFoundError:
                continue
            if time.time() > limite:
                raise TimeoutError("publicacoes.json ocupado por outro processo")
            time.sleep(0.05)
    try:
        yield
    finally:
        _TRAVA_ARQ.unlink(missing_ok=True)


def ler() -> dict:
    if not ARQ.exists():
        return {}
    try:
        return json.loads(ARQ.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def _gravar(d: dict) -> None:
    tmp = ARQ.with_suffix(".tmp")
    tmp.write_text(json.dumps(d, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(ARQ)


def status(numero: int, rede: str) -> dict:
    return ler().get(str(numero), {}).get(rede, {"status": "pendente"})


def marcar(numero: int, rede: str, novo: str, origem: str = "", **extra) -> dict:
    if rede not in REDES:
        raise ValueError("rede inválida")
    with _trava_arquivo():
        d = ler()
        r = d.setdefault(str(numero), {}).setdefault(rede, {"status": "pendente"})
        hist = r.setdefault("historico", [])
        hist.append({"em": agora(), "status": novo, "origem": origem, **{k: v for k, v in extra.items() if k == "detalhe"}})
        del hist[:-30]
        r.update(status=novo, em=agora(), **extra)
        _gravar(d)
        return r


def anotar(numero: int, rede: str, **campos) -> None:
    """Grava informação sem mudar o status (ex.: último ensaio)."""
    with _trava_arquivo():
        d = ler()
        d.setdefault(str(numero), {}).setdefault(rede, {"status": "pendente"}).update(campos)
        _gravar(d)


def liberar(numero: int, rede: str, motivo: str = "liberado no painel") -> None:
    marcar(numero, rede, "pendente", origem="painel", detalhe=motivo, tocado_em=None, publicar_em=None)


# ---------------------------------------------------------------- travas de aprovação
def estado_painel() -> dict:
    if not ARQ_ESTADO_PAINEL.exists():
        return {}
    return json.loads(ARQ_ESTADO_PAINEL.read_text(encoding="utf-8"))


def video_da_rede(numero: int, rede: str) -> Path:
    """Episódio completo em todas as redes; só os eps CORTES_DESDE..CORTES_ATE tiveram corte curto no IG/TikTok."""
    import config  # fabrica/config.py
    pasta = config.pasta_episodio(numero)
    if rede in ("instagram", "tiktok") and CORTES_DESDE <= numero <= CORTES_ATE:
        return pasta / f"episodio_{numero:03d}_{rede}.mp4"
    return pasta / f"episodio_{numero:03d}.mp4"


def exigir_liberado(numero: int, rede: str, ensaio: bool = False) -> dict:
    """Confere TODAS as travas antes de postar. Devolve a copy aprovada da rede."""
    import config  # fabrica/config.py (o chamador põe fabrica/ no sys.path)

    est = estado_painel()
    ep = est.get("episodios", {}).get(str(numero), {})
    if not ep.get("aprovado_em"):
        raise Recusado(f"episódio {numero} não está aprovado no painel")
    if not ep.get("publicado_em") and not ensaio:
        raise Recusado(f"episódio {numero} ainda não foi registrado (🚀 Publicar no painel cria os links /l/)")
    pasta = config.pasta_episodio(numero)
    video = video_da_rede(numero, rede)
    if not video.exists():
        raise Recusado(f"vídeo com voz não encontrado ({video.name}); prévia sem voz não é publicada"
                       + (" — gere os cortes: python cortes.py --episodio N" if video.stem.endswith(("_instagram", "_tiktok")) else ""))
    if ep.get("aprovado_em") and video.stat().st_mtime > datetime.fromisoformat(ep["aprovado_em"]).timestamp() + 5:
        raise Recusado("o vídeo foi gerado de novo depois da aprovação: aprove de novo no painel")
    copy_est = est.get("copies", {}).get(str(numero), {}).get(rede, {})
    if not copy_est.get("aprovado_em"):
        raise Recusado(f"a copy do {ROTULOS[rede]} não está aprovada")
    arq_copies = pasta / "copies.json"
    if not arq_copies.exists():
        raise Recusado("copies.json não existe")
    copy = config.ler_json(arq_copies)[rede]
    problemas = validar_copy(rede, copy)
    if problemas:
        raise Recusado("copy aprovada fora das regras: " + "; ".join(problemas))
    s = status(numero, rede)
    if s.get("status") in TRAVADOS and not ensaio:
        raise Recusado(f"{ROTULOS[rede]} está '{s['status']}' — nada é reenviado sozinho. "
                       "Confira no app e use 'Liberar' no painel se precisar postar de novo.")
    if copy_est.get("postado_url") and not ensaio:
        raise Recusado(f"{ROTULOS[rede]} já foi marcado como postado à mão ({copy_est['postado_url']})")
    return {"video": video, "copy": copy}


def chave_extra(numero: int, item: str) -> str:
    """Chave do conteúdo extra em publicacoes.json (ex.: "2-pov_obra"), separada da do episódio."""
    return f"{numero}-{item}"


def pasta_extra(numero: int, item: str) -> Path:
    """Onde mora o vídeo extra: POV do episódio (saida/epNNN/pov/) ou vídeo de construção
    (saida/construcao/<obra>/, que não pertence a um episódio: numero = 0)."""
    import config
    if item.startswith("construcao_"):
        return config.SAIDA / "construcao" / item.removeprefix("construcao_")
    return config.pasta_episodio(numero) / "pov"


def exigir_liberado_extra(numero: int, item: str, rede: str, ensaio: bool = False) -> dict:
    """Mesmas travas do episódio para um vídeo extra (POV ou "Como se constrói…"): aprovado, vídeo não mudou
    depois da aprovação, legenda dentro das regras e nada reenviado sozinho."""
    if not re.fullmatch(r"pov_[a-z]+|construcao_[a-z]+", item or ""):
        raise Recusado("conteúdo extra inválido")
    est = estado_painel().get("extras", {}).get(str(numero), {}).get(item, {})
    if not est.get("aprovado_em"):
        raise Recusado(f"{item} do episódio {numero} não está aprovado no painel")
    pasta = pasta_extra(numero, item)
    video, txt = pasta / f"{item}.mp4", pasta / f"{item}.txt"
    if not video.exists() or not txt.exists():
        raise Recusado(f"{item}.mp4 ou {item}.txt não existe: gere os extras de novo")
    if video.stat().st_mtime > datetime.fromisoformat(est["aprovado_em"]).timestamp() + 5:
        raise Recusado("o vídeo foi gerado de novo depois da aprovação: aprove de novo no painel")
    legenda = txt.read_text(encoding="utf-8")
    problemas = validar_copy(rede, {"legenda": legenda})
    if problemas:
        raise Recusado("legenda fora das regras: " + "; ".join(problemas))
    s = status(chave_extra(numero, item), rede)
    if s.get("status") in TRAVADOS and not ensaio:
        raise Recusado(f"{ROTULOS[rede]} está '{s['status']}' — nada é reenviado sozinho. "
                       "Confira no app e use 'Liberar' no painel se precisar postar de novo.")
    return {"video": video, "copy": {"legenda": legenda}}



def arquivos_apresentacao() -> tuple[list[Path], Path]:
    """Carrossel de apresentação do perfil (fabrica/divulgacao.py --apresentacao)."""
    import config
    pasta = config.SAIDA / "divulgacao" / "apresentacao"
    return sorted(pasta.glob("apresentacao_*.png")), pasta / "legenda.txt"


def exigir_liberado_apresentacao(rede: str, ensaio: bool = False) -> dict:
    """Mesmas travas do carrossel do episódio, para o post de apresentação (chave "apresentacao")."""
    if rede != "instagram":
        raise Recusado("o post de apresentação vai só para o feed do Instagram")
    est = estado_painel().get("divulgacao", {}).get("apresentacao", {})
    if not est.get("aprovado_em"):
        raise Recusado("o post de apresentação não está aprovado no painel")
    imagens, txt = arquivos_apresentacao()
    if not 2 <= len(imagens) <= 10 or not txt.exists():
        raise Recusado("imagens da apresentação ou legenda.txt não existem: gere de novo no painel")
    aprovado = datetime.fromisoformat(est["aprovado_em"]).timestamp() + 5
    if any(i.stat().st_mtime > aprovado for i in imagens):
        raise Recusado("as imagens foram geradas de novo depois da aprovação: aprove de novo no painel")
    legenda = txt.read_text(encoding="utf-8")
    problemas = validar_copy(rede, {"legenda": legenda})
    if problemas:
        raise Recusado("legenda fora das regras: " + "; ".join(problemas))
    s = status("apresentacao", rede)
    if s.get("status") in TRAVADOS and not ensaio:
        raise Recusado(f"{ROTULOS[rede]} está '{s['status']}' — nada é reenviado sozinho.")
    return {"imagens": imagens, "copy": {"legenda": legenda}}


CORTES_DESDE = 7      # do episódio 7 ao 9 o Instagram e o TikTok receberam o corte curto (cortes.py)
CORTES_ATE = 9        # do 10 em diante voltam a receber o episódio COMPLETO (decisão do dono em 2026-11-28)
CARROSSEL_DESDE = 4   # o carrossel do Instagram começa no episódio 4 (os anteriores não têm)


def arquivos_carrossel(numero: int) -> tuple[list[Path], Path]:
    """As imagens do carrossel (em ordem) e o arquivo da legenda, em saida/epNNN/imagens/."""
    import config
    pasta = config.pasta_episodio(numero) / "imagens"
    return sorted(pasta.glob("carrossel_*.png")), pasta / "carrossel.txt"


def exigir_liberado_carrossel(numero: int, rede: str, ensaio: bool = False) -> dict:
    """Mesmas travas do episódio para o carrossel do Instagram: aprovado no painel, imagens iguais às aprovadas,
    legenda dentro das regras e nada reenviado sozinho."""
    if rede != "instagram":
        raise Recusado("o carrossel só vai para o Instagram")
    if numero < CARROSSEL_DESDE:
        raise Recusado(f"o carrossel só começa no episódio {CARROSSEL_DESDE}")
    est = estado_painel().get("extras", {}).get(str(numero), {}).get("carrossel", {})
    if not est.get("aprovado_em"):
        raise Recusado(f"o carrossel do episódio {numero} não está aprovado no painel")
    imagens, txt = arquivos_carrossel(numero)
    if not 2 <= len(imagens) <= 10 or not txt.exists():
        raise Recusado("imagens do carrossel (2 a 10) ou carrossel.txt não existem: gere os extras de novo")
    aprovado = datetime.fromisoformat(est["aprovado_em"]).timestamp() + 5
    if any(i.stat().st_mtime > aprovado for i in imagens):
        raise Recusado("as imagens foram geradas de novo depois da aprovação: aprove de novo no painel")
    legenda = txt.read_text(encoding="utf-8")
    problemas = validar_copy(rede, {"legenda": legenda})
    if problemas:
        raise Recusado("legenda fora das regras: " + "; ".join(problemas))
    s = status(chave_extra(numero, "carrossel"), rede)
    if s.get("status") in TRAVADOS and not ensaio:
        raise Recusado(f"{ROTULOS[rede]} está '{s['status']}' — nada é reenviado sozinho. "
                       "Confira no app e use 'Liberar' no painel se precisar postar de novo.")
    return {"imagens": imagens, "copy": {"legenda": legenda}}

# ---------------------------------------------------------------- regras de texto
# Link em qualquer forma: com/sem http, www, domínios comuns e o "ponto com" escrito por extenso.
# REGRA FIXA: legenda do Instagram e do TikTok NUNCA tem link (só o YouTube pode). Conferido na geração das
# copies (sem_link), na aprovação, na liberação para postar e de novo no celular, na hora de colar.
# (?<![@\w.-]) : "@joao.app" é o @ de um perfil (legenda marcando quem chegou), não um link
RE_URL = re.compile(
    r"(https?://\S+|www\.\S+"
    r"|(?<![@\w.-])\b[\w-]+(\.[\w-]+)*\.(app|com|br|net|org|io|link|me|ly|gg|xyz|site|online|store|shop|tv|co|info|dev|page|bio)\b(/\S*)?"
    r"|\b(ponto|dot)\s?(com|br|app|net)\b)", re.I)


def sem_link(texto: str) -> str:
    """Tira qualquer link do texto (legenda de Instagram/TikTok) e arruma os espaços que sobram."""
    t = RE_URL.sub("", texto)
    t = re.sub(r"[ \t]+([,.!?])", r"\1", t)
    t = re.sub(r"[ \t]+\n", "\n", t)
    return re.sub(r"[ \t]{2,}", " ", t).strip()


def exigir_sem_link(rede: str, legenda: str) -> None:
    """Última trava antes de colar a legenda no app: Instagram/TikTok com link → nada é postado."""
    m = RE_URL.search(legenda or "")
    if rede in ("instagram", "tiktok") and m:
        raise Recusado(f"a legenda do {ROTULOS[rede]} tem link ({m.group(0)!r}): Instagram e TikTok nunca "
                       "levam link. Nada foi postado.")
RE_HASHTAG = re.compile(r"(?<![\w#])#[\wÀ-ÿ]+", re.U)


def contar_hashtags(texto: str) -> int:
    return len(RE_HASHTAG.findall(texto or ""))


def validar_copy(rede: str, copy: dict) -> list[str]:
    erros = []
    if rede == "youtube":
        if contar_hashtags(copy.get("titulo", "")) + contar_hashtags(copy.get("descricao", "")) > MAX_HASHTAGS:
            erros.append(f"mais de {MAX_HASHTAGS} hashtags")
        if len(copy.get("titulo", "")) > 100:
            erros.append("título passa de 100 caracteres")
        if len(copy.get("descricao", "")) > 5000:
            erros.append("descrição passa de 5000 caracteres")
        if not YT_LINK_NA_DESCRICAO and RE_URL.search(copy.get("titulo", "") + " " + copy.get("descricao", "")):
            erros.append("a descrição do YouTube tem link (o canal ainda não libera: use 'link no perfil do canal')")
        if re.search(r"[<>]", copy.get("titulo", "") + copy.get("descricao", "")):
            erros.append("YouTube recusa os caracteres < e >")
    else:
        leg = copy.get("legenda", "")
        if RE_URL.search(leg):
            erros.append(f"a legenda do {ROTULOS[rede]} tem link (não pode: use 'link na bio')")
        if contar_hashtags(leg) > MAX_HASHTAGS:
            erros.append(f"mais de {MAX_HASHTAGS} hashtags")
        if len(leg) > 2200:
            erros.append("legenda passa de 2200 caracteres")
    return erros


# ---------------------------------------------------------------- uma postagem por vez
@contextmanager
def trava_postagem(quem: str):
    """Impede o painel e o Agendador de Tarefas de postarem ao mesmo tempo.
    Processos filhos herdam a trava pela variável OMZ_TRAVA_POSTAGEM."""
    DADOS.mkdir(exist_ok=True)
    herdada = os.environ.get(ENV_TRAVA)
    if herdada and _TRAVA_POSTAGEM.exists() and herdada in _TRAVA_POSTAGEM.read_text(encoding="utf-8"):
        yield
        return
    if _TRAVA_POSTAGEM.exists():
        idade = time.time() - _TRAVA_POSTAGEM.stat().st_mtime
        if idade < 90 * 60:
            raise Recusado(f"outra postagem está rodando ({_TRAVA_POSTAGEM.read_text(encoding='utf-8').split('|')[0]}, "
                           f"há {int(idade // 60)} min). Espere terminar.")
        _TRAVA_POSTAGEM.unlink(missing_ok=True)   # sobra de algo que travou há mais de 90 min
    token = secrets.token_hex(8)
    try:
        fd = os.open(_TRAVA_POSTAGEM, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError:
        raise Recusado("outra postagem acabou de começar") from None
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(f"{quem}|{token}|{agora()}")
    os.environ[ENV_TRAVA] = token
    try:
        yield
    finally:
        os.environ.pop(ENV_TRAVA, None)
        _TRAVA_POSTAGEM.unlink(missing_ok=True)
