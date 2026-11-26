-- VILAREJO EM ANÉIS (pedido do dono em 2026-11-26): as casas saem do vilarejo espalhado e passam a ficar
-- enfileiradas dos dois lados de ruas em anel (quadradas) em volta do Módulo de Pouso, com duas avenidas retas.
-- Rode DEPOIS da 017. As casas dos colonos atuais mudam de lugar UMA vez (o site e o vídeo já usam a conta nova).
--
-- A mesma conta está em lib/mundo.ts (casaDoId) e em fabrica/bairro.py (casa_do_id):
--   * rua do anel k a 14 + 5*k casas do centro (5,-8) (distância "quadrada": max(|dx|,|dy|));
--   * casas dos dois lados da rua (dentro e fora), uma a cada 2 casas, sem cantos (|ao longo| <= d-3) e sem
--     encostar nas avenidas (dx = 0 e dy = +2);
--   * ordem: anel por anel; no anel, a partir do sul (dx = 0) girando para o leste: lado sul, leste, norte, oeste;
--   * casa em cima (ou a até 2 casas) de uma construção (fabrica/colonia.json, inclusive o Módulo de Comando),
--     da Vila das Cápsulas ou de um lote de cratera batizada é PULADA. Mudou o mapa? Gere de novo.

create or replace function casa_reservada(x int, y int) returns boolean
language sql immutable parallel safe
as $$
  select exists (
    select 1 from (values
      (1, -12, 9, -4)       -- Módulo de Pouso,
      (1, -1, 10, 6)        -- Praça da Colônia,
      (8, -13, 18, -4)      -- fazenda-solar,
      (-6, -13, 3, -5)      -- estufa,
      (5, -18, 12, -10)     -- antena,
      (-7, -7, 1, 0)        -- extrator-gelo,
      (0, -16, 7, -9)       -- modulo-comando,
      (9, -6, 16, 1)        -- gerador-oxigenio,
      (-8, -18, 1, -11)     -- oficina,
      (7, -2, 15, 5)        -- cantina,
      (-4, -2, 3, 5)        -- enfermaria,
      (-2, -22, 6, -15)     -- abrigo,
      (9, -20, 17, -13)     -- laboratorio,
      (30, -17, 48, 15)     -- Vila das Cápsulas,
      (16, 6, 21, 11)       -- cratera 1,
      (-13, -13, -8, -8)    -- cratera 2,
      (19, -21, 24, -16)    -- cratera 3,
      (-1, 6, 4, 11)        -- cratera 4,
      (-6, -26, -1, -21)    -- cratera 5,
      (19, -4, 24, 1)       -- cratera 6,
      (-18, -1, -13, 4)     -- cratera 7,
      (12, -31, 17, -26)    -- cratera 8,
      (10, 11, 15, 16)      -- cratera 9,
      (-18, -22, -13, -17)  -- cratera 10,
      (24, -15, 29, -10)    -- cratera 11,
      (-11, 11, -6, 16)     -- cratera 12,
      (-1, -36, 4, -31)     -- cratera 13,
      (29, 11, 34, 16)      -- cratera 14,
      (-23, -4, -18, 1)     -- cratera 15,
      (28, -36, 33, -31)    -- cratera 16,
      (-1, 16, 4, 21)       -- cratera 17,
      (-19, -36, -14, -31)  -- cratera 18,
      (34, -4, 39, 1)       -- cratera 19,
      (-28, 12, -23, 17)    -- cratera 20,
      (9, -41, 14, -36)     -- cratera 21,
      (21, 21, 26, 26)      -- cratera 22,
      (-28, -19, -23, -14)  -- cratera 23,
      (34, -25, 39, -20)    -- cratera 24,
      (-11, 26, -6, 31)     -- cratera 25,
      (-11, -46, -6, -41)   -- cratera 26,
      (39, 8, 44, 13)       -- cratera 27,
      (-33, 0, -28, 5)      -- cratera 28,
      (25, -46, 30, -41)    -- cratera 29,
      (10, 26, 15, 31)      -- cratera 30,
      (-38, -41, -33, -36)  -- cratera 31,
      (44, -14, 49, -9)     -- cratera 32,
      (-34, 31, -29, 36)    -- cratera 33,
      (7, -51, 12, -46)     -- cratera 34,
      (41, 31, 46, 36)      -- cratera 35,
      (-38, -13, -33, -8)   -- cratera 36,
      (49, -46, 54, -41)    -- cratera 37,
      (-5, 36, 0, 41)       -- cratera 38,
      (-27, -56, -22, -51)  -- cratera 39,
      (49, 2, 54, 7)        -- cratera 40,
      (-43, 15, -38, 20)    -- cratera 41,
      (19, -56, 24, -51)    -- cratera 42,
      (25, 41, 30, 46)      -- cratera 43,
      (-48, -33, -43, -28)  -- cratera 44,
      (54, -27, 59, -22)    -- cratera 45,
      (-26, 41, -21, 46)    -- cratera 46,
      (-9, -61, -4, -56)    -- cratera 47,
      (54, 25, 59, 30)      -- cratera 48
    ) as r(x0, y0, x1, y1)
    where x >= r.x0 and x < r.x1 and y >= r.y0 and y < r.y1
  )
$$;

create or replace function casa_pos(p_id bigint) returns int[]
language plpgsql immutable parallel safe
as $$
declare
  r0 constant int := 14; passo constant int := 5; av constant int := 2;
  cx constant int := 5; cy constant int := -8;
  alvo bigint := greatest(p_id, 1); n bigint := 0;
  k int := 0; d int; lado int; i int; dx int; dy int; nx int; ny int; ao int; s int; hx int; hy int;
begin
  loop
    d := r0 + passo * k;
    for lado in 0 .. 4 loop
      -- 0: sul (dx 0..d) · 1: leste (dy d..-d) · 2: norte (dx d..-d) · 3: oeste (dy -d..d) · 4: sul (dx -d..-1)
      for i in 0 .. (case lado when 0 then d when 4 then d - 1 else 2 * d end) loop
        if    lado = 0 then dx := i;      dy := d;      nx := 0;  ny := 1;
        elsif lado = 1 then dx := d;      dy := d - i;  nx := 1;  ny := 0;
        elsif lado = 2 then dx := d - i;  dy := -d;     nx := 0;  ny := -1;
        elsif lado = 3 then dx := -d;     dy := -d + i; nx := -1; ny := 0;
        else                dx := -d + i; dy := d;      nx := 0;  ny := 1;
        end if;
        ao := case when ny <> 0 then dx else dy end;
        continue when ao % 2 <> 0 or abs(ao) > d - 3;
        continue when (ny <> 0 and abs(dx) <= 1) or (nx <> 0 and abs(dy - av) <= 1);
        foreach s in array array[-1, 1] loop
          hx := cx + dx + s * nx; hy := cy + dy + s * ny;
          if not casa_reservada(hx, hy) then
            n := n + 1;
            if n = alvo then return array[hx, hy]; end if;
          end if;
        end loop;
      end loop;
    end loop;
    k := k + 1;
  end loop;
end
$$;

update personagens set pos_x = (casa_pos(id))[1], pos_y = (casa_pos(id))[2];

revoke execute on function casa_pos(bigint) from public;
revoke execute on function casa_reservada(int, int) from public;
grant  execute on function casa_pos(bigint) to service_role;
grant  execute on function casa_reservada(int, int) to service_role;

-- confira: select id, codigo, pos_x, pos_y from personagens order by id;
-- (colono 1 → 7,7 · colono 2 → 9,7 · colono 20 → 18,-14)
