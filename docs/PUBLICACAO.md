# Publicação automática (Capítulo 09)

O botão **📤 Publicar nas redes** (painel local → 🎬 Episódios) posta o episódio aprovado:

| Rede | Como | Script |
|---|---|---|
| Instagram (Reels) | celular Android via ADB | `producao/celular.py` |
| TikTok | celular Android via ADB | `producao/celular.py` |
| YouTube Shorts | webhook do n8n, agendado para daqui a +30 min | `producao/youtube.py` |

O log aparece ao vivo na **Fila de produção**. O status de cada rede aparece no card do episódio e na aba Divulgação.

## Travas (por que nunca sai post duplicado)

- Só posta se o **episódio** e a **copy daquela rede** estiverem aprovados no painel, e se o vídeo for o **com voz**.
- Copies fora das regras não podem ser aprovadas: **menos de 15 hashtags**. No Instagram e no TikTok **não pode ter link na legenda** (use "link na bio"); no YouTube também **não pode ter link na descrição** enquanto o canal não liberar link externo (veja abaixo).
- Cada rede tem um status, guardado em `producao/dados/publicacoes.json`:

| Status | Significa | Reenvia sozinho? |
|---|---|---|
| — pendente | nunca tentou | — |
| ✖ falhou antes de publicar | deu erro **antes** do toque final ou do envio | pode clicar 📤 de novo |
| ⏳ enviando | tocou em publicar ou enviou ao n8n e ainda não confirmou | **não** |
| ✅ publicado | confirmado no app | **não** |
| 🕒 agendado | o n8n aceitou e agendou | **não** |
| ⚠ conferir | algo falhou **depois** do toque final ou do envio: **pode ter publicado** | **não** |

- Para postar de novo uma rede ⚠ / ⏳ / ✅ / 🕒: **abra o app, confira** e só então clique em **Liberar** no painel.
- Só roda uma postagem por vez: o painel e o Agendador de Tarefas não postam ao mesmo tempo.
- No TikTok o script **nunca** toca em "Seu Story"/"Story". O botão final só pode ser tocado na etapa final.

## Celular (Instagram e TikTok)

### Preparar uma vez
1. Instale o ADB no PC: `winget install --id Google.PlatformTools -e` (feche e abra o terminal depois).
2. No celular, ative **Opções do desenvolvedor**: Configurações → Sobre o telefone → toque 7× em "Número da versão".
3. Em Opções do desenvolvedor, ligue:
   - **Depuração USB**;
   - **Permanecer ativo**, para a tela não apagar no cabo;
   - em Xiaomi/Redmi, também **Depuração USB (configurações de segurança)**. Sem ela, a MIUI ignora os toques vindos do PC (o `--checar` mostra ❌ em "Toques pelo PC").
4. Conecte no USB e aceite **"Permitir depuração USB"** no celular (marque "sempre permitir").
5. Instale o app **Clipper** (`ca.zgrs.clipper`). Ele é o que põe a legenda com emojis na área de transferência do Android. Ele não está na Play Store: use o APK do projeto oficial (github.com/majido/clipper, release v1.2.1, 10.143 bytes, não pede nenhuma permissão).
   - Se o `adb install clipper.apk` falhar no Xiaomi (`VERIFICATION_FAILURE` ou `USER_RESTRICTED`), ligue **Instalar via USB** nas Opções do desenvolvedor. Também dá para copiar o APK para a pasta Download do celular (`adb push clipper.apk /sdcard/Download/`) e instalar tocando nele pelo Gerenciador de arquivos.
   - Abra o Clipper uma vez depois de instalar.
6. Deixe o Instagram e o TikTok **logados** na conta da série.
7. Dê aos dois apps a permissão **Armazenamento** (ou "Fotos e vídeos"): Configurações → Apps → Instagram/TikTok → Permissões. Sem ela, o app abre o Compartilhar e fecha na hora, sem mostrar o vídeo.
8. Teste com `python producao/celular.py --checar`. Tudo precisa aparecer com ✅.

### Calibrar (obrigatório antes da primeira postagem de verdade)
Os botões do Instagram e do TikTok mudam de nome conforme a versão e o idioma do app. O script procura os nomes mais comuns em português e inglês, mas **só foi testado com telas simuladas**.
1. Aprove um episódio e as copies.
2. Rode o **🧪 Ensaio**, ou `python producao/celular.py --episodio N --ensaio`. Ele faz tudo, **menos** o toque final, e depois descarta o rascunho.
3. Acompanhe no celular e leia o log. Se travar em alguma tela, o log mostra o texto que estava nela: me mande e eu ajusto os padrões no topo de `celular.py` (`AVANCAR`, `IG`, `TT`).
4. Prints de cada tentativa ficam em `producao/dados/celular/`.

### Comandos
```
python producao/celular.py --checar
python producao/celular.py --episodio 3 --ensaio
python producao/celular.py --episodio 3                 # Instagram + TikTok
python producao/celular.py --episodio 3 --so tiktok
```

### Conteúdo extra (vídeos em primeira pessoa)

No painel, card do episódio → **Conteúdo extra** → 🎨 Gerar imagens e POVs. Cada vídeo em primeira pessoa
tem a legenda editável e o próprio ✅ Aprovar; o 📤 Publicar usa o mesmo celular e as mesmas travas do
episódio (aprovado, vídeo não mudou depois da aprovação, legenda sem link, nada reenviado sozinho, "conferir"
quando não dá para garantir). O status fica em `publicacoes.json` com a chave `N-pov_<cena>` (ex.: `2-pov_obra`).

    python celular.py --episodio 2 --extra pov_obra --ensaio

Thumbnail, capa e carrossel ficam em `fabrica/saida/epNNN/imagens/` (o painel mostra e deixa baixar);
por enquanto são postados à mão.

## YouTube (n8n)

1. No `.env.local`, preencha:
   - `N8N_WEBHOOK_PUBLICAR`: URL do webhook de produção, com `https://`;
   - `N8N_PAINEL_CHAVE`: o valor que o fluxo confere no cabeçalho `X-Painel-Chave`.
2. Teste com `python producao/youtube.py --checar`.

O que o script faz:
- **Compacta** o vídeo para `fabrica/saida/epNNN/episodio_yt.mp4`, abaixo de 15 MB (limite do webhook). Usa FFmpeg em 2 passadas e mantém 1080×1920: no episódio 1, 24 MB viraram 13,7 MB com SSIM 0,995, praticamente igual ao original. Leva uns 4 minutos e é reaproveitado depois.
- **Envia** um POST `multipart/form-data`. Veja os campos abaixo ou rode `python producao/youtube.py --contrato`.
- **Agenda** para daqui a 30 minutos, arredondado para cima. O fluxo recusa menos de 20, e o script também.

| Campo | Conteúdo |
|---|---|
| `video` | arquivo `episodio_yt.mp4` (`video/mp4`, < 15 MB) |
| `titulo` | até 100 caracteres, sem `<` `>` |
| `descricao` | até 5000 caracteres; sem link (a não ser com `YOUTUBE_LINK_NA_DESCRICAO=1`); no máximo 14 hashtags |
| `tags` | separadas por vírgula, até 500 caracteres |
| `publicar_em` | ISO 8601 com fuso de Brasília, ex.: `2026-11-19T19:30:00-03:00` |
| `publicar_em_utc` | o mesmo horário em UTC, ex.: `2026-11-19T22:30:00Z` |
| `episodio` | número do episódio |
| `chave` | identificador único do envio (o fluxo pode usar para recusar duplicado) |
| cabeçalho `X-Painel-Chave` | valor de `N8N_PAINEL_CHAVE` |

### Link na descrição
Canal novo no YouTube não aceita link externo na descrição: o Studio obriga a tirar. Por isso a copy do YouTube diz "link no perfil do canal 👆" e o painel recusa aprovar uma descrição com link. Coloque o link `/l/yt-bio` nos links do canal (Personalizar canal → Informações básicas → Links).

Quando o YouTube liberar link para o canal (Studio → Configurações → Canal → Recursos avançados, que pede verificação por telefone e um tempo de histórico), coloque `YOUTUBE_LINK_NA_DESCRICAO=1` no `.env.local`. A partir daí, as copies novas trazem o link `/l/yt-epNNN`.

**Se o seu fluxo usa outros nomes de campo**, ajuste a função `montar()` em `producao/youtube.py` ou o nó do n8n.

Como funciona a confirmação:
- O fluxo valida os dados e o canal e responde **202 "recebido"** antes de subir o vídeo. O proxy do n8n Cloud derruba (HTTP 502) qualquer resposta que demore uns 100 s, e o upload passa disso.
- O resultado do upload fica guardado no n8n pela `chave` do envio. O `youtube.py` consulta `GET .../operacao-marte-zero/status?chave=…` (mesmo cabeçalho `X-Painel-Chave`) a cada 15 s, por até 20 min. A URL sai da de publicar, trocando `/publicar` por `/status`; para usar outra, preencha `N8N_WEBHOOK_STATUS`.

| Resposta | Status no painel |
|---|---|
| status `agendado` (com `video_id` e `url`) | 🕒 agendado |
| status `falhou` ou `conferir` | ⚠ conferir: veja no Studio; se não estiver lá, **Liberar** e reenviar (o fluxo aceita a mesma chave depois de `falhou`) |
| continua `desconhecido` depois de 20 min | ⚠ conferir |
| **4xx** no envio (fora 408/409) | ✖ falhou: o n8n recusou, nada foi agendado |
| 409 (duplicado), 5xx, 408, conexão caindo no meio | ⚠ conferir |
| **n8n fora do ar** (a conexão nem abriu) | ✖ falhou: nada foi enviado |

`python producao/youtube.py --checar` também testa o webhook de status. Se der 404, o n8n ainda está com a versão antiga do fluxo.

### Atualizar o fluxo no n8n
1. Abra o fluxo no n8n, selecione tudo (Ctrl+A) e apague (Delete).
2. Abra `n8n/publicar-youtube-shorts.json` num editor, copie tudo e cole no canvas (Ctrl+V). Colar no **mesmo** fluxo mantém a memória de duplicados.
3. Escolha de novo as credenciais: **Header Auth** em "Webhook do painel" e "Webhook de status", e **YouTube OAuth** em "YouTube: canal conectado" e "YouTube: enviar e agendar".
4. Salve e clique em **Publish**. Depois rode `python producao/youtube.py --checar`.

## Agendador de Tarefas do Windows

`producao/postar_avulso.py` posta fora do painel, **um episódio por execução**: o mais antigo que está aprovado e registrado e tem a rede pendente.

```
python producao/postar_avulso.py --listar               # mostra o que está pendente (não faz nada)
python producao/postar_avulso.py --celular --ensaio     # simula
python producao/postar_avulso.py --celular              # Instagram + TikTok
python producao/postar_avulso.py --youtube
```

Para criar a tarefa diária, rode `producao\agendar_postagem.bat` (19:00) ou `producao\agendar_postagem.bat 18:30`.

| Comando | O que faz |
|---|---|
| `agendar_postagem.bat testar` | roda agora, em ensaio |
| `agendar_postagem.bat remover` | apaga a tarefa |

Os logs ficam em `producao/dados/logs/`. A tarefa só roda com você logado no Windows e o celular no USB, desbloqueado.
