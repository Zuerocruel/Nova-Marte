"""Posta o episódio aprovado no Instagram (Reels) e no TikTok por um celular Android via ADB.

    python producao/celular.py --checar                      # confere ADB, celular, apps e tela
    python producao/celular.py --episodio 1 --ensaio         # faz tudo, MENOS o toque final de publicar
    python producao/celular.py --episodio 1                  # publica nas duas redes
    python producao/celular.py --episodio 1 --so instagram   # só uma rede

Fluxo de cada rede:
  1. envia o MP4 para DCIM/OperacaoMarteZero e avisa a galeria;
  2. põe a legenda aprovada (com emojis) na área de transferência do Android (app Clipper);
  3. abre o vídeo direto no app pelo "Compartilhar" do Android (Reels / TikTok);
  4. lê a tela (uiautomator), trata pop-ups e toca nos botões até a tela final;
  5. cola a legenda no campo de descrição e confere que colou;
  5b. troca a capa pela capa do episódio (saida/epNNN/imagens/capa_vertical.png), enviada à galeria
      logo antes, então é a foto mais recente: Instagram "Editar capa → Adicionar do rolo da câmera",
      TikTok "Editar capa → Carregar" (--sem-capa pula; vídeos extras não trocam a capa);
  6. toca em Compartilhar/Publicar (não no --ensaio) e espera a confirmação.

Travas (não remova):
  - Só roda se o episódio e a copy da rede estiverem APROVADOS no painel.
  - No TikTok nunca toca em "Seu Story"/"Story".
  - Falha depois do toque final → status "⚠ conferir" e NUNCA tenta de novo sozinho.

Requisitos no celular: Depuração USB ligada e autorizada para este PC, tela desbloqueada,
Instagram e TikTok logados, app Clipper (ca.zgrs.clipper) instalado. Veja docs/PUBLICACAO.md.
"""
from __future__ import annotations

import argparse
import glob
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path

PRODUCAO = Path(__file__).resolve().parent
sys.path.insert(0, str(PRODUCAO.parent / "fabrica"))
sys.path.insert(0, str(PRODUCAO))

import config  # noqa: E402  (UTF-8 no console + .env)
import publicacao as pub  # noqa: E402

PASTA_CELULAR = "/sdcard/DCIM/OperacaoMarteZero"
TMP_CELULAR = "/data/local/tmp"
EVIDENCIAS = pub.DADOS / "celular"

APPS = {
    "instagram": ["com.instagram.android"],
    "tiktok": ["com.zhiliaoapp.musically", "com.ss.android.ugc.trill"],
}
CLIPPER = "ca.zgrs.clipper"

# ------------------------------------------------------------------ textos da tela (pt-BR e inglês)
def rx(*partes: str) -> re.Pattern:
    return re.compile("|".join(partes), re.I)


# Qual tela do "Compartilhar" usar. No Instagram NUNCA a do Direct (vira mensagem) nem a do Story.
COMPARTILHAR = {
    # testado (Instagram 2026, Android 12): ShareHandlerActivity abre o editor de Reels com o vídeo;
    # ReelShareHandlerActivity abre e cai no feed inicial.
    "instagram": {"preferir": rx(r"\.ShareHandlerActivity$", r"clips"),
                  "evitar": rx(r"\.direct\.", r"Direct", r"Story", r"ReelShareHandler")},
    "tiktok": {"preferir": rx(r"share", r"system"), "evitar": None},
}


FINAL_RID = rx(r"share_button", r"publish", r"post_button", r"btn_post", r"submit", r"done_button")
# tela de PUBLICAÇÃO (para as travas de tela): só o botão final de verdade. O "Seu Story" do TikTok
# (rid tv_quick_publish) fica no editor: nunca é tocado (FINAL_RID), mas não quer dizer que já é a tela final.
TELA_FINAL_RID = rx(r"share_button", r"post_button", r"btn_post")
FEED = rx(r"^feed$", r"^publicação$", r"^post$")   # carrossel: post no feed (nunca Reels/Story)
ESCOLHA_DESTINO = rx(r"^feed$", r"^publicação$", r"^post$", r"^reels?$", r"^story$", r"^stories$")
AVANCAR = rx(r"^avançar$", r"^próximo$", r"^next$", r"^seguinte$")
DISPENSAR = rx(r"^ok$", r"^entendi$", r"^continuar$", r"^agora não$", r"^not now$", r"^got it$",
               r"^fechar$", r"^close$", r"^pular$", r"^skip$", r"^ignorar$", r"^dispensar$", r"^dismiss$")
DESCARTAR = rx(r"^descartar", r"^discard", r"^recomeçar$", r"^start over$", r"^excluir rascunho", r"^delete draft", r"^começar de novo", r"^start over")
# nunca tocar (vale para os dois apps)
PROIBIDO = rx(r"salvar rascunho", r"save draft", r"^rascunho", r"^drafts?$")
# TikTok: nunca o Story
STORY = rx(r"\bstory\b", r"\bstories\b", r"seu story", r"your story")

IG = {
    # só textos de pop-up de verdade: um falso positivo faria tocar em "OK/Fechar" no meio do fluxo
    "popups": rx(r"sobre o reels", r"sobre os reels", r"about reels", r"reels mais longos", r"longer reels",
                 r"compartilhar seus reels no facebook", r"share your reels to facebook", r"recomendar no facebook",
                 r"recommend on facebook"),
    "escolher_reels": rx(r"^reels?$", r"^reel$"),
    "campo": rx(r"legenda", r"caption", r"escreva", r"write a"),
    "final": rx(r"^compartilhar$", r"^share$"),
    "sucesso": rx(r"compartilhad", r"\bshared\b", r"seu reel", r"your reel", r"publicad", r"posted", r"finalizando", r"finishing"),
    "enviando": rx(r"enviando", r"uploading", r"processando", r"processing"),
}
TT = {
    "popups": rx(r"\bnovidades?\b", r"novo recurso", r"what's new", r"\bdica\b", r"\btip\b"),   # busca no texto da tela inteira
    "campo": rx(r"descri", r"describe", r"adicione", r"add a"),
    "folha_destino": rx(r"compartilhe no tiktok", r"share to tiktok"),
    "escolher_video": rx(r"^vídeo$", r"^video$", r"^publicação$", r"^post$"),
    "final": rx(r"^publicar$", r"^post$", r"^postar$"),
    "sucesso": rx(r"publicad", r"\bposted\b", r"foi postado", r"has been posted"),
    "enviando": rx(r"enviando", r"uploading", r"publicando", r"posting", r"\d{1,3}\s?%"),
}


class Falha(Exception):
    pass


class TelaMudou(Falha):
    """A tela mudou entre a leitura e o toque: nada foi tocado, basta ler de novo."""


BLOQUEIO_TOQUE = ("o celular bloqueou os toques vindos do PC (INJECT_EVENTS). Xiaomi/Redmi: Opções do desenvolvedor → "
                  "ligue 'Depuração USB (configurações de segurança)'")


# ------------------------------------------------------------------ ADB
def achar_adb() -> str | None:
    candidatos = [os.environ.get("ADB_PATH", ""), shutil.which("adb") or "",
                  os.path.expandvars(r"%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe"),
                  *glob.glob(os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\WinGet\Packages\Google.PlatformTools*\platform-tools\adb.exe")),
                  r"C:\platform-tools\adb.exe"]
    return next((c for c in candidatos if c and Path(c).is_file()), None)


@dataclass
class No:
    text: str
    desc: str
    rid: str
    cls: str
    clicavel: bool
    ativo: bool
    focado: bool
    caixa: tuple[int, int, int, int]

    @property
    def rotulo(self) -> str:
        return (self.text or self.desc or self.rid.split("/")[-1]).strip()

    @property
    def centro(self) -> tuple[int, int]:
        x1, y1, x2, y2 = self.caixa
        return (x1 + x2) // 2, (y1 + y2) // 2


class Celular:
    def __init__(self, serial: str | None = None, log=print) -> None:
        self.bin = achar_adb()
        if not self.bin:
            raise Falha("ADB não encontrado. Instale com: winget install --id Google.PlatformTools -e  (ou defina ADB_PATH no .env)")
        self.serial = serial or os.environ.get("ADB_SERIAL") or None
        self.ensaio = False
        self.log = log

    # comandos crus
    def adb(self, *args: str, timeout: int = 60, binario: bool = False) -> subprocess.CompletedProcess:
        cmd = [self.bin] + (["-s", self.serial] if self.serial else []) + list(args)
        r = subprocess.run(cmd, capture_output=True, timeout=timeout,
                           **({} if binario else {"text": True, "encoding": "utf-8", "errors": "replace"}))
        return r

    def sh(self, comando: str, timeout: int = 60) -> str:
        r = self.adb("shell", comando, timeout=timeout)
        out = (r.stdout or "") + (r.stderr or "")
        if comando.startswith("input ") and "INJECT_EVENTS" in out:
            raise Falha(BLOQUEIO_TOQUE)
        return out

    def toques_liberados(self) -> bool:
        """A MIUI bloqueia toque/tecla vindos do PC sem 'Depuração USB (configurações de segurança)'."""
        try:
            self.sh("input keyevent 0")      # KEYCODE_UNKNOWN: não faz nada, só testa a permissão
            return True
        except Falha:
            return False

    # aparelho
    def dispositivos(self) -> list[tuple[str, str]]:
        r = subprocess.run([self.bin, "devices"], capture_output=True, text=True, timeout=30)
        out = []
        for linha in r.stdout.splitlines()[1:]:
            if "\t" in linha:
                s, st = linha.split("\t", 1)
                out.append((s.strip(), st.strip()))
        return out

    def escolher_aparelho(self) -> None:
        devs = self.dispositivos()
        prontos = [s for s, st in devs if st == "device"]
        if self.serial:
            if self.serial not in prontos:
                raise Falha(f"celular {self.serial} não está pronto ({dict(devs).get(self.serial, 'não conectado')})")
            return
        if any(st == "unauthorized" for _, st in devs):
            raise Falha("celular conectado mas NÃO autorizado: desbloqueie e aceite 'Permitir depuração USB' na tela")
        if not prontos:
            raise Falha("nenhum celular conectado (cabo USB + Depuração USB ligada nas Opções do desenvolvedor)")
        if len(prontos) > 1:
            raise Falha(f"mais de um aparelho conectado ({', '.join(prontos)}): defina ADB_SERIAL no .env")
        self.serial = prontos[0]

    def pacote_instalado(self, pacote: str) -> bool:
        return f"package:{pacote}" in self.sh(f"pm list packages {pacote}")

    def pacote_de(self, rede: str) -> str | None:
        return next((p for p in APPS[rede] if self.pacote_instalado(p)), None)

    def tela_desbloqueada(self) -> tuple[bool, str]:
        power = self.sh("dumpsys power")
        acordado = "mWakefulness=Awake" in power or "Display Power: state=ON" in power
        win = self.sh("dumpsys window")
        bloqueado = bool(re.search(r"(mDreamingLockscreen=true|isStatusBarKeyguard=true|mShowingLockscreen=true|"
                                   r"mKeyguardShowing=true|keyguardShowing=true)", win))
        if not acordado:
            return False, "tela apagada"
        if bloqueado:
            return False, "tela bloqueada"
        return True, "acordada e desbloqueada"

    def acordar(self) -> None:
        self.sh("input keyevent KEYCODE_WAKEUP")
        time.sleep(0.8)
        ok, motivo = self.tela_desbloqueada()
        if not ok:
            raise Falha(f"{motivo}: desbloqueie o celular e deixe a tela ligada (Opções do desenvolvedor → Permanecer ativo)")

    # arquivos e galeria
    def enviar_video(self, local: Path) -> tuple[str, str]:
        destino = f"{PASTA_CELULAR}/{local.name}"
        self.sh(f"mkdir -p {PASTA_CELULAR}")
        r = self.adb("push", str(local), destino, timeout=600)
        if r.returncode != 0:
            raise Falha(f"adb push falhou: {(r.stderr or r.stdout).strip()[:200]}")
        # A galeria guarda o caminho real (/storage/emulated/0/...), não o atalho /sdcard/...
        real = destino.replace("/sdcard/", "/storage/emulated/0/", 1)
        self.sh(f"am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file://{real}")
        uri = None
        for _ in range(20):
            out = self.sh(f"content query --uri content://media/external/video/media --projection _id "
                          f"--where \"_data='{real}' OR _data='{destino}'\"")
            m = re.search(r"_id=(\d+)", out)
            if m:
                uri = f"content://media/external/video/media/{m.group(1)}"
                break
            time.sleep(0.5)
        if not uri:
            raise Falha("o vídeo foi copiado mas a galeria não o indexou (abra a Galeria uma vez e tente de novo)")
        return destino, uri

    def enviar_imagem(self, local: Path, nome: str) -> str:
        """Manda a imagem para a galeria (fica como a foto mais recente)."""
        destino = f"{PASTA_CELULAR}/{nome}"
        self.sh(f"mkdir -p {PASTA_CELULAR}")
        r = self.adb("push", str(local), destino, timeout=120)
        if r.returncode != 0:
            raise Falha(f"adb push da capa falhou: {(r.stderr or r.stdout).strip()[:200]}")
        real = destino.replace("/sdcard/", "/storage/emulated/0/", 1)
        self.sh(f"am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file://{real}")
        for _ in range(20):
            if re.search(r"_id=\d+", self.sh(f"content query --uri content://media/external/images/media --projection _id "
                                             f"--where \"_data='{real}' OR _data='{destino}'\"")):
                return destino
            time.sleep(0.5)
        raise Falha("a capa foi copiada mas a galeria não a indexou")

    def ler_area_de_transferencia(self) -> str:
        self.sh(f"am start -W -n {CLIPPER}/.Main")
        time.sleep(1.0)
        m = re.search(r'data="(.*)"', self.sh("am broadcast -a clipper.get"), re.S)
        self.sh("input keyevent KEYCODE_HOME")
        return m.group(1).strip() if m else ""

    def link_do_ultimo_post(self, perfil: str = "operacaomartezero") -> str:
        """Abre o perfil, entra no post mais recente (linha 1, coluna 1), toca em Enviar → 'Copiar link' e devolve
        o link limpo (sem ?…). Não publica nem envia nada: só copia o link."""
        self.acordar()
        self.sh(f"am start -a android.intent.action.VIEW -d https://www.instagram.com/{perfil}/ com.instagram.android")
        time.sleep(6)
        post = None
        for _ in range(4):
            post = next((n for n in self.tela() if n.rid.endswith("/image_button") and "linha 1, coluna 1" in n.desc), None)
            if post:
                break
            self.sh("input swipe 540 1500 540 900 300")
            time.sleep(1.5)
        if not post:
            raise Falha("não achei o post mais recente no perfil")
        self.tocar(post, "instagram")
        time.sleep(4)
        enviar = None
        for _ in range(4):
            enviar = next((n for n in self.tela() if n.rid.endswith("/row_feed_button_share")), None)
            if enviar:
                break
            self.sh("input swipe 540 1700 540 1100 400")
            time.sleep(1.5)
        if not enviar:
            raise Falha("não achei o botão Enviar do post")
        self.tocar(enviar, "instagram")
        time.sleep(3)
        copiar = next((n for n in self.tela() if n.rid.endswith("/button") and n.rotulo.lower() == "copiar link"), None)
        if not copiar:
            self.sh("input keyevent KEYCODE_BACK")
            raise Falha("não achei 'Copiar link'")
        self.tocar(copiar, "instagram")
        time.sleep(1.5)
        link = self.ler_area_de_transferencia()
        m = re.match(r"(https://www\.instagram\.com/(p|reel)/[\w-]+/)", link)
        if not m:
            raise Falha(f"a área de transferência não tem um link de post: {link[:80]!r}")
        return m.group(1)

    def copiar_texto(self, texto: str) -> None:
        """Coloca o texto (com emojis e quebras de linha) na área de transferência do Android.
        O texto vai como arquivo e é lido no próprio celular: nada passa pela linha de comando do Windows."""
        if not self.pacote_instalado(CLIPPER):
            raise Falha("app Clipper (ca.zgrs.clipper) não está instalado: veja docs/PUBLICACAO.md")
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", suffix=".txt", delete=False, newline="\n") as f:
            f.write(texto)
            tmp = f.name
        try:
            r = self.adb("push", tmp, f"{TMP_CELULAR}/omz_legenda.txt", timeout=60)
            if r.returncode != 0:
                raise Falha("não consegui enviar a legenda ao celular")
        finally:
            os.unlink(tmp)
        # Android 10+ só deixa mexer na área de transferência com o app em primeiro plano
        self.sh(f"am start -W -n {CLIPPER}/.Main")
        time.sleep(1.0)
        out = self.sh(f"am broadcast -a clipper.set -e text \"$(cat {TMP_CELULAR}/omz_legenda.txt)\"")
        if "result=-1" not in out:
            raise Falha(f"Clipper não confirmou a cópia: {out.strip()[:200]}")
        self.sh("input keyevent KEYCODE_HOME")

    def app_em_frente(self) -> str | None:
        m = re.search(r"mCurrentFocus=Window\{\S+ \S+ ([\w.]+)/", self.sh("dumpsys window | grep mCurrentFocus"))
        return m.group(1) if m else None

    def le_videos(self, pacote: str) -> bool:
        """O app pode ler os vídeos da galeria? (sem isso o Compartilhar abre e fecha na hora)"""
        out = self.sh(f"dumpsys package {pacote}")
        return bool(re.search(r"android\.permission\.(READ_MEDIA_VIDEO|READ_EXTERNAL_STORAGE): granted=true", out))

    def atividade_compartilhar(self, pacote: str, preferir: re.Pattern | None,
                               evitar: re.Pattern | None = None) -> str | None:
        out = self.sh(f"cmd package query-activities --components -a android.intent.action.SEND -t video/mp4 -p {pacote}")
        comps = [l.strip() for l in out.splitlines() if l.strip().startswith(pacote + "/")]
        if evitar:
            comps = [c for c in comps if not evitar.search(c)]
        if not comps:
            return None
        if preferir:
            for c in comps:
                if preferir.search(c):
                    return c
        return comps[0]

    def compartilhar(self, uri: str, componente: str | None, pacote: str) -> None:
        alvo = f"-n {componente}" if componente else f"-p {pacote}"
        out = self.sh(f"am start -W -a android.intent.action.SEND -t video/mp4 --eu android.intent.extra.STREAM {uri} "
                      f"--grant-read-uri-permission -f 0x10008000 {alvo}")
        if re.search(r"Error|Exception", out):
            raise Falha(f"o app não abriu pelo Compartilhar: {out.strip()[:200]}")

    # tela
    def tela(self) -> list[No]:
        for _ in range(3):
            # apaga a leitura anterior: se o dump falhar (vídeo tocando, animação), NUNCA usar uma tela antiga
            self.sh(f"rm -f {TMP_CELULAR}/omz_tela.xml")
            self.sh(f"uiautomator dump {TMP_CELULAR}/omz_tela.xml", timeout=40)
            r = self.adb("exec-out", f"cat {TMP_CELULAR}/omz_tela.xml", timeout=30, binario=True)
            xml = r.stdout.decode("utf-8", "replace")
            if "<hierarchy" in xml:
                xml = xml[xml.index("<?xml") if "<?xml" in xml else xml.index("<hierarchy"):]
                xml = xml[: xml.rindex("</hierarchy>") + len("</hierarchy>")]
                return [n for n in (self._no(e) for e in ET.fromstring(xml).iter("node")) if n]
            time.sleep(1.0)   # acontece com animação na tela
        raise Falha("não consegui ler a tela (uiautomator dump)")

    @staticmethod
    def _no(e: ET.Element) -> No | None:
        m = re.match(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", e.get("bounds", ""))
        if not m:
            return None
        caixa = tuple(int(v) for v in m.groups())
        if caixa[2] <= caixa[0] or caixa[3] <= caixa[1]:
            return None
        return No(e.get("text", ""), e.get("content-desc", ""), e.get("resource-id", ""), e.get("class", ""),
                  e.get("clickable") == "true", e.get("enabled") != "false", e.get("focused") == "true", caixa)

    def tocar(self, no: No, rede: str, final: bool = False) -> None:
        rotulo = no.rotulo
        if PROIBIDO.search(rotulo):
            raise Falha(f"trava: tentativa de tocar em '{rotulo}'")
        if rede == "tiktok" and STORY.search(rotulo):
            raise Falha(f"trava: nunca tocar em '{rotulo}' no TikTok")
        if not final and (IG["final"].search(rotulo) or TT["final"].search(rotulo) or FINAL_RID.search(no.rid or "")):
            raise Falha(f"trava: '{rotulo}' ({no.rid}) é o botão final e só pode ser tocado na etapa final")
        if final and self.ensaio:
            raise Falha("trava: ENSAIO nunca toca no botão final")
        x, y = no.centro
        if not final:
            self._conferir_ponto(no, rede)
        self.log(f"  toque: '{rotulo}' em ({x},{y})")
        self.sh(f"input tap {x} {y}")

    def _conferir_ponto(self, no: No, rede: str) -> None:
        """Lê a tela de novo e olha o que está no ponto do toque AGORA (a tela pode ter mudado desde a leitura).
        Se ali houver um botão de publicar — pelo nome ou pela identificação — ou outro elemento, não toca."""
        x, y = no.centro
        agora = self.tela()
        no_ponto = [n for n in agora if n.ativo and n.caixa[0] <= x <= n.caixa[2] and n.caixa[1] <= y <= n.caixa[3]]
        for n in no_ponto:
            if IG["final"].search(n.rotulo) or TT["final"].search(n.rotulo) or FINAL_RID.search(n.rid or "") \
                    or PROIBIDO.search(n.rotulo) or (rede == "tiktok" and STORY.search(n.rotulo)):
                raise Falha(f"trava: no ponto ({x},{y}) agora está '{n.rotulo}' ({n.rid}) — não toco")
        if not any(n.rotulo == no.rotulo and n.rid == no.rid for n in no_ponto):
            raise TelaMudou(f"a tela mudou antes do toque em '{no.rotulo}' — não toquei")

    def teclado_aberto(self) -> bool:
        return bool(re.search(r"mInputShown=true|isInputViewShown=true", self.sh("dumpsys input_method")))

    def foto(self, destino: Path) -> Path | None:
        r = self.adb("exec-out", "screencap -p", timeout=30, binario=True)
        if r.returncode == 0 and r.stdout[:4] == b"\x89PNG":
            destino.parent.mkdir(parents=True, exist_ok=True)
            destino.write_bytes(r.stdout)
            return destino
        return None


def achar(nos: list[No], padrao: re.Pattern, so_clicavel: bool = False) -> No | None:
    for n in nos:
        if not n.ativo or (so_clicavel and not n.clicavel):
            continue
        for v in (n.text, n.desc):
            if v and padrao.search(v.strip()):
                return n
    return None


def texto_da_tela(nos: list[No], sem_campos: bool = False) -> str:
    """sem_campos=True ignora o que está DIGITADO nos campos (a legenda não pode parecer pop-up ou confirmação)."""
    return " | ".join(v for n in nos for v in (n.text, n.desc)
                      if v and not (sem_campos and "EditText" in n.cls))


CAIXA_TEXTO = re.compile(r"EditText|AutoCompleteTextView")


def achar_campo(nos: list[No], padrao: re.Pattern) -> No | None:
    """Campo de legenda/descrição: só caixa de texto (EditText), nunca botão com a mesma palavra."""
    for n in nos:
        if n.ativo and CAIXA_TEXTO.search(n.cls) and any(v and padrao.search(v.strip()) for v in (n.text, n.desc, n.rid)):
            return n
    return None


def campo_editavel(nos: list[No]) -> No | None:
    return next((n for n in nos if CAIXA_TEXTO.search(n.cls) and n.ativo), None)


def simplificar(texto: str) -> str:
    """Só letras e números simples, espaços únicos (emojis e pontuação variam no dump da tela)."""
    simples = re.sub(r"[^A-Za-z0-9À-ÿ ]+", " ", texto or "")
    return re.sub(r"\s+", " ", simples).strip()


def assinatura_legenda(texto: str) -> str:
    """Começo da legenda (24 caracteres simplificados), para conferir se a cola funcionou."""
    return simplificar(texto)[:24]


# ------------------------------------------------------------------ fluxo de uma rede
class Postagem:
    def __init__(self, cel: Celular, rede: str, numero: int, legenda: str, ensaio: bool, log=print,
                 capa: Path | None = None, chave: int | str | None = None) -> None:
        self.cel, self.rede, self.n, self.legenda, self.ensaio, self.log = cel, rede, numero, legenda, ensaio, log
        pub.exigir_sem_link(rede, legenda)   # Instagram/TikTok NUNCA com link: recusa antes de abrir o app
        # onde o status é gravado: o episódio (3) ou o vídeo extra ("3-pov_colonia"). Antes de 21/11 o extra
        # gravava o "tocou no botão final" no episódio por engano.
        self.chave = numero if chave is None else chave
        self.carrossel = False   # True: post de imagens no feed (rodar_carrossel)
        self.capa, self.capa_feita = capa, False
        self.t = IG if rede == "instagram" else TT
        self.tocou_final = False
        self.na_publicacao = False   # já viu a tela de publicação (campo de legenda / botão final)
        self.stamp = datetime.now().strftime("%Y%m%d-%H%M%S")

    def evidencia(self, nome: str) -> str:
        p = self.cel.foto(EVIDENCIAS / f"ep{self.n:03d}_{self.rede}_{self.stamp}_{nome}.png")
        return str(p) if p else ""

    def rodar(self, video: Path) -> str:
        cel, rede = self.cel, self.rede
        pacote = cel.pacote_de(rede)
        if not pacote:
            raise Falha(f"{pub.ROTULOS[rede]} não está instalado no celular")
        cel.acordar()
        self.log(f"[{pub.ROTULOS[rede]}] enviando o vídeo para a galeria ({video.stat().st_size // 1024 // 1024} MB)…")
        caminho, uri = cel.enviar_video(video)
        self.log(f"  na galeria: {caminho}")
        if self.capa:
            self.log(f"  capa na galeria: {cel.enviar_imagem(self.capa, f'capa_ep{self.n:03d}_{self.stamp}.png')}")
        self.log("  copiando a legenda aprovada para a área de transferência…")
        cel.copiar_texto(self.legenda.rstrip() + " ")   # espaço final: não abre a lista de sugestões de #hashtag
        comp = cel.atividade_compartilhar(pacote, **COMPARTILHAR[rede])
        if not comp and rede == "instagram":
            raise Falha("o Instagram não oferece a tela de Reels no Compartilhar (só Direct/Story) — nada foi postado")
        self.log(f"  abrindo pelo Compartilhar: {comp or pacote}")
        cel.compartilhar(uri, comp, pacote)
        time.sleep(4)
        frente = cel.app_em_frente()
        if frente and frente != pacote:
            raise Falha(f"o {pub.ROTULOS[rede]} fechou o Compartilhar sem abrir o vídeo (em frente: {frente}). "
                        "Ele tem permissão de Fotos e vídeos? Rode celular.py --checar")
        return self._navegar()

    def rodar_carrossel(self, imagens: list[Path]) -> str:
        """Carrossel do Instagram (post no feed com várias imagens), pelo próprio app: Criar → POST →
        Selecionar vários → toca nas imagens em ordem → Avançar → legenda → Compartilhar.
        (O Compartilhar múltiplo do Android não funciona aqui: o 'am start' do Android 12 não aceita lista de URIs.)
        As imagens vão para a galeria em ordem INVERSA, 1,5 s entre elas: a capa fica a mais recente e o
        Instagram já a marca como nº 1; as outras são tocadas na sequência e cada número é conferido."""
        cel = self.cel
        pacote = cel.pacote_de("instagram")
        if not pacote:
            raise Falha("Instagram não está instalado no celular")
        self.carrossel = True
        cel.acordar()
        self.log(f"[Instagram] enviando {len(imagens)} imagens do carrossel para a galeria (da última para a primeira)…")
        # relógio do CELULAR (a galeria mostra a hora dele, que pode não bater com a do PC)
        inicio = datetime.strptime(cel.sh("date +%Y-%m-%dT%H:%M").strip()[:16], "%Y-%m-%dT%H:%M") - timedelta(minutes=1)
        for i in reversed(imagens):
            cel.enviar_imagem(i, f"ep{self.n:03d}_{self.stamp}_{i.name}")
            time.sleep(1.5)
        self.log("  copiando a legenda aprovada para a área de transferência…")
        cel.copiar_texto(self.legenda.rstrip() + " ")
        cel.sh(f"monkey -p {pacote} -c android.intent.category.LAUNCHER 1")
        time.sleep(5)
        # tela inicial → "Criar"
        for _ in range(5):
            nos = cel.tela()
            if (d := achar(nos, DESCARTAR)):        # rascunho de um ensaio anterior: descarta (nunca salva)
                cel.tocar(d, "instagram")
                time.sleep(2)
                continue
            if any(n.rid.endswith("/new_post_title") for n in nos):   # o app já abriu no "Novo post"
                criar = None
                break
            if (criar := next((n for n in nos if n.rid.endswith("/action_bar_left_button") and n.rotulo == "Criar"), None)):
                break
            if (inicio_tab := next((n for n in nos if n.rid.endswith("/feed_tab")), None)):
                cel.tocar(inicio_tab, "instagram")
            else:
                # o app voltou na aba de Reels (vídeo tocando atrapalha a leitura da tela): toca na "Página inicial",
                # o 1º ícone da barra de baixo. Nunca o Voltar (ele sai do Instagram).
                larg, alt = cel.tamanho_tela() if hasattr(cel, "tamanho_tela") else (1080, 2340)
                cel.sh(f"input tap {int(larg * 0.1)} {int(alt * 0.947)}")
            time.sleep(2.5)
        else:
            raise Falha("não achei o botão 'Criar' na tela inicial do Instagram")
        if criar:
            cel.tocar(criar, "instagram")
        self._esperar(rx(r"^novo post$"), 10)
        nos = cel.tela()
        # trava: tem que ser o "Novo post" do FEED (Story/Reel têm outro título); as abas POST/STORY/REEL
        # nem sempre aparecem quando o app reabre direto nesta tela
        if not any(n.rid.endswith("/new_post_title") and n.text.strip().lower() == "novo post" for n in nos):
            raise Falha("a tela de criação não é 'Novo post' (feed): não sigo")
        multi = next((n for n in nos if n.rid.endswith("/multi_select_slide_button_alt")), None)
        if multi is None:
            raise Falha("não achei 'Selecionar vários'")
        cel.tocar(multi, "instagram")
        time.sleep(2)

        def fotos() -> list[No]:
            return sorted((n for n in cel.tela() if n.rid.endswith("/gallery_grid_item_thumbnail") and "foto" in n.desc.lower()),
                          key=lambda n: (n.caixa[1], n.caixa[0]))

        def numero(n: No) -> int | None:
            m = re.search(r"selecionada (\d+)", n.desc)
            return int(m.group(1)) if m else None

        f = fotos()
        if len(f) < len(imagens):
            raise Falha(f"a galeria mostrou {len(f)} fotos, preciso de {len(imagens)}")
        for k in range(len(imagens)):
            f = fotos()
            if numero(f[k]) == k + 1:
                continue
            if numero(f[k]) is not None:
                raise Falha(f"a foto {k + 1} da galeria já estava selecionada com outro número: {f[k].desc[:80]}")
            repetir = 0
            while numero(fotos()[k]) != k + 1:
                if repetir == 2:
                    raise Falha(f"não consegui selecionar a imagem {k + 1} do carrossel")
                cel.tocar(fotos()[k], "instagram")
                time.sleep(1.2)
                repetir += 1
        # conferência final: exatamente as N mais recentes, numeradas 1..N, criadas agora
        f = fotos()
        sel = [numero(n) for n in f]
        if sel[:len(imagens)] != list(range(1, len(imagens) + 1)) or any(x for x in sel[len(imagens):]):
            raise Falha(f"seleção diferente do esperado: {sel[:8]}")
        for n in f[:len(imagens)]:
            m = re.search(r"em (\d+) de (\w+) de (\d{4}) (\d+):(\d+)", n.desc)
            meses = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro",
                     "outubro", "novembro", "dezembro"]
            if not m or m.group(2) not in meses or datetime(int(m.group(3)), meses.index(m.group(2)) + 1, int(m.group(1)),
                                                            int(m.group(4)), int(m.group(5))) < inicio.replace(second=0, microsecond=0):
                raise Falha(f"uma das imagens selecionadas não é do carrossel enviado agora: {n.desc[:90]}")
        self.log(f"  {len(imagens)} imagens selecionadas em ordem (1 = capa) e conferidas")
        return self._navegar()

    def _navegar(self) -> str:
        cel, t = self.cel, self.t
        colou, ultimos, toques = False, [], []

        def repetido(no: No) -> None:
            """Trava: 3 toques seguidos no mesmo botão sem a tela sair do lugar = algo errado."""
            toques.append((no.rotulo, no.centro))
            if len(toques) >= 3 and len(set(toques[-3:])) == 1:
                raise Falha(f"toquei 3 vezes em '{no.rotulo}' {no.centro} e a tela não avançou")

        for passo in range(30):
            try:
                nos = cel.tela()
                tela = texto_da_tela(nos, sem_campos=True)
                if campo_editavel(nos) or any(TELA_FINAL_RID.search(n.rid or "") for n in nos):
                    self.na_publicacao = True
                if not self.tocou_final and t["sucesso"].search(tela) and not achar_campo(nos, t["campo"]):
                    self.evidencia("publicacao_inesperada")
                    pub.marcar(self.chave, self.rede, "conferir", origem="celular",
                               detalhe=f"apareceu confirmação de publicação SEM toque final ({'ensaio' if self.ensaio else 'postagem'}): "
                                       f"{tela[:150]}")
                    raise Falha("PARADO: a tela mostrou confirmação de publicação sem o toque final. "
                                "Rede travada como 'conferir' — veja o perfil antes de qualquer coisa")
                ultimos = (ultimos + [texto_da_tela(nos)])[-3:]
                # 1) pop-ups (ex.: "Sobre o Reels") — dispensa antes de avançar
                if t["popups"].search(tela) and (b := achar(nos, DISPENSAR)):
                    self.log("  pop-up detectado → dispensando")
                    cel.tocar(b, self.rede)
                    time.sleep(1.5)
                    continue
                # 2) Instagram às vezes pergunta onde compartilhar (Feed / Reels / Story)
                #    Só vale se for MESMO a escolha (2+ opções escritas na tela), nunca o ícone Reels da barra de baixo.
                opcoes = [n for n in nos if n.ativo and n.text and ESCOLHA_DESTINO.search(n.text.strip())
                          and "tab" not in n.rid.lower()]
                r = next((n for n in opcoes if (FEED if self.carrossel else t["escolher_reels"]).search(n.text.strip())), None)
                if self.rede == "instagram" and not colou and not achar_campo(nos, t["campo"]) \
                        and len(opcoes) >= 2 and r and not achar(nos, AVANCAR):
                    repetido(r)
                    cel.tocar(r, self.rede)
                    time.sleep(2.5)
                    continue
                # 2b) TikTok pergunta "Compartilhe no TikTok": Vídeo (post) ou Mensagem (DM) → sempre Vídeo
                if self.rede == "tiktok" and not colou and t["folha_destino"].search(tela) \
                        and (v := achar(nos, t["escolher_video"])):
                    self.log("  TikTok perguntou o destino → Vídeo")
                    repetido(v)
                    cel.tocar(v, self.rede)
                    time.sleep(3.0)
                    continue
                # 3) tela final: campo de legenda/descrição + botão final
                final = achar(nos, t["final"])
                if not colou and (campo := achar_campo(nos, t["campo"])):
                    cel.tocar(campo, self.rede)
                    if self.carrossel:
                        self._colar_no_editor_de_legenda()
                        colou = True
                        continue
                    # espera o teclado/campo ficar pronto (colar cedo demais não faz nada)
                    for _ in range(10):
                        time.sleep(0.5)
                        if cel.teclado_aberto():
                            break
                    time.sleep(1.0)
                    alvo = assinatura_legenda(self.legenda).lower()
                    for tentativa in range(2):
                        cel.sh("input keyevent 279")          # KEYCODE_PASTE
                        colado = False
                        for _ in range(8):
                            time.sleep(0.75)
                            if alvo in simplificar(texto_da_tela(cel.tela())).lower():
                                colado = True
                                break
                        if colado:
                            break
                        # a lista de sugestões (#hashtag/@menção) cobre o campo na leitura da tela: fecha e confere de novo
                        cel.sh("input keyevent KEYCODE_BACK")
                        time.sleep(1.0)
                        if alvo in simplificar(texto_da_tela(cel.tela())).lower():
                            break
                        if tentativa == 0:
                            self.log("  a legenda ainda não apareceu no campo, colando de novo…")
                            # se colou pela metade na 1ª vez, a 2ª duplicaria: só cola de novo com o campo vazio
                            c = campo_editavel(cel.tela())
                            if c and c.text and not self.t["campo"].search(c.text):
                                raise Falha(f"o campo ficou com um texto diferente da legenda — não colo de novo "
                                    f"(esperava {alvo!r}; no campo: {assinatura_legenda(c.text)!r} / {c.text[:80]!r})")
                    else:
                        raise Falha("a legenda não colou no campo (confira se o Clipper copiou)")
                    self.log("  legenda colada e conferida")
                    colou = True
                    if cel.teclado_aberto():
                        cel.sh("input keyevent KEYCODE_BACK")   # fecha só o teclado
                        time.sleep(1.0)
                    continue
                if colou and self.capa and not self.capa_feita:
                    self._trocar_capa()
                    self.capa_feita = True
                    continue
                if colou:
                    # depois de colar, o campo mostra a legenda (não mais "Escreva uma legenda…")
                    if final:
                        return self._final(final)
                    if cel.teclado_aberto():
                        cel.sh("input keyevent KEYCODE_BACK")
                        time.sleep(1.0)
                        continue
                    raise Falha("legenda colada, mas o botão final não apareceu")
                # 4) avançar (editor de vídeo → próxima tela)
                if (a := achar(nos, AVANCAR)):
                    if campo_editavel(nos) or any(TELA_FINAL_RID.search(n.rid or "") for n in nos):
                        raise Falha("trava: esta tela já é a de publicação (campo de legenda/botão final) — "
                                    f"não toco em '{a.rotulo}'")
                    repetido(a)
                    cel.tocar(a, self.rede)
                    time.sleep(3.0)
                    continue
                if len(ultimos) == 3 and len(set(ultimos)) == 1:
                    raise Falha(f"tela parada sem botão conhecido: {tela[:300]}")
                time.sleep(2.0)
            except TelaMudou as e:
                self.log(f"  {e}; lendo a tela de novo")
                time.sleep(1.5)
                continue
        raise Falha("passos demais sem chegar na tela final")

    def _colar_no_editor_de_legenda(self) -> None:
        """Post no feed: tocar no campo abre o editor 'Legenda' (tela própria, com OK no topo). Espera ele ficar
        pronto, cola UMA vez, confere e toca em OK. Nunca usa o Voltar aqui (ele fecha o editor)."""
        cel = self.cel
        fim = time.time() + 10
        while time.time() < fim:
            nos = cel.tela()
            campo = next((n for n in nos if n.rid.endswith("/caption_input_text_view") and n.focado), None)
            titulo = any(n.rid.endswith("/action_bar_textview_title") and n.text.strip().lower() == "legenda" for n in nos)
            if campo and titulo:
                break
            time.sleep(0.8)
        else:
            raise Falha("o editor de legenda não abriu")
        time.sleep(1.5)                       # colar cedo demais não faz nada
        alvo = assinatura_legenda(self.legenda).lower()
        cel.sh("input keyevent 279")          # KEYCODE_PASTE
        for _ in range(10):
            time.sleep(0.8)
            if alvo in simplificar(texto_da_tela(cel.tela())).lower():
                break
        else:
            c = next((n for n in cel.tela() if n.rid.endswith("/caption_input_text_view")), None)
            if c and c.text and not self.t["campo"].search(c.text):
                raise Falha(f"o campo ficou com um texto diferente da legenda: {c.text[:80]!r}")
            raise Falha("a legenda não colou no campo (confira se o Clipper copiou)")
        self.log("  legenda colada e conferida")
        ok = next((n for n in cel.tela() if n.rid.endswith("/next_button_textview") and n.rotulo.lower() == "ok"), None)
        if not ok:
            raise Falha("não achei o OK do editor de legenda")
        cel.tocar(ok, self.rede)
        time.sleep(2.0)

    # ---------------------------------------------------------------- capa
    def _esperar(self, padrao: re.Pattern, segundos: float = 12, rid: str | None = None) -> No:
        fim = time.time() + segundos
        while time.time() < fim:
            nos = self.cel.tela()
            for n in nos:
                if n.ativo and ((rid and n.rid.endswith(rid)) or (not rid and any(v and padrao.search(v.strip()) for v in (n.text, n.desc)))):
                    return n
            time.sleep(1.0)
        raise Falha(f"capa: não apareceu {rid or padrao.pattern!r}")

    def _trocar_capa(self) -> None:
        """Troca a capa pela imagem enviada (a mais recente da galeria). Falhou → para ANTES do toque final."""
        cel, rede = self.cel, self.rede
        self.log("  trocando a capa…")
        try:
            if rede == "instagram":
                nos = cel.tela()
                ok = next((n for n in nos if n.rid.endswith("action_bar_button_text") and re.fullmatch(r"ok", n.rotulo, re.I)), None)
                if ok:   # fecha a edição da legenda
                    cel.tocar(ok, rede)
                    time.sleep(1.5)
                for _ in range(4):   # a legenda longa empurra a miniatura para cima: rola até o topo
                    ed = next((n for n in cel.tela() if n.ativo and n.rotulo == "Editar capa" and n.caixa[1] >= 254), None)
                    if ed:
                        break
                    cel.sh("input swipe 540 600 540 1700 400")
                    time.sleep(1.5)
                else:
                    raise Falha("capa: não achei 'Editar capa'")
                cel.tocar(ed, rede); time.sleep(2.5)
                cel.tocar(self._esperar(re.compile(r"^Adicionar do rolo da câmera$|^Add from camera roll$", re.I), rid="add_from_gallery"), rede)
                time.sleep(2.5)
                foto = self._esperar(re.compile(r"^$"), rid="gallery_image")
                if not re.search(r"há \d+ (segundo|minuto)|agora|just now|seconds? ago|minutes? ago", foto.desc, re.I):
                    raise Falha(f"capa: a foto mais recente da galeria não é a que acabei de enviar ({foto.desc!r})")
                cel.tocar(foto, rede); time.sleep(3)
                cel.tocar(self._esperar(re.compile(r"^Concluir$|^Done$", re.I)), rede)
            else:
                cel.tocar(self._esperar(re.compile(r"^Editar capa$|^Edit cover$|^Selecionar capa$", re.I)), rede)
                time.sleep(2.5)
                cel.tocar(self._esperar(re.compile(r"^Carregar$|^Upload$", re.I)), rede)
                time.sleep(3)
                nos = cel.tela()
                grade = sorted((n for n in nos if n.clicavel and n.ativo and not n.rotulo and n.caixa[1] > 200
                                and (n.caixa[2] - n.caixa[0]) > 150 and abs((n.caixa[2] - n.caixa[0]) - (n.caixa[3] - n.caixa[1])) < 40),
                               key=lambda n: (n.caixa[1], n.caixa[0]))
                if not grade:
                    raise Falha("capa: a galeria do TikTok não abriu")
                cel.tocar(grade[0], rede); time.sleep(3)   # a mais recente = a capa enviada agora
                cel.tocar(self._esperar(re.compile(r"^Salvar$|^Save$", re.I), rid="tv_choose_cover_complete"), rede)
            time.sleep(3)
            self.evidencia("capa")
            self.log("  capa trocada")
        except Exception as e:
            # nada foi publicado: sai sem publicar e marca erro (pode tentar de novo)
            self.na_publicacao = False
            raise Falha(f"não consegui trocar a capa (nada publicado): {e}") from e

    def _final(self, botao: No) -> str:
        rotulo = botao.rotulo
        if self.rede == "tiktok" and STORY.search(rotulo):
            raise Falha("trava: o botão final do TikTok parece ser o Story")
        foto = self.evidencia("antes")
        if self.ensaio:
            x, y = botao.centro
            self.log(f"  ENSAIO: tudo pronto. Tocaria em '{rotulo}' ({x},{y}). Nada foi publicado.")
            self._sair_sem_publicar()
            return f"ensaio ok (botão final '{rotulo}')" + (f" · print: {foto}" if foto else "")
        pub.marcar(self.chave, self.rede, "enviando", origem="celular", detalhe=f"tocou em '{rotulo}'", tocado_em=pub.agora())
        self.tocou_final = True
        self.cel.tocar(botao, self.rede, final=True)
        return self._confirmar()

    def _confirmar(self) -> str:
        t, inicio, viu_envio, confirmou_popup = self.t, time.time(), False, False
        while time.time() - inicio < 150:
            time.sleep(3)
            nos = self.cel.tela()
            tela = texto_da_tela(nos, sem_campos=True)
            # Instagram: o 1º reel da conta mostra "Sobre o Reels" com um Compartilhar que confirma o MESMO post
            if self.rede == "instagram" and not confirmou_popup and IG["popups"].search(tela) and (b := achar(nos, IG["final"])):
                self.log("  pop-up de confirmação do Reels → confirmando o mesmo post (uma vez)")
                self.cel.tocar(b, self.rede, final=True)
                confirmou_popup = True
                continue
            if t["sucesso"].search(tela):
                self.evidencia("depois")
                return "publicado"
            if t["enviando"].search(tela):
                viu_envio = True
                continue
            if achar(nos, t["final"]) and campo_editavel(nos) and time.time() - inicio > 20:
                raise Falha("depois do toque final a tela de publicação continua aberta")
        self.evidencia("depois")
        raise Falha("não vi a confirmação de publicação" + (" (ainda enviando)" if viu_envio else ""))

    def _sair_sem_publicar(self) -> None:
        for _ in range(8):
            nos = self.cel.tela()
            if (d := achar(nos, DESCARTAR)):
                self.cel.tocar(d, self.rede)
                time.sleep(1.2)
                continue
            if not achar_campo(nos, self.t["campo"]) and not achar(nos, AVANCAR) and not achar(nos, self.t["final"]) \
                    and not campo_editavel(nos):
                break
            self.cel.sh("input keyevent KEYCODE_BACK")
            time.sleep(1.2)
        self.cel.sh("input keyevent KEYCODE_HOME")


# ------------------------------------------------------------------ comandos
def checar(serial: str | None = None) -> list[tuple[str, bool, str]]:
    itens: list[tuple[str, bool, str]] = []
    bin_ = achar_adb()
    itens.append(("ADB", bool(bin_), bin_ or "instale: winget install --id Google.PlatformTools -e"))
    if not bin_:
        return itens
    cel = Celular(serial)
    try:
        cel.escolher_aparelho()
        modelo = cel.sh("getprop ro.product.model").strip()
        versao = cel.sh("getprop ro.build.version.release").strip()
        itens.append(("Celular", True, f"{modelo} · Android {versao} · {cel.serial}"))
    except Falha as e:
        itens.append(("Celular", False, str(e)))
        return itens
    ok, motivo = cel.tela_desbloqueada()
    itens.append(("Tela", ok, motivo))
    toques = cel.toques_liberados()
    itens.append(("Toques pelo PC", toques, "liberados" if toques else BLOQUEIO_TOQUE))
    for rede in ("instagram", "tiktok"):
        p = cel.pacote_de(rede)
        itens.append((pub.ROTULOS[rede], bool(p), p or "não instalado"))
        if p:
            comp = cel.atividade_compartilhar(p, **COMPARTILHAR[rede])
            itens.append((f"{pub.ROTULOS[rede]}: Compartilhar", bool(comp), comp or "o app não aceita vídeo pelo Compartilhar"))
            le = cel.le_videos(p)
            itens.append((f"{pub.ROTULOS[rede]}: acesso a Fotos e vídeos", le, "permitido" if le else
                          f"negado: Configurações → Apps → {pub.ROTULOS[rede]} → Permissões → Armazenamento (ou \"Fotos e vídeos\") → Permitir"))
    itens.append(("Clipper (área de transferência)", cel.pacote_instalado(CLIPPER), CLIPPER))
    return itens


def postar(numero: int, redes: list[str], ensaio: bool, serial: str | None = None, log=print,
           extra: str | None = None, com_capa: bool = True) -> bool:
    """Devolve True se todas as redes pedidas terminaram bem (publicado / ensaio ok).
    extra="pov_obra" posta o vídeo extra do episódio (saida/epNNN/pov/) em vez do episódio."""
    chave = "apresentacao" if extra == "apresentacao" else pub.chave_extra(numero, extra) if extra else numero
    tudo_ok = True
    with pub.trava_postagem("celular.py"):
        cel = Celular(serial, log=log)
        cel.ensaio = ensaio          # trava no próprio toque: ensaio nunca toca no botão final
        cel.escolher_aparelho()
        for rede in redes:
            rot = pub.ROTULOS[rede]
            try:
                lib = (pub.exigir_liberado_apresentacao(rede, ensaio=ensaio) if extra == "apresentacao"
                       else pub.exigir_liberado_carrossel(numero, rede, ensaio=ensaio) if extra == "carrossel"
                       else pub.exigir_liberado_extra(numero, extra, rede, ensaio=ensaio) if extra
                       else pub.exigir_liberado(numero, rede, ensaio=ensaio))
            except pub.Recusado as e:
                log(f"[{rot}] não executado: {e}")
                tudo_ok = False
                continue
            legenda = lib["copy"]["legenda"]
            capa = config.pasta_episodio(numero) / "imagens" / "capa_vertical.png"
            if extra and extra.startswith("construcao_"):   # vídeo de construção tem capa própria
                capa = pub.pasta_extra(numero, extra) / "capa_vertical.png"
            p = Postagem(cel, rede, numero, legenda, ensaio, log=log,
                         capa=capa if (com_capa and (not extra or extra.startswith("construcao_")) and capa.exists()) else None,
                         chave=chave)
            try:
                resultado = (p.rodar_carrossel(lib["imagens"]) if extra in ("carrossel", "apresentacao")
                             else p.rodar(lib["video"]))
                if ensaio:
                    pub.anotar(chave, rede, ultimo_ensaio=pub.agora(), ultimo_ensaio_resultado=resultado)
                    log(f"[{rot}] {resultado}")
                else:
                    pub.marcar(chave, rede, "publicado", origem="celular", detalhe="confirmado no app")
                    log(f"[{rot}] ✅ publicado")
                    if extra in ("carrossel", "apresentacao"):
                        atualizar_link_comentar(cel, log)
            except Exception as e:  # noqa: BLE001
                tudo_ok = False
                if p.tocou_final or (p.na_publicacao and not ensaio):
                    # chegou na tela de publicação e falhou: não dá para garantir que não publicou → nunca "pode tentar"
                    pub.marcar(chave, rede, "conferir", origem="celular", detalhe=str(e)[:300])
                    log(f"[{rot}] ⚠ CONFERIR no app: {e}. Não vou tentar de novo sozinho.")
                else:
                    if ensaio:
                        pub.anotar(chave, rede, ultimo_ensaio=pub.agora(), ultimo_ensaio_resultado=f"falhou: {e}"[:300])
                    else:
                        pub.marcar(chave, rede, "erro", origem="celular", detalhe=str(e)[:300])
                    log(f"[{rot}] ✖ falhou antes de publicar (pode tentar de novo): {e}")
                    try:
                        p.evidencia("erro")
                        p._sair_sem_publicar()
                    except Exception:  # noqa: BLE001
                        pass
    return tudo_ok


def enviar_para_galeria(imagens: list[Path], prefixo: str, serial: str | None = None, log=print) -> list[str]:
    """Só manda as imagens para a galeria do celular (ex.: stories aprovados). Não abre app nem publica nada."""
    cel = Celular(serial, log=log)
    cel.escolher_aparelho()
    feitos = []
    for i in imagens:
        feitos.append(cel.enviar_imagem(i, f"{prefixo}_{i.name}"))
        log(f"  📲 {i.name} → galeria do celular")
        time.sleep(1.0)
    return feitos


def atualizar_link_comentar(cel: Celular, log=print, salvar: bool = True) -> str | None:
    """Pega o link do post mais recente (o carrossel que acabou de sair) e grava em links.ig-comentar: o botão
    "Comente no Instagram" do site passa a levar para ele. Falhar aqui não desfaz nada (o post já está no ar)."""
    try:
        link = cel.link_do_ultimo_post()
        if "/p/" not in link:
            raise Falha(f"o post mais recente não é um carrossel ({link}): o link do site não foi trocado")
        if salvar:
            from episodio import Supabase
            Supabase().escrever("PATCH", "links", {"slug": "eq.ig-comentar"}, {"destino": link}, prefer="return=minimal")
            log(f"  🔗 botão 'Comente no Instagram' do site agora leva para {link}")
        return link
    except Exception as e:  # noqa: BLE001
        log(f"  ⚠ não atualizei o link do 'Comente no Instagram' ({e}). Rode: python celular.py --link-comentar")
        return None


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--episodio", type=int)
    ap.add_argument("--so", choices=["instagram", "tiktok"])
    ap.add_argument("--ensaio", action="store_true", help="faz tudo menos o toque final de publicar")
    ap.add_argument("--checar", action="store_true", help="só confere ADB, celular e apps")
    ap.add_argument("--serial", help="serial do aparelho (se tiver mais de um)")
    ap.add_argument("--extra", help="posta um vídeo extra do episódio (ex.: pov_obra) em vez do episódio")
    ap.add_argument("--sem-capa", action="store_true", help="não troca a capa pela capa do episódio")
    ap.add_argument("--apresentacao", action="store_true",
                    help="posta o carrossel de apresentação (aprovado no painel) no feed do Instagram")
    ap.add_argument("--galeria", nargs="+", metavar="PNG", help="só manda estas imagens para a galeria do celular")
    ap.add_argument("--link-comentar", action="store_true",
                    help="copia o link do post mais recente do Instagram (tem que ser um carrossel) para o botão do site")
    ap.add_argument("--testar-link", action="store_true", help="só mostra o link do post mais recente (não grava)")
    a = ap.parse_args()

    if a.checar:
        itens = checar(a.serial)
        for nome, ok, det in itens:
            print(f"{'✅' if ok else '❌'} {nome}: {det}")
        return 0 if all(ok for _, ok, _ in itens) else 1
    if a.galeria:
        enviar_para_galeria([Path(x) for x in a.galeria], "omz", a.serial)
        return 0
    if a.apresentacao:
        return 0 if postar(0, ["instagram"], a.ensaio, a.serial, extra="apresentacao") else 1
    if a.link_comentar or a.testar_link:
        cel = Celular(a.serial)
        cel.escolher_aparelho()
        if a.testar_link:
            print(cel.link_do_ultimo_post())
            return 0
        return 0 if atualizar_link_comentar(cel) else 1
    if a.episodio is None or (a.episodio == 0 and not (a.extra or "").startswith("construcao_")):
        ap.error("informe --episodio N (ou use --checar); 0 só com --extra construcao_<obra>")
    redes = [a.so] if a.so else ["instagram", "tiktok"]
    try:
        ok = postar(a.episodio, redes, a.ensaio, a.serial, extra=a.extra, com_capa=not a.sem_capa)
    except (Falha, pub.Recusado) as e:
        print(f"✖ {e}")
        return 1
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
