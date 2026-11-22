-- 012 — Cargos de liderança de Nova Marte (aba "Cargos de Nova Marte" do painel)
-- Lista em fabrica/liderancas.json (líder da colônia, vice, engenharias, plantação...).
-- Cada cargo tem UM ocupante. Diferente do cargo da 008 (escolhido pelo colono, fixo), a liderança é dada e
-- tirada pelo painel a qualquer hora. Rode numa aba NOVA do SQL Editor. Pode rodar de novo sem problema.

alter table personagens add column if not exists lideranca text
  check (lideranca is null or lideranca ~ '^[a-z][a-z-]{1,29}$');
alter table personagens add column if not exists lideranca_em timestamptz;
create unique index if not exists personagens_lideranca_unica on personagens (lideranca) where lideranca is not null;

-- a view pública e a busca ganham a liderança: recria as duas (mesmo corpo da 009)
drop function if exists buscar_personagens(text, int);
drop view if exists v_mundo_publico;

create or replace view v_mundo_publico as
  select codigo, nome_exibicao(nome) as nome, handle, handle_plataforma as plataforma,
         status, pos_x, pos_y, seed, sprite_url, cargo, lideranca
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
