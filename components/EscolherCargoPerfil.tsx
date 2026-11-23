'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import EscolherCargo from '@/components/EscolherCargo';

/** No próprio perfil, para quem entrou antes dos cargos existirem: escolher o cargo (uma vez só, sem troca). */
export default function EscolherCargoPerfil() {
  const router = useRouter();
  const [valor, setValor] = useState<string | null>(null);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (!valor) { setErro('Escolha um cargo.'); return; }
    setErro(''); setSalvando(true);
    try {
      const r = await fetch('/api/perfil/cargo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cargo: valor }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro || 'Erro');
      router.refresh();
    } catch (e) { setErro(e instanceof Error ? e.message : 'Erro'); }
    finally { setSalvando(false); }
  }

  return (
    <div className="caixa" style={{ marginTop: 12 }}>
      <strong>Escolha o seu cargo na colônia</strong>
      <p className="mudo" style={{ margin: '4px 0 0', fontSize: 18 }}>Atenção: o cargo é escolhido uma vez só e não pode ser trocado depois.</p>
      <EscolherCargo nome="cargo-perfil" valor={valor} aoMudar={setValor} />
      {erro && <p className="erro" role="alert">{erro}</p>}
      <p style={{ marginTop: 12 }}>
        <button className="btn" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando...' : 'Confirmar cargo'}</button>
      </p>
    </div>
  );
}
