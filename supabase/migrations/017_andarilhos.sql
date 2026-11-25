-- ANDARILHOS: quem comenta no episódio dizendo a profissão ("SIM + sou bombeira") entra na colônia sem casa e
-- sem cadastro, com o @ da rede e o cargo que o Claude entendeu do comentário. Fica andando pelo mapa (vídeo e
-- Mundo ao vivo) até se cadastrar no site: aí ganha a casinha e o cargo de verdade, e o andarilho é ligado ao
-- personagem (personagem_codigo) e some do mapa.
-- Quem grava: a fábrica, ao registrar a publicação do episódio (fabrica/episodio.py → registrar_andarilhos).

create table if not exists andarilhos (
  id bigserial primary key,
  rede text not null check (rede in ('youtube', 'instagram', 'tiktok')),
  handle text not null,
  cargo text,
  episodio int,                      -- episódio em que apareceu pela primeira vez
  comentario text,                   -- id do comentário que trouxe a pessoa
  seed int not null default (floor(random() * 2147483647))::int,   -- aparência do bonequinho
  personagem_codigo text,            -- preenchido quando a pessoa se cadastra no site
  criado_em timestamptz not null default now(),
  unique (rede, handle)              -- um andarilho por @ em cada rede (a fábrica já compara sem maiúsculas)
);

-- só o servidor (chave de serviço) lê e escreve
alter table andarilhos enable row level security;
