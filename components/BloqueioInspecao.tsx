'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Dificulta abrir as ferramentas do navegador no site: bloqueia F12, Ctrl+Shift+I/J/C (Cmd+Opt+I/J/C no Mac),
 * Ctrl+U (ver código-fonte) e o botão direito (menu "Inspecionar").
 *
 * É só um empecilho: quem quiser ainda abre pelo menu do navegador. Nada secreto pode depender disto
 * (chaves e dados privados ficam no servidor, nunca no navegador).
 *
 * Fica de fora: o /painel (é do dono), o modo de desenvolvimento e o botão direito em campos de texto
 * (para colar o WhatsApp/código no cadastro).
 */
export default function BloqueioInspecao() {
  const caminho = usePathname();
  const ativo = process.env.NODE_ENV === 'production' && !caminho?.startsWith('/painel');

  useEffect(() => {
    if (!ativo) return;
    const ehCampo = (alvo: EventTarget | null) =>
      alvo instanceof HTMLElement && !!alvo.closest('input, textarea, [contenteditable="true"]');

    const menu = (e: MouseEvent) => { if (!ehCampo(e.target)) e.preventDefault(); };
    const teclas = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const ctrl = e.ctrlKey || e.metaKey;
      const ferramentas = e.key === 'F12'
        || (ctrl && e.shiftKey && ['i', 'j', 'c'].includes(k))   // Windows/Linux
        || (e.metaKey && e.altKey && ['i', 'j', 'c'].includes(k))  // Mac
        || (ctrl && !e.shiftKey && k === 'u');                    // ver código-fonte
      if (ferramentas) { e.preventDefault(); e.stopPropagation(); }
    };

    document.addEventListener('contextmenu', menu);
    window.addEventListener('keydown', teclas, true);
    return () => {
      document.removeEventListener('contextmenu', menu);
      window.removeEventListener('keydown', teclas, true);
    };
  }, [ativo]);

  return null;
}
