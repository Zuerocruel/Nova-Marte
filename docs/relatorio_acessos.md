# Relatório de acessos — 22/11/2026

Fonte: tabela `cliques` do Supabase (todo acesso a um link rastreável `/l/...`, com navegador e site de origem) e a
origem gravada em cada cadastro (`personagens.origem_*`). Desde hoje, o painel separa robôs de visitas reais
(aba 📊 Visão geral → "Acessos pelos links").

## 6. "7 pessoas acessaram pelo link do YouTube do episódio 1 e não se cadastraram"

**Conclusão: não foram 7 pessoas. Foi 1 acesso, e de robô.**

- O link do ep. 1 no YouTube (`/l/yt-ep001`) foi aberto **uma vez** no banco: 20/11 às 14:28 (horário de Brasília),
  com o navegador `Mozilla/5.0 (compatible)`. Esse "navegador" sem nome é o verificador de links do YouTube/Google:
  no mesmo minuto ele abriu também os links do ep. 2 e do POV do ep. 2, sem nenhum site de origem.
- Somando TODOS os links do YouTube há 13 acessos, e **12 são robôs**:
  - 3 do `Google-Safety` (robô do Google declarado, que checa se o link é seguro);
  - 3 do verificador genérico `Mozilla/5.0 (compatible)`;
  - 6 em "rajadas": 2 acessos no mesmo segundo, sem origem, com Chrome de PC de versões diferentes. Acontecem
    sempre logo depois de o YouTube publicar/agendar a descrição (05:48, 16:28 e 18:00), ou seja, o YouTube
    conferindo o link;
  - 1 `curl` (teste feito daqui).
- **O único acesso real pelo YouTube foi o link do canal (`/l/yt-bio`)**, num Android com Firefox em 21/11 às 08:23,
  e essa pessoa **se cadastrou** 4 minutos depois (NM000008). Conversão real do YouTube até agora: 1 de 1.
- Se o número 7 veio de outro painel (ex.: Vercel Analytics), ele conta esses verificadores como visitas. Eles não
  são gente e nunca vão se cadastrar.

**Recomendações**
1. Olhar sempre a coluna "reais" do painel, não o total.
2. O que traz gente de verdade é o link da bio/canal (Instagram e YouTube trouxeram 1 cadastro cada). Fixar o
   comentário com o link em todo Short ajuda (texto pronto em `docs/textos_divulgacao.txt`).
3. 5 dos 9 cadastros vieram "direto" (digitaram o endereço ou alguém mandou o link): o link de convite por colono
   (item 2 do checkup) vai mostrar quem trouxe quem.

## 7. UTMs do Facebook e do Google: são robôs?

- No nosso banco **não existe nenhum cadastro nem acesso com utm do Facebook ou do Google**: as origens gravadas são
  direto (5), vercel.com (2, testes pelo painel da Vercel), Instagram (1) e YouTube (1).
- Os acessos "do Google" que aparecem são o `Google-Safety` e os verificadores do YouTube (acima). Os "do
  Facebook" costumam ser o `facebookexternalhit` / `meta-externalagent`, robôs da Meta que abrem o link para montar a
  prévia quando ele é colado no Instagram/WhatsApp/Facebook. **Sim, são robôs.**
- Se você viu esses UTMs no Vercel Analytics: lá o "referrer" `facebook.com`/`google.com` aparece também quando o
  Instagram abre o site no navegador interno (ele se identifica como Facebook). Esses podem ser reais; os do
  Google, sem cadastro e sem tempo na página, são verificadores.

**Feito no painel:** a Visão geral agora mostra cada acesso com 👤 real ou 🤖 robô e o motivo (robô declarado,
navegador genérico, rajada sem origem). As visitas dos gráficos e totais contam só as reais.
Resultado hoje: **15 acessos → 2 reais e 13 robôs**.
