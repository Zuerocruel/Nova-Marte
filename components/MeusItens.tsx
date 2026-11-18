'use client';
import { useState } from 'react';

type Item = {
  pedido: number; nome: string; comprado_em: string;
  opcoes: { valor: string; rotulo: string }[]; pergunta_texto: string | null;
  opcao: string | null; texto: string | null;
};

async function chamar(body: object) {
  const r = await fetch('/api/meus-itens', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.erro || 'Erro');
  return j;
}

export default function MeusItens() {
  const [cred, setCred] = useState<{ whatsapp: string; email: string } | null>(null);
  const [itens, setItens] = useState<Item[] | null>(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  async function entrar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro('');
    const f = new FormData(e.currentTarget);
    const c = { whatsapp: String(f.get('whatsapp')), email: String(f.get('email')) };
    setCarregando(true);
    try {
      const j = await chamar({ acao: 'listar', ...c });
      setCred(c);
      setItens(j.itens);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro');
    } finally {
      setCarregando(false);
    }
  }

  if (!cred || !itens) {
    return (
      <form className="caixa" onSubmit={entrar} noValidate>
        <label htmlFor="whatsapp">Telefone usado na compra</label>
        <input id="whatsapp" name="whatsapp" type="tel" inputMode="tel" autoComplete="tel" placeholder="(11) 99999-8888" required />
        <label htmlFor="email">E-mail usado na compra</label>
        <input id="email" name="email" type="email" autoComplete="email" required />
        {erro && <p className="erro" role="alert">{erro}</p>}
        <p style={{ marginTop: 16 }}><button className="btn" disabled={carregando}>{carregando ? 'Buscando...' : 'Ver meus itens'}</button></p>
        <p className="mudo">O pagamento pode levar alguns minutos para aparecer aqui (Pix é quase na hora).</p>
      </form>
    );
  }

  if (!itens.length) {
    return (
      <div className="caixa">
        <p>Não achamos compras aprovadas com esse telefone e e-mail.</p>
        <p className="mudo">Confira se são os mesmos que você usou no checkout. Se acabou de pagar, espere alguns minutos.</p>
        <button className="btn sec" onClick={() => { setCred(null); setItens(null); }}>Tentar de novo</button>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {itens.map((it) => <ItemForm key={it.pedido} item={it} cred={cred} />)}
    </div>
  );
}

function ItemForm({ item, cred }: { item: Item; cred: { whatsapp: string; email: string } }) {
  const [estado, setEstado] = useState<'' | 'salvando' | 'salvo'>('');
  const [erro, setErro] = useState('');
  const pendente = (item.opcoes.length > 0 && !item.opcao);
  const precisaForm = item.opcoes.length > 0 || !!item.pergunta_texto;

  async function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro('');
    const f = new FormData(e.currentTarget);
    setEstado('salvando');
    try {
      await chamar({ acao: 'salvar', ...cred, pedido: item.pedido, opcao: f.get('opcao'), texto: f.get('texto') });
      setEstado('salvo');
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro');
      setEstado('');
    }
  }

  return (
    <form className="caixa" onSubmit={salvar}>
      <h3>{item.nome}</h3>
      <p className="mudo">
        Comprado em {new Date(item.comprado_em).toLocaleDateString('pt-BR')}
        {pendente && <strong style={{ color: 'var(--areia)' }}> · falta escolher</strong>}
      </p>
      {item.opcoes.length > 0 && (
        <>
          <label htmlFor={`op-${item.pedido}`}>Escolha</label>
          <select id={`op-${item.pedido}`} name="opcao" defaultValue={item.opcao ?? ''} required>
            <option value="" disabled>selecione…</option>
            {item.opcoes.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
          </select>
        </>
      )}
      {item.pergunta_texto && (
        <>
          <label htmlFor={`tx-${item.pedido}`}>{item.pergunta_texto}</label>
          <input id={`tx-${item.pedido}`} name="texto" maxLength={120} defaultValue={item.texto ?? ''} />
        </>
      )}
      {erro && <p className="erro" role="alert">{erro}</p>}
      {precisaForm
        ? <p style={{ marginTop: 12 }}><button className="btn" disabled={estado === 'salvando'}>{estado === 'salvo' ? 'Salvo ✓' : estado === 'salvando' ? 'Salvando...' : 'Salvar'}</button></p>
        : <p className="mudo">Nada para escolher neste item. Ele vai aparecer num próximo episódio.</p>}
    </form>
  );
}
