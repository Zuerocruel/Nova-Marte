# Embalagem · Expedição Norte, Parte 1 (só YouTube, vídeo normal 16:9)

## 5 opções de título (padrão: gerúndio + tempo extremo + situação-limite + Parte)
1. **Sobrevivendo 36 horas perdido no deserto de Marte (Parte 1)** ← recomendado (o 36 é o relógio do vídeo)
2. Passando 3 dias sem rádio além das dunas de Marte (Parte 1)
3. Sobrevivendo a uma tempestade de poeira em Marte, sem contato com a base (Parte 1)
4. Esperando 36 horas por um resgate que não vem, em Marte (Parte 1)
5. Vivendo 3 sóis perdido em Marte com 6 kg de oxigênio (Parte 1)

## Thumb
- Fundo escuro de duna à noite; no centro, **o painel do rover com "VOLTA-CASA 00:00:00" em vermelho**.
- Dois astronautas pequenos no canto, olhando o rover ir embora.
- Selo grande **PARTE 1** (amarelo) no canto superior. Texto no máximo: "36 HORAS".
- Gerar a imagem com `python motor/longo.py --parte 1 --previa <segundo do VOLTA-CASA>` e montar o selo por cima.

## Descrição (colar no YouTube)
```
Sol 11, 19:42. A voz da base some no meio de uma palavra. Uma tempestade de poeira chega em 38 minutos, você está a 45 km de casa, e o rover que trouxe vocês até aqui tem uma regra: se passar 36 horas sem ouvir a base, ele volta sozinho. Sem perguntar.

Você segue as marcas, ou espera na barraca por um resgate que alguém pode nem mandar? Responde nos comentários: MARCAS ou BARRACA.

Expedição Norte é a série longa da Operação Marte Zero, contada por quem foi pro norte. A série diária (Shorts) continua no canal: lá a colônia vê o rover voltar.

Capítulos:
0:00 SOL 11 · 19:42 — O RÁDIO CAI
0:13 SOL 11 · 19:43 — 38 MINUTOS
0:59 SOL 11 · 20:16 — O ZÍPER FECHA
1:10 SOL 11 · 20:31 — A CONTA
2:40 SOL 11 · 20:31 — TRÊS REGRAS
3:39 SOL 12 · 03:10 — PRESSÃO CAINDO
4:37 SOL 12 · 09:00 — DE NOVO E DE NOVO
5:19 SOL 12 · 22:00 — VOZES NO CHIADO
5:44 SOL 13 · 01:17 — 4-1-7
6:10 SOL 13 · 06:02 — VOCÊ, CANSADO
6:51 SOL 13 · 07:38 — VOLTA-CASA
7:12 SOL 13 · 07:42 — AS MARCAS

Fatos reais desta parte:
• Marte não tem GPS: rovers se guiam contando as voltas das rodas e pela posição do sol.
• A pressão do ar em Marte é menos de 1% da da Terra: sem traje, a água do corpo ferveria à temperatura do corpo.
• A poeira marciana é mais fina que farinha. Uma tempestade de poeira em 2018 encerrou a missão do rover Opportunity, da NASA.
• Uma pessoa consome cerca de 0,84 kg de oxigênio por dia.
• Quem vive isolado (Antártida, estação espacial) usa rotina fixa para manter a cabeça no lugar.

#marte #sobrevivencia #operacaomartezero
```
(Tempos reais da versão com voz: 7:54. O motor grava os capítulos em `saida/parte01/capitulos.txt` a cada geração.)

## Pergunta binária (igual no vídeo e na descrição)
**Você segue as marcas, ou espera na barraca por um resgate que alguém pode nem mandar?**

## Quando publicar
Depois do **ep. 13 dos Shorts** (quando o rover volta sozinho na série principal): assim a Parte 1 mostra o outro lado
sem estragar a surpresa do Short. Ritmo da série longa: semanal.
