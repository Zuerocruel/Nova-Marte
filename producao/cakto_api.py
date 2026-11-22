"""
Cakto · API pública (OAuth client credentials). Usada pelo painel para:
  - criar um produto aprovado na aba "Produtos novos" (nome, descrição, preço e IMAGEM por URL);
  - trocar o e-mail de suporte e o nome de exibição do produtor em TODOS os produtos (a API não tem atualização
    em massa: é um PATCH /public_api/products/{id}/ por produto, com os campos supportEmail e producerName).

Credenciais em .env.local (crie em Cakto → Integrações → API):
    CAKTO_CLIENT_ID=...
    CAKTO_CLIENT_SECRET=...
    CAKTO_API=https://api.cakto.com.br      (opcional)

    python producao/cakto_api.py --checar
    python producao/cakto_api.py --listar
    python producao/cakto_api.py --suporte contato@exemplo.com --produtor "Operação Marte Zero"   # mostra o que mudaria
    python producao/cakto_api.py --suporte ... --produtor ... --aplicar                            # aplica em todos
"""
from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

import requests

RAIZ = Path(__file__).resolve().parent.parent


def _env() -> dict:
    vals = dict(os.environ)
    arq = RAIZ / ".env.local"
    if arq.exists():
        for linha in arq.read_text(encoding="utf-8").splitlines():
            if "=" in linha and not linha.lstrip().startswith("#"):
                k, v = linha.split("=", 1)
                vals.setdefault(k.strip(), v.strip().strip('"'))
    return vals


class Cakto:
    def __init__(self) -> None:
        e = _env()
        self.base = (e.get("CAKTO_API") or "https://api.cakto.com.br").rstrip("/")
        self.cid, self.segredo = e.get("CAKTO_CLIENT_ID", ""), e.get("CAKTO_CLIENT_SECRET", "")
        self._token, self._expira = "", 0.0

    def configurada(self) -> bool:
        return bool(self.cid and self.segredo)

    def token(self) -> str:
        if not self.configurada():
            raise RuntimeError("faltam CAKTO_CLIENT_ID e CAKTO_CLIENT_SECRET no .env.local (Cakto → Integrações → API)")
        if self._token and time.time() < self._expira - 60:
            return self._token
        r = requests.post(f"{self.base}/public_api/token/", data={"client_id": self.cid, "client_secret": self.segredo},
                          timeout=30)
        r.raise_for_status()
        j = r.json()
        self._token, self._expira = j["access_token"], time.time() + float(j.get("expires_in", 3600))
        return self._token

    def req(self, metodo: str, caminho: str, **kw):
        r = requests.request(metodo, f"{self.base}/public_api/{caminho.lstrip('/')}",
                             headers={"Authorization": f"Bearer {self.token()}"}, timeout=60, **kw)
        if r.status_code >= 400:
            raise RuntimeError(f"Cakto {metodo} {caminho}: HTTP {r.status_code} {r.text[:300]}")
        return r.json() if r.content else {}

    def produtos(self) -> list[dict]:
        saida, pagina = [], 1
        while True:
            j = self.req("GET", "products/", params={"page": pagina, "limit": 100})
            itens = j.get("results", j if isinstance(j, list) else [])
            saida += itens
            if not j.get("next") or not itens:
                return saida
            pagina += 1

    def criar_produto(self, nome: str, descricao: str, preco_reais: float, imagem_url: str, **extra) -> dict:
        corpo = {"name": nome, "description": descricao, "price": round(preco_reais, 2), "image": imagem_url, **extra}
        return self.req("POST", "products/", json=corpo)

    def atualizar_todos(self, suporte: str | None, produtor: str | None, aplicar: bool, log=print) -> int:
        campos = {k: v for k, v in (("supportEmail", suporte), ("producerName", produtor)) if v}
        n = 0
        for p in self.produtos():
            mudar = {k: v for k, v in campos.items() if p.get(k) != v}
            if not mudar:
                continue
            n += 1
            log(f"{'✔' if aplicar else '→'} {p.get('name')} ({p.get('id')}): {mudar}")
            if aplicar:
                self.req("PATCH", f"products/{p['id']}/", json=mudar)
        return n


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--checar", action="store_true")
    ap.add_argument("--listar", action="store_true")
    ap.add_argument("--suporte")
    ap.add_argument("--produtor")
    ap.add_argument("--aplicar", action="store_true")
    a = ap.parse_args()
    c = Cakto()
    try:
        if a.checar:
            c.token()
            print("✅ Cakto API conectada")
        if a.listar:
            for p in c.produtos():
                print(p.get("id"), "·", p.get("name"), "·", p.get("supportEmail"), "·", p.get("producerName"))
        if a.suporte or a.produtor:
            n = c.atualizar_todos(a.suporte, a.produtor, a.aplicar)
            print(f"{n} produto(s) {'atualizados' if a.aplicar else 'mudariam (use --aplicar)'}")
    except Exception as e:  # noqa: BLE001
        print("✖", e)
        sys.exit(1)
