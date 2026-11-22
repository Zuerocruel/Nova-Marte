'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Os 3 minigames da colônia, em canvas pixel (sem imagens externas):
 *   laser    → toque para disparar o laser no drone que se mexe (errou = perde coração)
 *   meteoros → arraste/setas para desviar dos meteoros e pegar cristais de gelo
 *   reator   → toque quando a agulha estiver na faixa verde
 * Partida de 45 s com 3 corações. Acabou o tempo = "terminou" (sem trava). Perdeu os 3 corações = "perdeu_coracoes"
 * e AQUELE jogo trava 12 h (no banco). Sair no meio = pop-up DENTRO do jogo avisando que perde os corações.
 * Modo teste (painel): joga sem login e sem gravar nada.
 */
export type ResultadoPartida = 'terminou' | 'perdeu_coracoes' | 'abandonou';
type Props = { jogo: string; teste?: boolean; aoFechar: () => void; aoTerminar?: (r: { pontos: number; resultado: ResultadoPartida }) => void };

const W = 360, H = 520, DURACAO = 45, CORACOES = 3;
const COR = { ceu: '#140f26', ceu2: '#1e1838', borda: '#3a2f63', ouro: '#ffc83d', agua: '#3fd0c9', marte: '#e2603b', ok: '#4ed37a', erro: '#ff4d4d', texto: '#f3eefe', areia: '#f6d7a7' };
const NOMES: Record<string, string> = { laser: 'Laser de Precisão', meteoros: 'Chuva de Meteoros', reator: 'Estabilize o Reator' };
const DICAS: Record<string, string> = {
  laser: 'Toque na tela (ou espaço) para disparar quando o drone passar na mira.',
  meteoros: 'Arraste (ou use ← →) para desviar dos meteoros. Cristais azuis valem pontos.',
  reator: 'Toque (ou espaço) quando a agulha estiver na faixa verde.',
};

type Estado = {
  t: number; pontos: number; coracoes: number; combo: number; fim: boolean; resultado?: ResultadoPartida;
  efeitos: { x: number; y: number; t0: number; cor: string; txt?: string }[];
  // laser
  alvoX: number; alvoV: number; tiro: number;
  // meteoros
  naveX: number; alvoNave: number; meteoros: { x: number; y: number; v: number; r: number; cristal: boolean }[]; proximo: number; invul: number;
  // reator
  agulha: number; agV: number; zona: number; zonaL: number;
};

function novoEstado(): Estado {
  return { t: 0, pontos: 0, coracoes: CORACOES, combo: 0, fim: false, efeitos: [],
    alvoX: W / 2, alvoV: 90, tiro: -1, naveX: W / 2, alvoNave: W / 2, meteoros: [], proximo: 0.6, invul: 0,
    agulha: 0.1, agV: 0.7, zona: 0.5, zonaL: 0.24 };
}

export default function Minigame({ jogo, teste, aoFechar, aoTerminar }: Props) {
  const cv = useRef<HTMLCanvasElement>(null);
  const est = useRef<Estado>(novoEstado());
  const [fase, setFase] = useState<'pronto' | 'jogando' | 'fim'>('pronto');
  const [sair, setSair] = useState(false);
  const [placar, setPlacar] = useState({ pontos: 0, resultado: '' as ResultadoPartida | '' });
  const pausado = useRef(false);

  const terminar = useCallback((resultado: ResultadoPartida) => {
    const e = est.current;
    if (e.fim) return;
    e.fim = true; e.resultado = resultado;
    setPlacar({ pontos: e.pontos, resultado });
    setFase('fim');
    aoTerminar?.({ pontos: e.pontos, resultado });
  }, [aoTerminar]);

  const perderCoracao = useCallback((x: number, y: number) => {
    const e = est.current;
    e.coracoes -= 1; e.combo = 0;
    e.efeitos.push({ x, y, t0: e.t, cor: COR.erro, txt: '-1 ♥' });
    if (e.coracoes <= 0) terminar('perdeu_coracoes');
  }, [terminar]);

  const acao = useCallback(() => {   // toque / espaço
    const e = est.current;
    if (fase !== 'jogando' || e.fim || pausado.current) return;
    if (jogo === 'laser') {
      e.tiro = e.t;
      if (Math.abs(e.alvoX - W / 2) < 22) {
        e.combo += 1; const g = 10 + Math.min(e.combo, 5) * 2; e.pontos += g;
        e.efeitos.push({ x: e.alvoX, y: 130, t0: e.t, cor: COR.ouro, txt: `+${g}` });
        e.alvoV = Math.sign(e.alvoV || 1) * Math.min(260, Math.abs(e.alvoV) + 14) * (Math.random() < 0.5 ? -1 : 1);
      } else perderCoracao(W / 2, 140);
    } else if (jogo === 'reator') {
      const d = Math.abs(e.agulha - e.zona);
      if (d < e.zonaL / 2) {
        const perfeito = d < e.zonaL / 8, g = perfeito ? 20 : 10;
        e.combo += 1; e.pontos += g;
        e.efeitos.push({ x: 40 + e.agulha * (W - 80), y: 250, t0: e.t, cor: perfeito ? COR.ouro : COR.ok, txt: perfeito ? `PERFEITO +${g}` : `+${g}` });
        e.zona = 0.15 + Math.random() * 0.7; e.zonaL = Math.max(0.09, e.zonaL * 0.94); e.agV = Math.sign(e.agV) * Math.min(2.2, Math.abs(e.agV) + 0.07);
      } else perderCoracao(40 + e.agulha * (W - 80), 250);
    }
  }, [fase, jogo, perderCoracao]);

  // laço do jogo
  useEffect(() => {
    if (fase !== 'jogando') return;
    let raf = 0, ultimo = performance.now();
    const passo = (agora: number) => {
      const dt = Math.min(0.05, (agora - ultimo) / 1000); ultimo = agora;
      const e = est.current;
      if (!pausado.current && !e.fim) {
        e.t += dt;
        if (e.t >= DURACAO) terminar('terminou');
        if (jogo === 'laser') {
          e.alvoX += e.alvoV * dt;
          if (e.alvoX < 30 || e.alvoX > W - 30) { e.alvoV *= -1; e.alvoX = Math.max(30, Math.min(W - 30, e.alvoX)); }
          if (Math.random() < dt * 0.6) e.alvoV *= -1;   // muda de direção de surpresa
        } else if (jogo === 'meteoros') {
          e.naveX += (e.alvoNave - e.naveX) * Math.min(1, dt * 12);
          e.proximo -= dt;
          if (e.proximo <= 0) {
            const cristal = Math.random() < 0.3;
            e.meteoros.push({ x: 20 + Math.random() * (W - 40), y: -20, v: 140 + e.t * 4 + Math.random() * 80, r: cristal ? 8 : 10 + Math.random() * 8, cristal });
            e.proximo = Math.max(0.28, 0.75 - e.t * 0.01);
          }
          e.invul = Math.max(0, e.invul - dt);
          for (const m of e.meteoros) m.y += m.v * dt;
          for (const m of e.meteoros) {
            if (m.y > H - 92 && m.y < H - 52 && Math.abs(m.x - e.naveX) < m.r + 14) {
              m.y = H + 99;
              if (m.cristal) { e.pontos += 15; e.efeitos.push({ x: m.x, y: H - 110, t0: e.t, cor: COR.agua, txt: '+15' }); }
              else if (e.invul <= 0) { e.invul = 1.2; perderCoracao(m.x, H - 110); }
            }
          }
          e.meteoros = e.meteoros.filter((m) => m.y < H + 30);
          e.pontos += dt * 2;   // sobreviver também conta
        } else {
          e.agulha += e.agV * dt;
          if (e.agulha < 0 || e.agulha > 1) { e.agV *= -1; e.agulha = Math.max(0, Math.min(1, e.agulha)); }
        }
      }
      desenhar();
      raf = requestAnimationFrame(passo);
    };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [fase, jogo, terminar, perderCoracao]); // eslint-disable-line react-hooks/exhaustive-deps

  // teclado e "fechar a aba no meio"
  useEffect(() => {
    const tecla = (ev: KeyboardEvent) => {
      if (ev.code === 'Space') { ev.preventDefault(); acao(); }
      if (jogo === 'meteoros') {
        if (ev.key === 'ArrowLeft') est.current.alvoNave = Math.max(20, est.current.alvoNave - 60);
        if (ev.key === 'ArrowRight') est.current.alvoNave = Math.min(W - 20, est.current.alvoNave + 60);
      }
      if (ev.key === 'Escape' && fase === 'jogando') { pausado.current = true; setSair(true); }
    };
    const antesDeSair = (ev: BeforeUnloadEvent) => { if (fase === 'jogando' && !est.current.fim) { ev.preventDefault(); ev.returnValue = ''; } };
    window.addEventListener('keydown', tecla);
    window.addEventListener('beforeunload', antesDeSair);
    return () => { window.removeEventListener('keydown', tecla); window.removeEventListener('beforeunload', antesDeSair); };
  }, [acao, fase, jogo]);

  useEffect(() => { desenhar(); }); // eslint-disable-line react-hooks/exhaustive-deps

  function desenhar() {
    const c = cv.current?.getContext('2d');
    if (!c) return;
    const e = est.current;
    c.imageSmoothingEnabled = false;
    c.fillStyle = COR.ceu; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 40; i++) { c.fillStyle = i % 5 ? '#ffffff22' : '#ffffff55'; c.fillRect((i * 97) % W, (i * 53 + e.t * (i % 3 + 1) * 6) % H, 2, 2); }
    c.fillStyle = '#7a2f1e'; c.fillRect(0, H - 40, W, 40); c.fillStyle = '#a94f33'; c.fillRect(0, H - 40, W, 6);
    if (jogo === 'laser') {
      const y = 130, x = e.alvoX;   // drone
      c.fillStyle = '#9aa0b5'; c.fillRect(x - 22, y - 6, 44, 12); c.fillStyle = COR.erro; c.fillRect(x - 6, y - 4, 12, 8);
      c.fillStyle = '#c9ced9'; c.fillRect(x - 28, y - 10, 10, 3); c.fillRect(x + 18, y - 10, 10, 3);
      c.strokeStyle = '#ffffff44'; c.setLineDash([4, 6]); c.beginPath(); c.moveTo(W / 2, y + 20); c.lineTo(W / 2, H - 80); c.stroke(); c.setLineDash([]);
      c.fillStyle = '#6b6f86'; c.fillRect(W / 2 - 16, H - 76, 32, 36); c.fillStyle = COR.agua; c.fillRect(W / 2 - 4, H - 92, 8, 20);   // canhão
      if (e.tiro >= 0 && e.t - e.tiro < 0.12) { c.fillStyle = '#8fe6ff'; c.fillRect(W / 2 - 3, 100, 6, H - 192); c.fillStyle = '#ffffff'; c.fillRect(W / 2 - 1, 100, 2, H - 192); }
    } else if (jogo === 'meteoros') {
      for (const m of e.meteoros) {
        if (m.cristal) { c.fillStyle = COR.agua; c.fillRect(m.x - 5, m.y - 8, 10, 16); c.fillStyle = '#dff3ff'; c.fillRect(m.x - 2, m.y - 6, 3, 6); }
        else { c.fillStyle = '#5a2a18'; c.fillRect(m.x - m.r, m.y - m.r, m.r * 2, m.r * 2); c.fillStyle = '#8f4129'; c.fillRect(m.x - m.r + 3, m.y - m.r + 3, m.r, m.r); c.fillStyle = '#ffc83d88'; c.fillRect(m.x - 3, m.y - m.r - 14, 6, 12); }
      }
      if (!(e.invul > 0 && Math.floor(e.t * 12) % 2)) {   // nave
        const x = e.naveX, y = H - 72;
        c.fillStyle = '#e4e6f0'; c.fillRect(x - 6, y - 16, 12, 26); c.fillStyle = COR.erro; c.fillRect(x - 14, y + 2, 28, 8); c.fillStyle = COR.agua; c.fillRect(x - 3, y - 10, 6, 6);
        c.fillStyle = COR.ouro; c.fillRect(x - 3, y + 10, 6, 6 + (Math.floor(e.t * 20) % 2) * 3);
      }
    } else {
      const x0 = 40, x1 = W - 40, y = 250;
      c.fillStyle = COR.ceu2; c.fillRect(x0 - 6, y - 26, x1 - x0 + 12, 52);
      c.fillStyle = '#4d1f1f'; c.fillRect(x0, y - 18, x1 - x0, 36);
      c.fillStyle = COR.ok; c.fillRect(x0 + (e.zona - e.zonaL / 2) * (x1 - x0), y - 18, e.zonaL * (x1 - x0), 36);
      c.fillStyle = '#b8ffcf'; c.fillRect(x0 + (e.zona - e.zonaL / 8) * (x1 - x0), y - 18, (e.zonaL / 4) * (x1 - x0), 36);
      c.fillStyle = '#ffffff'; c.fillRect(x0 + e.agulha * (x1 - x0) - 2, y - 30, 4, 60);
      c.fillStyle = '#6b6f86'; c.fillRect(W / 2 - 40, 330, 80, 90); c.fillStyle = e.coracoes > 1 ? COR.agua : COR.erro;
      c.fillRect(W / 2 - 24, 345, 48, 48 + Math.sin(e.t * 6) * 4);   // núcleo do reator
    }
    // efeitos de texto
    c.font = '12px "Press Start 2P", monospace'; c.textAlign = 'center';
    e.efeitos = e.efeitos.filter((f) => e.t - f.t0 < 0.9);
    for (const f of e.efeitos) { c.globalAlpha = 1 - (e.t - f.t0) / 0.9; c.fillStyle = f.cor; c.fillText(f.txt ?? '', f.x, f.y - (e.t - f.t0) * 40); }
    c.globalAlpha = 1;
    // HUD
    c.fillStyle = '#0b0816cc'; c.fillRect(0, 0, W, 44);
    c.textAlign = 'left'; c.fillStyle = COR.ouro; c.fillText(`${Math.floor(e.pontos)} PTS`, 12, 28);
    c.textAlign = 'center'; c.fillStyle = COR.texto; c.fillText(`${Math.max(0, Math.ceil(DURACAO - e.t))}s`, W / 2, 28);
    c.textAlign = 'right'; c.fillStyle = COR.erro; c.fillText('♥'.repeat(Math.max(0, e.coracoes)) + '♡'.repeat(CORACOES - Math.max(0, e.coracoes)), W - 52, 28);
  }

  function comecar() {
    est.current = novoEstado();
    setPlacar({ pontos: 0, resultado: '' });
    setFase('jogando');
  }

  function pedirParaSair() {
    if (fase === 'jogando' && !est.current.fim) { pausado.current = true; setSair(true); }
    else aoFechar();
  }

  const mover = (ev: React.PointerEvent) => {
    if (jogo !== 'meteoros' || fase !== 'jogando') return;
    const r = cv.current!.getBoundingClientRect();
    est.current.alvoNave = Math.max(20, Math.min(W - 20, ((ev.clientX - r.left) / r.width) * W));
  };

  return (
    <div className="minigame">
      <div className="minigame-tela">
        <canvas ref={cv} width={W} height={H} onPointerDown={(ev) => { mover(ev); acao(); }} onPointerMove={(ev) => { if (ev.buttons || ev.pointerType !== 'mouse') mover(ev); }} />
        <button type="button" className="minigame-x" onClick={pedirParaSair} aria-label="Sair do minigame">✕</button>
        {fase === 'pronto' && (
          <div className="minigame-camada">
            <h3>{NOMES[jogo]}</h3>
            <p>{DICAS[jogo]}</p>
            <p className="mudo">45 segundos · 3 corações. Perdeu os 3 corações: este jogo trava por 12 h.{teste ? ' (modo teste: nada é gravado)' : ''}</p>
            <button type="button" className="btn" onClick={comecar}>▶ Jogar</button>
          </div>
        )}
        {fase === 'fim' && (
          <div className="minigame-camada">
            <h3>{placar.resultado === 'terminou' ? 'FIM DE TURNO!' : 'SEM CORAÇÕES!'}</h3>
            <p className="pixel" style={{ color: COR.ouro, fontSize: 18 }}>{Math.floor(placar.pontos)} pontos</p>
            {placar.resultado !== 'terminou' && <p className="mudo">Este minigame descansa por 12 h. Os outros continuam liberados!</p>}
            <div className="linha-botoes">
              {(teste || placar.resultado === 'terminou') && <button type="button" className="btn" onClick={comecar}>↻ De novo</button>}
              <button type="button" className="btn sec" onClick={aoFechar}>Voltar</button>
            </div>
          </div>
        )}
        {sair && (
          <div className="minigame-camada alerta">
            <h3>SAIR DA PARTIDA?</h3>
            <p>Se você sair agora, <b>perde os {CORACOES} corações</b> e este minigame fica travado por 12 horas.</p>
            <div className="linha-botoes">
              <button type="button" className="btn" onClick={() => { pausado.current = false; setSair(false); }}>Continuar jogando</button>
              <button type="button" className="btn sec" onClick={() => { setSair(false); terminar('abandonou'); aoFechar(); }}>Sair e perder</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
