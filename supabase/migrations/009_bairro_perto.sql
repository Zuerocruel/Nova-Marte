-- Bairro colado no Módulo de Pouso (as casas ficavam a 13 casas da base, longe demais).
-- Rode DEPOIS da 008_cargos_nick.sql. As casas dos colonos atuais mudam de lugar UMA vez.
--
-- A mesma conta está em lib/mundo.ts (casaDoId) e em fabrica/episodio.py (casa_do_id):
--   * "lotes" numa espiral quadrada em volta do centro (5,-8) = centro do Módulo de Pouso, agora a partir
--     do anel 2 (logo em volta da base);
--   * a cada 3 lotes entra uma rua de 1 casa: quarteirões de 3x3 casas;
--   * lote que cai em cima (ou a até 2 casas) da base, da praça, de uma obra (mesmo planejada) ou da trilha
--     é PULADO: o próximo colono fica no próximo lote livre. Os retângulos abaixo saem de
--     fabrica/colonia.json (x-2, y-2, x+w+2, y+h+2; fim exclusivo). Mudou o mapa? Mude aqui também.
--   * além do anel 12 nada é reservado: a conta volta a ser direta (sem laço).

create or replace function casa_do_lote(m bigint) returns int[]
language plpgsql immutable parallel safe
as $$
declare
  r bigint; t bigint; u bigint; v bigint;
begin
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

create or replace function casa_reservada(x int, y int) returns boolean
language sql immutable parallel safe
as $$
  select exists (
    select 1 from (values
      (1, -12, 9, -4),     -- Módulo de Pouso
      (1, -1, 10, 6),      -- Praça da Colônia
      (8, -13, 18, -4),    -- fazenda-solar
      (-6, -13, 3, -5),    -- estufa
      (5, -18, 12, -10),   -- antena
      (-7, -7, 1, 0),      -- extrator-gelo
      (9, -6, 16, 1),      -- gerador-oxigenio
      (-8, -18, 1, -11),   -- oficina
      (7, -2, 15, 5),      -- cantina
      (-4, -2, 3, 5),      -- enfermaria
      (-2, -22, 6, -15),   -- abrigo
      (9, -20, 17, -13),   -- laboratorio
      (5, -6, 6, 1)        -- trilha do módulo até a praça
    ) as r(x0, y0, x1, y1)
    where x >= r.x0 and x < r.x1 and y >= r.y0 and y < r.y1
  )
$$;

create or replace function casa_pos(p_id bigint) returns int[]
language plpgsql immutable parallel safe
as $$
declare
  r0   constant int := 2;      -- primeiro anel com casas
  rmax constant int := 12;     -- além deste anel nada é reservado
  m0   bigint := (2 * r0 - 1)::bigint * (2 * r0 - 1);
  mfim bigint := (2 * rmax + 1)::bigint * (2 * rmax + 1);
  livres bigint := 0; m bigint; c int[];
begin
  for m in m0 .. mfim - 1 loop
    c := casa_do_lote(m);
    if not casa_reservada(c[1], c[2]) then
      livres := livres + 1;
      if livres = greatest(p_id, 1) then return c; end if;
    end if;
  end loop;
  return casa_do_lote(mfim + (p_id - livres) - 1);
end
$$;

-- a view pública e a busca dependem das colunas de posição: recria tudo (mesmo corpo da 008)
drop function if exists buscar_personagens(text, int);
drop view if exists v_mundo_publico;

alter table personagens drop column if exists pos_x, drop column if exists pos_y;
alter table personagens
  add column pos_x int generated always as ((casa_pos(id))[1]) stored,
  add column pos_y int generated always as ((casa_pos(id))[2]) stored;
create index if not exists personagens_pos on personagens (pos_y, pos_x);

create or replace view v_mundo_publico as
  select codigo, nome_exibicao(nome) as nome, handle, handle_plataforma as plataforma,
         status, pos_x, pos_y, seed, sprite_url, cargo
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
revoke execute on function casa_pos(bigint) from public;
revoke execute on function casa_do_lote(bigint) from public;
revoke execute on function casa_reservada(int, int) from public;
grant  execute on function casa_pos(bigint) to service_role;
grant  execute on function casa_do_lote(bigint) to service_role;
grant  execute on function casa_reservada(int, int) to service_role;

-- confira: select id, codigo, pos_x, pos_y from personagens order by id;
-- (colono 1 → 6,-4 · colono 2 → 7,-4 · colono 3 → 2,-4 ...)
