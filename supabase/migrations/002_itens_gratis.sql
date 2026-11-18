-- 002 — Itens grátis com resgate único por personagem (ex.: "Nomeie sua Cratera")
-- Rode no SQL Editor do Supabase DEPOIS do schema.sql.

alter table produtos add column if not exists tipo text not null default 'pago';
alter table produtos drop constraint if exists produtos_tipo_check;
alter table produtos add constraint produtos_tipo_check check (tipo in ('pago', 'gratis'));
alter table produtos alter column checkout_url drop not null;
alter table produtos drop constraint if exists produtos_checkout_pago;
alter table produtos add constraint produtos_checkout_pago check (tipo = 'gratis' or checkout_url is not null);

create table if not exists resgates (
  id             bigserial primary key,
  produto_id     bigint not null references produtos(id),
  personagem_id  bigint not null references personagens(id) on delete cascade,
  texto          text not null,                 -- ex.: o nome da cratera
  status         text not null default 'pendente' check (status in ('pendente', 'aprovado', 'recusado')),
  created_at     timestamptz not null default now(),
  revisado_em    timestamptz,
  unique (produto_id, personagem_id)            -- UMA vez por pessoa, garantido pelo banco
);
create index if not exists resgates_status on resgates (status, created_at);
alter table resgates enable row level security;
revoke all on resgates from anon, authenticated;
revoke all on sequence resgates_id_seq from anon, authenticated;

-- desempenho da loja passa a contar resgates
drop view if exists v_produtos_desempenho;
create view v_produtos_desempenho as
select pr.slug, pr.nome, pr.preco_centavos, pr.ativo, pr.tipo,
  (select count(*) from cliques c where c.tipo = 'checkout' and c.alvo = pr.slug)         as cliques_comprar,
  (select count(*) from pedidos pe where pe.produto_id = pr.id and pe.status = 'aprovado') as vendas,
  (select count(*) from resgates r where r.produto_id = pr.id and r.status <> 'recusado')  as resgates,
  (select coalesce(sum(valor_centavos), 0) from pedidos pe
     where pe.produto_id = pr.id and pe.status = 'aprovado')                              as receita_centavos
from produtos pr
order by pr.ordem;
revoke all on v_produtos_desempenho from anon, authenticated;
