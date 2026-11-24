import { REDES, type RedeId } from '@/lib/redes';

/** Ícones das redes em pixel (SVG 16x16 com retângulos, combina com o resto do site). */
function Icone({ id }: { id: RedeId }) {
  const px: Record<RedeId, string> = {
    instagram: 'M3 1h10v1h1v1h1v10h-1v1h-1v1H3v-1H2v-1H1V3h1V2h1zM4 3v1H3v8h1v1h8v-1h1V4h-1V3zm2 3h4v1h1v2h-1v1H6V9H5V7h1zm1 1v2h2V7zm4-3h1v1h-1z',
    tiktok: 'M8 1h2v1h1v1h1v1h2v2h-2V5h-2v6H9v1H8v1H7v1H4v-1H3v-1H2V9h1V8h1V7h3v2H5v1H4v1h1v1h2v-1h1z',
    youtube: 'M2 3h12v1h1v8h-1v1H2v-1H1V4h1zm4 2v6h1v-1h2V9h1V7H9V6H7V5z',
  };
  return <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true" style={{ imageRendering: 'pixelated' }}><path d={px[id]} fill="currentColor" fillRule="evenodd" /></svg>;
}

/** Botões para seguir a série nas três redes. `compacto`: só os ícones (topo do mapa, rodapé apertado). */
export default function RedesSociais({ titulo, compacto = false }: { titulo?: string; compacto?: boolean }) {
  return (
    <div className={compacto ? 'redes redes-compacto' : 'redes'}>
      {titulo && <span className="redes-titulo">{titulo}</span>}
      {REDES.map((r) => (
        <a key={r.id} href={r.url} target="_blank" rel="noopener noreferrer" className="rede" style={{ ['--cor' as string]: r.cor }}
           aria-label={`${r.nome} da Operação Marte Zero (${r.arroba})`} title={`${r.nome} · ${r.arroba}`}>
          <Icone id={r.id} />
          {!compacto && <span><b>{r.nome}</b><small>{r.arroba}</small></span>}
        </a>
      ))}
    </div>
  );
}
