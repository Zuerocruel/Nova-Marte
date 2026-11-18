-- 003 — Produtos com opções (ex.: Bandeira / Satélite / Festa) e personalização pós-compra
-- Rode numa aba NOVA do SQL Editor. Pode rodar de novo sem problema.

-- opcoes: lista [{ "valor": "satelite", "rotulo": "Satélite" }, ...]  (null = produto sem opções)
alter table produtos add column if not exists opcoes jsonb;
-- pergunta_texto: se preenchida, o comprador escreve um texto livre (ex.: "Cores ou país da bandeira")
alter table produtos add column if not exists pergunta_texto text;

alter table cliques add column if not exists opcao text;

alter table pedidos add column if not exists opcao text;
alter table pedidos add column if not exists texto_personalizado text;
alter table pedidos add column if not exists personalizado_em timestamptz;
alter table pedidos add column if not exists cliente_telefone_chave text
  generated always as (right(regexp_replace(coalesce(cliente_telefone, ''), '\D', '', 'g'), 11)) stored;
create index if not exists pedidos_tel_chave on pedidos (cliente_telefone_chave);
create index if not exists cliques_visitante on cliques (visitante_id, created_at);

-- Opções dos produtos que hoje são "vários em um"
update produtos set
  opcoes = '[{"valor":"bandeira","rotulo":"Bandeira"},{"valor":"satelite","rotulo":"Satélite"},{"valor":"festa","rotulo":"Festa"}]',
  pergunta_texto = 'Cores ou país (para a bandeira). Opcional para Satélite e Festa.'
where slug = 'bandeira';

update produtos set
  opcoes = '[{"valor":"poeira","rotulo":"Tempestade de poeira"},{"valor":"meteoros","rotulo":"Chuva de meteoros"},{"valor":"inverno","rotulo":"Inverno marciano"},{"valor":"reator","rotulo":"Falha no reator"},{"valor":"aliens","rotulo":"Aliens"}]'
where slug = 'eventos-furia-marte';
