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

Para guardar o estágio das obras no banco, rode `supabase/migrations/004_colonia_obras.sql` e depois `005_obras_ritmo.sql` no SQL Editor. Sem a tabela, vale o `estado_inicial` de `colonia.json`, o que só serve para o episódio 1: do 2 em diante a fábrica se recusa a gerar sem a tabela (senão repetiria obras já feitas).

### Ritmo das obras (episódios diários)

Uma obra leva vários episódios. A cada episódio ela avança `população × pontos_por_pessoa ÷ trabalho` (em `colonia.json`: bloco `ritmo` e o `trabalho` de cada obra). População = fundadores + colonos, então quanto mais gente se cadastra, mais rápido a colônia constrói. Com 4 pessoas, a Estufa (trabalho 16) leva 4 episódios; com 16 pessoas, sai num só.

- 1º dia da obra: as cenas de apresentar e demarcar, um trecho da construção e "amanhã a obra continua".
- Dias do meio: retomar de onde parou, a mão de obra do dia ("dois a mais que ontem"), o avanço em % e o fim do turno.
- Dia da conclusão: fecha com as cenas originais de terminar e ligar a obra.
- Se a colônia for grande o bastante para fazer a obra inteira num dia, entram as 5 cenas originais.

O título dos posts ganha "· dia 2", "· dia 3"… e, do episódio 2 em diante, o gancho e as legendas dizem que o episódio é diário. Cadastre novas obras em `colonia.json` antes que acabem: com 4 pessoas, as três atuais acabam no episódio 11.

### As obras e o que cada uma muda

Ordem em `colonia.json` (a primeira não concluída é a obra do dia): Fazenda Solar → Estufa → Antena → **Extrator de Gelo** (28) → **Gerador de Oxigênio** (32) → **Oficina dos Robôs** (36) → **Cantina Comunitária** (40) → **Enfermaria** (44) → **Abrigo Antirradiação** (52) → **Laboratório de Pesquisa** (60). Entre parênteses, o `trabalho`. Todas ficam no miolo da colônia, sem encostar no bairro.

Quando uma obra fica pronta (`marte.json` → `obras_da_categoria`, `fator_protecao`, `alvo_com`):
- Extrator de Gelo, Gerador de Oxigênio, Oficina e Laboratório deixam os problemas de água, oxigênio, manutenção e ataque mais raros (peso × 0,4), e a câmera do problema vai até a obra.
- A Enfermaria libera a categoria **Saúde da colônia**, e o Laboratório libera a **Descoberta do dia** (cartão azul "DESCOBERTA!" no vídeo, sem luz de alarme).
- O Abrigo vira o lugar da tempestade solar. Cada obra também tem problemas próprios (`requer`).
- No Mundo ao vivo: com a Cantina pronta, os colonos almoçam juntos; com a Oficina pronta, dois robôs levam material até a obra do dia.

O desenho das obras 4 a 10 é o mesmo no vídeo (`diretor.js`) e no site (`lib/colonia-arte.ts`): `PINTORES` e `predioEmObra` (o prédio sobe conforme o progresso, com andaime). Mudou um? Mude o outro.

### Clima de Marte e Problema do Dia

Para os episódios diários não ficarem repetitivos, cada um tem (do episódio 2 em diante), além da obra:

- **Estação marciana** (`marte.json` → `estacoes`): primavera, verão, outono e inverno, na ordem da Terra, comprimidas e bem mais extremas. O episódio 1 foi o pouso, no começo da primavera. Cada estação dura `episodios` episódios, proporcional à de Marte de verdade (primavera 34, verão 31, outono 25, inverno 27: um ano marciano a cada 117 episódios). A temperatura segue a estação: a primavera esquenta, o outono esfria, e o inverno chega a -125 °C. A abertura fala a estação, o dia e a temperatura, e o selo do topo do vídeo mostra `EP 12 · INVERNO · DIA 8 · -115°C`. No vídeo: poeira normal na primavera, tempestade alaranjada no verão, vento em riscos no outono e neve de gelo seco no inverno.
- **Problema do Dia** (`marte.json` → `problemas`, lógica em `eventos.py`): água, oxigênio, manutenção, ataque selvagem e clima. O alerta entra antes da Missão do Dia e a solução depois dela. **Não mexe no tempo das obras.** Quem resolve, em 3 de cada 4 episódios, é um colono de verdade, chamado pelo nome, e a câmera vai até a casa dele.
  - O mesmo problema não volta antes de 8 episódios, e a mesma categoria nunca cai dois dias seguidos. O histórico vem dos `roteiro.json` de `saida/`.
  - `peso` define a chance de cada problema por estação (os de clima são da sua estação), e `requer` faz o problema só aparecer depois que a obra existe (ex.: poeira nos painéis só com a Fazenda Solar pronta).
  - Para criar um problema novo, é só acrescentar no `marte.json`: 2 falas de alerta e 2 de solução, com `{heroi}`, `{temp}` e `{estacao}`.

```
python eventos.py --de 2 --ate 40    # mostra estação, temperatura e problema de cada episódio
```

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

Isso grava `publicado_em` em `episodios` (vira o corte de "novos desde o último episódio") e grava até onde a obra da missão chegou (`obra_progresso` do roteiro). Ela só fica concluída ao chegar a 100%. O botão 🚀 Publicar do painel faz o mesmo.

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
