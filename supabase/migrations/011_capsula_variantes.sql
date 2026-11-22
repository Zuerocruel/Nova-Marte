-- 011 — Variantes da cápsula habitacional (a casa do colono muda no mapa e no episódio)
-- Rode numa aba NOVA do SQL Editor. Pode rodar de novo sem problema.
-- Os valores precisam bater com lib/mundo.ts e fabrica/episodio.py (VARIANTES_CAPSULA).
-- Quem já comprou a cápsula antes fica com a Clássica e pode escolher outra em "Meus itens".
update produtos set
  opcoes = '[{"valor":"classica","rotulo":"Clássica"},{"valor":"estufa","rotulo":"Estufa"},{"valor":"observatorio","rotulo":"Observatório"},{"valor":"dupla","rotulo":"Dupla"}]'
where slug = 'capsula-habitacional';
