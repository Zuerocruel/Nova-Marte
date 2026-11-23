import type { Metadata, Viewport } from 'next';
import { Press_Start_2P, VT323 } from 'next/font/google';
import Link from 'next/link';
import BloqueioInspecao from '@/components/BloqueioInspecao';
import Entrada from '@/components/Entrada';
import './globals.css';

const pixel = Press_Start_2P({ weight: '400', subsets: ['latin'], variable: '--font-pixel', display: 'swap' });
const terminal = VT323({ weight: '400', subsets: ['latin'], variable: '--font-terminal', display: 'swap' });

export const metadata: Metadata = {
  title: 'Operação Marte Zero — vire um personagem',
  description: 'Cada seguidor vira um personagem em pixel art. Cadastre-se e encontre você no mundo.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  openGraph: { title: 'Operação Marte Zero', description: 'Cada seguidor vira um personagem.' },
};

export const viewport: Viewport = { themeColor: '#0e0b1f', viewportFit: 'cover' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${pixel.variable} ${terminal.variable}`}>
      <body>
        <BloqueioInspecao />
        <Entrada />
        <header className="topo">
          <Link href="/" className="logo"><span className="logo-planeta" aria-hidden="true" />MARTE ZERO</Link>
          <nav>
            <Link href="/mundo">Mundo ao vivo</Link>
            <Link href="/loja">Loja</Link>
            <Link href="/central">Central</Link>
            <Link href="/meus-itens">Meus itens</Link>
            <Link href="/eu">Meu perfil</Link>
          </nav>
          <Link href="/#criar" className="topo-cta">+ Criar colono</Link>
        </header>
        {children}
        <footer className="rodape">
          <p className="rodape-logo">OPERAÇÃO MARTE ZERO</p>
          <p>A colônia cresce a cada seguidor. Siga a série e venha morar em Marte.</p>
          <p className="rodape-links">
            <Link href="/mundo">Mundo ao vivo</Link> · <Link href="/loja">Loja</Link> · <Link href="/central">Central</Link> · <Link href="/privacidade">Privacidade</Link>
          </p>
        </footer>
      </body>
    </html>
  );
}
