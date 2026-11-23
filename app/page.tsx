import Cadastro from '@/components/Cadastro';
import Contador from '@/components/Contador';
import FaixaChegadas from '@/components/FaixaChegadas';
import PaisagemHero from '@/components/PaisagemHero';

const PASSOS = [
  { n: '01', titulo: 'Crie seu colono', texto: 'Nome, nick e seu @. Em um minuto você ganha um personagem em pixel art com o seu nome.' },
  { n: '02', titulo: 'Ganhe sua casa', texto: 'Seu colono recebe um endereço fixo no mapa da colônia. Procure seu nome no mundo ao vivo.' },
  { n: '03', titulo: 'Apareça na série', texto: 'Os episódios saem no Instagram, TikTok e YouTube. Seu colono pode ser chamado para a cena.' },
];

export default function Home() {
  return (
    <main>
      <section className="capa">
        <PaisagemHero />
        <div className="capa-texto">
          <p className="capa-sobre">SÉRIE EM PIXEL ART · TEMPORADA 1</p>
          <h1 className="capa-titulo">OPERAÇÃO<br />MARTE ZERO</h1>
          <p className="capa-sub">Todo seguidor vira um personagem.</p>
        </div>
      </section>

      <div className="painel-status">
        <div className="status-num">
          <span className="mudo">colonos morando aqui</span>
          <Contador />
        </div>
        <div className="status-acoes">
          <a className="btn ouro" href="#criar">Criar meu colono</a>
          <a className="btn sec" href="/mundo">▶ Ver o mundo ao vivo</a>
        </div>
      </div>
      <FaixaChegadas />

      <section className="faixa-ferrugem">
        <div className="wrap">
          <p className="etiqueta">COMO FUNCIONA</p>
          <h2 className="titulo-secao">Do seu @ para dentro do episódio</h2>
          <ol className="passos">
            {PASSOS.map((p) => (
              <li key={p.n} className="papel">
                <span className="passo-n">{p.n}</span>
                <h3>{p.titulo}</h3>
                <p>{p.texto}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="criar" className="wrap secao-criar">
        <div className="criar-lado">
          <p className="etiqueta">ESCOTILHA ABERTA</p>
          <h2 className="titulo-secao">Criar meu personagem</h2>
          <p>
            Operação Marte Zero é uma série em pixel art onde cada pessoa que entra ganha um personagem
            com casa fixa no mundo.
          </p>
          <ul className="vantagens">
            <li><span aria-hidden>🏠</span> Casa com seu nome no mapa</li>
            <li><span aria-hidden>🎬</span> Chance de aparecer nos episódios</li>
            <li><span aria-hidden>🧑‍🚀</span> Um cargo na colônia, escolhido por você</li>
            <li><span aria-hidden>🎮</span> Missões, minigames e moedas na Central</li>
          </ul>
          <p className="mudo">Já tem personagem? <a href="/mundo">Procure seu nome</a>.</p>
        </div>
        <div className="caixa">
          <Cadastro />
        </div>
      </section>

      <section className="wrap atalhos">
        <a className="atalho papel" href="/loja">
          <span className="atalho-icone" aria-hidden>🛰️</span>
          <span>
            <h3>Entreposto da colônia</h3>
            <p>Itens que aparecem de verdade nos próximos episódios.</p>
          </span>
          <b aria-hidden>→</b>
        </a>
        <a className="atalho papel" href="/central">
          <span className="atalho-icone" aria-hidden>🕹️</span>
          <span>
            <h3>Central do colono</h3>
            <p>Missões do dia, minigames, ranking e moedas.</p>
          </span>
          <b aria-hidden>→</b>
        </a>
      </section>
    </main>
  );
}
