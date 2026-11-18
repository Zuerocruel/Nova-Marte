# Escala

## O que já está pronto para volume

| Ponto | Como foi resolvido |
|---|---|
| Mapa com milhões de personagens | Carrega por quarteirões 32×32, só os visíveis; posição derivada do id (sem cálculo nem disputa) |
| Pico de acesso depois de um episódio | `/api/mundo/*` com cache de CDN (10–30 s). A loja é estática e revalida a cada 60 s |
| Busca rápida | Índices GIN de trigramas em nome e @, e índice em código |
| Cadastro duplicado | `whatsapp` único e `(rede, @)` único. Repetir o cadastro devolve o personagem existente |
| Webhook perdido | Todo evento é salvo cru antes de processar, com botão de reprocessar e upsert idempotente por `cakto_order_id` |
| Relatórios | Views SQL, sem processamento no navegador; CSV paginado |

## Quando trocar algo

| Sinal | Ação |
|---|---|
| Robôs criando cadastros (picos estranhos, nomes aleatórios) | Adicionar **Cloudflare Turnstile** no formulário (grátis) e validar o token em `/api/cadastro` |
| Mais de ~10 mil cadastros/hora ou ataques | Trocar `lib/limite.ts` (memória, por instância) por **Upstash Ratelimit** (Redis) |
| Painel lento (views com `count(*)` em milhões de linhas) | Transformar `v_kpis`, `v_origens` e `v_funil_links` em *materialized views* atualizadas a cada 5 min por `pg_cron` |
| Mais de 500 mil personagens | Plano pago do Supabase (backups diários, mais conexões); conferir `cliques`, a maior tabela, e particionar por mês ou apagar cliques com mais de 12 meses |
| Muitos sprites finais | Servir do Supabase Storage com CDN (já é o padrão) e manter o PNG em 12×12 ou 24×24 |
| Vários ajudantes no painel | Trocar a senha básica por login do Supabase Auth com papéis (admin, arte, financeiro) |
| Disparo de avisos no WhatsApp | WhatsApp Cloud API com templates aprovados, fila (ex.: tabela `avisos` + cron) e só para `aceita_whatsapp = true` |

## Custos de partida (aproximados)

- Vercel Hobby (grátis), mas o uso comercial pede o plano **Pro**: comece no Pro quando a loja estiver ativa.
- Supabase Free (500 MB) aguenta dezenas de milhares de personagens. O Pro vale quando tiver receita ou passar do limite.
- Cakto cobra taxa por venda. Para itens de R$ 2–5, confira se a taxa fixa por transação não come a margem.
