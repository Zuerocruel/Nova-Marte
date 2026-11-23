'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import MontarBoneco from '@/components/MontarBoneco';
import { gerarSprite } from '@/lib/sprite';

const desenho = (s: number) => JSON.stringify(gerarSprite(s));

/** No próprio perfil: trocar o visual do boneco. Vale uma vez só (a API confere de novo). */
export default function TrocarBonecoPerfil({ seedAtual }: { seedAtual: number }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [seed, setSeed] = useState(seedAtual);
  const [confirmar, setConfirmar] = useState(false);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setErro(''); setSalvando(true);
    try {
      const r = await fetch('/api/perfil/boneco', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seed }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro || 'Erro');
      router.refresh();
    } catch (e) { setErro(e instanceof Error ? e.message : 'Erro'); setConfirmar(false); }
    finally { setSalvando(false); }
  }

  if (!aberto) {
    return (
      <p style={{ marginTop: 14 }}>
        <button type="button" className="btn ouro" onClick={() => setAberto(true)}>🎨 Personalizar meu boneco</button>
        <span className="mudo" style={{ display: 'block', marginTop: 6 }}>Você pode trocar o visual uma vez só.</span>
      </p>
    );
  }

  const igual = desenho(seed) === desenho(seedAtual);   // mesmo visual (mesmo que o número seja outro)
  return (
    <div className="caixa" style={{ marginTop: 14 }}>
      <strong>Personalizar meu boneco</strong>
      <p className="mudo" style={{ margin: '4px 0 10px' }}>
        Atenção: a troca vale <b>uma vez só</b>. O novo visual aparece no mapa e nos próximos episódios.
      </p>
      <MontarBoneco seedInicial={seedAtual} aoMudar={(s) => { setSeed(s); setConfirmar(false); }} />
      {erro && <p className="erro" role="alert">{erro}</p>}
      <div className="acoes-linha">
        {!confirmar ? (
          <button type="button" className="btn" disabled={igual} onClick={() => setConfirmar(true)}>
            {igual ? 'Mude algo para salvar' : 'Salvar novo visual'}
          </button>
        ) : (
          <>
            <span className="aviso-troca">Tem certeza? Depois não dá pra trocar de novo.</span>
            <button type="button" className="btn ouro" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando...' : 'Sim, salvar'}</button>
            <button type="button" className="btn sec" onClick={() => setConfirmar(false)} disabled={salvando}>Voltar</button>
          </>
        )}
        {!confirmar && <button type="button" className="link" onClick={() => setAberto(false)}>cancelar</button>}
      </div>
    </div>
  );
}
