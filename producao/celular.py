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
from datetime import datetime
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


AVANCAR = rx(r"^avançar$", r"^próximo$", r"^next$", r"^seguinte$")
DISPENSAR = rx(r"^ok$", r"^entendi$", r"^continuar$", r"^agora não$", r"^not now$", r"^got it$",
               r"^fechar$", r"^close$", r"^pular$", r"^skip$", r"^ignorar$", r"^dispensar$", r"^dismiss$")
DESCARTAR = rx(r"^descartar", r"^discard", r"^excluir rascunho", r"^delete draft", r"^começar de novo", r"^start over")
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
    "final": rx(r"^publicar$", r"^post$", r"^postar$"),
    "sucesso": rx(r"publicad", r"\bposted\b", r"foi postado", r"has been posted"),
    "enviando": rx(r"enviando", r"uploading", r"publicando", r"posting", r"\d{1,3}\s?%"),
}


class Falha(Exception):
    pass


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
        self.log = log

    # comandos crus
    def adb(self, *args: str, timeout: int = 60, binario: bool = False) -> subprocess.CompletedProcess:
        cmd = [self.bin] + (["-s", self.serial] if self.serial else []) + list(args)
        r = subprocess.run(cmd, capture_output=True, timeout=timeout,
                           **({} if binario else {"text": True, "encoding": "utf-8", "errors": "replace"}))
        return r

    def sh(self, comando: str, timeout: int = 60) -> str:
        r = self.adb("shell", comando, timeout=timeout)
        return (r.stdout or "") + (r.stderr or "")

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
        self.sh(f"am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file://{destino}")
        uri = None
        for _ in range(20):
            out = self.sh(f"content query --uri content://media/external/video/media --projection _id "
                          f"--where \"_data='{destino}'\"")
            m = re.search(r"_id=(\d+)", out)
            if m:
                uri = f"content://media/external/video/media/{m.group(1)}"
                break
            time.sleep(0.5)
        if not uri:
            raise Falha("o vídeo foi copiado mas a galeria não o indexou (abra a Galeria uma vez e tente de novo)")
        return destino, uri

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

    def atividade_compartilhar(self, pacote: str, preferir: re.Pattern | None) -> str | None:
        out = self.sh(f"cmd package query-activities --components -a android.intent.action.SEND -t video/mp4 -p {pacote}")
        comps = [l.strip() for l in out.splitlines() if l.strip().startswith(pacote + "/")]
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
        if not final and (IG["final"].search(rotulo) or TT["final"].search(rotulo)):
            raise Falha(f"trava: '{rotulo}' é o botão final e só pode ser tocado na etapa final")
        x, y = no.centro
        self.log(f"  toque: '{rotulo}' em ({x},{y})")
        self.sh(f"input tap {x} {y}")

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


def campo_editavel(nos: list[No]) -> No | None:
    return next((n for n in nos if "EditText" in n.cls and n.ativo), None)


def assinatura_legenda(texto: str) -> str:
    """Pedaço só com letras e números simples, para conferir se a cola funcionou (emojis variam no dump)."""
    simples = re.sub(r"[^A-Za-z0-9À-ÿ ]+", " ", texto)
    return re.sub(r"\s+", " ", simples).strip()[:24]


# ------------------------------------------------------------------ fluxo de uma rede
class Postagem:
    def __init__(self, cel: Celular, rede: str, numero: int, legenda: str, ensaio: bool, log=print) -> None:
        self.cel, self.rede, self.n, self.legenda, self.ensaio, self.log = cel, rede, numero, legenda, ensaio, log
        self.t = IG if rede == "instagram" else TT
        self.tocou_final = False
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
        self.log("  copiando a legenda aprovada para a área de transferência…")
        cel.copiar_texto(self.legenda)
        comp = cel.atividade_compartilhar(pacote, rx(r"clips", r"reel") if rede == "instagram" else rx(r"share", r"system"))
        self.log(f"  abrindo pelo Compartilhar: {comp or pacote}")
        cel.compartilhar(uri, comp, pacote)
        time.sleep(4)
        return self._navegar()

    def _navegar(self) -> str:
        cel, t = self.cel, self.t
        colou, ultimos = False, []
        for passo in range(30):
            nos = cel.tela()
            tela = texto_da_tela(nos, sem_campos=True)
            ultimos = (ultimos + [texto_da_tela(nos)])[-3:]
            # 1) pop-ups (ex.: "Sobre o Reels") — dispensa antes de avançar
            if t["popups"].search(tela) and (b := achar(nos, DISPENSAR)):
                self.log("  pop-up detectado → dispensando")
                cel.tocar(b, self.rede)
                time.sleep(1.5)
                continue
            # 2) Instagram às vezes pergunta onde compartilhar (Feed / Reels / Story)
            if self.rede == "instagram" and not colou and not achar(nos, t["campo"]) \
                    and (r := achar(nos, t["escolher_reels"])) and not achar(nos, AVANCAR):
                cel.tocar(r, self.rede)
                time.sleep(2.5)
                continue
            # 3) tela final: campo de legenda/descrição + botão final
            final = achar(nos, t["final"])
            if not colou and (campo := achar(nos, t["campo"])):
                cel.tocar(campo, self.rede)
                time.sleep(1.0)
                cel.sh("input keyevent 279")          # KEYCODE_PASTE
                time.sleep(1.5)
                if assinatura_legenda(self.legenda).lower() not in assinatura_legenda(texto_da_tela(cel.tela())).lower():
                    raise Falha("a legenda não colou no campo (confira se o Clipper copiou)")
                self.log("  legenda colada e conferida")
                colou = True
                if cel.teclado_aberto():
                    cel.sh("input keyevent KEYCODE_BACK")   # fecha só o teclado
                    time.sleep(1.0)
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
                cel.tocar(a, self.rede)
                time.sleep(3.0)
                continue
            if len(ultimos) == 3 and len(set(ultimos)) == 1:
                raise Falha(f"tela parada sem botão conhecido: {tela[:300]}")
            time.sleep(2.0)
        raise Falha("passos demais sem chegar na tela final")

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
        pub.marcar(self.n, self.rede, "enviando", origem="celular", detalhe=f"tocou em '{rotulo}'", tocado_em=pub.agora())
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
            if not achar(nos, self.t["campo"]) and not achar(nos, AVANCAR) and not achar(nos, self.t["final"]) \
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
    for rede in ("instagram", "tiktok"):
        p = cel.pacote_de(rede)
        itens.append((pub.ROTULOS[rede], bool(p), p or "não instalado"))
        if p:
            comp = cel.atividade_compartilhar(p, None)
            itens.append((f"{pub.ROTULOS[rede]}: Compartilhar", bool(comp), comp or "o app não aceita vídeo pelo Compartilhar"))
    itens.append(("Clipper (área de transferência)", cel.pacote_instalado(CLIPPER), CLIPPER))
    return itens


def postar(numero: int, redes: list[str], ensaio: bool, serial: str | None = None, log=print) -> bool:
    """Devolve True se todas as redes pedidas terminaram bem (publicado / ensaio ok)."""
    tudo_ok = True
    with pub.trava_postagem("celular.py"):
        cel = Celular(serial, log=log)
        cel.escolher_aparelho()
        for rede in redes:
            rot = pub.ROTULOS[rede]
            try:
                lib = pub.exigir_liberado(numero, rede, ensaio=ensaio)
            except pub.Recusado as e:
                log(f"[{rot}] não executado: {e}")
                tudo_ok = False
                continue
            legenda = lib["copy"]["legenda"]
            p = Postagem(cel, rede, numero, legenda, ensaio, log=log)
            try:
                resultado = p.rodar(lib["video"])
                if ensaio:
                    pub.anotar(numero, rede, ultimo_ensaio=pub.agora(), ultimo_ensaio_resultado=resultado)
                    log(f"[{rot}] {resultado}")
                else:
                    pub.marcar(numero, rede, "publicado", origem="celular", detalhe="confirmado no app")
                    log(f"[{rot}] ✅ publicado")
            except Exception as e:  # noqa: BLE001
                tudo_ok = False
                if p.tocou_final:
                    pub.marcar(numero, rede, "conferir", origem="celular", detalhe=str(e)[:300])
                    log(f"[{rot}] ⚠ CONFERIR no app: {e}. Não vou tentar de novo sozinho.")
                else:
                    if ensaio:
                        pub.anotar(numero, rede, ultimo_ensaio=pub.agora(), ultimo_ensaio_resultado=f"falhou: {e}"[:300])
                    else:
                        pub.marcar(numero, rede, "erro", origem="celular", detalhe=str(e)[:300])
                    log(f"[{rot}] ✖ falhou antes de publicar (pode tentar de novo): {e}")
                    try:
                        p.evidencia("erro")
                        p._sair_sem_publicar()
                    except Exception:  # noqa: BLE001
                        pass
    return tudo_ok


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--episodio", type=int)
    ap.add_argument("--so", choices=["instagram", "tiktok"])
    ap.add_argument("--ensaio", action="store_true", help="faz tudo menos o toque final de publicar")
    ap.add_argument("--checar", action="store_true", help="só confere ADB, celular e apps")
    ap.add_argument("--serial", help="serial do aparelho (se tiver mais de um)")
    a = ap.parse_args()

    if a.checar:
        itens = checar(a.serial)
        for nome, ok, det in itens:
            print(f"{'✅' if ok else '❌'} {nome}: {det}")
        return 0 if all(ok for _, ok, _ in itens) else 1
    if not a.episodio:
        ap.error("informe --episodio N (ou use --checar)")
    redes = [a.so] if a.so else ["instagram", "tiktok"]
    try:
        ok = postar(a.episodio, redes, a.ensaio, a.serial)
    except (Falha, pub.Recusado) as e:
        print(f"✖ {e}")
        return 1
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
