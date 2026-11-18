import type { Metadata, Viewport } from 'next';
import { Press_Start_2P } from 'next/font/google';
import Link from 'next/link';
import './globals.css';

const pixel = Press_Start_2P({ weight: '400', subsets: ['latin'], variable: '--font-pixel', display: 'swap' });

export const metadata: Metadata = {
  title: 'NovaMarte — vire um personagem',
  description: 'Cada seguidor vira um personagem em pixel art. Cadastre-se e encontre você no mundo.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  openGraph: { title: 'NovaMarte', description: 'Cada seguidor vira um personagem.' },
};

export const viewport: Viewport = { themeColor: '#140f26', viewportFit: 'cover' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={pixel.variable}>
      <body>
        <header className="topo">
          <Link href="/" className="logo">NOVAMARTE</Link>
          <nav>
            <Link href="/">Entrar</Link>
            <Link href="/mundo">Mundo</Link>
            <Link href="/loja">Loja</Link>
            <Link href="/meus-itens">Meus itens</Link>
          </nav>
        </header>
        {children}
        <footer className="rodape">
          NovaMarte · <Link href="/privacidade">Privacidade</Link>
        </footer>
      </body>
    </html>
  );
}
