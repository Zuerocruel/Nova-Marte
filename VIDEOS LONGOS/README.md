# VIDEOS LONGOS — série secundária "Expedição Norte" (só YouTube)

A série **principal** da Operação Marte Zero continua sendo o **Short diário** (Instagram, TikTok e YouTube), feito
pela `fabrica/`. Esta pasta é uma **série secundária**, separada: vídeos longos 16:9, **só no YouTube**, contados em
**2ª pessoa** ("você") do ponto de vista dos dois colonos que foram na Expedição Norte.

**Regra de convivência:** nada aqui é importado pela fábrica dos Shorts e nada daqui vai para o Mundo ao vivo.
A série principal segue a vida normal da colônia. A secundária segue o próprio rumo e só **cruza** com a principal
em pontos combinados (o primeiro: no ep. 13 dos Shorts o rover volta sozinho com o diário de bordo gravado na Parte 1).
O único arquivo compartilhado é `fabrica/expedicao.json` (quem está fora da colônia), que é da série principal.

## Tema, tom e formato (série atual, em 4 linhas)
- **Tema:** colonização de Marte em pixel art; cada seguidor vira colono. Obras, clima extremo, problema do dia, votações.
- **Tom:** aventura de sobrevivência leve e otimista, com mistério de fundo (as marcas de pneu que "não são nossas").
- **Formato principal:** Short vertical diário (~2 min), narrador em 3ª pessoa, mapa de cima + cortes cinematográficos.
- **Esta série:** o avesso. Longo (8–13 min), horizontal, 2ª pessoa, ritmo de simulação/sobrevivência, um mistério por parte.

## Pastas
| Pasta | O que tem |
|---|---|
| `serie/biblia.md` | Personagens, equipamento, linha do tempo, mistérios abertos e pontos de cruzamento com os Shorts |
| `formato/molde-episodio.md` | O molde de retenção traduzido para o nosso universo (campos para preencher) |
| `partes/parteNN/roteiro.json` | **Fonte do roteiro** (blocos, falas, cena, relógio, HUD). O motor lê daqui |
| `partes/parteNN/roteiro.md` | Versão para ler/aprovar (gerada do .json: `python motor/longo.py --parte N --md`) |
| `partes/parteNN/embalagem.md` | Títulos, thumb, descrição, capítulos, fatos reais, pergunta final |
| `motor/` | Motor de vídeo próprio (16:9, 1920x1080): voz, linha do tempo, filmagem, montagem |
| `saida/parteNN/` | Vídeo final, áudio, quadros temporários (fora do git) |

## Produzir uma parte
```
cd "VIDEOS LONGOS"
python motor/longo.py --parte 1 --md              # gera o roteiro.md para revisar
python motor/longo.py --parte 1 --sem-voz         # prévia grátis (tempos estimados, sem narração)
python motor/longo.py --parte 1 --previa 5 60 300 # PNGs de instantes soltos
python motor/longo.py --parte 1                   # voz (ElevenLabs) + filmagem + montagem → saida/parte01/parte01.mp4
```
A voz usa a mesma chave da fábrica (`ELEVENLABS_API_KEY` no `.env.local`), com cache próprio em `motor/cache_voz/`.
Uma parte de ~10 min gasta ~8 mil caracteres: **só gere a voz depois de aprovar o roteiro.**

## Publicar
Só no YouTube, como vídeo normal (não Shorts), à mão pelo Studio por enquanto: título, descrição, capítulos e thumb
estão no `embalagem.md`. Ritmo: **semanal** (os Shorts continuam diários e são a prioridade).
