# Fábrica de Vídeos da Operação Marte Zero

Gera os episódios automaticamente em Python. **A geração não usa IA**: as falas saem de templates e as imagens são desenhadas por código. O único serviço pago é a voz (ElevenLabs), e as falas repetidas ficam em cache.

```
coleta        episodio.py     Supabase → colonos, novos, compras PAGAS, obras
roteiro       roteiro.py      templates pt-BR → falas + marcas de foco da câmera
voz           voz.py          ElevenLabs with-timestamps → mp3 + tempo de cada palavra (cache_voz/)
tempo         roteiro.py      início/fim de cada cena a partir da duração real da voz
filmagem      navegador.py    Chrome/Edge headless abre render.html + diretor.js, 30 fps
montagem      audio.py        música + narração (ducking) + legenda dourada + FFmpeg → MP4 1080x1920
```

## Instalar (uma vez)

```
python -m pip install -r fabrica/requirements.txt
```

Também precisa do FFmpeg no PATH e do Chrome **ou** do Edge (sem nenhum dos dois: `python -m playwright install chromium`).

No `.env.local` da raiz: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ELEVENLABS_API_KEY` (a chave que começa com `sk_`) e, se quiser, `ELEVENLABS_VOICE_ID` para fixar a voz.

Para guardar o estágio das obras no banco, rode `supabase/migrations/004_colonia_obras.sql` no SQL Editor. Sem a tabela, vale o `estado_inicial` de `colonia.json`.

## Gerar um episódio

```
cd fabrica
python fabricar.py --episodio 1 --so-fundadores    # Episódio 1: só Comandante Vega e Dra. Lia
python fabricar.py --episodio 2                    # dados reais do banco
python fabricar.py --episodio 2 --sem-voz          # prévia grátis, sem narração
python fabricar.py --episodio 2 --a-partir-de filmagem   # refaz só imagem e montagem
python navegador.py --episodio 2 --previa 5 20 41  # PNGs de instantes soltos
```

O resultado fica em `saida/epNNN/`: `episodio_NNN.mp4`, `post.txt` (texto do post), `roteiro.json` e os intermediários.

**Nada é publicado automaticamente.** Depois de assistir e postar:

```
python episodio.py --registrar-publicacao 2
```

Isso grava `publicado_em` em `episodios` (vira o corte de "novos desde o último episódio") e marca a obra da missão como concluída.

## Regras embutidas

- **Compras:** só entram vendas pagas (`status` = `aprovado`, que é como o webhook da Cakto grava a venda paga, ou `pago`). Pendentes, recusadas e reembolsadas nunca entram.
- **Privacidade:** a coleta só pede nome de exibição, código, posição, seed e sprite. WhatsApp, e-mail e telefone não saem do banco. Colonos ocultos ficam de fora.
- **Sincronia:** a legenda de cada palavra é presa ao início da sua cena. Um atraso numa fala não empurra as seguintes.
- **Cache de voz:** o nome do arquivo é o hash de voz + modelo + ajustes + texto. Mudar uma vírgula gera um áudio novo; repetir a mesma fala não gasta crédito.

## Personalizar

- **Obras e missões:** `colonia.json`. Cada obra tem posição no mapa, tipo de desenho (`solar`, `estufa`, `antena`) e uma missão de 5 cenas (fala, câmera, ação, progresso, para onde os fundadores andam).
- **Textos fixos:** os templates ficam no topo de `roteiro.py` (a escolha entre eles é sorteada pelo número do episódio, então o mesmo episódio sempre sai igual).
- **Música:** coloque um `.mp3` em `fabrica/musica/`. Sem arquivo, o FFmpeg gera uma trilha ambiente.
- **Visual:** `diretor.js` (cores, sprites dos fundadores, ícones dos itens, cartões).
