"""Voz: narração com a ElevenLabs (eleven_multilingual_v2) + tempos palavra por palavra.

Usa o endpoint /with-timestamps, que devolve o áudio e o início/fim de cada caractere.
Desses tempos saem a legenda dourada sincronizada e os focos de câmera.

Cache: cada fala vira cache_voz/<hash>.mp3 + <hash>.json. O hash leva voz, modelo,
ajustes e texto, então uma fala repetida (abertura, gancho, missão refeita) não gasta
crédito de novo.

Voz: ELEVENLABS_VOICE_ID no .env, se existir. Senão procura "Sergio" nas vozes da conta
e, se não achar, na biblioteca pública (e adiciona à conta). Último recurso: uma voz
masculina grave em português que já esteja na conta.

Modo --sem-voz: estima os tempos pelo tamanho do texto e não gera áudio (prévia grátis).
"""
from __future__ import annotations

import base64
import hashlib
import json
import subprocess

import requests

import config

ARQ_VOZ = config.CACHE_VOZ / "_voz_escolhida.json"


class ErroVoz(SystemExit):
    pass


class SemPermissao(Exception):
    pass


class ElevenLabs:
    def __init__(self) -> None:
        chave = config.env("ELEVENLABS_API_KEY")
        if not chave.startswith("sk_"):
            raise ErroVoz(
                "ELEVENLABS_API_KEY no .env.local não é uma chave de API válida (deveria começar com 'sk_').\n"
                "Parece ser o ID da chave. Na ElevenLabs: Developers → API Keys → Create API Key,\n"
                "copie o valor 'sk_...' mostrado na criação e troque no .env.local.")
        self.s = requests.Session()
        self.s.headers.update({"xi-api-key": chave, "User-Agent": config.USER_AGENT})

    def _req(self, metodo: str, caminho: str, **kw):
        r = self.s.request(metodo, config.ELEVEN_URL + caminho, timeout=kw.pop("timeout", 60), **kw)
        if r.status_code == 402:
            raise ErroVoz("ElevenLabs: esta voz exige plano pago (vozes da biblioteca não funcionam pela API "
                          "no plano gratuito). Assine o Starter ou defina ELEVENLABS_VOICE_ID com uma voz padrão.")
        if r.status_code == 401 and "missing_permissions" in r.text:
            raise SemPermissao(r.text[:300])
        if r.status_code in (401, 403):
            raise ErroVoz(f"ElevenLabs recusou a chave ({r.status_code}): {r.text[:300]}")
        if r.status_code == 429:
            raise ErroVoz("ElevenLabs: limite de uso atingido (429). Tente de novo mais tarde.")
        r.raise_for_status()
        return r.json()

    def creditos(self) -> tuple[int, int] | None:
        """None quando a chave não tem a permissão user_read (chave restrita)."""
        try:
            s = self._req("GET", "/v1/user/subscription")
        except SemPermissao:
            return None
        return s["character_count"], s["character_limit"]

    # ---------- escolha da voz ----------
    def escolher_voz(self) -> dict:
        fixa = config.env("ELEVENLABS_VOICE_ID", obrigatoria=False)
        if fixa:
            return {"voice_id": fixa, "nome": "ELEVENLABS_VOICE_ID"}
        if config.ELEVEN_VOZ_ID:   # voz definida no config: usa direto (não precisa de voices_read)
            return {"voice_id": config.ELEVEN_VOZ_ID, "nome": config.ELEVEN_VOZ_NOME}
        if ARQ_VOZ.exists():
            return config.ler_json(ARQ_VOZ)

        alvo = config.ELEVEN_VOZ_NOME.lower()
        minhas = self._req("GET", "/v2/voices", params={"page_size": 100, "search": config.ELEVEN_VOZ_NOME})["voices"]
        voz = next(({"voice_id": v["voice_id"], "nome": v["name"]} for v in minhas
                    if v["name"].lower().startswith(alvo)), None)

        if not voz:  # biblioteca pública → adiciona à conta
            lib = self._req("GET", "/v1/shared-voices",
                            params={"search": config.ELEVEN_VOZ_NOME, "language": "pt", "page_size": 30})["voices"]
            lib = [v for v in lib if v["name"].lower().startswith(alvo)]
            lib.sort(key=lambda v: ("deep" not in v["name"].lower(), v.get("gender") != "male"))
            if lib:
                v = lib[0]
                r = self._req("POST", f"/v1/voices/add/{v['public_owner_id']}/{v['voice_id']}",
                              json={"new_name": v["name"]})
                voz = {"voice_id": r.get("voice_id", v["voice_id"]), "nome": v["name"]}
                print(f"  voz '{v['name']}' adicionada à sua conta ElevenLabs")

        if not voz:  # voz grave masculina em português já na conta
            todas = self._req("GET", "/v2/voices", params={"page_size": 100})["voices"]
            def nota(v):
                lab = {k: str(x).lower() for k, x in (v.get("labels") or {}).items()}
                texto = " ".join(lab.values()) + " " + (v.get("description") or "").lower() + " " + v["name"].lower()
                return (("brazil" in texto or "portug" in texto) * 4 + (lab.get("gender") == "male") * 2
                        + any(p in texto for p in ("deep", "grave", "narrat", "resonant")))
            todas.sort(key=nota, reverse=True)
            if todas and nota(todas[0]) >= 6:
                voz = {"voice_id": todas[0]["voice_id"], "nome": todas[0]["name"]}
            else:
                nomes = ", ".join(f"{v['name']} ({v['voice_id']})" for v in todas[:15])
                raise ErroVoz("Não achei a voz 'Sergio' nem uma voz masculina em português na conta.\n"
                              f"Vozes disponíveis: {nomes}\nDefina ELEVENLABS_VOICE_ID no .env.local.")
        config.CACHE_VOZ.mkdir(exist_ok=True)
        config.gravar_json(ARQ_VOZ, voz)
        return voz

    # ---------- síntese ----------
    def sintetizar(self, voice_id: str, texto: str, modelo: str | None = None, ajustes: dict | None = None) -> dict:
        return self._req("POST", f"/v1/text-to-speech/{voice_id}/with-timestamps",
                         params={"output_format": "mp3_44100_128"},
                         json={"text": texto, "model_id": modelo or config.ELEVEN_MODELO,
                               "language_code": "pt", "voice_settings": ajustes or config.ELEVEN_AJUSTES},
                         timeout=180)


# ---------------------------------------------------------------- tempos
def palavras_de(caracteres: list[str], inicios: list[float], fins: list[float]) -> list[dict]:
    """Agrupa os tempos por caractere em palavras (separadas por espaço)."""
    palavras, atual = [], None
    for ch, i, f in zip(caracteres, inicios, fins):
        if ch.isspace():
            if atual:
                palavras.append(atual)
                atual = None
            continue
        if atual is None:
            atual = {"p": "", "i": i, "f": f}
        atual["p"] += ch
        atual["f"] = f
    if atual:
        palavras.append(atual)
    return palavras


def estimar(texto: str) -> dict:
    """Tempos aproximados (≈14 caracteres/s, pausas na pontuação) para a prévia sem voz."""
    inicios, fins, t = [], [], 0.0
    for ch in texto:
        passo = 1 / 14.5 + (0.32 if ch in ".!?" else 0.16 if ch in ",:;" else 0)
        inicios.append(t)
        t += passo
        fins.append(t)
    return {"duracao": round(t, 3), "inicio_caracteres": inicios, "total_caracteres": len(texto),
            "palavras": palavras_de(list(texto), inicios, fins), "audio": None, "estimado": True}


def duracao_mp3(caminho) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                          "-of", "default=nw=1:nk=1", str(caminho)], capture_output=True, text=True, check=True)
    return float(out.stdout.strip())


def chave_cache(voice_id: str, texto: str, modelo: str | None = None, ajustes: dict | None = None) -> str:
    base = json.dumps([voice_id, modelo or config.ELEVEN_MODELO, ajustes or config.ELEVEN_AJUSTES, texto],
                      ensure_ascii=False, sort_keys=True)
    return hashlib.sha1(base.encode("utf-8")).hexdigest()[:20]


def falar(api: "ElevenLabs", voz: dict, texto: str, modelo: str, ajustes: dict) -> dict:
    """Uma fala avulsa (POV) com cache: {audio, duracao, gerado}."""
    config.CACHE_VOZ.mkdir(exist_ok=True)
    h = chave_cache(voz["voice_id"], texto, modelo, ajustes)
    mp3, meta = config.CACHE_VOZ / f"{h}.mp3", config.CACHE_VOZ / f"{h}.json"
    gerado = not (mp3.exists() and meta.exists())
    if gerado:
        r = api.sintetizar(voz["voice_id"], texto, modelo, ajustes)
        mp3.write_bytes(base64.b64decode(r["audio_base64"]))
        config.gravar_json(meta, {"texto": texto, "voz": voz, "modelo": modelo, "duracao": round(duracao_mp3(mp3), 3)})
    return {"audio": str(mp3), "duracao": config.ler_json(meta)["duracao"], "gerado": gerado}


def gerar_falas(roteiro: dict, sem_voz: bool = False) -> dict:
    """Devolve {id_da_cena: {duracao, palavras, inicio_caracteres, audio}}."""
    if sem_voz:
        print("  modo sem voz: tempos estimados, sem áudio de narração")
        return {c["id"]: estimar(c["fala"]) for c in roteiro["cenas"]}

    config.CACHE_VOZ.mkdir(exist_ok=True)
    api = ElevenLabs()
    voz = api.escolher_voz()
    print(f"  voz: {voz['nome']} ({voz['voice_id']})")

    pendentes = [c for c in roteiro["cenas"]
                 if not (config.CACHE_VOZ / f"{chave_cache(voz['voice_id'], c['fala'])}.json").exists()]
    if pendentes:
        custo = sum(len(c["fala"]) for c in pendentes)
        conta = api.creditos()
        if conta is None:
            print(f"  {len(pendentes)} falas novas = {custo} caracteres (saldo não verificado: a chave não tem user_read)")
        else:
            usados, limite = conta
            print(f"  {len(pendentes)} falas novas = {custo} caracteres (conta: {usados}/{limite} usados)")
            if usados + custo > limite:
                raise ErroVoz("Créditos da ElevenLabs insuficientes para este episódio.")

    falas = {}
    for c in roteiro["cenas"]:
        h = chave_cache(voz["voice_id"], c["fala"])
        mp3, meta = config.CACHE_VOZ / f"{h}.mp3", config.CACHE_VOZ / f"{h}.json"
        if meta.exists() and mp3.exists():
            print(f"  [{c['id']}] cache")
        else:
            print(f"  [{c['id']}] gerando ({len(c['fala'])} caracteres)…")
            r = api.sintetizar(voz["voice_id"], c["fala"])
            mp3.write_bytes(base64.b64decode(r["audio_base64"]))
            al = r.get("alignment") or r["normalized_alignment"]
            config.gravar_json(meta, {
                "texto": c["fala"], "voz": voz,
                "duracao": round(duracao_mp3(mp3), 3),
                "caracteres": al["characters"],
                "inicio_caracteres": al["character_start_times_seconds"],
                "fim_caracteres": al["character_end_times_seconds"],
            })
        m = config.ler_json(meta)
        falas[c["id"]] = {
            "duracao": m["duracao"],
            "audio": str(mp3),
            # só usa os tempos por caractere para as marcas se o alinhamento bater com o texto
            "inicio_caracteres": m["inicio_caracteres"] if "".join(m["caracteres"]) == c["fala"] else [],
            "total_caracteres": len(c["fala"]),
            "palavras": palavras_de(m["caracteres"], m["inicio_caracteres"], m["fim_caracteres"]),
        }
    return falas


if __name__ == "__main__":
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--episodio", type=int, required=True)
    ap.add_argument("--sem-voz", action="store_true")
    a = ap.parse_args()
    pasta = config.pasta_episodio(a.episodio)
    config.gravar_json(pasta / "voz.json", gerar_falas(config.ler_json(pasta / "roteiro.json"), a.sem_voz))
