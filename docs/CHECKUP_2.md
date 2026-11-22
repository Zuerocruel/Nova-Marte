# Checkup 2 — pedido de 22/11/2026

Pedido inteiro, com checklist. Conferir a cada passo. `[x]` = feito e conferido · `[~]` = parcial (ver nota) · `[ ]` = falta.

## Pendências do checkup anterior
- [x] Vídeo institucional refeito com o site NO AR
- [ ] Prints do Instagram pelo celular (grade do perfil e dentro do post) e conferência do tamanho das imagens

## 1. Vídeo dos cargos
- [x] Cada personagem dá uma voltinha (nada estático), na cadeia de comando: líder, vice, engenharias, vida (plantação, saúde)...
- [x] Confirmar que as imagens estão no tamanho do Instagram

## 2. Link de convite por colono
- [x] Cada colono tem link de convite próprio (botão copiar dentro da Colônia ao vivo)
- [x] Quem convidar mais gente concorre a um cargo (líder, embaixador, festas...)
- [x] Painel: quantos cadastros cada link trouxe, quem veio por quem, UTM por pessoa

## 3. Como convidar
- [x] Vídeo didático e simples de como convidar pessoas com o link
- [x] Posts para feed e stories

## 4. Vídeo longo para o YouTube (HORIZONTAL, 5 a 10 min, ElevenLabs)
- [x] Explica tudo: cadastro, colônia ao vivo, cargos, como convidar, como comprar na loja, incluindo os episódios 1 e 2
- [x] NÃO postar (o usuário sobe à mão)
- [x] Copies prontas com capítulos, hashtags e gancho de novidades
- [x] Thumbnail muito boa (Higgsfield se houver acesso)
- [x] Tudo em Aprovações

## 5. Textos (arquivo .txt na pasta do projeto)
- [x] (a) copy para comentar no TikTok levando ao site
- [x] (b) descrição do YouTube com link
- [x] (c) respostas para comentários do YouTube com link
- [x] (d) copy para comentários dos posts mandando para o link da bio (sem URL)

## 6. Relatório: 7 acessos pelo link do YouTube do ep. 1 sem cadastro
- [x] Analisar os dados e trazer relatório

## 7. UTMs do Facebook e do Google
- [x] Analisar se são robôs
- [x] Marcar visitas suspeitas de robô no painel, separadas das reais

## 8. Recursos de jogo que fazem voltar todo dia
- [x] Lista com explicação de uma linha cada (sem construir)

## 9. Pedido (sub-lista)
- [x] 9.1 Login com e-mail/senha: FORA do escopo por enquanto
- [x] 9.2 Ideias de CLASSES (diferentes dos cargos)
- [x] 9.3 Mostrar quem está online AGORA e quantos colonos a série tem
- [x] 9.4 Missões diárias (moedas + XP), ranking e 3 minigames (ex.: acertar o laser num alvo que se mexe)
- [x] 9.4 Aba de minigames no painel para testar e aprovar antes de ligar no site
- [x] 9.5 Animação de entrada ao abrir o site, com a cara de Marte
- [x] 9.6 Produtos novos com aprovação: aba "Produtos/Loja" no painel; ao aprovar, criar na Cakto pela API com imagem

## 10. Ajustes
- [x] Entrada: só o foguete na plataforma ligando os propulsores, com barra de carregamento (sem viagem Terra → Marte)
- [x] Prévia da entrada numa aba própria do painel
- [x] A fumaça não pode ser cortada nas bordas
- [x] Perdeu os 3 corações num minigame: AQUELE minigame trava 12 h para a pessoa (os outros continuam); automático, gravado no banco
- [x] Sair no meio da partida: pop-up DENTRO do jogo avisando que perde os corações
- [x] Botão "Ligar no site" sem confirmação, atualizando na hora após aprovar
- [x] Chat duplicando mensagens: corrigir
- [x] Loja no celular em 2 colunas

## 11. Chat ao vivo na colônia
- [x] Chat para as pessoas conversarem dentro da colônia
- [x] Painel: botão limpar o chat SEM confirmação
- [x] Limpeza automática a cada 10 minutos

## 12. Bandeira e Cakto
- [x] "Bandeira do colono": escolher bandeira de quase todos os países (pode cobrar mais caro)
- [x] Ver se a API da Cakto muda e-mail de suporte e nome de exibição de todos os produtos de uma vez

## 13. Mapa em HEXÁGONO
- [x] Bordas arredondadas, minimalista, bem maior que o atual (mais gente, cápsulas e lojas)

## 14. Mini loja de moedas (diferente da loja paga)
- [x] Trajes espaciais, cores e alguns trajes especiais
- [x] Painel: aba para aprovar itens e preços
- [x] Preços equilibrados com o que a pessoa ganha jogando

## 15. Um vídeo para cada novidade
- [x] (1) chat + online agora
- [x] (2) central do colono: missões, épicas, minigames, ranking
- [x] (3) loja de moedas, mostrando que a loja paga dá muito mais benefícios

---
## Notas de conferência

- Item 5: docs/textos_divulgacao.txt · Itens 6 e 7: docs/relatorio_acessos.md + Visão geral do painel (robôs separados) · Itens 8 e 9.2: docs/ideias_jogo.md
- Item 12 (Cakto): a API muda supportEmail e producerName, mas um produto por vez (PATCH /public_api/products/{id}/); sem
  endpoint em massa → producao/cakto_api.py faz o laço em todos. Precisa CAKTO_CLIENT_ID/SECRET no .env.local. O preço da
  bandeira é o da oferta na Cakto (mudar lá). Migração 014 troca as opções da bandeira para 201 países + "minhas cores".
- 9.6: aprovar produto novo cria na Cakto pela API (imagem por URL do site) — depende das mesmas credenciais.
- Migração 013 (jogo, convites, online, loja de moedas) precisa ser rodada para essas partes funcionarem de verdade.
- Prints do Instagram: o celular estava com a tela bloqueada; refazer com a tela desbloqueada.
- Tamanhos conferidos: feed/carrossel 1080x1350 (4:5), stories 1080x1920 (9:16), capa dos Reels com textos na área 3:4, thumb 1280x720.
- Thumbnail do longo feita no motor pixel (não há acesso ao Higgsfield no projeto).
- Vídeos com partes que dependem de login/migração 013 usam dados de DEMONSTRAÇÃO (nomes fictícios), total de colonos real.
- Vídeos (Aprovações → Vídeos explicativos; arquivos em fabrica/saida/divulgacao/videos/): cargos 1min34, convite, chat+online 36 s,
  central, loja de moedas e YouTube longo HORIZONTAL 7min10 (eps. 1 e 2 completos, capítulos conferidos, thumb 1280x720, copies.txt).
- Pendente: prints do Instagram (celular com a tela bloqueada nas 2 tentativas).
