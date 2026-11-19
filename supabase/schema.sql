-- =====================================================================
-- Operação Marte Zero — esquema do banco (Supabase / Postgres)
-- Rode inteiro no Supabase → SQL Editor. É idempotente o suficiente
-- para a primeira instalação; mudanças futuras vão em supabase/migrations/.
-- =====================================================================

create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------
-- LINKS RASTREÁVEIS  (bio, descrição de episódio, story, comentário fixado)
--   site.com/l/<slug>  → registra o clique, marca a origem, redireciona
-- ---------------------------------------------------------------------
create table if not exists links (
  slug        text primary key,                -- ex.: ig-bio, tt-ep012, yt-ep012-desc
  destino     text not null default '/',       -- caminho interno ou URL completa
  plataforma  text not null,                   -- instagram | tiktok | youtube | whatsapp | outro
  campanha    text,                            -- ex.: ep012, lancamento, sorteio-natal
  episodio_id bigint,
  descricao   text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- EPISÓDIOS
-- ---------------------------------------------------------------------
create table if not exists episodios (
  id            bigserial primary key,
  numero        int unique not null,
  titulo        text not null,
  publicado_em  timestamptz,
  url_instagram text,
  url_tiktok    text,
  url_youtube   text,
  created_at    timestamptz not null default now()
);

alter table links drop constraint if exists links_episodio_fk;
alter table links add constraint links_episodio_fk foreign key (episodio_id) references episodios(id);

-- ---------------------------------------------------------------------
-- PERSONAGENS  (cada cadastro = um personagem no mundo)
-- ---------------------------------------------------------------------
-- Casa de cada colono: bairro em espiral em volta da base (veja migrations/007_bairro_espiral.sql)
create or replace function casa_pos(p_id bigint) returns int[]
language plpgsql immutable parallel safe
as $$
declare
  r0 constant int := 10;      -- primeiro anel com casas
  m bigint; r bigint; t bigint; u bigint; v bigint;
begin
  m := (p_id - 1) + (2 * r0 - 1)::bigint * (2 * r0 - 1);
  r := (floor(sqrt(m::numeric))::bigint + 1) / 2;
  t := m - (2 * r - 1) * (2 * r - 1);
  if    t < r     then u := t;             v := r;
  elsif t < 3 * r then u := r;             v := r - (t - r);
  elsif t < 5 * r then u := r - (t - 3*r); v := -r;
  elsif t < 7 * r then u := -r;            v := -r + (t - 5*r);
  else                 u := -r + (t - 7*r); v := r;
  end if;
  -- rua a cada 3 lotes: o lote u vira a casa u + floor(u/3)
  return array[(5 + u + floor(u / 3.0))::int, (-8 + v + floor(v / 3.0))::int];
end
$$;

create table if not exists personagens (
  id                 bigserial primary key,
  -- código público e posição fixa no mundo derivam do id (nunca colidem)
  codigo             text generated always as ('NM' || lpad(id::text, 6, '0')) stored,
  pos_x              int  generated always as ((casa_pos(id))[1]) stored,
  pos_y              int  generated always as ((casa_pos(id))[2]) stored,

  nome               text not null,
  nome_busca         text not null,              -- minúsculo, sem acento (gerado no app)
  handle             text not null,              -- @ sem o "@", minúsculo
  handle_plataforma  text not null check (handle_plataforma in ('instagram','tiktok','youtube')),
  whatsapp           text not null unique,       -- formato E.164: +5511999998888
  whatsapp_chave     text generated always as (right(regexp_replace(whatsapp, '\D', '', 'g'), 11)) stored,

  consentimento_lgpd boolean not null check (consentimento_lgpd),
  consentimento_em   timestamptz not null default now(),
  aceita_whatsapp    boolean not null default false,   -- opt-in p/ avisos (ex.: "você apareceu no ep. 12")

  status             text not null default 'fila' check (status in ('fila','desenhado','estreou')),
  oculto             boolean not null default false,   -- moderação: some do mundo público
  seed               int not null default floor(random() * 2147483647)::int,  -- gera o sprite provisório
  sprite_url         text,                              -- arte final, quando desenhada
  episodio_estreia_id bigint references episodios(id),

  -- ORIGEM — primeiro toque (de onde a pessoa veio da 1ª vez)
  visitante_id       uuid,
  origem_source      text,     -- instagram | tiktok | youtube | google | direto ...
  origem_medium      text,     -- social | bio | ads | organico ...
  origem_campaign    text,     -- ep012 ...
  origem_content     text,
  origem_link_slug   text,     -- slug de links (sem FK de propósito: apagar um link não quebra cadastros)
  origem_referer     text,     -- domínio que mandou
  origem_landing     text,     -- 1ª página vista
  origem_em          timestamptz,
  -- ORIGEM — último toque antes de se cadastrar
  ultimo_source      text,
  ultimo_campaign    text,
  ultimo_link_slug   text,

  created_at         timestamptz not null default now(),
  unique (handle_plataforma, handle)
);

create index if not exists personagens_nome_trgm   on personagens using gin (nome_busca gin_trgm_ops);
create index if not exists personagens_handle_trgm on personagens using gin (handle gin_trgm_ops);
create index if not exists personagens_pos         on personagens (pos_y, pos_x);
create index if not exists personagens_wpp_chave   on personagens (whatsapp_chave);
create index if not exists personagens_visitante   on personagens (visitante_id);
create index if not exists personagens_created     on personagens (created_at);
create index if not exists personagens_origem      on personagens (origem_source, origem_campaign);

-- ---------------------------------------------------------------------
-- CLIQUES  (links rastreáveis e cliques em "comprar")
-- ---------------------------------------------------------------------
create table if not exists cliques (
  id            bigserial primary key,
  tipo          text not null check (tipo in ('link','checkout')),
  alvo          text not null,           -- slug do link ou do produto
  visitante_id  uuid,
  source        text,
  campaign      text,
  referer       text,
  user_agent    text,
  created_at    timestamptz not null default now()
);
create index if not exists cliques_alvo on cliques (tipo, alvo, created_at);

-- ---------------------------------------------------------------------
-- LOJA
-- ---------------------------------------------------------------------
create table if not exists produtos (
  id               bigserial primary key,
  slug             text unique not null,         -- ex.: capacete-ep012
  nome             text not null,
  descricao        text,
  preco_centavos   int not null check (preco_centavos >= 0),
  imagem_url       text,                         -- pixel art do item
  checkout_url     text not null,                -- link de checkout da Cakto
  cakto_product_id text,                         -- id do produto na Cakto (casa o webhook)
  episodio_id      bigint references episodios(id),
  ativo            boolean not null default true,
  ordem            int not null default 0,
  created_at       timestamptz not null default now()
);

-- Itens grátis (resgate no site, 1 por personagem) — mesmo conteúdo da migração 002
alter table produtos add column if not exists tipo text not null default 'pago';
alter table produtos drop constraint if exists produtos_tipo_check;
alter table produtos add constraint produtos_tipo_check check (tipo in ('pago', 'gratis'));
alter table produtos alter column checkout_url drop not null;
alter table produtos drop constraint if exists produtos_checkout_pago;
alter table produtos add constraint produtos_checkout_pago check (tipo = 'gratis' or checkout_url is not null);
-- Opções e personalização — mesmo conteúdo da migração 003
alter table produtos add column if not exists opcoes jsonb;
alter table produtos add column if not exists pergunta_texto text;
alter table cliques  add column if not exists opcao text;

create table if not exists pedidos (
  id               bigserial primary key,
  cakto_order_id   text unique not null,
  produto_id       bigint references produtos(id),
  personagem_id    bigint references personagens(id),
  status           text not null,                -- aprovado | pendente | recusado | reembolsado | chargeback | cancelado
  valor_centavos   int not null default 0,
  metodo           text,                         -- pix | cartao | boleto
  cliente_nome     text,
  cliente_email    text,
  cliente_telefone text,
  utm_source       text,
  utm_campaign     text,
  src_visitante    text,                         -- nosso visitante_id repassado ao checkout
  created_at       timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
);
alter table pedidos add column if not exists opcao text;
alter table pedidos add column if not exists texto_personalizado text;
alter table pedidos add column if not exists personalizado_em timestamptz;
alter table pedidos add column if not exists cliente_telefone_chave text
  generated always as (right(regexp_replace(coalesce(cliente_telefone, ''), '\D', '', 'g'), 11)) stored;
create index if not exists pedidos_tel_chave  on pedidos (cliente_telefone_chave);
create index if not exists cliques_visitante  on cliques (visitante_id, created_at);
create index if not exists pedidos_personagem on pedidos (personagem_id);
create index if not exists pedidos_status     on pedidos (status, created_at);

create table if not exists resgates (
  id             bigserial primary key,
  produto_id     bigint not null references produtos(id),
  personagem_id  bigint not null references personagens(id) on delete cascade,
  texto          text not null,
  status         text not null default 'pendente' check (status in ('pendente', 'aprovado', 'recusado')),
  created_at     timestamptz not null default now(),
  revisado_em    timestamptz,
  unique (produto_id, personagem_id)
);
create index if not exists resgates_status on resgates (status, created_at);

-- Todo webhook recebido fica guardado cru (auditoria + reprocessamento)
create table if not exists webhook_eventos (
  id          bigserial primary key,
  fonte       text not null,
  evento      text,
  payload     jsonb not null,
  processado  boolean not null default false,
  erro        text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- SEGUIDORES (uma foto por plataforma por dia)
-- ---------------------------------------------------------------------
create table if not exists seguidores_snapshot (
  plataforma  text not null check (plataforma in ('instagram','tiktok','youtube')),
  data        date not null,
  seguidores  int  not null,
  fonte       text not null default 'api',   -- api | manual
  created_at  timestamptz not null default now(),
  primary key (plataforma, data)
);

-- Tokens que giram (ex.: refresh token do TikTok)
create table if not exists integracoes (
  chave          text primary key,
  valor          text not null,
  atualizado_em  timestamptz not null default now()
);

-- =====================================================================
-- FUNÇÕES PÚBLICAS (só devolvem campos seguros — nunca WhatsApp)
-- =====================================================================
create or replace function nome_exibicao(n text) returns text
language sql immutable as $$
  select split_part(trim(n), ' ', 1)
         || coalesce(nullif(' ' || left(split_part(trim(n), ' ', 2), 1) || '.', ' .'), '')
$$;

create or replace view v_mundo_publico as
  select codigo, nome_exibicao(nome) as nome, handle, handle_plataforma as plataforma,
         status, pos_x, pos_y, seed, sprite_url
  from personagens
  where not oculto;

-- q já chega normalizado (minúsculo, sem acento) do app
create or replace function buscar_personagens(q text, lim int default 20)
returns setof v_mundo_publico
language sql stable
set search_path = public, extensions   -- no Supabase o pg_trgm pode morar em "extensions"
as $$
  select v.*
  from personagens p
  join v_mundo_publico v on v.codigo = p.codigo
  where not p.oculto
    and (
      p.codigo = upper(q)
      or p.handle like ltrim(q, '@') || '%'
      or p.nome_busca like q || '%'
      or p.nome_busca % q
    )
  order by (p.codigo = upper(q)) desc,
           (p.handle = ltrim(q, '@')) desc,
           similarity(p.nome_busca, q) desc,
           p.id
  limit lim
$$;

-- =====================================================================
-- VIEWS DO PAINEL
-- =====================================================================
create or replace view v_kpis as
select
  (select count(*) from personagens)                                                as cadastros_total,
  (select count(*) from personagens
     where created_at >= (date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')) as cadastros_hoje,
  (select count(*) from personagens where created_at >= now() - interval '7 days')  as cadastros_7d,
  (select count(*) from personagens where status = 'estreou')                       as personagens_estreados,
  (select count(*) from pedidos where status = 'aprovado')                          as pedidos_aprovados,
  (select coalesce(sum(valor_centavos), 0) from pedidos where status = 'aprovado')  as receita_total_centavos,
  (select coalesce(sum(valor_centavos), 0) from pedidos
     where status = 'aprovado' and created_at >= now() - interval '30 days')        as receita_30d_centavos,
  (select count(distinct personagem_id) from pedidos
     where status = 'aprovado' and personagem_id is not null)                       as compradores_cadastrados,
  (select count(*) from cliques where created_at >= now() - interval '7 days')      as cliques_7d;

create or replace view v_cadastros_diarios as
select d::date as dia,
       (select count(*) from personagens p
         where (p.created_at at time zone 'America/Sao_Paulo')::date = d::date) as cadastros
from generate_series((now() at time zone 'America/Sao_Paulo')::date - 29,
                     (now() at time zone 'America/Sao_Paulo')::date, interval '1 day') d
order by dia;

create or replace view v_origens as
select coalesce(p.origem_source, 'direto')   as source,
       coalesce(p.origem_campaign, '—')      as campanha,
       count(distinct p.id)                  as cadastros,
       count(distinct pe.personagem_id)      as compradores,
       coalesce(sum(pe.valor_centavos), 0)   as receita_centavos
from personagens p
left join pedidos pe on pe.personagem_id = p.id and pe.status = 'aprovado'
group by 1, 2
order by cadastros desc;

create or replace view v_funil_links as
select l.slug, l.plataforma, l.campanha,
  (select count(*) from cliques c where c.tipo = 'link' and c.alvo = l.slug)        as cliques,
  (select count(*) from personagens p where p.origem_link_slug = l.slug)            as cadastros,
  (select count(*) from pedidos pe join personagens p on p.id = pe.personagem_id
     where p.origem_link_slug = l.slug and pe.status = 'aprovado')                  as pedidos,
  (select coalesce(sum(pe.valor_centavos), 0) from pedidos pe join personagens p on p.id = pe.personagem_id
     where p.origem_link_slug = l.slug and pe.status = 'aprovado')                  as receita_centavos
from links l
order by cadastros desc, cliques desc;

drop view if exists v_produtos_desempenho;  -- drop + create: aceita mudar colunas ao rodar de novo
create view v_produtos_desempenho as
select pr.slug, pr.nome, pr.preco_centavos, pr.ativo, pr.tipo,
  (select count(*) from cliques c where c.tipo = 'checkout' and c.alvo = pr.slug)         as cliques_comprar,
  (select count(*) from pedidos pe where pe.produto_id = pr.id and pe.status = 'aprovado') as vendas,
  (select count(*) from resgates r where r.produto_id = pr.id and r.status <> 'recusado')  as resgates,
  (select coalesce(sum(valor_centavos), 0) from pedidos pe
     where pe.produto_id = pr.id and pe.status = 'aprovado')                              as receita_centavos
from produtos pr
order by pr.ordem;

create or replace view v_seguidores as
select distinct on (s.plataforma)
  s.plataforma, s.data, s.seguidores, s.fonte,
  s.seguidores - (select s2.seguidores from seguidores_snapshot s2
                   where s2.plataforma = s.plataforma and s2.data <= s.data - 7
                   order by s2.data desc limit 1) as delta_7d
from seguidores_snapshot s
order by s.plataforma, s.data desc;

create or replace view v_status_personagens as
select status, count(*) as total from personagens group by status;

-- =====================================================================
-- SEGURANÇA
-- Todo acesso passa pelo servidor do site com a service role.
-- RLS ligado e sem políticas = a chave pública (anon) não lê nada.
-- =====================================================================
alter table links               enable row level security;
alter table episodios           enable row level security;
alter table personagens         enable row level security;
alter table cliques             enable row level security;
alter table produtos            enable row level security;
alter table pedidos             enable row level security;
alter table webhook_eventos     enable row level security;
alter table seguidores_snapshot enable row level security;
alter table integracoes         enable row level security;
alter table resgates            enable row level security;

-- Views e funções ignoram RLS, então tira o acesso da API pública a elas também
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
-- funções nascem executáveis por PUBLIC; deixa só a service role
revoke execute on function buscar_personagens(text, int) from public;
revoke execute on function nome_exibicao(text) from public;
grant  execute on function buscar_personagens(text, int) to service_role;
grant  execute on function nome_exibicao(text) to service_role;
revoke execute on function casa_pos(bigint) from public;
grant  execute on function casa_pos(bigint) to service_role;
