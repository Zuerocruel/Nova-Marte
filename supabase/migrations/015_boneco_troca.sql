-- Troca do boneco pelo perfil (uma vez só).
--   * O visual do colono continua vindo só do seed; a troca grava um seed novo.
--   * boneco_trocado_em: quando a pessoa usou a troca. Preenchido = não troca mais pelo site.
-- Rode DEPOIS da 014_bandeira_paises.sql. Não muda nada de quem já está cadastrado.

alter table personagens add column if not exists boneco_trocado_em timestamptz;
