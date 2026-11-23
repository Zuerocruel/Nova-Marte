'use client';

import { useEffect, useRef, useState } from 'react';
import { PET_MACACO, type Opcao } from '@/lib/opcoes';
import type { EspeciePet } from '@/lib/pet-arte';
import { PreviaCapsula, PreviaPet, PreviaRover } from './PreviasLoja';

/**
 * Botão chamativo "Comprar para a colônia" do Mundo ao vivo + pop-up centralizado.
 * 1º passo: a vitrine (todos os itens e eventos). Ao clicar num item, abre o formulário DELE: opção (qual
 * evento, bandeira/satélite/festa…) e texto (outdoor, cores da bandeira), com prévia ao vivo do outdoor.
 * "Pagar" vai para /comprar/<slug>?opcao=…&texto=… (registra o clique e abre o checkout da Cakto).
 * Nada aparece na colônia antes do pagamento aprovado: a prévia do outdoor existe só aqui, no pop-up.
 * Pet: cachorro e gato são opções do "pet-do-colono"; o macaco é o produto "pet-macaco" (mais caro, bicho exótico),
 * escolhido no mesmo cartão. A página /loja abre este pop-up direto num item (evento "loja:abrir").
 */
export function abrirLoja(slug?: string) { window.dispatchEvent(new CustomEvent('loja:abrir', { detail: { slug } })); }
type Produto = {
  slug: string; nome: string; descricao: string | null; preco_centavos: number; tipo: 'pago' | 'gratis';
  opcoes: Opcao[]; pergunta_texto: string | null; imagem_url: string | null;
};

const reais = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const LIMITE_TEXTO: Record<string, number> = { 'outdoor-holografico': 40 };
const TEXTO_OBRIGATORIO = new Set(['outdoor-holografico']);

export default function LojaModal({ semBotao = false }: { semBotao?: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [produtos, setProdutos] = useState<Produto[] | null>(null);
  const [item, setItem] = useState<Produto | null>(null);
  const [opcao, setOpcao] = useState('');
  const [texto, setTexto] = useState('');
  const caixa = useRef<HTMLDivElement>(null);
  const [pedido, setPedido] = useState<string | null>(null);   // slug pedido pela /loja antes da lista chegar

  useEffect(() => {   // a página /loja abre o pop-up direto num item
    const abrir = (e: Event) => { setAberto(true); setPedido((e as CustomEvent<{ slug?: string }>).detail?.slug ?? null); };
    window.addEventListener('loja:abrir', abrir);
    return () => window.removeEventListener('loja:abrir', abrir);
  }, []);
  useEffect(() => {
    if (!pedido || !produtos) return;
    const p = produtos.find((x) => x.slug === pedido);
    if (p) escolher(p);
    setPedido(null);
  }, [pedido, produtos]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!aberto || produtos) return;
    fetch('/api/produtos').then((r) => r.json()).then((j) => setProdutos(j.produtos ?? [])).catch(() => setProdutos([]));
  }, [aberto, produtos]);

  useEffect(() => {   // Esc fecha; a página de trás não rola com o pop-up aberto
    if (!aberto) return;
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar(); };
    document.addEventListener('keydown', tecla);
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', tecla); document.body.style.overflow = antes; };
  }, [aberto]);

  function fechar() { setAberto(false); setItem(null); setPedido(null); }
  function escolher(p: Produto) {
    setItem(p); setOpcao(''); setTexto('');
    caixa.current?.scrollTo({ top: 0 });
  }

  // pet: a espécie escolhida decide o produto (macaco = produto próprio, preço próprio)
  const macaco = produtos?.find((p) => p.slug === PET_MACACO) ?? null;
  const ehPet = item?.slug === 'pet-do-colono';
  const especie: EspeciePet = ehPet ? (opcao === 'macaco' ? 'macaco' : opcao === 'gato' ? 'gato' : 'cachorro') : 'cachorro';
  const comprando = ehPet && opcao === 'macaco' && macaco ? macaco : item;
  const opcoesPet: Opcao[] = ehPet ? [...(item?.opcoes ?? []), { valor: 'macaco', rotulo: '🐒 Macaco' }] : [];
  const limite = item ? LIMITE_TEXTO[item.slug] ?? 120 : 120;
  // o outdoor sempre pede o texto (a pergunta também vem do banco: migração 010)
  const pergunta = item ? item.pergunta_texto ?? (TEXTO_OBRIGATORIO.has(item.slug) ? 'Texto do outdoor (até 40 letras)' : null) : null;
  const faltaOpcao = !!item && item.opcoes.length > 0 && !opcao;
  const faltaTexto = !!item && TEXTO_OBRIGATORIO.has(item.slug) && !texto.trim();
  const destino = item && comprando
    ? comprando.tipo === 'gratis'
      ? `/resgatar/${comprando.slug}`
      : comprando.slug === PET_MACACO
        ? `/comprar/${PET_MACACO}`
        : `/comprar/${comprando.slug}?${new URLSearchParams({ ...(opcao ? { opcao } : {}), ...(texto.trim() ? { texto: texto.trim() } : {}) })}`
    : '#';

  return (
    <>
      {!semBotao && (
        <button type="button" className="btn-comprar-vivo" onClick={() => setAberto(true)}>
          🛒 COMPRAR PARA A COLÔNIA
          <small>cápsula · foguete · rover · pet · outdoor · eventos</small>
        </button>
      )}

      {aberto && (
        <div className="modal-fundo" onMouseDown={(e) => { if (e.target === e.currentTarget) fechar(); }}>
          <div className="modal-caixa" role="dialog" aria-modal="true" aria-label="Comprar para a colônia" ref={caixa}>
            <button type="button" className="modal-fechar" aria-label="Fechar" onClick={fechar}>×</button>

            {!item ? (
              <>
                <h2 className="modal-titulo">Loja da colônia</h2>
                <p className="mudo" style={{ marginTop: 0 }}>Escolha um item: ele aparece na sua casa no mapa e no próximo episódio.</p>
                {!produtos && <p className="mudo">Carregando…</p>}
                <div className="modal-grade">
                  {produtos?.filter((p) => p.slug !== PET_MACACO).map((p) => (
                    <button type="button" key={p.slug} className="modal-produto" onClick={() => escolher(p)}>
                      {p.imagem_url ? <img src={p.imagem_url} alt="" loading="lazy" /> : <span className="sem-img" />}
                      <b>{p.nome}</b>
                      <span className="preco-mini">{p.tipo === 'gratis' ? 'GRÁTIS' : reais(p.preco_centavos)}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); if (!faltaOpcao && !faltaTexto) window.location.href = destino; }}>
                <button type="button" className="link" onClick={() => setItem(null)}>← todos os itens</button>
                <h2 className="modal-titulo">{item.nome}</h2>

                {item.slug === 'outdoor-holografico' ? (
                  <div className="outdoor-previa" aria-label="Prévia do outdoor">
                    <img src="/itens/outdoor-holografico-vazio.png" alt="" />
                    <div className="outdoor-tela"><span>{texto.trim() || 'SEU TEXTO AQUI'}</span></div>
                  </div>
                ) : item.slug === 'capsula-habitacional' && item.opcoes.length > 0 ? (
                  <PreviaCapsula variante={opcao || item.opcoes[0].valor} />
                ) : ehPet ? (
                  <PreviaPet especie={especie} />
                ) : item.slug === 'rover' ? (
                  <PreviaRover />
                ) : item.imagem_url && <img className="modal-img" src={item.imagem_url} alt="" />}

                {item.descricao && <p style={{ fontSize: 19 }}>{item.descricao}</p>}

                {ehPet && (
                  <>
                    <label htmlFor="modal-opcao">Qual bicho?</label>
                    <div className="modal-opcoes opcoes-pet" id="modal-opcao" role="radiogroup">
                      {opcoesPet.map((o) => {
                        const indisponivel = o.valor === 'macaco' && !macaco;
                        const preco = o.valor === 'macaco' ? (macaco?.preco_centavos ?? 800) : item.preco_centavos;
                        return (
                          <button type="button" key={o.valor} role="radio" aria-checked={opcao === o.valor} disabled={indisponivel}
                            className={opcao === o.valor ? 'ativa' : ''} onClick={() => setOpcao(o.valor)}>
                            {o.rotulo}<small>{indisponivel ? 'em breve' : reais(preco)}{o.valor === 'macaco' ? ' · exótico' : ''}</small>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
                {!ehPet && item.opcoes.length > 0 && (
                  <>
                    <label htmlFor="modal-opcao">{item.slug === 'eventos-furia-marte' ? 'Qual evento?' : item.slug === 'capsula-habitacional' ? 'Qual cápsula?' : item.slug === 'bandeira' ? 'Qual bandeira?' : 'Escolha:'}</label>
                    {item.opcoes.length > 12 ? (   // muitas opções (ex.: ~200 países da bandeira): lista suspensa
                      <select id="modal-opcao" value={opcao} onChange={(e) => setOpcao(e.target.value)} required>
                        <option value="">Escolha…</option>
                        {item.opcoes.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
                      </select>
                    ) : (
                      <div className="modal-opcoes" id="modal-opcao" role="radiogroup">
                        {item.opcoes.map((o) => (
                          <button type="button" key={o.valor} role="radio" aria-checked={opcao === o.valor}
                            className={opcao === o.valor ? 'ativa' : ''} onClick={() => setOpcao(o.valor)}>{o.rotulo}</button>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {pergunta && (
                  <>
                    <label htmlFor="modal-texto">{pergunta}</label>
                    <input id="modal-texto" value={texto} maxLength={limite} onChange={(e) => setTexto(e.target.value)}
                      placeholder={item.slug === 'outdoor-holografico' ? 'Ex.: ALÔ MARTE! SOU EU' : ''} required={TEXTO_OBRIGATORIO.has(item.slug)} />
                    <div className="mudo" style={{ fontSize: 16, textAlign: 'right' }}>{texto.length}/{limite}</div>
                  </>
                )}

                <div className="preco" style={{ marginTop: 12 }}>{item.tipo === 'gratis' ? 'GRÁTIS · 1 por pessoa' : reais((comprando ?? item).preco_centavos)}</div>
                <p className="mudo" style={{ fontSize: 16 }}>
                  {item.tipo === 'gratis' ? 'Quem já é personagem resgata grátis.' : 'Pagamento seguro pela Cakto (Pix ou cartão). O item aparece depois que o pagamento for aprovado.'}
                </p>
                <button className="btn" style={{ width: '100%' }} disabled={faltaOpcao || faltaTexto}>
                  {item.tipo === 'gratis' ? 'Resgatar' : faltaOpcao ? 'Escolha uma opção' : faltaTexto ? 'Escreva o texto' : 'Ir para o pagamento →'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
