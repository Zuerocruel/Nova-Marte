# Processos

## O ciclo (uma volta por dia = um episódio)

```mermaid
flowchart LR
  A[Episódio publicado<br/>com CTA + link /l/] --> B[Pessoas se cadastram,<br/>compram e comentam]
  B --> C[Painel: marcar o resultado<br/>da votação do ep. anterior]
  C --> D[fabricar.py: coleta, correio,<br/>roteiro, vídeo, cortes]
  D --> E[Painel: assistir, aprovar,<br/>copies e conteúdo extra]
  E --> F[Postagem automática:<br/>YouTube n8n + IG/TT celular]
  F --> G[Conferir os perfis<br/>e marcar publicado]
  G --> A
```

## Rotina diária

Episódio novo **todo dia** (Shorts / Reels / TikTok). A fábrica desenha os colonos sozinha: quem se cadastra entra no
próximo episódio, sem lote nem sprite feito à mão.

| Quando | O quê | Onde |
|---|---|---|
| **Antes de gerar** | Marcar o resultado da votação SIM/NÃO do episódio anterior (card do episódio). | `painel.py` |
| **Gerar** | `python fabricar.py`: puxa cadastros, compras (Fúria, Destaque, itens), comentários (YouTube pela API, Instagram e TikTok pelo navegador) e o Correio da Colônia; monta roteiro, vídeo, cortes IG/TT, imagens. | `fabrica/` |
| **Revisar** | Assistir o episódio e os cortes. Pedir ajustes antes de aprovar. | `fabrica/saida/epNNN/` |
| **Aprovar** | Gerar as copies (`copies.py`), revisar manchete/pauta/ganchos e aprovar as 3 redes. Aprovar o carrossel no Conteúdo extra. | `painel.py` |
| **Agendar** | Aprovar = postar no horário marcado (`auto_postar`): YouTube pelo n8n 30 min antes, Instagram e TikTok pelo celular. PC ligado e celular no cabo. Instagram e TikTok **nunca** com link. | `painel.py` + celular |
| **Depois de postar** | Conferir os perfis (IG @operacaomartezero, TikTok @operacaomartezero, YouTube Studio) e só então marcar `publicado`. Postar o carrossel no IG e atualizar `ig-comentar`. | Redes + `painel.py` |
| **Diário** | O cron puxa os seguidores às 8h (horário de Brasília). Se uma API falhar, o painel mostra o último valor, e dá para lançar à mão. | automático |

Extras (não substituem o episódio do dia): vídeos "Como se constrói…" (`construcao.py`), POVs, divulgação.
O único formato **semanal** é o vídeo longo 16:9 do YouTube que junta os episódios da semana (ver `docs/CHECKLIST.md`).
Produto novo na loja: criar na Cakto e marcar o produto no webhook, senão a compra não chega.

## Nomes dos links (padrão)

`<rede>-<onde>` → `ig-bio`, `tt-bio`, `yt-bio`, `ig-ep013`, `tt-ep013-comentario`, `yt-ep013-desc`, `ig-story-loja-1211`.
Um link para cada lugar onde ele aparece. Assim o painel mostra exatamente **qual post** trouxe gente.
Campo `campanha` = o episódio (`ep013`), para agrupar as 3 redes.

## Loja

- Itens baratos (R$ 2,90 a R$ 9,90), cada um ligado a um episódio. Na loja aparece “Aparece no ep. 13”.
- Para criar: produto na Cakto → copiar link de checkout e id → `insert` em `produtos` (`slug`, `nome`, `preco_centavos`, `checkout_url`, `cakto_product_id`, `episodio_id`, `imagem_url`).
- Para tirar da loja: `ativo = false` (o histórico de vendas continua).
- O que se entrega: defina e escreva na descrição do produto na Cakto (ex.: wallpaper/PNG do item, o item aparece no personagem do comprador num próximo episódio, nome nos créditos). **Tem que ser algo que você consegue cumprir em escala.**

### Validar a Cakto (fazer uma vez, antes de vender)

1. Cadastre o webhook e clique em **Enviar teste** no painel da Cakto.
2. No Supabase, abra `webhook_eventos`: a linha nova mostra o JSON que a Cakto manda.
3. Confira se os caminhos em `lib/cakto.ts` (`CAMPOS`) batem com os nomes do JSON (id do pedido, status, valor, produto, cliente, utm). Se algum não bater, ajuste só a lista.
4. Confira se o valor vem em reais (`9.9`) ou centavos (`990`) e ajuste `CAKTO_VALOR_EM_CENTAVOS`.
5. Faça uma compra real de R$ 1 com o seu WhatsApp cadastrado. O pedido deve aparecer no painel **ligado ao seu personagem**. Depois reembolse e veja o status virar `reembolsado`.
6. Se algum webhook ficar com erro, corrija `CAMPOS` e clique em **Reprocessar** no painel. Nada se perde.

## Métricas que importam (todas no painel)

| Métrica | Pergunta que responde |
|---|---|
| Seguidores por rede + Δ 7 dias | Qual rede está crescendo? |
| Seguidor → cadastro | O CTA do episódio está funcionando? |
| Funil por link (cliques → cadastros → vendas) | **Qual post** traz gente que compra? |
| Origens (source/campanha) | Qual rede traz cadastros e qual traz receita? |
| Cadastro → comprador, ticket médio | A loja está madura para itens mais caros? |
| Fila vs. estreados | A produção de arte está acompanhando os cadastros? |

## LGPD e regras das plataformas

- O cadastro só passa com o consentimento marcado. O aviso por WhatsApp é **opt-in separado**.
- **WhatsApp:** só mande mensagem para quem tem `aceita_whatsapp = true`, uma a uma ou por lista de transmissão (que só chega a quem salvou seu número). Para disparo em volume, use a WhatsApp Cloud API com templates aprovados. Disparo em massa sem opt-in derruba o número.
- **Pedido de exclusão:** ache a pessoa pelo código ou WhatsApp, `delete` em `personagens` (os pedidos ficam com `personagem_id` nulo; os dados fiscais da compra ficam com a Cakto).
- **Moderação:** nomes ou @ ofensivos são ocultados pelo painel (“ocultar”). A pessoa some do mundo e da busca na hora.
- **Menores:** público de pixel art atrai adolescentes. Considere pedir “tenho 13 anos ou mais” (ou 18 para comprar) e revise a política com um advogado.
- A página `/privacidade` é um **modelo**: preencha os colchetes antes de publicar.
- Mencionar @ de pessoas nos episódios: todos autorizaram no cadastro. Mesmo assim, use o nome do personagem na tela e não marque contas automaticamente.
