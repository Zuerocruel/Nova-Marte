# Operação Marte Zero

Série em pixel art onde **cada seguidor vira um personagem**.
Este repositório tem o site (cadastro + mundo ao vivo + loja), o banco, o painel e as integrações.

| Peça | Onde | O que faz |
|---|---|---|
| Site | `app/` (Next.js na Vercel) | Cadastro, busca no mundo ao vivo, loja |
| Banco | `supabase/schema.sql` (Supabase/Postgres) | Personagens, origem, cliques, produtos, pedidos, seguidores |
| Loja/checkout | Cakto + `app/comprar/` + `app/api/webhooks/cakto/` | Botão leva ao checkout; webhook grava a venda |
| Painel | `app/painel/` (com senha) | Seguidores, cadastros, origens, funil, vendas, fila de produção |
| Seguidores | `app/api/cron/seguidores/` (Vercel Cron, 1x/dia) | Puxa números do YouTube, Instagram e TikTok |

Leia nesta ordem:
1. [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md): como tudo se conecta, as pastas e o banco
2. [`docs/PROCESSOS.md`](docs/PROCESSOS.md): rotina semanal (episódio, fila de arte, loja, métricas, LGPD)
3. [`docs/ESCALA.md`](docs/ESCALA.md): o que já aguenta volume e o que trocar quando crescer

## Colocar no ar (≈1 hora)

1. **Supabase**: crie um projeto em supabase.com, depois vá em **SQL Editor** e rode, nesta ordem: `supabase/schema.sql`, os arquivos de `supabase/migrations/` (002, 003…), `supabase/produtos.sql` e, se quiser os links de exemplo, `supabase/seed.sql`.
2. **Variáveis**: copie `.env.example` para `.env.local` e preencha com Supabase → Settings → API (URL + service_role).
3. **Rodar local**: `npm install` e depois `npm run dev`. Abra http://localhost:3000 (o painel fica em `/painel`).
4. **Vercel**: suba o código num repositório no GitHub, importe-o na Vercel e cadastre as mesmas variáveis. O `vercel.json` já agenda o cron.
5. **Domínio**: aponte o domínio para a Vercel e ajuste `NEXT_PUBLIC_SITE_URL`.
6. **Cakto**: para cada produto, crie-o na Cakto, copie o link de checkout e o id, e insira na tabela `produtos`.
   Em **Webhooks**, cadastre `https://SEUDOMINIO/api/webhooks/cakto?token=<CAKTO_WEBHOOK_TOKEN>` com os eventos de compra aprovada, recusada, reembolso, chargeback e Pix/boleto gerado.
   Use **“Enviar teste”** e confira a linha que aparece em `webhook_eventos` (veja *Validar a Cakto* em PROCESSOS.md).
7. **Links**: troque a bio de cada rede por `SEUDOMINIO/l/ig-bio`, `/l/tt-bio` e `/l/yt-bio`.
8. **Seguidores**: configure as APIs (veja `.env.example`) ou lance os números à mão no painel.

## Comandos

```
npm run dev        # desenvolvimento
npm run build      # build de produção
npm run typecheck  # checagem de tipos
```
