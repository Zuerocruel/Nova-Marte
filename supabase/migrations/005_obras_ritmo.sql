-- Episódios diários: uma obra pode levar vários episódios (fabrica/colonia.json → "ritmo" e "trabalho").
-- Quanto maior a população, mais a obra avança por episódio.
-- Rode DEPOIS da 004_colonia_obras.sql.

-- quantos episódios a obra já teve (vira o "dia 2", "dia 3"… no título e na narração)
alter table colonia_obras add column if not exists dias int not null default 0;

-- o episódio 1 (já publicado) construiu a Fazenda Solar inteira
update colonia_obras set status = 'concluida', progresso = 100, dias = greatest(dias, 1)
 where slug = 'fazenda-solar' and status <> 'concluida';
