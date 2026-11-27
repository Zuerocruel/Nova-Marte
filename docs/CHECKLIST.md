# CHECKLIST — Operação Marte Zero

Lista viva do que falta e das ideias guardadas. Marque `[x]` quando fizer.
Legenda: ✅ já existe no código · 🆕 ideia nova (ainda não feita).

---

## 1. Checkup geral (fazer junto, antes de seguir)

- [ ] Commit + push das mudanças de 21/11 (crateras batizadas, Fúria de Marte, Destaque, compras agrupadas). O push põe o site no ar (Vercel).
- [ ] Gerar o ep. 4 de verdade (com voz) e assistir: cratera BuracoNegrote, Lanu e elchapo chegando.
- [x] `docs/PROCESSOS.md` com a rotina **diária** (27/11).
- [x] YouTube Studio: descrição do canal + link `/l/yt-bio`, foto de perfil e banner (à mão).
- [ ] POVs soltos do ep. 2 e do ep. 3 ainda não postados (4 cenas de cada).
- [ ] Carrossel e thumbnail ainda são postados à mão.
- [ ] Miniatura do POV do ep. 3 no Instagram estava preta logo depois de postar: conferir.
- [ ] Login do site = código + WhatsApp, sem confirmação (ponto fraco conhecido).
- [ ] Testar uma compra real de Fúria de Marte e de Destaque (só simulado até agora).
- [ ] Conferir o roteiro e as descrições base que você está montando para YouTube / TikTok / Instagram.

---

## 2. Formatos no YouTube

> **Regra fixa:** a SÉRIE PRINCIPAL são os **Shorts diários** (um episódio por dia, em todas as redes).
> Os **vídeos longos são semanais** e só existem no YouTube, juntando os episódios da semana.
> Os especiais (mês, obra, marco) são extras: nunca substituem o Short do dia nem o longo da semana.

### Shorts (vertical 9:16, ~1,5–2 min) — o que já sai todo dia
- ✅ Episódio diário (`fabricar.py`).
- ✅ POV em primeira pessoa (`pov.py`) e `pov_colonia` (as 4 cenas juntas).
- 🆕 Short de "momento": só uma cena forte cortada do episódio (o alerta + a solução, a obra concluída, a nave).
- 🆕 Short "Procure seu nome": câmera passeando pelo bairro com nomes na tela (chamada para o site).

### Vídeos longos (horizontal 16:9, 8–15 min) — juntando episódios, com roteiro maior
- [ ] 🆕 **"Semana N em Marte"** (semanal): junta os 7 episódios com narração nova por cima.
- [ ] 🆕 **"O mês em Marte"** (mensal): retrospectiva maior, com números do mês.
- [ ] 🆕 **Especial de obra**: do primeiro tijolo à inauguração de uma construção (vários episódios).
- [ ] 🆕 **Especial de marco**: 10, 50, 100, 1000 colonos.

Estrutura sugerida do vídeo longo:
1. Abertura (30 s): o que aconteceu de mais forte na semana, como gancho.
2. "Onde estamos": mapa da colônia, população antes → agora, estação e temperatura.
3. Obras: progresso de cada uma na semana, com time-lapse.
4. Os 3 maiores momentos (problemas do dia, Fúria de Marte, nave).
5. Colonos da semana: quem chegou, quem foi herói, destaques, crateras batizadas.
6. Loja / apoio: o que chegou nas casas (agrupado: "12 colonos compraram cápsula").
7. Próxima semana: obra que vem, estação chegando, mistério em aberto.
8. Chamada: site + "procure seu nome" + inscrição.

O que precisa existir para o vídeo longo:
- [ ] Layout horizontal 1920×1080 no `diretor.js` (hoje é só vertical 1080×1920).
- [ ] Juntar `dados.json` / `roteiro.json` da semana num resumo (sem IA: templates, como o episódio).
- [ ] Capítulos automáticos na descrição (00:00 Abertura, 01:10 Obras…).
- [ ] Thumbnail 16:9 (`imagens.py` já faz thumb: adaptar).
- [ ] Fluxo do n8n aceitar vídeo longo (não Short) e agendar em outro horário.

---

## 3. Banco de ideias de roteiro (além de "chegaram novos colonos")

### Já existem (✅)
- ✅ Chegaram novos colonos (boas-vindas pelo nome e cargo).
- ✅ Missão do Dia (obra em 5 cenas, vários dias por obra).
- ✅ Problema do Dia (36 tipos: água, oxigênio, manutenção, ataque, clima, saúde, descoberta) com herói do cargo certo.
- ✅ Estações e temperatura de Marte.
- ✅ Novidades na vizinhança (compras, agora agrupadas).
- ✅ Cratera batizada.
- ✅ Fúria de Marte comprada (poeira, meteoros, nevasca, reator, nave).
- ✅ Destaque do dia (comprado).
- ✅ Noite com luzes, todo mundo volta para o módulo.

### Ideias novas (🆕)
**Chegadas e visitas**
- [ ] 🆕 **Chegou uma nave de suprimentos**: pousa perto da colônia; Vega e Lia descarregam; traz peças que aceleram a obra.
- [ ] 🆕 **Nave com colonos**: quando entram muitos de uma vez, eles descem juntos de uma nave (em vez de surgirem nas casas).
- [ ] 🆕 **Visita da Terra**: mensagem de vídeo da "base na Terra" lida no rádio (pode usar recados reais dos seguidores).

**Marcos e comemorações**
- [ ] 🆕 **Obra inaugurada**: corte de fita na praça, todos reunidos, a função nova explicada ("agora tem água para todos").
- [ ] 🆕 **Marco de população** (10, 25, 50, 100…): festa na praça com bandeiras.
- [ ] 🆕 **Aniversário de colono**: "faz 30 dias que ZéGotinha chegou a Marte".
- [ ] 🆕 **Primeira vez da estação**: primeira nevasca do inverno, primeiro dia acima de zero.
- [ ] 🆕 **Recorde de temperatura** (mais frio / mais quente desde o pouso).

**Gente da colônia**
- [ ] 🆕 **Colono da semana**: quem mais foi herói nos problemas.
- [ ] 🆕 **Equipe em ação**: uma equipe/cargo inteira trabalhando junto (Robótica conserta o robô fujão).
- [ ] 🆕 **Disputa amigável entre equipes**: quem resolveu mais problemas na semana.
- [ ] 🆕 **Um dia na vida de…**: rotina de um colono sorteado, da manhã à noite (casa com o POV).
- [ ] 🆕 **Pets da colônia**: os pets aprontando (fugiu, achou algo na duna).

**Exploração e mistério (histórias de vários episódios)**
- [ ] 🆕 **Expedição de rover**: equipe sai para longe da colônia e volta com algo (gelo, minério, fóssil).
- [ ] 🆕 **Sinal misterioso**: começa num episódio, cresce em outros e se resolve numa semana (bom para o vídeo longo).
- [ ] 🆕 **Mapa novo**: descoberta de uma área (caverna, vale), que pode virar obra ou cratera para batizar.
- [ ] 🆕 **Noite de observação**: Terra vista no céu, chuva de estrelas, Fobos e Deimos.

**Participação dos seguidores**
- [ ] 🆕 **Votação**: "qual a próxima obra?" pelos comentários ou pelo site, com o resultado no episódio seguinte.
- [ ] 🆕 **Pergunta do dia**: um colono responde uma pergunta de seguidor.
- [ ] 🆕 **Recados do Rádio da colônia**: mensagens do chat do site lidas no episódio.

**Produtos que viram cena** (para crescer a loja)
- [ ] 🆕 **Foguete**: lançamento do foguete do colono, com contagem regressiva.
- [ ] 🆕 **Rover**: passeio do comprador pelo deserto.
- [ ] 🆕 **Outdoor holográfico**: mensagem do comprador acesa no bairro à noite.
- [ ] 🆕 **Festa / bandeira**: festa na praça com a bandeira do comprador.
