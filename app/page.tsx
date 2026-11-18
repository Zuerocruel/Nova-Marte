import Cadastro from '@/components/Cadastro';
import Contador from '@/components/Contador';

export default function Home() {
  return (
    <main className="wrap">
      <section className="hero">
        <div>
          <h1>Todo seguidor vira um personagem.</h1>
          <p>
            NovaMarte é uma série em pixel art. Cada pessoa que entra ganha um personagem
            com casa fixa no mundo, e pode aparecer nos próximos episódios no Instagram, no TikTok e no YouTube.
          </p>
          <p className="mudo">Já tem gente morando aqui:</p>
          <Contador />
          <p style={{ marginTop: 24 }}>
            <a className="btn sec" href="/mundo">Procurar meu nome</a>
          </p>
        </div>
        <div className="caixa">
          <h2 style={{ marginTop: 0 }}>Criar meu personagem</h2>
          <Cadastro />
        </div>
      </section>
    </main>
  );
}
