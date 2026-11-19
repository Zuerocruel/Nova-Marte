-- Bairro em espiral em volta da base (no lugar das casas em fila).
-- Rode DEPOIS da 006_perfil_chat.sql. As casas dos colonos atuais mudam de lugar UMA vez.
--
-- Como funciona (a mesma conta está em lib/mundo.ts → casaDoId, para o site prever onde cada um mora):
--   * "lotes" numa espiral quadrada em volta do centro (5,-8) = centro do Módulo de Pouso;
--   * a espiral começa no anel 10 (o miolo fica livre para a base, as obras e a praça);
--   * a cada 3 lotes entra uma rua de 1 casa: quarteirões de 3x3 casas;
--   * o 1º lote de cada anel fica ao sul do centro (no fim da trilha que sai da base) e o anel gira
--     para o leste, sobe, vai para o oeste, desce e volta.

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

-- a view pública e a busca dependem das colunas de posição: recria tudo
drop function if exists buscar_personagens(text, int);
drop view if exists v_mundo_publico;

alter table personagens drop column if exists pos_x, drop column if exists pos_y;
alter table personagens
  add column pos_x int generated always as ((casa_pos(id))[1]) stored,
  add column pos_y int generated always as ((casa_pos(id))[2]) stored;
create index if not exists personagens_pos on personagens (pos_y, pos_x);

create or replace view v_mundo_publico as
  select codigo, nome_exibicao(nome) as nome, handle, handle_plataforma as plataforma,
         status, pos_x, pos_y, seed, sprite_url
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
grant  execute on function casa_pos(bigint) to service_role;
