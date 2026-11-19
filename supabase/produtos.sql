-- Produtos da loja (cadastrados na Cakto em 2026-11-18).
-- Pode rodar de novo: atualiza preço/link/id se o slug já existir.
-- Requer supabase/migrations/002_itens_gratis.sql.

-- Item grátis: resgate no próprio site (/resgatar/...), 1 por personagem — não passa pela Cakto
insert into produtos (slug, nome, descricao, preco_centavos, tipo, checkout_url, ordem) values
  ('nomeie-sua-cratera', 'Nomeie sua Cratera',
   'Grátis para quem já é personagem. Escolha o nome de uma cratera da Operação Marte Zero. Vale 1 por pessoa.',
   0, 'gratis', null, 0)
on conflict (slug) do update set
  nome = excluded.nome, descricao = excluded.descricao, preco_centavos = 0,
  tipo = 'gratis', checkout_url = null, ordem = excluded.ordem, ativo = true;

insert into produtos (slug, nome, preco_centavos, cakto_product_id, checkout_url, ordem) values
  ('bandeira',             'Bandeira (minhas cores / país) · Satélite · Festa',                     750, 'a7351dd2-f2e8-4d82-bbb1-4bd438e0c0e2', 'https://pay.cakto.com.br/3d85fhh_1341231',  1),
  ('eventos-furia-marte',  'Eventos "Fúria de Marte" (poeira, meteoros, inverno, reator, aliens)', 890, 'f06203be-0d4a-4969-b160-29258fbe7d4b', 'https://pay.cakto.com.br/g8xxrwc_1341219',  2),
  ('capsula-comercio',     'Cápsula de comércio',                                                  2490, '86a8fc42-c483-4106-8f41-141139f31a58', 'https://pay.cakto.com.br/en2bz3w_1341213',  3),
  ('monumento-dourado',    'Monumento dourado',                                                    1990, '5c080ee8-b485-476e-b121-c015909f8910', 'https://pay.cakto.com.br/uqegbrd_1341190',  4),
  ('destaque-proximo-ep',  'Destaque no Próximo EP!',                                               500, 'c329cfcb-da3c-4a72-abab-437e65c6ead4', 'https://pay.cakto.com.br/f7oqtuj_1341179',  5),
  ('traje-espacial',       'Traje Espacial',                                                        500, '23048cb3-af99-4ac5-b60a-7e1854aac012', 'https://pay.cakto.com.br/zz8pa2x_1341161',  6),
  ('pet-do-colono',        'Pet do Colono',                                                         500, '083df8a8-0e3b-4320-8997-0f7109c51603', 'https://pay.cakto.com.br/aysd8gz_1341154',  7),
  ('rover',                'Rover',                                                                 990, '786c4bb0-e7b7-461c-874b-65d6492d64da', 'https://pay.cakto.com.br/6m66xze_1341151',  8),
  ('seu-foguete',          'Seu Foguete',                                                          1490, '68c218e9-8690-4628-b466-6bfb6dd37408', 'https://pay.cakto.com.br/3825z6x_1341146',  9),
  ('capsula-habitacional', 'Cápsula habitacional',                                                 1480, 'b8b3378f-81d2-47df-baed-f5067fb8b275', 'https://pay.cakto.com.br/y9autnw_1341133', 10),
  ('outdoor-holografico',  'Outdoor holográfico',                                                   590, '587d9bbf-08d0-43e4-aeb4-222be5378607', 'https://pay.cakto.com.br/zvqfcea_1341099', 11)
on conflict (slug) do update set
  nome             = excluded.nome,
  preco_centavos   = excluded.preco_centavos,
  cakto_product_id = excluded.cakto_product_id,
  checkout_url     = excluded.checkout_url,
  ordem            = excluded.ordem,
  ativo            = true;

-- Tira da vitrine o produto de exemplo do seed.sql (se ele tiver sido inserido)
update produtos set ativo = false where slug = 'capacete-ep001';
