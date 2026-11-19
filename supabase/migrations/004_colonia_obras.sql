-- Estágio das obras da colônia (usado pela Fábrica de Vídeos em fabrica/).
-- Cada episódio tem uma "Missão do Dia" que avança a primeira obra não concluída (veja 005_obras_ritmo.sql).
-- Depois de publicar: python fabrica/episodio.py --registrar-publicacao N  (grava até onde a obra chegou)

create table if not exists colonia_obras (
  slug          text primary key,                         -- igual a fabrica/colonia.json
  nome          text not null,
  status        text not null default 'planejada' check (status in ('planejada', 'em_obra', 'concluida')),
  progresso     int  not null default 0 check (progresso between 0 and 100),
  episodio_id   bigint references episodios(id),
  atualizado_em timestamptz not null default now()
);

insert into colonia_obras (slug, nome, status) values
  ('fazenda-solar', 'Fazenda Solar',          'em_obra'),
  ('estufa',        'Estufa Hidropônica',     'planejada'),
  ('antena',        'Antena de Comunicação',  'planejada')
on conflict (slug) do nothing;

alter table colonia_obras enable row level security;
revoke all on colonia_obras from anon, authenticated;
