-- Cargos da colônia + nick do colono.
--   * cargo: o colono escolhe o que quer ser ao entrar (lista em fabrica/cargos.json), uma vez só.
--   * apelido (nick): login = nick + WhatsApp. A chave (minúscula, sem acento) é única: não repete nick.
-- Rode DEPOIS da 007_bairro_espiral.sql. Não muda nada de quem já está cadastrado (cargo fica vazio
-- até a pessoa escolher no perfil).

alter table personagens add column if not exists cargo text
  check (cargo is null or cargo ~ '^[a-z]{2,20}$');
alter table personagens add column if not exists cargo_em timestamptz;   -- quando o cargo foi escolhido

alter table personagens add column if not exists apelido text;
alter table personagens add column if not exists apelido_chave text
  check (apelido_chave is null or apelido_chave ~ '^[a-z0-9_.]{3,20}$');
create unique index if not exists personagens_apelido_chave on personagens (apelido_chave);

-- cargo escolhido não muda mais (nem por engano, nem por outra rota do site)
create or replace function travar_cargo() returns trigger
language plpgsql as $$
begin
  if old.cargo is not null and new.cargo is distinct from old.cargo then
    raise exception 'o cargo do colono já foi escolhido e não pode ser trocado';
  end if;
  return new;
end
$$;
drop trigger if exists personagens_travar_cargo on personagens;
create trigger personagens_travar_cargo before update of cargo on personagens
  for each row execute function travar_cargo();

-- a view pública e a busca ganham o cargo: recria as duas (mesmo corpo da 007)
drop function if exists buscar_personagens(text, int);
drop view if exists v_mundo_publico;

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
