-- VILAREJO ESPALHADO: as casas dos colonos deixam os quarteirões 3x3 colados e passam a ficar espalhadas.
-- Rode DEPOIS da 015. As casas dos colonos atuais mudam de lugar UMA vez (o site e o vídeo já usam a conta nova).
--
-- A mesma conta está em lib/mundo.ts (casaDoId) e em fabrica/bairro.py (casa_do_id):
--   * o chão em volta do centro (5,-8) é dividido em CÉLULAS de 3x3 casas, numeradas numa espiral quadrada a
--     partir do anel 2;
--   * cada célula tem UMA casa, num ponto sorteado (fixo) entre 2x2 posições dentro dela: entre duas casas
--     vizinhas sobra sempre pelo menos uma casa livre;
--   * 1 em cada 5 células vira CLAREIRA (fica vazia);
--   * célula cuja casa cai em cima (ou a até 2 casas) da base, da praça, de uma obra (mesmo planejada) ou da
--     trilha é PULADA. Os retângulos abaixo saem de fabrica/colonia.json. Mudou o mapa? Mude aqui também.
--   * além do anel 30 nada é pulado: a conta volta a ser direta (sem laço).
-- pos_x/pos_y deixam de ser colunas geradas (não dá para trocar a expressão sem derrubar a view): viram
-- colunas comuns, recalculadas aqui e preenchidas por um gatilho em cada colono novo.

create or replace function casa_sorteio(u bigint, v bigint) returns int
language sql immutable parallel safe
as $$
  select (abs((u * 7919 + v * 104729) * (u * 7919 + v * 104729) + 31 * (u * 7919 + v * 104729) + 13 * u * v) % 1009)::int
$$;

create or replace function casa_da_celula(m bigint) returns int[]
language plpgsql immutable parallel safe
as $$
declare
  r bigint; t bigint; u bigint; v bigint; h int;
begin
  r := (floor(sqrt(m::numeric))::bigint + 1) / 2;
  t := m - (2 * r - 1) * (2 * r - 1);
  if    t < r     then u := t;             v := r;
  elsif t < 3 * r then u := r;             v := r - (t - r);
  elsif t < 5 * r then u := r - (t - 3*r); v := -r;
  elsif t < 7 * r then u := -r;            v := -r + (t - 5*r);
  else                 u := -r + (t - 7*r); v := r;
  end if;
  h := casa_sorteio(u, v);
  -- casa = canto da célula + posição sorteada; 3º item: 1 se a célula é clareira
  return array[(5 + 3 * u - 1 + h % 2)::int, (-8 + 3 * v - 1 + (h / 2) % 2)::int, case when (h / 10) % 5 = 0 then 1 else 0 end];
end
$$;

create or replace function casa_reservada(x int, y int) returns boolean
language sql immutable parallel safe
as $$
  select exists (
    select 1 from (values
      (1, -12, 9, -4),          -- Módulo de Pouso
      (1, -1, 10, 6),           -- Praça da Colônia
      (8, -13, 18, -4),         -- fazenda-solar
      (-6, -13, 3, -5),         -- estufa
      (5, -18, 12, -10),        -- antena
      (-7, -7, 1, 0),           -- extrator-gelo
      (9, -6, 16, 1),           -- gerador-oxigenio
      (-8, -18, 1, -11),        -- oficina
      (7, -2, 15, 5),           -- cantina
      (-4, -2, 3, 5),           -- enfermaria
      (-2, -22, 6, -15),        -- abrigo
      (9, -20, 17, -13),        -- laboratorio
      (5, -6, 6, 1),            -- trilha do módulo até a praça
      (30, -17, 48, 15)         -- Vila das Cápsulas (até 50 cápsulas)
    ) as r(x0, y0, x1, y1)
    where x >= r.x0 and x < r.x1 and y >= r.y0 and y < r.y1
  )
$$;

create or replace function casa_pos(p_id bigint) returns int[]
language plpgsql immutable parallel safe
as $$
declare
  r0   constant int := 2;      -- primeiro anel com casas
  rmax constant int := 30;     -- além deste anel nada é pulado
  m0   bigint := (2 * r0 - 1)::bigint * (2 * r0 - 1);
  mfim bigint := (2 * rmax + 1)::bigint * (2 * rmax + 1);
  livres bigint := 0; m bigint; c int[];
begin
  for m in m0 .. mfim - 1 loop
    c := casa_da_celula(m);
    if c[3] = 0 and not casa_reservada(c[1], c[2]) then
      livres := livres + 1;
      if livres = greatest(p_id, 1) then return c[1:2]; end if;
    end if;
  end loop;
  return (casa_da_celula(mfim + (p_id - livres) - 1))[1:2];
end
$$;

-- colunas geradas → comuns + gatilho (a view e a busca continuam iguais)
alter table personagens alter column pos_x drop expression;
alter table personagens alter column pos_y drop expression;

create or replace function personagens_pos() returns trigger
language plpgsql
as $$
declare c int[];
begin
  c := casa_pos(new.id);
  new.pos_x := c[1]; new.pos_y := c[2];
  return new;
end
$$;
drop trigger if exists personagens_pos on personagens;
create trigger personagens_pos before insert or update of id on personagens
  for each row execute function personagens_pos();

update personagens set pos_x = (casa_pos(id))[1], pos_y = (casa_pos(id))[2];

revoke execute on function casa_pos(bigint) from public;
revoke execute on function casa_da_celula(bigint) from public;
revoke execute on function casa_sorteio(bigint, bigint) from public;
revoke execute on function casa_reservada(int, int) from public;
grant  execute on function casa_pos(bigint) to service_role;
grant  execute on function casa_da_celula(bigint) to service_role;
grant  execute on function casa_sorteio(bigint, bigint) to service_role;
grant  execute on function casa_reservada(int, int) to service_role;

-- confira: select id, codigo, pos_x, pos_y from personagens order by id;
-- (colono 1 → 8,-3 · colono 2 → 4,-15 · colono 3 → 1,-15 ...)
