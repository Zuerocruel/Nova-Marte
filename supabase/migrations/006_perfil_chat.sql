-- Site: perfil do colono, feitos (conquistas), chat dos inscritos e resumo de cada episódio.
-- Rode DEPOIS da 005_obras_ritmo.sql. Tudo aqui só é lido/escrito pelo servidor (service role).

-- Resumo do episódio para o site ("hoje na colônia"): estação, temperatura e problema do dia.
-- Gravado pela fábrica ao publicar (python fabrica/episodio.py --registrar-publicacao N / botão 🚀 do painel).
alter table episodios add column if not exists resumo jsonb;

-- Feitos de cada colono (ex.: herói do problema do dia). Outras conquistas do perfil são calculadas
-- na hora (pioneiro, estreia, compras, dias na colônia, mensagens no chat).
create table if not exists feitos (
  id             bigserial primary key,
  personagem_id  bigint not null references personagens(id) on delete cascade,
  tipo           text   not null,                -- heroi | ...
  titulo         text   not null,                -- ex.: "Cano de água congelado"
  episodio       int,                            -- número do episódio
  created_at     timestamptz not null default now(),
  unique (personagem_id, tipo, episodio)
);
create index if not exists feitos_personagem on feitos (personagem_id, created_at desc);

-- Chat da colônia: só colonos cadastrados escrevem (sessão do site); moderação no /painel.
create table if not exists chat_mensagens (
  id             bigserial primary key,
  personagem_id  bigint not null references personagens(id) on delete cascade,
  texto          text   not null check (char_length(texto) between 1 and 280),
  oculto         boolean not null default false,  -- moderação
  created_at     timestamptz not null default now()
);
create index if not exists chat_recentes on chat_mensagens (id desc) where not oculto;
create index if not exists chat_por_personagem on chat_mensagens (personagem_id, created_at desc);

alter table feitos enable row level security;
alter table chat_mensagens enable row level security;
revoke all on feitos, chat_mensagens from anon, authenticated;
