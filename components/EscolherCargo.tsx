'use client';
import { CARGOS } from '@/lib/cargos';

/** Grade de cargos (rádio): usada no cadastro e na troca de cargo do perfil. */
export default function EscolherCargo({ valor, aoMudar, nome = 'cargo' }: {
  valor?: string | null; aoMudar?: (id: string) => void; nome?: string;
}) {
  return (
    <div className="cargos" role="radiogroup" aria-label="Cargo na colônia">
      {CARGOS.map((c) => (
        <label key={c.id} className="cargo">
          <input type="radio" name={nome} value={c.id} required
                 {...(aoMudar ? { checked: valor === c.id, onChange: () => aoMudar(c.id) } : { defaultChecked: valor === c.id })} />
          <span className="cargo-emoji" aria-hidden>{c.emoji}</span>
          <span><strong>{c.nome}</strong><span className="mudo">{c.descricao}</span></span>
        </label>
      ))}
    </div>
  );
}
