// Operação Marte Zero · "Como se constrói uma FAZENDA SOLAR em Marte?" — cena da obra para o construcao.js.
// Usa o motor 2,5D de lá (faces, caixas, vigas, máquinas, astronautas, FX) e se registra em OBRAS.solar.
//
// A fazenda é um campo de 12 painéis (3 fileiras x 4) inclinados para o sol, cada um sobre 2 estacas de aço, com um
// banco de baterias semienterrado ao lado (a noite marciana dura 12 h). Etapas: terraplanagem → estacas (bate-estaca
// cravando 24 pilares) → estrutura inclinada (soldada) → painéis (o rover traz, a turma encaixa) → baterias →
// ligar tudo (o cabo leva a energia à colônia, as luzes acendem) → tempestade de poeira e limpeza dos painéis.
(function () {
  const NC = 4, NR = 3, NP = NC * NR;
  const PX = (c) => -2.4 + c * 1.6, PY = (r) => -1.5 + r * 1.5;
  const POS = Array.from({ length: NP }, (_, i) => ({ x: PX(i % NC), y: PY(Math.floor(i / NC)) }));
  const ESTACAS = [];   // 2 por painel, na ordem em que são cravadas (fileira por fileira, da frente para trás)
  POS.forEach((p) => { ESTACAS.push([p.x - 0.5, p.y]); ESTACAS.push([p.x + 0.5, p.y]); });
  // paradas do bate-estaca (torre dupla: crava as 2 estacas de um painel juntas), fileira em zigue-zague
  const ORDEM = Array.from({ length: NP }, (_, j) => { const r = Math.floor(j / NC), c = j % NC; return r * NC + (r % 2 ? NC - 1 - c : c); });
  const PARADA = (j) => ({ x: POS[ORDEM[j]].x, y: POS[ORDEM[j]].y - 0.85 });
  const HE = 0.45;                                           // altura da estaca fora do chão
  const BAT = { x0: -4.85, x1: -3.65, y0: -0.9, y1: 0.9 };   // banco de baterias
  const PILHA = [4.3, 2.7];                                  // canteiro: estacas e vigas esperando a vez
  const ROVER_PARA = [3.7, -2.9];                            // onde o rover estaciona com os painéis
  const E = (id) => OB.etapas.find((e) => e.id === id);
  const z0 = (x, y) => altura(x, y, 1);
  // mistura de cores em "#rrggbb" (o sombreamento do motor só entende hex; o mistCor de lá devolve rgb())
  const mistHex = (a, b, k) => {
    const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
    const c = (sh) => Math.round(lerp((A >> sh) & 255, (B >> sh) & 255, clamp(k))).toString(16).padStart(2, '0');
    return `#${c(16)}${c(8)}${c(0)}`;
  };

  // ---------------------------------------------------------------- peças da fazenda
  function estaca(x, y, alturaFora) {   // pilar de aço galvanizado com a chapa de topo
    const z = z0(x, y);
    cilindro([x, y, z - 0.02], [x, y, z + alturaFora], 0.06, 8, '#9aa0b5', { tampa: '#c9ced9' });
    caixa3(x - 0.08, y - 0.08, z + alturaFora - 0.02, x + 0.08, y + 0.08, z + alturaFora + 0.02, '#6b6f86');
  }
  function suporte(i, k) {   // trave + 2 trilhos inclinados (frente baixa, fundo alto)
    if (k <= 0) return;
    const { x, y } = POS[i], z = z0(x, y) + HE;
    const xa = x - 0.5, xb = lerp(x - 0.5, x + 0.5, Math.min(1, k * 1.6));
    viga([xa, y, z + 0.02], [xb, y, z + 0.02], 0.07, '#c9ced9', { topo: '#eef0f8' });
    for (const [q, xx] of [[0.55, x - 0.42], [1, x + 0.42]]) {
      const kk = clamp((k - q + 0.45) / 0.45);
      if (kk <= 0) continue;
      viga([xx, y - 0.42, z - 0.05], [xx, lerp(y - 0.42, y + 0.42, kk), lerp(z - 0.05, z + 0.3, kk)], 0.05, '#9aa0b5');
    }
  }
  /** Painel inclinado (vidro azul, moldura clara). sujo 0..1 = poeira; brilho = reflexo do sol. */
  function painel(i, k, sujo, brilho, desloc = [0, 0, 0]) {
    if (k <= 0) return;
    const { x, y } = POS[i], c = soma([x, y, z0(x, y) + HE + 0.2], desloc);
    const ux = [0.66 * k, 0, 0], uy = [0, 0.5, 0.2], uz = [0, -0.02, 0.05];
    const vidro = mistHex(NOITE > 0.5 ? '#24387a' : '#4a6ff0', '#b5683f', clamp(sujo) * 0.85);
    obox(c, ux, uy, uz, '#c9ced9', { topo: vidro });
    if (k >= 1) for (const q of [-0.33, 0, 0.33]) {   // divisões entre as células
      const a = soma(c, soma(mul(ux, q), soma(uz, [0, 0, 0.004]))), b = soma(a, [0, 0, 0]);
      linha3(soma(a, mul(uy, -1)), soma(b, mul(uy, 1)), mistHex('#9fb4ff', '#8f4129', sujo), 1, false);
    }
    if (brilho > 0 && sujo < 0.4) FX.push({ tipo: 'brilho', p: soma(c, [0.2, -0.1, 0.12]), cor: '#dfe9ff', r: 1.2 + brilho });
  }
  function pilhaEstacas(n) {
    const [x, y] = PILHA, z = z0(x, y);
    for (let i = 0; i < n; i++) {
      const zz = z + 0.07 + Math.floor(i / 4) * 0.13, yy = y - 0.3 + (i % 4) * 0.18;
      cilindro([x - 0.6, yy, zz], [x + 0.6, yy, zz], 0.06, 6, '#9aa0b5', { tampa: '#c9ced9' });
    }
  }
  function pilhaPaineis(x, y, n, dir = 0) {   // painéis deitados em cima de um estrado
    const z = z0(x, y), L = local([x, y, z], dir);
    obox(L.at(0, 0, 0.05), mul(L.u, 0.5), mul(L.v, 0.4), [0, 0, 0.05], '#8f6a45', { topo: '#a07a50' });
    for (let i = 0; i < n; i++) obox(L.at(0, 0, 0.13 + i * 0.07), mul(L.u, 0.46), mul(L.v, 0.36), [0, 0, 0.025], '#c9ced9', { topo: '#4a6ff0' });
  }
  /** Bate-estaca: base de esteira, torre vertical com o martelo que sobe e cai em cima da estaca. */
  function bateEstaca(x, y, t, ciclo, ativa, andando = false) {
    const z = z0(x, y), base = local([x, y, z], Math.PI / 2), { u, v, at } = base;
    esteira(base, 0, -0.36, 1.1, 0.28, andando ? t * 0.4 : 0); esteira(base, 0, 0.36, 1.1, 0.28, andando ? t * 0.4 : 0);
    obox(at(-0.1, 0, 0.45), mul(u, 0.45), mul(v, 0.36), [0, 0, 0.18], '#e2603b', { topo: '#ff8a5c' });   // corpo
    obox(at(-0.25, 0.18, 0.78), mul(u, 0.18), mul(v, 0.15), [0, 0, 0.16], '#c94f2e', { topo: '#e2603b' });  // cabine
    operador(at(-0.25, 0.18, 0.62), Math.PI / 2, '#ffc83d');
    face([at(-0.07, 0.05, 0.66), at(-0.07, 0.31, 0.66), at(-0.07, 0.31, 0.92), at(-0.07, 0.05, 0.92)], '#8fe6ff', { n: u, alfa: 0.55, duplo: true });
    giroflex(at(-0.45, -0.2, 0.68), t);
    // martelo: sobe devagar (0–0.7) e despenca (0.7–0.78), depois quica
    const sobe = ciclo < 0.7 ? suave3(ciclo / 0.7) : ciclo < 0.78 ? 1 - (ciclo - 0.7) / 0.08 : 0;
    const mz = 0.25 + sobe * 0.75;
    for (const lado of [-0.5, 0.5]) {   // uma torre em cima de cada estaca do par
      const pe = at(0.85, lado, 0.3), topo = at(0.85, lado, 2.3);
      for (const sg of [-1, 1]) viga(soma(pe, mul(u, sg * 0.1)), soma(topo, mul(u, sg * 0.1)), 0.05, '#ffc83d');
      for (let i = 1; i < 8; i++) viga(at(0.75, lado, 0.3 + i * 0.25), at(0.95, lado, 0.3 + (i + 0.5) * 0.25), 0.025, '#e0a920');
      viga(at(0.25, lado * 0.6, 0.62), at(0.85, lado, 1.6), 0.05, '#e0a920');                                   // escora
      obox(soma(at(0.85, lado, 0), [0, 0, z0(x, y) - z + HE + mz + 0.75]), mul(u, 0.13), mul(v, 0.13), [0, 0, 0.18], '#4a4466', { topo: '#6b6f86' });
      if (ativa && ciclo >= 0.78 && ciclo < 0.86) FX.push({ tipo: 'poeira', p: at(0.85, lado, 0.05), t, semente: 7 + lado * 4 });
    }
    viga(at(0.85, -0.5, 2.3), at(0.85, 0.5, 2.3), 0.05, '#ffc83d');                                                // travessa no topo
    if (ativa || andando) FX.push({ tipo: 'fumaca', p: at(-0.5, -0.2, 0.9), t, semente: 4 });
    return at(0.85, 0, 1.2);
  }
  function bancoBaterias(k, noite, carga) {   // casa semienterrada: paredes, telhado de sacos de regolito, baterias
    if (k <= 0) return;
    const { x0, x1, y0, y1 } = BAT, z = z0((x0 + x1) / 2, 0) - 0.05, h = 0.85 * suave3(clamp(k / 0.45));
    caixa3(x0, y0, z, x1, y1, z + h, '#eef0f8', { topo: '#c9ced9' });
    if (k > 0.45) {   // telhado de sacos de regolito (proteção contra frio e radiação)
      const kt = clamp((k - 0.45) / 0.3);
      for (let i = 0; i < 6; i++) if (i / 6 < kt) {
        const yy = lerp(y0 + 0.15, y1 - 0.15, i / 5);
        prisma((x0 + x1) / 2, yy, z + h, z + h + 0.14, 0.55, 0.45, 8, '#b85a37', { topo: '#c96a45' });
      }
      caixa3(x1 - 0.01, -0.25, z, x1 + 0.03, 0.25, z + 0.6, '#3a2f63');   // porta
    }
    if (k > 0.75) for (let i = 0; i < 4; i++) {   // luzinhas de carga das baterias (na parede de fora)
      const aceso = i / 4 < carga;
      caixa3(x1 + 0.02, y0 + 0.2 + i * 0.12, z + 0.68, x1 + 0.05, y0 + 0.28 + i * 0.12, z + 0.74, aceso ? '#4ed37a' : '#2a2140', { emis: aceso });
    }
    if (k > 0.75) caixa3(x1 + 0.02, 0.4, z + 0.5, x1 + 0.08, 0.6, z + 0.56, noite > 0.3 ? '#ffe58a' : '#c9ced9', { emis: noite > 0.3 });
  }
  const ROTA_CAMPO = [[-3.6, 0.5], [-3.2, 0.75], [-2.4, 0.75]];               // baterias → fileira do meio
  const ROTA_COLONIA = [[-4.25, -0.9], [-4.5, -2.0], [-4.9, -3.2], [-5.6, -4.6]]; // baterias → colônia (fora da tela)
  function caboRota(rota, k, pulsosT, cor = '#ffe58a') {
    const tot = rota.length - 1;
    for (let i = 0; i < tot; i++) {
      const kk = clamp(k * tot - i);
      if (kk <= 0) break;
      const a = rota[i], b = rota[i + 1], fim = [lerp(a[0], b[0], kk), lerp(a[1], b[1], kk)];
      viga([a[0], a[1], z0(a[0], a[1]) + 0.05], [fim[0], fim[1], z0(fim[0], fim[1]) + 0.05], 0.1, '#3a2f63', { topo: '#2a2140' });
    }
    if (pulsosT != null) for (let p = 0; p < 3; p++) {
      const q = ((pulsosT * 0.5 + p / 3) % 1) * tot, i = Math.floor(q), f = q - i, a = rota[i], b = rota[i + 1];
      const x = lerp(a[0], b[0], f), y = lerp(a[1], b[1], f);
      FX.push({ tipo: 'brilho', p: [x, y, z0(x, y) + 0.18], cor, r: 2 });
    }
  }
  function postes(k, aceso) {   // postes de luz ao longo do cabo da colônia
    ROTA_COLONIA.slice(1).forEach(([x, y], i) => {
      if (k * 3 < i + 0.3) return;
      const z = z0(x, y) + 0.05;
      viga([x + 0.25, y, z], [x + 0.25, y, z + 1.0], 0.05, '#6b6f86');
      caixa3(x + 0.15, y - 0.08, z + 0.98, x + 0.4, y + 0.08, z + 1.05, aceso ? '#ffe58a' : '#9aa0b5', { emis: aceso });
      if (aceso) FX.push({ tipo: 'brilho', p: [x + 0.28, y, z + 0.95], cor: '#ffe58a', r: 3 });
    });
  }

  // ---------------------------------------------------------------- estado da obra no tempo tc
  function estado(tc) {
    const s = { plano: 0, trator: null, estacas: 0, estacaK: 0, bate: null, suportes: 0, supK: 0, paineis: 0, painelK: 0,
                rover: null, bat: 0, carga: 0, caboCampo: 0, caboColonia: 0, energia: false, luzes: false, noite: 0,
                sujo: 0, limpos: NP, limpaK: 0, tempestade: 0, feixe: 0 };
    const Ee = Object.fromEntries(OB.etapas.map((e) => [e.id, e]));
    const k = (id) => (Ee[id] ? clamp((tc - Ee[id].ini) / (Ee[id].fim - Ee[id].ini)) : 0);
    const depois = (id) => Ee[id] && tc >= Ee[id].fim;
    const durante = (id) => Ee[id] && tc >= Ee[id].ini && tc < Ee[id].fim;
    s.plano = depois('terraplanagem') ? 1 : suave3(k('terraplanagem') * 1.15 - 0.1);
    if (durante('terraplanagem')) {
      const q = k('terraplanagem'), vai = (q * 3) % 1, ida = Math.floor(q * 3) % 2 === 0, y = lerp(-1.6, 1.6, Math.floor(q * 3) / 2);
      s.trator = { x: ida ? lerp(-4.2, 4.2, suave3(vai)) : lerp(4.2, -4.2, suave3(vai)), y, dir: ida ? 0 : Math.PI };
    }
    // estacas: 0.04–0.96 crava os 12 pares (s.estacas = paradas prontas); em cada parada o bate-estaca anda
    // devagar até o painel (0–0.4) e bate 2 vezes enquanto as 2 estacas descem (0.4–1)
    const ks = k('estacas');
    if (depois('estacas')) s.estacas = NP;
    else if (ks > 0.04) { const q = clamp((ks - 0.04) / 0.92) * NP; s.estacas = Math.min(NP, Math.floor(q)); s.estacaK = q - Math.floor(q); }
    if (durante('estacas') && s.estacas < NP) {
      const b = PARADA(s.estacas), a = s.estacas ? PARADA(s.estacas - 1) : (ks <= 0.04 ? { x: 4.6, y: -3.0 } : { x: 4.6, y: -3.0 });
      const kk = ks <= 0.04 ? 0 : s.estacaK, anda = clamp(kk / 0.4), x = lerp(a.x, b.x, suave3(anda)), y = lerp(a.y, b.y, suave3(anda));
      const bate = clamp((kk - 0.4) / 0.6);
      s.bate = { x, y, ciclo: (bate * 2) % 1, ativa: anda >= 1, andando: anda > 0 && anda < 1, desce: suave3(bate) };
    }
    // estrutura: um suporte por painel
    const ke = k('estrutura');
    if (depois('estrutura')) s.suportes = NP; else if (ke > 0) { const q = clamp(ke / 0.95) * NP; s.suportes = Math.min(NP, Math.floor(q)); s.supK = q - Math.floor(q); }
    // painéis: o rover chega (0–0.12) e a turma encaixa os 12 (0.12–0.95)
    const kp = k('paineis');
    if (depois('paineis')) s.paineis = NP; else if (kp > 0.12) { const q = clamp((kp - 0.12) / 0.83) * NP; s.paineis = Math.min(NP, Math.floor(q)); s.painelK = q - Math.floor(q); }
    if (durante('paineis')) s.rover = { x: lerp(7.5, ROVER_PARA[0], suave3(clamp(kp / 0.12))), y: ROVER_PARA[1], andando: kp < 0.12, n: NP - s.paineis };
    // baterias: casa (0–0.75), baterias carregando o dia todo
    const kb = k('baterias');
    s.bat = depois('baterias') ? 1 : kb;
    // energia: cabo até o campo (0–0.3) e até a colônia (0.25–0.6); liga em 0.6; anoitece e os postes acendem
    const kl = k('energia');
    s.caboCampo = depois('energia') ? 1 : clamp(kl / 0.3);
    s.caboColonia = depois('energia') ? 1 : clamp((kl - 0.25) / 0.35);
    s.energia = depois('energia') || kl > 0.6;
    s.noite = depois('energia') ? 0 : suave3(clamp((kl - 0.62) / 0.25));
    s.luzes = s.energia && (s.noite > 0.35 || depois('energia'));
    if (depois('energia')) s.luzes = true;
    s.carga = s.energia ? clamp(0.25 + (tc - (Ee.energia ? Ee.energia.ini : 0)) / 20) : 0;
    // poeira: 0–0.3 tempestade (os painéis ficam vermelhos de poeira) · 0.3–0.95 limpeza painel por painel
    const kq = k('poeira');
    if (durante('poeira') || depois('poeira')) {
      s.tempestade = durante('poeira') ? Math.sin(clamp(kq / 0.36) * Math.PI) ** 0.6 : 0;   // sobe rápido e fica forte
      s.sujo = depois('poeira') ? 0 : clamp(kq / 0.25);
      if (depois('poeira')) s.limpos = NP;
      else { const q = clamp((kq - 0.3) / 0.65) * NP; s.limpos = kq < 0.3 ? 0 : Math.min(NP, Math.floor(q)); s.limpaK = q - Math.floor(q); }
      s.noite = 0;
    }
    if (Ee.voo && tc >= Ee.voo.ini) s.noite = clamp((tc - Ee.voo.ini) / 3) * 0.75;   // fim do dia sobre a fazenda pronta
    return s;
  }
  /** Energia produzida agora (kW), para o medidor. */
  function energiaKW(s) {
    if (!s.energia && s.paineis < NP) return 0;
    let soma = 0;
    for (let i = 0; i < NP; i++) {
      if (i >= s.paineis) continue;
      const sujo = i < s.limpos ? 0 : s.sujo;
      soma += 10 * (1 - 0.7 * sujo);
    }
    return Math.round(soma * (1 - s.noite) * (1 - 0.5 * s.tempestade));
  }

  // ---------------------------------------------------------------- cena
  function montar(t, tc, s) {
    FACES = []; TAGS = []; FX = []; FOCO = { pessoas: [], trator: null };
    chaoOb(s.plano);
    // estacas cravadas (e a da vez descendo)
    for (let j = 0; j < Math.min(NP, s.estacas); j++) { const p = POS[ORDEM[j]]; estaca(p.x - 0.5, p.y, HE); estaca(p.x + 0.5, p.y, HE); }
    if (s.bate && s.estacas < NP) {
      const p = POS[ORDEM[s.estacas]];
      if (s.bate.ativa) { const alt = lerp(1.25, HE, s.bate.desce); estaca(p.x - 0.5, p.y, alt); estaca(p.x + 0.5, p.y, alt); }
      FOCO.trator = bateEstaca(s.bate.x, s.bate.y, t, s.bate.ativa ? s.bate.ciclo : 0, s.bate.ativa, s.bate.andando);
    }
    if (E('estacas') && tc < E('estacas').fim && tc >= E('estacas').ini - 2) pilhaEstacas(Math.max(0, Math.ceil((NP - s.estacas) * 2 / 3)));
    // estrutura e painéis
    for (let i = 0; i < NP; i++) {
      if (i < s.suportes) suporte(i, 1); else if (i === s.suportes && s.supK > 0) { suporte(i, suave3(s.supK)); if (s.supK > 0.4) FX.push({ tipo: 'faisca', p: [POS[i].x + 0.42, POS[i].y, z0(POS[i].x, POS[i].y) + HE + 0.1], t, semente: i }); }
      const sujo = i < s.limpos ? 0 : s.sujo, brilho = s.energia && s.noite < 0.3 ? 1 : 0;
      if (i < s.paineis) painel(i, 1, sujo, brilho);
      else if (i === s.paineis && s.painelK > 0.35) {   // o painel da vez desce até o trilho, carregado pela dupla
        const q = clamp((s.painelK - 0.35) / 0.5);
        painel(i, 1, 0, 0, [0, -0.6 * (1 - suave3(q)), 0.5 * (1 - suave3(q))]);
        if (q >= 0.9) FX.push({ tipo: 'faisca', p: [POS[i].x, POS[i].y - 0.45, z0(POS[i].x, POS[i].y) + HE + 0.12], t, semente: i + 3 });
      }
    }
    if (E('estrutura') && tc >= E('estrutura').ini && tc < E('estrutura').fim) pilhaVigas(PILHA[0], PILHA[1], Math.max(1, Math.round((1 - s.suportes / NP) * 6)));
    if (s.rover) {
      rover(s.rover.x, s.rover.y, Math.PI, t, s.rover.andando, false);
      pilhaPaineis(s.rover.x, s.rover.y + 0.0, Math.min(6, s.rover.n), Math.PI);
      FOCO.trator = [s.rover.x, s.rover.y, z0(s.rover.x, s.rover.y) + 0.9];
    }
    // baterias, cabos e postes
    bancoBaterias(s.bat, s.noite, s.carga);
    if (E('baterias') && tc >= E('baterias').ini && tc < E('baterias').fim) {
      const kb = clamp((tc - E('baterias').ini) / (E('baterias').fim - E('baterias').ini));
      if (kb > 0.6) for (let i = 0; i < Math.round((1 - kb) * 10); i++) caixa3(-3.2 + (i % 3) * 0.28, -1.5 - Math.floor(i / 3) * 0.28, z0(-3.2, -1.5), -3.0 + (i % 3) * 0.28, -1.3 - Math.floor(i / 3) * 0.28, z0(-3.2, -1.5) + 0.2, '#2a2140', { topo: '#4ed37a' });
    }
    caboRota(ROTA_CAMPO, s.caboCampo, s.energia ? t : null);
    caboRota(ROTA_COLONIA, s.caboColonia, s.energia ? t + 0.4 : null);
    postes(s.caboColonia, s.luzes);
    if (s.tempestade > 0) for (let i = 0; i < 10; i++) FX.push({ tipo: 'poeira', p: [-5 + ((t * 1.6 + i * 1.1) % 10), -3 + hash(i, 2, 9) * 6, 0.4 + hash(i, 3, 9) * 1.2], t, semente: i + 20 });
    if (s.trator) { trator(s.trator.x, s.trator.y, s.trator.dir, t, true); FOCO.trator = [s.trator.x, s.trator.y, z0(s.trator.x, s.trator.y) + 0.7]; }
    NOITE_POEIRA = s.tempestade;
    pessoas(t, s);
    return {};
  }
  let NOITE_POEIRA = 0;

  // ---------------------------------------------------------------- colonos (nomes de verdade) em cada etapa
  const lerpAng = (a, b, k) => { const d = ((((b - a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI; return a + d * clamp(k); };
  const velDe = (q) => clamp((6 * q * (1 - q)) / 1.5 * 1.3, 0, 1);
  const FASES = { poeira: [0.3] };
  const segDe = (id, k) => (FASES[id] || []).filter((b) => k >= b).length;

  function alvo(id, k, i, t, s) {
    const e = E(id) || { ini: 0, fim: 1 }, dur = e.fim - e.ini, kEm = (tx) => clamp((tx - e.ini) / dur);
    const r = { x: 0, y: 0, a: 'parar', o: 0, mov: null };
    const no = (xx, yy, a, o) => { r.x = xx; r.y = yy; r.a = a; r.o = o == null ? Math.atan2(-yy, -xx) : o; r.mov = null; return r; };
    const andando = (A, B, q, a, oA, oB) => {
      const d = Math.hypot(B[0] - A[0], B[1] - A[1]), e2 = suave3(q), dir = Math.atan2(B[1] - A[1], B[0] - A[0]);
      no(lerp(A[0], B[0], e2), lerp(A[1], B[1], e2), a, q < 0.18 ? lerpAng(oA, dir, q / 0.18) : q > 0.82 ? lerpAng(dir, oB, (q - 0.82) / 0.18) : dir);
      r.mov = { passo: d * e2, v: velDe(q) };
      return r;
    };
    const caminho = (p0, p1, vel, a = 'andar', pausa = 1.1) => {
      const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) || 0.01, tw = L / vel, T = 2 * tw + 2 * pausa;
      const tt0 = t + i * 1.3, n = Math.floor(tt0 / T), tt = tt0 - n * T;
      const ab = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]), ba = ab + Math.PI, parado = a === 'carregar' ? 'carregar' : 'parar';
      if (tt < tw) andando(p0, p1, tt / tw, a, ab, ab);
      else if (tt < tw + pausa) { no(p1[0], p1[1], parado, lerpAng(ab, ba, suave3((tt - tw) / pausa))); if (a === 'carregar') r.mov = { passo: 0, v: 0 }; }
      else if (tt < 2 * tw + pausa) andando(p1, p0, (tt - tw - pausa) / tw, a, ba, ba);
      else { no(p0[0], p0[1], parado, lerpAng(ba, ab + 2 * Math.PI, suave3((tt - 2 * tw - pausa) / pausa))); if (a === 'carregar') r.mov = { passo: 0, v: 0 }; }
      return r;
    };
    const degraus = (ponto, T0, a, o, tw0 = 1.0) => {
      const T = Math.max(T0, 2.4), tw = Math.min(tw0, T * 0.4);
      const tt = t + i * 0.45, n = Math.floor(tt / T), f = tt - n * T, A = ponto(n * T - i * 0.45), B = ponto((n + 1) * T - i * 0.45);
      const oA = no(A[0], A[1], a, o).o, oB = no(B[0], B[1], a, o).o;
      if (f < T - tw || Math.hypot(B[0] - A[0], B[1] - A[1]) < 0.05) return no(A[0], A[1], a, o);
      return andando(A, B, (f - (T - tw)) / tw, 'andar', oA, oB);
    };
    const painelEm = (tx, ini, len) => POS[Math.min(NP - 1, Math.floor(clamp((kEm(tx) - ini) / len) * NP))];
    if (id === 'terraplanagem' || id === 'abertura') {
      const ang = -2.2 + i * 0.55, acoes = ['sinalizar', 'tablet', 'pa', 'pa', 'tablet'];
      no(Math.cos(ang) * 4.9, Math.sin(ang) * 4.9, acoes[i % 5]);
      if (r.a === 'sinalizar' && s.trator) r.o = Math.atan2(s.trator.y - r.y, s.trator.x - r.x);
    } else if (id === 'estacas') {
      const parada = (tx) => Math.min(NP - 1, Math.floor(clamp((kEm(tx) - 0.04) / 0.92) * NP));
      const prox = (tx) => { const p = POS[ORDEM[parada(tx)]]; return [p.x, p.y]; };
      if (i === 0) { const p = prox(t); no(p[0] + 0.7, p[1] - 0.5, 'sinalizar'); r.o = Math.atan2(-0.35, -0.7); }
      else if (i === 1) degraus((tx) => { const p = prox(tx); return [p[0] - 0.55, p[1] + 0.35]; }, 2.4, 'tablet', -0.6);
      else if (i === 2) degraus((tx) => { const p = POS[ORDEM[Math.min(NP - 1, parada(tx) + 1)]]; return [p.x + 0.3, p.y + 0.3]; }, 2.4, 'martelar', Math.PI * 1.25);
      else if (i === 3) caminho([PILHA[0] - 0.8, PILHA[1]], [prox(t)[0] + 0.9, prox(t)[1] + 0.6], 0.6, 'carregar');
      else no(-4.2, -2.4, 'tablet', 0.6);
    } else if (id === 'estrutura') {
      const T = (dur * 0.95) / NP, atual = (tx) => painelEm(tx, 0, 0.95);
      // soldadores: andam 0,7 s até o suporte da vez e soldam uns 2,5 s (um de cada lado, em painéis diferentes)
      if (i < 2) degraus((tx) => { const p = atual(tx + i * 1.6); return [p.x + (i ? 0.75 : -0.75), p.y - 0.15]; }, 3.2, 'soldar', i ? Math.PI : 0, 0.7);
      else if (i === 2) caminho([PILHA[0] - 0.8, PILHA[1] - 0.2], [atual(t).x + 0.5, atual(t).y + 0.6], 0.6, 'carregar');
      else if (i === 3) no(-4.3, 1.6, 'tablet', -0.4);
      else degraus((tx) => { const p = atual(tx); return [p.x, p.y + 0.75]; }, T, 'chave', -Math.PI / 2);
    } else if (id === 'paineis') {
      const T = (dur * 0.83) / NP, atual = (tx) => painelEm(tx, 0.12, 0.83);
      if (k < 0.12) no(ROVER_PARA[0] - 0.9 - i * 0.35, ROVER_PARA[1] + 0.9, i === 0 ? 'sinalizar' : 'parar', -0.3);
      else if (i < 2) degraus((tx) => { const p = atual(tx); return [p.x + (i ? 0.85 : -0.85), p.y - 0.25]; }, T, 'chave', i ? Math.PI : 0);
      else if (i < 4) caminho([ROVER_PARA[0] - 0.6, ROVER_PARA[1] + (i === 2 ? 0.25 : -0.25)], [atual(t).x + 0.35 * (i === 2 ? -1 : 1), atual(t).y - 0.85], 0.55, 'carregar', 0.9);
      else no(-4.0, -2.0, 'tablet', 0.5);
    } else if (id === 'baterias') {
      const { x0, x1, y0, y1 } = BAT;
      if (k < 0.6) { const lug = [[x0 - 0.3, -0.4, 0], [x1 + 0.3, -0.5, Math.PI], [x0 - 0.3, 0.5, 0], [x1 + 0.3, 0.5, Math.PI], [-2.6, 1.6, null]]; const [lx, ly, o] = lug[i]; no(lx, ly, i === 4 ? 'tablet' : 'martelar', o); }
      else if (i < 3) caminho([-3.0, -1.4 + i * 0.3], [x1 + 0.35, -0.1 + i * 0.1], 0.5, 'carregar');
      else no(x1 + 0.6, i === 3 ? 0.8 : -0.9, i === 3 ? 'chave' : 'tablet', Math.PI);
    } else if (id === 'energia') {
      if (k < 0.6) {   // estendendo o cabo
        const fr = (tx) => { const q = clamp(kEm(tx) / 0.3); const a = ROTA_CAMPO[q < 0.5 ? 0 : 1], b = ROTA_CAMPO[q < 0.5 ? 1 : 2]; return [lerp(a[0], b[0], (q * 2) % 1), lerp(a[1], b[1], (q * 2) % 1)]; };
        if (i < 2) degraus((tx) => { const p = fr(tx); return [p[0] + 0.2, p[1] + (i ? 0.35 : -0.35)]; }, 2.2, 'agachar', i ? -Math.PI / 2 : Math.PI / 2);
        else if (i === 2) no(BAT.x1 + 0.45, 0.6, 'chave', Math.PI);
        else no(-4.9 + i * 0.3, -2.4, 'tablet', 0.9);
      } else no(-2.9 + (i % 3) * 0.5, 1.9 + Math.floor(i / 3) * 0.5, 'festa', -Math.PI / 2);
    } else if (id === 'poeira') {
      if (k < 0.3) {   // correm do campo para o abrigo da casa das baterias e agacham de costas para o vento
        const abrigo = [BAT.x1 + 0.35 + (i % 2) * 0.3, -0.8 + i * 0.4], q = clamp(kEm(t) / 0.1);
        const de = [POS[(i * 5) % NP].x, POS[(i * 5) % NP].y - 0.6];
        if (q < 1) andando(de, abrigo, q, 'andar', 0, Math.PI);
        else if (i === 4) no(abrigo[0], abrigo[1], 'tablet', Math.PI + Math.sin(t * 1.3) * 0.4);
        else { no(abrigo[0], abrigo[1], (Math.floor(t * 0.7 + i) % 3) ? 'agachar' : 'sinalizar', Math.PI + Math.sin(t * 2 + i) * 0.25); }
      }
      else if (i < 4) {   // escovando os painéis, um por um
        const T = (dur * 0.65) / NP, atual = (tx) => painelEm(tx, 0.3, 0.65);
        degraus((tx) => { const p = atual(tx); return [p.x + (i % 2 ? 0.4 : -0.4), p.y - 0.85 + (i > 1 ? 1.65 : 0)]; }, T, 'pa', i > 1 ? -Math.PI / 2 : Math.PI / 2);
      } else no(-4.1, -1.6, 'tablet', 0.4);
    } else {   // voo e convite: comemorando na frente da fazenda
      no(-1.2 + (i % 3) * 0.8, -2.6 - Math.floor(i / 3) * 0.6, 'festa', Math.PI / 2);
    }
    return r;
  }

  function pessoas(t, s) {
    const { e, k } = etapaEm(t), idx = OB.etapas.indexOf(e);
    OB.colonos.forEach((c, i) => {
      const sem = i * 1.7, cor = TRAJES[i % TRAJES.length];
      let r = alvo(e.id, k, i, t, s);
      const seg = segDe(e.id, k), bordas = FASES[e.id] || [];
      const kIni = seg ? bordas[seg - 1] : 0, tIni = e.ini + kIni * (e.fim - e.ini);
      let antes = null;
      if (seg) antes = alvo(e.id, kIni - 1e-4, i, tIni, s);
      else if (idx > 1) antes = alvo(OB.etapas[idx - 1].id, 0.9999, i, tIni, s);
      if (antes) {
        const d = Math.hypot(r.x - antes.x, r.y - antes.y), dur = clamp(d / 0.8, 0.8, 3.4), q = (t - tIni) / dur;
        if (d > 0.12 && q < 1) {
          const e2 = suave3(q), dir = Math.atan2(r.y - antes.y, r.x - antes.x);
          const olhar = q < 0.15 ? lerpAng(antes.o, dir, q / 0.15) : q > 0.85 ? lerpAng(dir, r.o, (q - 0.85) / 0.15) : dir;
          r = { ...r, x: lerp(antes.x, r.x, e2), y: lerp(antes.y, r.y, e2), a: r.a === 'carregar' ? 'carregar' : 'andar', o: olhar, mov: { passo: d * e2, v: velDe(q) } };
        }
      }
      if (r.a === 'soldar' && !(r.mov && r.mov.v > 0.05) && Math.floor(t * 4 + i) % 5) {   // maçarico aceso
        const hx = r.x + Math.cos(r.o) * 0.42, hy = r.y + Math.sin(r.o) * 0.42;
        FX.push({ tipo: 'faisca', p: [hx, hy, z0(hx, hy) + 0.78], t, semente: i + 11 });
        FX.push({ tipo: 'brilho', p: [hx, hy, z0(hx, hy) + 0.8], cor: '#e8f6ff', r: 2.5 });
      }
      ULTIMA_CAIXA = null;
      const cabeca = pessoa(r.x, r.y, z0(r.x, r.y), cor, r.o, r.a, t, sem, r.mov);
      if (r.a === 'carregar' && ULTIMA_CAIXA && (e.id === 'paineis')) obox(soma(ULTIMA_CAIXA, [0, 0, 0.05]), [0.3, 0, 0], [0, 0.22, 0], [0, 0, 0.02], '#c9ced9', { topo: '#4a6ff0' });
      TAGS.push({ p: cabeca, nome: c.nome, cor });
      FOCO.pessoas[i] = soma(cabeca, [0, 0, -0.6]);
    });
  }

  // ---------------------------------------------------------------- câmera e HUD
  const YAW_FRENTE = 2.4;   // giro que mostra o vidro dos painéis (a frente baixa vira para a câmera)
  const PLANOS_S = {
    abertura: { tz: 0.6, zoom: 27, pitch: 0.5, yaw: YAW_FRENTE },
    terraplanagem: { tz: 0.3, zoom: 22, pitch: 0.6 },
    estacas: { tz: 0.3, zoom: 26, pitch: 0.55 },
    estrutura: { tz: 0.5, zoom: 27, pitch: 0.5 },
    paineis: { tz: 0.5, zoom: 25, pitch: 0.52 },
    baterias: { tx: -4.0, ty: 0.2, tz: 0.4, zoom: 40, pitch: 0.42 },
    energia: { tx: -2.6, ty: -0.8, tz: 0.4, zoom: 24, pitch: 0.42 },
    poeira: { tz: 0.5, zoom: 24, pitch: 0.48 },
    voo: { tz: 0.5, zoom: 27, pitch: 0.4 },
    convite: { ty: 0.4, tz: 0.4, zoom: 25, pitch: 0.46, yaw: YAW_FRENTE },
  };
  const CLOSES_S = {
    terraplanagem: { alvo: 'trator', zoom: 70, de: 0.34, ate: 0.6, pitch: 0.34 },
    estacas: { alvo: 'trator', zoom: 62, de: 0.2, ate: 0.42, pitch: 0.32 },
    estrutura: { alvo: 0, zoom: 84, de: 0.45, ate: 0.66, pitch: 0.3 },
    paineis: { alvo: 0, zoom: 80, de: 0.5, ate: 0.7, pitch: 0.32 },
    baterias: { alvo: 2, zoom: 80, de: 0.68, ate: 0.88, pitch: 0.36 },
    poeira: { alvo: 0, zoom: 78, de: 0.55, ate: 0.75, pitch: 0.34 },
  };
  function planoDeS(id, s, k) {
    const p = { tx: 0, ty: 0, ...(PLANOS_S[id] || PLANOS_S.voo) };
    if (id === 'terraplanagem' && s.trator) { p.tx = s.trator.x * 0.6; p.ty = s.trator.y * 0.6; p.zoom = lerp(22, 30, k); }
    if (id === 'estacas' && s.bate) { p.tx = s.bate.x * 0.7; p.ty = (s.bate.y + 0.85) * 0.7; }
    if (id === 'estrutura') p.tx = lerp(-1.6, 1.6, k);
    if (id === 'paineis') p.tx = k < 0.12 ? 2.2 : lerp(-1.6, 1.6, (k - 0.12) / 0.88);
    if (id === 'poeira') {   // começo da tempestade: perto do abrigo das baterias; depois abre para a limpeza
      const w = suave3(clamp((k - 0.26) / 0.1));
      p.tx = lerp(-3.4, 0, w); p.ty = lerp(-0.1, 0, w); p.zoom = lerp(40, 24, w); p.pitch = lerp(0.4, 0.48, w);
    }
    if (id === 'energia') { p.tx = lerp(-2.6, -3.6, k); p.ty = lerp(0, -1.8, k); p.zoom = lerp(28, 22, k); }
    return p;
  }
  function hudExtra(t, e, k) {
    const s = estado(t), kw = energiaKW(s);
    const y = 400;   // logo abaixo do título da etapa, longe dos colonos e da legenda
    if (['energia', 'poeira'].includes(e.id) && s.energia) {
      const max = NP * 10, ruim = e.id === 'poeira' && s.sujo > 0.3 && s.limpos < NP, noite = e.id === 'energia' && s.noite > 0.3;
      caixa(140, y, W - 280, 150, 0.9, ruim ? COR.alerta : noite ? '#ffe58a' : COR.ok);
      // de noite o sol não gera nada: quem acende a colônia são as baterias carregadas durante o dia
      texto(noite ? 'BATERIAS → COLÔNIA' : `ENERGIA ${kw} kW`, W / 2, y + 55, 40, '#ffffff', { contorno: false });
      ret(190, y + 95, W - 380, 22, COR.borda);
      ret(190, y + 95, (W - 380) * (noite ? 1 : kw / max), 22, ruim ? COR.alerta : noite ? '#ffe58a' : COR.ok);
    }
    if (e.id === 'baterias' && k > 0.7) chip(W / 2 + 160, y + 40, `BATERIAS ${Math.round(clamp((k - 0.7) / 0.28) * 100)}%`, COR.ceu, '#4ed37a', 'right');
    if (e.id === 'energia' && k > 0.62 && Math.floor(t * 3) % 4 !== 0) texto('A COLÔNIA ACENDEU!', W / 2, y + 215, 50, '#ffe58a');
    if (e.id === 'poeira' && k < 0.3 && Math.floor(t * 3) % 3 !== 0) texto('TEMPESTADE DE POEIRA!', W / 2, y + 215, 46, COR.alerta);
  }

  function sobreCena(t, s) {
    const f = s.tempestade;
    if (f <= 0.02) return;
    ctx.globalAlpha = 0.42 * f; ctx.fillStyle = '#c0703f'; ctx.fillRect(0, 0, W, H);   // céu e chão somem na poeira
    for (let i = 0; i < 90; i++) {   // rajadas: riscos que cruzam a tela da esquerda para a direita
      const vel = 900 + hash(i, 1, 5) * 1400, x = ((t * vel + hash(i, 2, 5) * W * 2) % (W + 400)) - 200;
      const yy = hash(i, 3, 5) * H + Math.sin(t * 2 + i) * 30, len = 60 + hash(i, 4, 5) * 160;
      ctx.globalAlpha = f * (0.25 + 0.45 * hash(i, 6, 5)); ctx.fillStyle = i % 3 ? '#e8b48c' : '#f6d2a8';
      ctx.fillRect(Math.round(x), Math.round(yy), Math.round(len), 3 + (i % 4 === 0 ? 3 : 0));
    }
    ctx.globalAlpha = 1;
  }

  OBRAS.solar = {
    estado, montar, planoDe: planoDeS, closes: CLOSES_S,
    pesos: { terraplanagem: 0.08, estacas: 0.2, estrutura: 0.18, paineis: 0.24, baterias: 0.14, energia: 0.16 },
    abertura: [['UMA FAZENDA', 66], ['SOLAR', 84], ['EM MARTE?', 70]],
    hudExtra, sobreCena,
  };
})();
