export const metadata = { title: 'Privacidade — NovaMarte' };

// MODELO — revise com um advogado antes de publicar e preencha os [colchetes].
export default function Privacidade() {
  return (
    <main className="wrap" style={{ maxWidth: 760 }}>
      <h1>Privacidade</h1>
      <p><strong>Quem somos:</strong> [razão social / nome], [CNPJ ou CPF], contato: [e-mail de privacidade].</p>
      <h2>O que coletamos</h2>
      <ul>
        <li><strong>Nome e @</strong>: para criar seu personagem. Aparecem publicamente no mundo e podem aparecer nos episódios (no mundo mostramos só o primeiro nome e a inicial do sobrenome).</li>
        <li><strong>WhatsApp</strong>: para identificar você, evitar cadastros repetidos, ligar compras ao seu personagem e, se você autorizar, avisar quando seu personagem aparecer. Nunca é exibido publicamente.</li>
        <li><strong>Origem da visita</strong>: de qual rede ou link você veio (cookies próprios), para sabermos quais episódios trazem gente.</li>
        <li><strong>Compras</strong>: processadas pela Cakto. Recebemos nome, e-mail, telefone, produto e status do pagamento. Não recebemos dados de cartão.</li>
      </ul>
      <h2>Base legal e uso</h2>
      <p>Consentimento (LGPD, art. 7º, I) para o personagem e os avisos; execução de contrato para as compras.
        Não vendemos seus dados. Não mandamos mensagens em massa sem a sua autorização.</p>
      <h2>Seus direitos</h2>
      <p>Você pode pedir acesso, correção ou exclusão do seu personagem e dos seus dados a qualquer momento pelo
        [e-mail de privacidade] informando seu código (NM...) ou WhatsApp. Atendemos em até 15 dias.</p>
      <h2>Por quanto tempo</h2>
      <p>Enquanto a série estiver no ar ou até você pedir exclusão. Dados de compra são guardados pelo prazo exigido por lei.</p>
    </main>
  );
}
