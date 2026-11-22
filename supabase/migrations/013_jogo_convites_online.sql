-- 013 — Online agora, convites por colono, moedas/XP, missões, minigames (corações e trava de 12 h) e loja de moedas.
-- Rode numa aba NOVA do SQL Editor. Pode rodar de novo sem problema. Tudo só é lido/escrito pelo servidor
-- (service role): o público não acessa estas tabelas direto.

-- ---------------------------------------------------------------- online agora
create table if not exists presenca (
  visitante  text primary key,                 -- id do navegador (cookie) — ou NMxxxxxx de quem está logado
  codigo     text,                             -- colono logado (null = visitante)
  visto_em   timestamptz not null default now()
);
create index if not exists presenca_visto on presenca (visto_em desc);

-- ---------------------------------------------------------------- convites
alter table personagens add column if not exists convidado_por bigint references personagens(id) on delete set null;
create index if not exists personagens_convidado_por on personagens (convidado_por);

-- ---------------------------------------------------------------- moedas e XP (extrato: nada some sem registro)
create table if not exists jogo_saldo (
  personagem_id  bigint primary key references personagens(id) on delete cascade,
  moedas         int not null default 0 check (moedas >= 0),
  xp             int not null default 0 check (xp >= 0),
  atualizado_em  timestamptz not null default now()
);
create table if not exists jogo_extrato (
  id             bigserial primary key,
  personagem_id  bigint not null references personagens(id) on delete cascade,
  tipo           text not null check (tipo in ('missao','epica','minigame','loja','bonus','ajuste')),
  ref            text,                          -- id da missão, slug do minigame, item comprado...
  moedas         int not null default 0,
  xp             int not null default 0,
  created_at     timestamptz not null default now()
);
create index if not exists jogo_extrato_pessoa on jogo_extrato (personagem_id, created_at desc);
create index if not exists jogo_extrato_semana on jogo_extrato (created_at desc);
-- uma missão diária (ou épica semanal) só paga uma vez por período
create unique index if not exists jogo_extrato_missao_unica on jogo_extrato (personagem_id, tipo, ref)
  where tipo in ('missao','epica');

-- movimenta saldo + extrato numa transação só (saldo nunca fica negativo)
create or replace function jogo_movimentar(p_id bigint, p_tipo text, p_ref text, p_moedas int, p_xp int)
returns jogo_saldo language plpgsql as $$
declare s jogo_saldo;
begin
  insert into jogo_saldo (personagem_id) values (p_id) on conflict do nothing;
  update jogo_saldo set moedas = moedas + p_moedas, xp = xp + greatest(p_xp, 0), atualizado_em = now()
    where personagem_id = p_id returning * into s;
  if s.moedas < 0 then raise exception 'moedas insuficientes'; end if;
  insert into jogo_extrato (personagem_id, tipo, ref, moedas, xp) values (p_id, p_tipo, p_ref, p_moedas, greatest(p_xp, 0));
  return s;
end $$;
revoke execute on function jogo_movimentar(bigint, text, text, int, int) from public;
grant  execute on function jogo_movimentar(bigint, text, text, int, int) to service_role;

-- ---------------------------------------------------------------- minigames
create table if not exists minigames (
  slug          text primary key,
  nome          text not null,
  descricao     text,
  aprovado_em   timestamptz,                     -- aprovado no painel (testado)
  ativo         boolean not null default false,  -- ligado no site
  moedas_max    int not null default 30,         -- teto de moedas por partida
  partidas_dia  int not null default 3           -- partidas que rendem moedas por dia
);
insert into minigames (slug, nome, descricao, moedas_max) values
  ('laser',    'Laser de Precisão', 'Acerte o laser no alvo que se mexe. Errou, perde um coração.', 30),
  ('meteoros', 'Chuva de Meteoros', 'Desvie dos meteoros e pegue os cristais de gelo.', 30),
  ('reator',   'Estabilize o Reator', 'Toque quando a agulha estiver na faixa verde.', 30)
on conflict (slug) do nothing;

create table if not exists minigame_partidas (
  id              bigserial primary key,
  personagem_id   bigint not null references personagens(id) on delete cascade,
  minigame        text not null references minigames(slug),
  pontos          int not null default 0 check (pontos between 0 and 100000),
  resultado       text not null check (resultado in ('terminou','perdeu_coracoes','abandonou')),
  moedas          int not null default 0,
  created_at      timestamptz not null default now()
);
create index if not exists minigame_partidas_pessoa on minigame_partidas (personagem_id, minigame, created_at desc);

-- perdeu os 3 corações (ou saiu no meio): AQUELE minigame fica travado 12 h para a pessoa
create table if not exists minigame_travas (
  personagem_id  bigint not null references personagens(id) on delete cascade,
  minigame       text not null references minigames(slug),
  ate            timestamptz not null,
  primary key (personagem_id, minigame)
);

-- ---------------------------------------------------------------- loja de moedas (trajes, cores, especiais)
create table if not exists loja_moedas (
  slug         text primary key,
  nome         text not null,
  tipo         text not null check (tipo in ('cor','traje','especial')),
  preco        int not null check (preco > 0),
  traje        jsonb not null,        -- {"corpo","detalhe","calca","acessorios":[...]}, como fabrica/liderancas.json
  aprovado_em  timestamptz,           -- aprovado no painel (item e preço)
  ativo        boolean not null default false,
  ordem        int not null default 0
);
create table if not exists loja_moedas_compras (
  id             bigserial primary key,
  personagem_id  bigint not null references personagens(id) on delete cascade,
  item           text not null references loja_moedas(slug),
  preco          int not null,
  created_at     timestamptz not null default now(),
  unique (personagem_id, item)
);
alter table personagens add column if not exists traje_moedas text references loja_moedas(slug) on delete set null;

-- a view pública ganha o traje comprado com moedas (recria igual à 012 + traje_moedas)
drop function if exists buscar_personagens(text, int);
drop view if exists v_mundo_publico;
create or replace view v_mundo_publico as
  select codigo, nome_exibicao(nome) as nome, handle, handle_plataforma as plataforma,
         status, pos_x, pos_y, seed, sprite_url, cargo, lideranca, traje_moedas
  from personagens
  where not oculto;
create or replace function buscar_personagens(q text, lim int default 20)
returns setof v_mundo_publico
language sql stable
set search_path = public, extensions
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
revoke execute on function buscar_personagens(text, int) from public;
grant  execute on function buscar_personagens(text, int) to service_role;
revoke all on v_mundo_publico from anon, authenticated;

alter table presenca enable row level security;
alter table jogo_saldo enable row level security;
alter table jogo_extrato enable row level security;
alter table minigames enable row level security;
alter table minigame_partidas enable row level security;
alter table minigame_travas enable row level security;
alter table loja_moedas enable row level security;
alter table loja_moedas_compras enable row level security;
revoke all on presenca, jogo_saldo, jogo_extrato, minigames, minigame_partidas, minigame_travas,
              loja_moedas, loja_moedas_compras from anon, authenticated;
