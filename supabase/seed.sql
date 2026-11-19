-- Dados iniciais de exemplo. Troque pelos seus antes de rodar.

insert into links (slug, destino, plataforma, campanha, descricao) values
  ('ig-bio',  '/', 'instagram', 'bio', 'Link da bio do Instagram'),
  ('tt-bio',  '/', 'tiktok',    'bio', 'Link da bio do TikTok'),
  ('yt-bio',  '/', 'youtube',   'bio', 'Link do canal do YouTube'),
  ('ig-loja', '/loja', 'instagram', 'loja', 'Story / destaque da loja')
on conflict (slug) do nothing;

insert into episodios (numero, titulo) values (1, 'Pouso da Operação Marte Zero')
on conflict (numero) do nothing;

-- Produto de exemplo: crie o produto na Cakto, copie o link de checkout e o id
insert into produtos (slug, nome, descricao, preco_centavos, checkout_url, cakto_product_id, ordem) values
  ('capacete-ep001', 'Capacete de Pouso', 'O capacete que o seu personagem usa no ep. 1.', 490,
   'https://pay.cakto.com.br/SEU-CHECKOUT', 'ID-DO-PRODUTO-NA-CAKTO', 1)
on conflict (slug) do nothing;
