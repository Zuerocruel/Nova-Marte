"""Posta fora do painel (ex.: pelo Agendador de Tarefas do Windows).

    python producao/postar_avulso.py --celular              # Instagram + TikTok do próximo episódio pendente
    python producao/postar_avulso.py --youtube              # YouTube (n8n) do próximo episódio pendente
    python producao/postar_avulso.py --celular --youtube    # as três redes
    python producao/postar_avulso.py --celular --episodio 3 # um episódio específico
    python producao/postar_avulso.py --celular --ensaio     # simula sem tocar em publicar
    python producao/postar_avulso.py --listar               # mostra o que está pendente e não faz nada

Escolhe UM episódio por execução: o mais antigo que está aprovado e registrado no painel,
com a copy da rede aprovada e a rede ainda pendente (ou com erro antes do toque final).
As mesmas travas do painel valem aqui (aprovação, status travado, uma postagem por vez).
Log em producao/dados/logs/postar_avulso_AAAAMMDD.log.
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path

PRODUCAO = Path(__file__).resolve().parent
sys.path.insert(0, str(PRODUCAO.parent / "fabrica"))
sys.path.insert(0, str(PRODUCAO))

import config  # noqa: E402,F401  (UTF-8 + .env)
import publicacao as pub  # noqa: E402

LOGS = pub.DADOS / "logs"


class Log:
    def __init__(self) -> None:
        LOGS.mkdir(parents=True, exist_ok=True)
        self.arq = open(LOGS / f"postar_avulso_{datetime.now():%Y%m%d}.log", "a", encoding="utf-8")

    def __call__(self, linha: str) -> None:
        linha = linha.rstrip()
        print(linha, flush=True)
        self.arq.write(f"{datetime.now():%H:%M:%S} {linha}\n")
        self.arq.flush()


def candidatos(redes: list[str]) -> list[tuple[int, list[str]]]:
    """Episódios (do mais antigo ao mais novo) e quais das redes pedidas ainda podem ser postadas."""
    est = pub.estado_painel()
    out = []
    for chave in sorted(est.get("episodios", {}), key=int):
        n = int(chave)
        livres = []
        for r in redes:
            try:
                pub.exigir_liberado(n, r)
                livres.append(r)
            except pub.Recusado:
                pass
        if livres:
            out.append((n, livres))
    return out


def rodar(cmd: list[str], log: Log) -> int:
    log("$ " + " ".join(Path(c).name if i == 0 else c for i, c in enumerate(cmd)))
    p = subprocess.Popen(cmd, cwd=PRODUCAO, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
                         encoding="utf-8", errors="replace",
                         env={**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUNBUFFERED": "1"})
    for linha in p.stdout:
        if linha.strip():
            log("  " + linha)
    return p.wait()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--celular", action="store_true", help="Instagram + TikTok pelo celular")
    ap.add_argument("--youtube", action="store_true", help="YouTube pelo n8n")
    ap.add_argument("--episodio", type=int)
    ap.add_argument("--ensaio", action="store_true")
    ap.add_argument("--listar", action="store_true")
    a = ap.parse_args()
    if not (a.celular or a.youtube):
        if not a.listar:
            ap.error("use --celular e/ou --youtube")
        a.celular = a.youtube = True
    redes = (["instagram", "tiktok"] if a.celular else []) + (["youtube"] if a.youtube else [])
    log = Log()
    log(f"===== postar_avulso {' '.join(sys.argv[1:])} =====")

    if a.listar:
        lista = candidatos(redes)
        for n, livres in lista:
            log(f"episódio {n}: pode postar em {', '.join(pub.ROTULOS[r] for r in livres)}")
        if not lista:
            log("nada pendente (ou falta aprovar no painel)")
        return 0

    if a.episodio:
        alvo, livres = a.episodio, redes
    else:
        lista = candidatos(redes)
        if not lista:
            log("nada para postar: nenhum episódio aprovado e registrado com essas redes pendentes.")
            return 0
        alvo, livres = lista[0]
    log(f"episódio {alvo} → {', '.join(pub.ROTULOS[r] for r in livres)}" + (" (ENSAIO)" if a.ensaio else ""))

    py = sys.executable
    falhas = 0
    try:
        with pub.trava_postagem("postar_avulso.py"):
            cel = [r for r in livres if r in ("instagram", "tiktok")]
            if cel:
                cmd = [py, "celular.py", "--episodio", str(alvo)] + (["--so", cel[0]] if len(cel) == 1 else [])
                falhas += rodar(cmd + (["--ensaio"] if a.ensaio else []), log) != 0
            if "youtube" in livres:
                falhas += rodar([py, "youtube.py", "--episodio", str(alvo)] + (["--ensaio"] if a.ensaio else []), log) != 0
    except pub.Recusado as e:
        log(f"✖ {e}")
        return 2
    for r in livres:
        s = pub.status(alvo, r)
        log(f"  {pub.ROTULOS[r]}: {s.get('status')}" + (f" · {s.get('detalhe', '')}" if s.get("status") in ("erro", "conferir") else ""))
    log("===== fim: " + ("ok" if not falhas else f"{falhas} etapa(s) com problema") + " =====")
    return 1 if falhas else 0


if __name__ == "__main__":
    sys.exit(main())
