'use client';

import { useEffect, useRef, useState } from 'react';
import type { Opcao } from '@/lib/opcoes';
import { desenharCapsula } from '@/lib/colonia-arte';

/**
 * Botão chamativo "Comprar para a colônia" do Mundo ao vivo + pop-up centralizado.
 * 1º passo: a vitrine (todos os itens e eventos). Ao clicar num item, abre o formulário DELE: opção (qual
 * evento, bandeira/satélite/festa…) e texto (outdoor, cores da bandeira), com prévia ao vivo do outdoor.
 * "Pagar" vai para /comprar/<slug>?opcao=…&texto=… (registra o clique e abre o checkout da Cakto).
 * Nada aparece na colônia antes do pagamento aprovado: a prévia do outdoor existe só aqui, no pop-up.
 */
type Produto = {
  slug: string; nome: string; descricao: string | null; preco_centavos: number; tipo: 'pago' | 'gratis';
  opcoes: Opcao[]; pergunta_texto: string | null; imagem_url: string | null;
};

const reais = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const LIMITE_TEXTO: Record<string, number> = { 'outdoor-holografico': 40 };
const TEXTO_OBRIGATORIO = new Set(['outdoor-holografico']);

/** A cápsula escolhida, grande, com a MESMA arte da casa no mapa (lib/colonia-arte.ts → desenharCapsula). */
function CapsulaPrevia({ variante }: { variante: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current?.getContext('2d');
    if (!c) return;
    c.fillStyle = '#c1673e'; c.fillRect(0, 0, 24, 20);
    c.fillStyle = '#b05c37'; for (const [x, y] of [[2, 3], [19, 15], [4, 17], [20, 4]]) c.fillRect(x, y, 2, 1);
    desenharCapsula(c, 4, 4, variante, '#3f8efc', true);
  }, [variante]);
  return <canvas ref={ref} width={24} height={20} className="capsula-previa" aria-label={`Prévia da cápsula ${variante}`} />;
}

export default function LojaModal() {
  const [aberto, setAberto] = useState(false);
  const [produtos, setProdutos] = useState<Produto[] | null>(null);
  const [item, setItem] = useState<Produto | null>(null);
  const [opcao, setOpcao] = useState('');
  const [texto, setTexto] = useState('');
  const caixa = useRef<HTMLDivElement>(null);

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

  function fechar() { setAberto(false); setItem(null); }
  function escolher(p: Produto) {
    setItem(p); setOpcao(''); setTexto('');
    caixa.current?.scrollTo({ top: 0 });
  }

  const limite = item ? LIMITE_TEXTO[item.slug] ?? 120 : 120;
  // o outdoor sempre pede o texto (a pergunta também vem do banco: migração 010)
  const pergunta = item ? item.pergunta_texto ?? (TEXTO_OBRIGATORIO.has(item.slug) ? 'Texto do outdoor (até 40 letras)' : null) : null;
  const faltaOpcao = !!item && item.opcoes.length > 0 && !opcao;
  const faltaTexto = !!item && TEXTO_OBRIGATORIO.has(item.slug) && !texto.trim();
  const destino = item
    ? item.tipo === 'gratis'
      ? `/resgatar/${item.slug}`
      : `/comprar/${item.slug}?${new URLSearchParams({ ...(opcao ? { opcao } : {}), ...(texto.trim() ? { texto: texto.trim() } : {}) })}`
    : '#';

  return (
    <>
      <button type="button" className="btn-comprar-vivo" onClick={() => setAberto(true)}>
        🛒 COMPRAR PARA A COLÔNIA
        <small>cápsula · foguete · rover · pet · outdoor · eventos</small>
      </button>

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
                  {produtos?.map((p) => (
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
                  <CapsulaPrevia variante={opcao || item.opcoes[0].valor} />
                ) : item.imagem_url && <img className="modal-img" src={item.imagem_url} alt="" />}

                {item.descricao && <p style={{ fontSize: 14 }}>{item.descricao}</p>}

                {item.opcoes.length > 0 && (
                  <>
                    <label htmlFor="modal-opcao">{item.slug === 'eventos-furia-marte' ? 'Qual evento?' : item.slug === 'capsula-habitacional' ? 'Qual cápsula?' : 'Escolha:'}</label>
                    <div className="modal-opcoes" id="modal-opcao" role="radiogroup">
                      {item.opcoes.map((o) => (
                        <button type="button" key={o.valor} role="radio" aria-checked={opcao === o.valor}
                          className={opcao === o.valor ? 'ativa' : ''} onClick={() => setOpcao(o.valor)}>{o.rotulo}</button>
                      ))}
                    </div>
                  </>
                )}

                {pergunta && (
                  <>
                    <label htmlFor="modal-texto">{pergunta}</label>
                    <input id="modal-texto" value={texto} maxLength={limite} onChange={(e) => setTexto(e.target.value)}
                      placeholder={item.slug === 'outdoor-holografico' ? 'Ex.: ALÔ MARTE! SOU EU' : ''} required={TEXTO_OBRIGATORIO.has(item.slug)} />
                    <div className="mudo" style={{ fontSize: 12, textAlign: 'right' }}>{texto.length}/{limite}</div>
                  </>
                )}

                <div className="preco" style={{ marginTop: 12 }}>{item.tipo === 'gratis' ? 'GRÁTIS · 1 por pessoa' : reais(item.preco_centavos)}</div>
                <p className="mudo" style={{ fontSize: 12 }}>
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
