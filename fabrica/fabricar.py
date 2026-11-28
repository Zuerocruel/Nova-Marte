"""Fábrica de Vídeos da Operação Marte Zero: gera um episódio inteiro, sem IA na geração.

    python fabricar.py --episodio 1 --so-fundadores     # Episódio 1: só Vega e Lia
    python fabricar.py --episodio 2                     # dados reais do Supabase
    python fabricar.py --episodio 2 --sem-voz           # prévia grátis (sem ElevenLabs)
    python fabricar.py --episodio 2 --a-partir-de filmagem   # refaz só imagem + montagem

Etapas: coleta → roteiro → voz → tempo → filmagem → montagem → cortes
Tudo fica em saida/epNNN/. O vídeo final é saida/epNNN/episodio_NNN.mp4 (YouTube); os cortes curtos
são episodio_NNN_instagram.mp4 e episodio_NNN_tiktok.mp4 (cortes.py).
Nada é publicado: confira o vídeo e depois rode
    python episodio.py --registrar-publicacao N
"""
from __future__ import annotations

import argparse
import time

import audio
import config
import correio
import cortes
import episodio
import navegador
import roteiro
import voz

CORTES_ATE = 9   # igual a producao/publicacao.py
ETAPAS = ["coleta", "roteiro", "voz", "tempo", "filmagem", "montagem", "cortes"]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--episodio", type=int, required=True)
    ap.add_argument("--so-fundadores", action="store_true", help="ignora colonos e compras do banco (Episódio 1)")
    ap.add_argument("--sem-voz", action="store_true", help="tempos estimados, sem narração (não gasta créditos)")
    ap.add_argument("--a-partir-de", choices=ETAPAS, default="coleta")
    ap.add_argument("--abas", type=int, default=4, help="abas do navegador filmando em paralelo")
    ap.add_argument("--manter-quadros", action="store_true")
    a = ap.parse_args()

    n = a.episodio
    pasta = config.pasta_episodio(n)
    faz = lambda etapa: ETAPAS.index(etapa) >= ETAPAS.index(a.a_partir_de)
    t0 = time.time()

    if faz("coleta"):
        print("1/7 coleta (Supabase)")
        d = episodio.coletar(n, a.so_fundadores)
        config.gravar_json(pasta / "dados.json", d)
        print("  " + episodio.resumo(d).replace("\n", "\n  "))
        print("1b correio da colônia (comentários das redes → respostas da Vega e da Lia)")
        try:
            lido = correio.gerar(n) or {}
            novos = episodio.juntar_andarilhos(d, lido.get("andarilhos", []))
            if novos:
                config.gravar_json(pasta / "dados.json", d)
                print(f"  andarilhos novos no episódio: {', '.join('@' + a['handle'] for a in novos)}")
        except Exception as e:   # o correio é um extra: nunca derruba o episódio
            print(f"  correio: pulei ({type(e).__name__}: {str(e)[:150]})")
    d = config.ler_json(pasta / "dados.json")

    if faz("roteiro"):
        print("2/7 roteiro")
        r = roteiro.montar(d)
        config.gravar_json(pasta / "roteiro.json", r)
        (pasta / "post.txt").write_text(roteiro.legenda_post(d, r), encoding="utf-8")
        for c in r["cenas"]:
            print(f"  [{c['id']}] {c['fala']}")
    r = config.ler_json(pasta / "roteiro.json")

    if faz("voz"):
        print("3/7 voz (ElevenLabs)")
        config.gravar_json(pasta / "voz.json", voz.gerar_falas(r, a.sem_voz))
    falas = config.ler_json(pasta / "voz.json")

    if faz("tempo"):
        print("4/7 linha do tempo")
        lt = roteiro.linha_do_tempo(r, falas)
        config.gravar_json(pasta / "linha_do_tempo.json", lt)
        for c in lt["cenas"]:
            print(f"  {c['inicio']:6.2f}s → {c['fim']:6.2f}s  {c['id']}")
        print(f"  duração total: {lt['duracao']:.1f}s")

    if faz("filmagem"):
        print("5/7 filmagem (navegador headless, 30 fps)")
        navegador.filmar(n, a.abas)

    if faz("montagem"):
        print("6/7 montagem (FFmpeg)")
        sem_voz = all(not f.get("audio") for f in falas.values())
        final = audio.montar(n, a.manter_quadros, "_previa_sem_voz" if sem_voz else "")
        print(f"  episódio completo (YouTube): {final}")

    sem_voz = all(not f.get("audio") for f in falas.values())
    # cortes curtos só existiram do ep. 7 ao 9: do 10 em diante todas as redes recebem o episódio completo
    if faz("cortes") and not sem_voz and n >= 2 and n <= CORTES_ATE:
        print("7/7 cortes curtos (Instagram e TikTok; o YouTube fica com o episódio completo)")
        for rede in cortes.REDES:
            cortes.gerar(n, rede, abas=a.abas)

    print(f"\nPronto em {time.time() - t0:.0f}s")
    print(f"Texto do post: {pasta / 'post.txt'}")


if __name__ == "__main__":
    main()
