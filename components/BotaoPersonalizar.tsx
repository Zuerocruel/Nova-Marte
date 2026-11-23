'use client';
import { abrirLoja } from './LojaModal';

/** Botão do cartão da /loja: abre o pop-up de compra já no item (escolher opção, texto e ver a prévia). */
export default function BotaoPersonalizar({ slug, rotulo }: { slug: string; rotulo: string }) {
  return <button type="button" className="btn ouro" onClick={() => abrirLoja(slug)}>{rotulo}</button>;
}
