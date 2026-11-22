-- 010 — Compra pelo pop-up do Mundo ao vivo: o texto digitado antes de pagar (ex.: texto do outdoor) vai junto
-- com o clique em "comprar" e passa para o pedido quando o pagamento é aprovado (lib/cakto.ts → ligarOpcao).
-- Rode numa aba NOVA do SQL Editor do Supabase. Pode rodar de novo sem problema.

alter table cliques add column if not exists texto text;

-- outdoor: o comprador escreve o texto no pop-up (aparece no outdoor enquanto digita)
update produtos set pergunta_texto = 'Texto do outdoor (até 40 letras)'
where slug = 'outdoor-holografico' and pergunta_texto is null;
