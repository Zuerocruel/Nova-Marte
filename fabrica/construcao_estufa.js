// Operação Marte Zero · "Como se constrói uma ESTUFA HIDROPÔNICA em Marte?" — cena da obra para o construcao.js.
// Usa o motor 2,5D de lá (faces, caixas, vigas, máquinas, astronautas, FX) e se registra em OBRAS.estufa.
//
// A estufa é um túnel de 9 arcos de aço sobre uma laje de concreto, coberto por painéis duplos transparentes, com
// eclusa numa ponta. Dentro: duas fileiras de calhas hidropônicas em 2 andares, tanque de solução nutritiva e
// LEDs roxos (vermelho + azul). Etapas: terraplanagem → fundação (escavadeira, fôrmas, manta, malha de aço com o
// guindaste) → concretagem (betoneira + caçamba no guindaste) → estrutura → cobertura e pressão → hidroponia →
// luz → plantio → colheita de legumes e verduras (time-lapse de 30 sóis).
(function () {
  const BZ = 0.32;                                      // topo da laje
  const GX0 = -2.2, GX1 = 2.6, GR = 1.45, NARCOS = 9;   // túnel: de GX0 a GX1, raio GR
  const SX0 = -3.35, SX1 = 2.95, SY = 1.85;             // laje
  const FUNDO = -0.42;                                  // fundo da vala
  const arcoX = (i) => GX0 + (i * (GX1 - GX0)) / (NARCOS - 1);
  const ptArco = (x, a, rr = GR) => [x, Math.cos(a) * rr, BZ + Math.sin(a) * rr];
  const FILAS = [-0.62, 0.62], NIVEIS = [0.36, 0.78], CX0 = -1.85, CX1 = 1.75, NPLANTAS = 13;
  const CALHAS = [];   // [fila, nível] na ordem em que são montadas
  for (const n of [0, 1]) for (const f of [0, 1]) CALHAS.push([f, n]);
  const E = (id) => OB.etapas.find((e) => e.id === id);

  // ---------------------------------------------------------------- fundação: vala, fôrmas, manta, malha, concreto
  function vala(prof) {   // buraco retangular (piso + 4 paredes de terra), desenhado rente ao chão
    if (prof <= 0.001) return;
    const z = -prof, o = { sobre: true, duplo: true };
    face([[SX0, -SY, z], [SX1, -SY, z], [SX1, SY, z], [SX0, SY, z]], '#8f4129', { ...o, n: [0, 0, 1] });
    face([[SX0, -SY, z], [SX1, -SY, z], [SX1, -SY, 0.01], [SX0, -SY, 0.01]], '#a24c30', { ...o, n: [0, 1, 0] });
    face([[SX0, SY, z], [SX1, SY, z], [SX1, SY, 0.01], [SX0, SY, 0.01]], '#7e3a26', { ...o, n: [0, -1, 0] });
    face([[SX0, -SY, z], [SX0, SY, z], [SX0, SY, 0.01], [SX0, -SY, 0.01]], '#94452c', { ...o, n: [1, 0, 0] });
    face([[SX1, -SY, z], [SX1, SY, z], [SX1, SY, 0.01], [SX1, -SY, 0.01]], '#94452c', { ...o, n: [-1, 0, 0] });
    for (let i = 0; i < 9; i++) {   // marcas da caçamba no fundo
      const x = SX0 + 0.3 + hash(i, 1, 4) * (SX1 - SX0 - 0.6), y = -SY + 0.3 + hash(i, 2, 4) * (2 * SY - 0.6);
      face([[x - 0.25, y - 0.03, z + 0.005], [x + 0.25, y - 0.03, z + 0.005], [x + 0.25, y + 0.03, z + 0.005], [x - 0.25, y + 0.03, z + 0.005]], '#7a3622', { sobre: true, n: [0, 0, 1] });
    }
  }
  function monteTerra(k) {   // a terra tirada da vala vira um monte ao lado
    if (k <= 0) return;
    const x = -1.4, y = -3.2, z = altura(x, y, 1);
    prisma(x, y, z, z + 0.75 * k, 1.2 * Math.sqrt(k), 0.25 * k, 9, '#a24c30', { topo: '#b85a37', lados: (i) => (i % 2 ? '#a24c30' : '#94452c') });
  }
  function formas(k) {   // fôrmas de madeira em volta da vala (sobem tábua por tábua)
    if (k <= 0) return;
    const h = BZ + 0.04, lados = [[[SX0, -SY], [SX1, -SY]], [[SX1, -SY], [SX1, SY]], [[SX1, SY], [SX0, SY]], [[SX0, SY], [SX0, -SY]]];
    lados.forEach(([a, b], i) => {
      const kk = clamp(k * 4 - i);
      if (kk <= 0) return;
      const fim = [lerp(a[0], b[0], kk), lerp(a[1], b[1], kk)];
      for (let tb = 0; tb < 3; tb++) {
        const z0 = FUNDO + 0.02 + (tb * (h - FUNDO)) / 3, z1 = z0 + (h - FUNDO) / 3 - 0.02;
        const nx = b[1] - a[1], ny = a[0] - b[0], l = Math.hypot(nx, ny), ox = (nx / l) * 0.03, oy = (ny / l) * 0.03;
        caixa3(Math.min(a[0], fim[0]) - Math.abs(ox), Math.min(a[1], fim[1]) - Math.abs(oy), z0, Math.max(a[0], fim[0]) + Math.abs(ox), Math.max(a[1], fim[1]) + Math.abs(oy), z1, tb % 2 ? '#8f6a45' : '#a07a50', { topo: '#b89060' });
      }
      for (let q = 0; q <= 1.001; q += 0.25) if (q <= kk) {   // estacas
        const px = lerp(a[0], b[0], q), py = lerp(a[1], b[1], q);
        caixa3(px - 0.04, py - 0.04, FUNDO, px + 0.04, py + 0.04, h + 0.12, '#6b4a2e');
      }
    });
  }
  function manta(k, z) {   // manta de isolamento térmico (amarela) desenrolando no fundo da vala
    if (k <= 0) return;
    const x1 = lerp(SX0, SX1, suave3(k));
    face([[SX0, -SY, z], [x1, -SY, z], [x1, SY, z], [SX0, SY, z]], '#ffd86a', { n: [0, 0, 1], sobre: true });
    for (let x = SX0 + 0.4; x < x1; x += 0.8) face([[x - 0.01, -SY, z + 0.002], [x + 0.01, -SY, z + 0.002], [x + 0.01, SY, z + 0.002], [x - 0.01, SY, z + 0.002]], '#e0a920', { n: [0, 0, 1], sobre: true });
    if (k < 1) cilindro([x1, -SY + 0.05, z + 0.1], [x1, SY - 0.05, z + 0.1], 0.1, 8, '#ffd86a', { tampa: '#e0a920' });   // o rolo
  }
  function malha(k) {   // malha de aço em 2 camadas, amarrada de uma ponta à outra
    if (k <= 0) return;
    const x1 = lerp(SX0 + 0.1, SX1 - 0.1, k);
    for (const [z, cor] of [[FUNDO + 0.12, '#c8642c'], [FUNDO + 0.26, '#ff8a3d']]) {
      for (let y = -SY + 0.15; y <= SY - 0.1; y += 0.3) viga([SX0 + 0.1, y, z], [x1, y, z], 0.025, cor);
      for (let x = SX0 + 0.15; x <= x1; x += 0.3) viga([x, -SY + 0.1, z + 0.02], [x, SY - 0.1, z + 0.02], 0.025, cor);
    }
    for (let x = SX0 + 0.45; x <= x1; x += 0.9) for (let y = -SY + 0.45; y < SY; y += 0.9) caixa3(x - 0.03, y - 0.03, FUNDO, x + 0.03, y + 0.03, FUNDO + 0.26, '#6b6f86');   // espaçadores
  }
  function feixeAco(c, giro) {   // feixe de vergalhões pendurado no guindaste
    const u = [Math.cos(giro), Math.sin(giro), 0];
    for (let i = 0; i < 5; i++) {
      const off = soma(c, [((i % 3) - 1) * 0.04 * -u[1], ((i % 3) - 1) * 0.04 * u[0], Math.floor(i / 3) * 0.05]);
      viga(soma(off, mul(u, -0.9)), soma(off, mul(u, 0.9)), 0.035, i % 2 ? '#ff8a3d' : '#c8642c');
    }
    for (const q of [-0.5, 0.5]) caixa3(c[0] + u[0] * q - 0.04, c[1] + u[1] * q - 0.04, c[2] - 0.04, c[0] + u[0] * q + 0.04, c[1] + u[1] * q + 0.04, c[2] + 0.12, '#ffc83d');
  }
  function pilhaAco(x, y, n) {
    const z = altura(x, y, 1);
    for (let i = 0; i < n; i++) feixeAco([x, y - 0.25 + (i % 3) * 0.22, z + 0.06 + Math.floor(i / 3) * 0.1], 0);
  }
  function concreto(nivel, cura, t, frente) {   // concreto subindo dentro das fôrmas; "frente" = até onde já chegou
    if (nivel <= FUNDO + 0.001) return;
    const molhado = cura < 1;
    const cor = molhado ? (cura > 0.5 ? '#a3a8bd' : '#7f8499') : '#b9bccc';
    const x0 = lerp(SX1, SX0, frente);
    face([[x0, -SY, nivel], [SX1, -SY, nivel], [SX1, SY, nivel], [x0, SY, nivel]], cor, { n: [0, 0, 1], sobre: true });
    if (x0 > SX0 + 0.01) {   // frente de concreto escorrendo (rampa até o fundo)
      face([[x0, -SY, nivel], [x0 - 0.35, -SY, FUNDO + 0.02], [x0 - 0.35, SY, FUNDO + 0.02], [x0, SY, nivel]], '#73788c', { n: norma([-0.6, 0, 0.8]), sobre: true });
    }
    if (molhado) for (let i = 0; i < 14; i++) {   // brilho do concreto molhado
      const x = x0 + 0.2 + hash(i, 5, 2) * (SX1 - x0 - 0.4), y = -SY + 0.2 + hash(i, 6, 2) * (2 * SY - 0.4);
      if (x > x0 && Math.sin(t * 2 + i) > 0.3) face([[x, y, nivel + 0.004], [x + 0.12, y, nivel + 0.004], [x + 0.12, y + 0.03, nivel + 0.004], [x, y + 0.03, nivel + 0.004]], '#c9ced9', { n: [0, 0, 1], sobre: true });
    }
  }
  function laje() {   // laje pronta (curada), com as juntas de dilatação (camada do chão)
    SOBRE = true;
    caixa3(SX0, -SY, 0, SX1, SY, BZ, '#b9bccc', { topo: '#c9ccd8', lado: '#8a8fa6' });
    for (let x = SX0 + 1.26; x < SX1 - 0.1; x += 1.26) linha3([x, -SY, BZ + 0.003], [x, SY, BZ + 0.003], '#8a8fa6', 1, false);
    linha3([SX0, 0, BZ + 0.003], [SX1, 0, BZ + 0.003], '#8a8fa6', 1, false);
    SOBRE = false;
  }

  // ---------------------------------------------------------------- máquinas da fundação
  /** Escavadeira de esteira: a caçamba segue um alvo (IK de lança + braço); ciclo de cavar, girar, despejar e voltar. */
  function escavadeira(x, y, dir0, t, ciclo, ativa) {
    const z = altura(x, y, 1), base = local([x, y, z], dir0);
    esteira(base, 0, -0.42, 1.35, 0.32, ativa ? t * 0.2 : 0); esteira(base, 0, 0.42, 1.35, 0.32, ativa ? t * 0.2 : 0);
    let giroRel = 0, alvo, cheia = false;
    // ciclo: 0–0.35 cava (desce e puxa), 0.35–0.55 gira até o monte, 0.55–0.7 despeja, 0.7–1 volta
    if (ciclo < 0.35) { const q = ciclo / 0.35; alvo = [lerp(2.05, 1.3, q), 0, lerp(0.15, -0.55, Math.sin(q * Math.PI) ** 0.6)]; cheia = q > 0.55; }
    else if (ciclo < 0.55) { const q = suave3((ciclo - 0.35) / 0.2); giroRel = q * 1.35; alvo = [lerp(1.3, 1.8, q), 0, lerp(0.1, 0.9, q)]; cheia = true; }
    else if (ciclo < 0.7) { giroRel = 1.35; alvo = [1.8, 0, 0.9]; }
    else { const q = suave3((ciclo - 0.7) / 0.3); giroRel = 1.35 * (1 - q); alvo = [lerp(1.8, 2.05, q), 0, lerp(0.9, 0.15, q)]; }
    const L = local([x, y, z + 0.34], dir0 + giroRel), { u, v, at } = L;
    cilindro(at(0, 0, 0), at(0, 0, 0.08), 0.42, 10, '#6b6f86');                                                     // anel de giro
    obox(at(-0.12, 0, 0.3), mul(u, 0.55), mul(v, 0.42), [0, 0, 0.2], '#ffc83d', { topo: '#ffd86a' });                // corpo
    obox(at(-0.62, 0, 0.32), mul(u, 0.12), mul(v, 0.4), [0, 0, 0.18], '#4a4466', { topo: '#6b6f86' });               // contrapeso
    obox(at(0.22, 0.24, 0.62), mul(u, 0.2), mul(v, 0.16), [0, 0, 0.22], '#e0a920', { topo: '#ffc83d' });             // cabine
    operador(at(0.2, 0.24, 0.42), dir0 + giroRel, '#3f8efc');
    face([at(0.42, 0.1, 0.46), at(0.42, 0.38, 0.46), at(0.42, 0.38, 0.8), at(0.42, 0.1, 0.8)], '#8fe6ff', { n: u, alfa: 0.55, duplo: true });
    giroflex(at(-0.3, -0.2, 0.5), t);
    cilindro(at(-0.35, -0.25, 0.48), at(-0.35, -0.25, 0.85), 0.04, 6, '#4a4466', { tampa: '#1b1530' });              // escapamento
    if (ativa) FX.push({ tipo: 'fumaca', p: at(-0.35, -0.25, 0.9), t, semente: 2 });
    const pivo = at(0.38, -0.08, 0.45);
    const ponta = at(alvo[0], alvo[1], alvo[2] - 0.34);
    const [cotov, cac] = ik2(pivo, ponta, 1.15, 0.95, [0, 0, 1]);
    for (const s of [-1, 1]) viga(soma(pivo, mul(v, s * 0.07)), soma(cotov, mul(v, s * 0.05)), 0.12, '#ffc83d', { topo: '#ffd86a' });   // lança
    viga(cotov, cac, 0.1, '#e0a920', { topo: '#ffc83d' });                                                              // braço
    cilindro(soma(pivo, [0, 0, -0.12]), soma(mul(soma(pivo, cotov), 0.5), [0, 0, -0.05]), 0.045, 6, '#c9ced9');        // pistão da lança
    cilindro(soma(cotov, [0, 0, 0.1]), soma(mul(soma(cotov, cac), 0.5), [0, 0, 0.06]), 0.04, 6, '#c9ced9');            // pistão do braço
    // caçamba com dentes (abre para despejar)
    const abre = ciclo >= 0.55 && ciclo < 0.7 ? 1 : 0;
    const bd = norma(soma(mul(u, 0.4 - abre * 0.9), [0, 0, -1 + abre * 1.3]));
    obox(soma(cac, mul(bd, 0.12)), mul(norma(cruz(bd, v)), 0.12), mul(v, 0.18), mul(bd, 0.12), '#6b6f86', { topo: '#4a4466' });
    for (let i = 0; i < 4; i++) caixa3(...soma(soma(cac, mul(bd, 0.26)), mul(v, -0.13 + i * 0.087)).map((c, j) => c - [0.02, 0.02, 0.02][j]), ...soma(soma(cac, mul(bd, 0.3)), mul(v, -0.13 + i * 0.087)).map((c, j) => c + [0.02, 0.02, 0.02][j]), '#c9ced9');
    if (cheia && !abre) esferaO(soma(cac, soma(mul(bd, 0.1), [0, 0, 0.1])), [0.12, 0, 0], [0, 0.15, 0], [0, 0, 0.07], '#a24c30', 6, 3);
    if (abre) { FX.push({ tipo: 'poeira', p: soma(cac, [0, 0, -0.3]), t, semente: 1 }); FX.push({ tipo: 'jato', de: soma(cac, [0, 0, -0.1]), para: soma(cac, [0, 0, -0.75]), cor: '#a24c30', larg: 4 }); }
    else if (ciclo < 0.35 && ativa) FX.push({ tipo: 'poeira', p: cac, t, semente: 4 });
    return cac;
  }

  /** Caminhão betoneira: cabine, 3 eixos, tambor listrado girando e a bica que desce até a fôrma. */
  function betoneira(x, y, dir, t, andando, bica) {
    const z = altura(x, y, 1), { u, v, at } = local([x, y, z], dir), giro = Math.floor(t * 9);
    for (const a of [-0.75, -0.35, 0.65]) for (const s of [-1, 1]) {
      cilindro(at(a, s * 0.38, 0.2), at(a, s * 0.5, 0.2), 0.19, 8, '#2a2140', { tampa: '#6b6f86', lados: (i) => ((i + (andando ? giro : 0)) % 2 ? '#2a2140' : '#4a4466') });
    }
    obox(at(-0.1, 0, 0.42), mul(u, 0.95), mul(v, 0.36), [0, 0, 0.07], '#4a4466', { topo: '#6b6f86' });                 // chassi
    obox(at(0.68, 0, 0.72), mul(u, 0.22), mul(v, 0.37), [0, 0, 0.26], '#e2603b', { topo: '#ff8a5c' });                 // cabine
    face([at(0.905, -0.3, 0.68), at(0.905, 0.3, 0.68), at(0.905, 0.3, 0.92), at(0.905, -0.3, 0.92)], '#8fe6ff', { n: u, alfa: 0.7, duplo: true });
    operador(at(0.66, 0.12, 0.5), dir, '#ffc83d');
    for (const s of [-1, 1]) FX.push({ tipo: 'brilho', p: at(0.92, s * 0.25, 0.55), cor: '#fff4c2', r: 1.4 });
    giroflex(at(0.6, 0, 1.0), t);
    // tambor: inclinado, mais largo no meio, listras em espiral girando
    const tA = at(-0.95, 0, 0.98), tB = at(0.35, 0, 0.66), meio = mul(soma(tA, tB), 0.5);
    const listra = (i) => (((i + Math.floor(t * 6)) % 4) < 2 ? '#eef0f8' : '#3f8efc');
    cilindro(tA, meio, 0.36, 10, '#eef0f8', { lados: listra, tampa: '#c9ced9' });
    cilindro(meio, tB, 0.36, 10, '#eef0f8', { lados: (i) => listra(i + 1), tampa: '#c9ced9' });
    cilindro(tB, soma(tB, mul(norma(sub3(tB, tA)), 0.15)), 0.24, 8, '#6b6f86');
    viga(at(-0.6, 0, 0.5), at(-0.6, 0, 0.75), 0.08, '#6b6f86'); viga(at(0.2, 0, 0.5), at(0.2, 0, 0.62), 0.08, '#6b6f86');
    // bica (desce atrás do caminhão até o ponto de despejo)
    const boca = soma(tA, mul(norma(sub3(tA, tB)), 0.1));
    if (bica) {
      viga(boca, bica, 0.12, '#9aa0b5', { topo: '#c9ced9' });
      return boca;
    }
    return null;
  }

  /** Caçamba de concreto pendurada no guindaste (abre embaixo quando chega). */
  function cacamba(c, cheia, abrindo) {
    prisma(c[0], c[1], c[2] - 0.32, c[2] + 0.12, 0.12, 0.3, 8, '#ffc83d', { topo: cheia ? '#7f8499' : '#6b6f86' });
    for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.4; linha3([c[0] + Math.cos(a) * 0.28, c[1] + Math.sin(a) * 0.28, c[2] + 0.12], [c[0], c[1], c[2] + 0.5], '#1b1530', 1, false); }
    if (abrindo) FX.push({ tipo: 'jato', de: [c[0], c[1], c[2] - 0.32], para: [c[0], c[1], FUNDO + 0.1], cor: '#8a8fa6', larg: 5 });
  }

  // ---------------------------------------------------------------- estrutura e cobertura
  function arco(i, desloc = [0, 0, 0]) {   // arco de aço (meio círculo) com chapas de base
    const x = arcoX(i), N = 10, P = (a) => soma(ptArco(x, a), desloc), noAr = desloc.some((d) => Math.abs(d) > 0.01);
    for (let j = 0; j < N; j++) {
      const am = ((j + 0.5) / N) * Math.PI;
      MARCA = noAr ? null : { r: [0, Math.cos(am), Math.sin(am)] };
      viga(P((j / N) * Math.PI), P(((j + 1) / N) * Math.PI), 0.1, j % 2 ? '#e4e6f0' : '#f6f7fb');
    }
    for (const s of [-1, 1]) (MARCA = noAr ? null : { r: [0, s, 0] }), caixa3(x - 0.12 + desloc[0], s * GR - 0.12 + desloc[1], BZ + desloc[2], x + 0.12 + desloc[0], s * GR + 0.12 + desloc[1], BZ + 0.05 + desloc[2], '#6b6f86');
    MARCA = null;
  }
  function tercas(n) {
    for (let i = 0; i + 1 < n; i++) for (const a of [0.55, 1.15, Math.PI / 2, 2.0, 2.6]) (MARCA = { r: [0, Math.cos(a), Math.sin(a)] }), viga(ptArco(arcoX(i), a), ptArco(arcoX(i + 1), a), 0.045, '#9aa0b5');
    MARCA = null;
  }
  const FAIXAS = [0, 5, 1, 4, 2, 3];
  function cobertura(vaos, vaoK, fundos, brilho) {
    const cor = brilho > 0.05 ? '#ff9be6' : '#bfe8ff', o = { alfa: brilho > 0.05 ? 0.09 + brilho * 0.05 : 0.3, duplo: true, emis: brilho > 0.05 };
    for (let b = 0; b < NARCOS - 1; b++) {
      const tot = b < vaos ? 6 : b === vaos ? Math.floor(vaoK * 6.99) : 0;
      for (let q = 0; q < tot; q++) {
        const j = FAIXAS[q], a0 = (j / 6) * Math.PI, a1 = ((j + 1) / 6) * Math.PI, x0 = arcoX(b), x1 = arcoX(b + 1);
        MARCA = { r: [0, Math.cos((a0 + a1) / 2), Math.sin((a0 + a1) / 2)] };
        face([ptArco(x0, a0, GR + 0.03), ptArco(x1, a0, GR + 0.03), ptArco(x1, a1, GR + 0.03), ptArco(x0, a1, GR + 0.03)], cor, o);
      }
    }
    if (fundos > 0) for (const x of [GX0, GX1]) {
      const N = 10, pts = Array.from({ length: N + 1 }, (_, i) => ptArco(x, (i / N) * Math.PI));
      MARCA = { r: [x < 0 ? -1 : 1, 0, 0] };
      face(pts, cor, { ...o, alfa: o.alfa * fundos });
    }
    MARCA = null;
  }
  function eclusa(k, noite) {
    if (k <= 0) return;
    const x0 = -3.2, x1 = GX0 + 0.05, h = 1.05 * suave3(k);
    caixa3(x0, -0.55, BZ, x1, 0.55, BZ + h, '#eef0f8', { topo: '#c9ced9' });
    if (k > 0.8) {
      caixa3(x0 - 0.02, -0.56, BZ + h * 0.62, x1, 0.56, BZ + h * 0.74, '#4ed37a');
      caixa3(x0 - 0.03, -0.25, BZ, x0, 0.25, BZ + 0.82, '#3a2f63');
      cilindro([x0 - 0.04, 0, BZ + 0.58], [x0 - 0.01, 0, BZ + 0.58], 0.1, 8, '#8fe6ff', { tampa: noite > 0.3 ? '#ffe58a' : '#8fe6ff', emis: noite > 0.3 });
      caixa3(x0 - 0.04, 0.3, BZ + 0.85, x0 - 0.01, 0.4, BZ + 0.92, noite > 0.3 ? '#ffe58a' : '#c9ced9', { emis: noite > 0.3 });
      if (noite > 0.3) FX.push({ tipo: 'brilho', p: [x0 - 0.1, 0.35, BZ + 0.9], cor: '#ffe58a', r: 1.6 });
    }
  }

  // ---------------------------------------------------------------- hidroponia, luz e plantas
  function tanque(k, t, agua) {
    if (k <= 0) return;
    const h = 0.85 * suave3(k);
    cilindro([2.18, 0, BZ], [2.18, 0, BZ + h], 0.3, 10, '#3f8efc', { tampa: '#8fe6ff', lados: (i) => (i % 5 === 0 ? '#2a5fb8' : '#3f8efc') });
    if (k > 0.9) {
      caixa3(2.0, -0.32, BZ + 0.5, 2.06, -0.26, BZ + 0.62, agua ? '#4ed37a' : '#7a2a2a', { emis: !!agua });
      for (const f of FILAS) viga([1.95, 0, BZ + 0.2], [CX1 + 0.05, f, BZ + 0.2], 0.05, '#c9ced9');
    }
  }
  function estante(f) {
    const y = FILAS[f];
    for (let x = CX0; x <= CX1 + 0.01; x += (CX1 - CX0) / 3) for (const s of [-1, 1]) viga([x, y + s * 0.12, BZ], [x, y + s * 0.12, BZ + NIVEIS[1] + 0.02], 0.035, '#6b6f86');
  }
  function calha(f, n, k) {
    const y = FILAS[f], z = BZ + NIVEIS[n], x1 = lerp(CX0, CX1, k);
    caixa3(CX0, y - 0.11, z - 0.06, x1, y + 0.11, z, '#eef0f8', { topo: '#c9ced9' });
  }
  function led(f, n, on) {
    const y = FILAS[f], z = BZ + NIVEIS[n] + (n ? 0.3 : 0.32);
    caixa3(CX0, y - 0.05, z, CX1, y + 0.05, z + 0.03, on ? '#ff5fd2' : '#4a4466', { emis: on });
    if (on) for (let x = CX0 + 0.3; x < CX1; x += 0.9) FX.push({ tipo: 'brilho', p: [x, y, z - 0.02], cor: (Math.floor(x * 3 + 10) % 2) ? '#ff4d7a' : '#7a6bff', r: 1.4 });
  }
  // Legumes e verduras: o que cada calha cultiva (por calha e posição) e como cada um cresce.
  const CULTURA = (c, j) => [['tomate', 'tomate', 'tomate'], ['pimentao', 'pepino', 'pimentao'], ['alface', 'rucula', 'alface'], ['morango', 'alfaceRoxa', 'morango']][c][j % 3];
  const fruto = (p, rx, rz, cor) => esferaO(p, [rx, 0, 0], [0, rx, 0], [0, 0, rz], cor, 5, 3);
  /** Muda num cubinho de substrato (lã de rocha): caule e 3 folhas abertas. k = 0..1 (tamanho). */
  function muda(p, k, giro = 0) {
    const [x, y, z] = p;
    caixa3(x - 0.045, y - 0.045, z - 0.03, x + 0.045, y + 0.045, z + 0.045, '#d9c7a0', { topo: '#c4ad80' });
    const h = 0.06 + k * 0.1;
    viga([x, y, z + 0.04], [x, y, z + 0.04 + h], 0.02, '#4ed37a');
    for (let i = 0; i < 3; i++) {
      const a = giro + (i / 3) * Math.PI * 2, l = 0.045 + k * 0.06;
      obox([x + Math.cos(a) * l, y + Math.sin(a) * l, z + 0.04 + h * (0.75 + i * 0.1)], [Math.cos(a) * l, Math.sin(a) * l, 0.012], [-Math.sin(a) * l * 0.55, Math.cos(a) * l * 0.55, 0], [0, 0, 0.008], i % 2 ? '#7be08f' : '#5fd38a');
    }
  }
  function planta(x, y, z, g, tipo, lado) {
    if (g <= 0) return;
    if (g < 0.45) { muda([x, y, z], g / 0.45, x * 7); return; }
    const verde = ['#2bb673', '#5fd38a'], escuro = ['#1f8a55', '#3fbf6f'];
    if (tipo === 'alface' || tipo === 'rucula' || tipo === 'alfaceRoxa') {
      const s = 0.05 + g * 0.08, h = 0.04 + g * 0.1, c = tipo === 'rucula' ? escuro : tipo === 'alfaceRoxa' ? ['#7a3a8a', '#b06ac0'] : verde;
      esferaO([x, y, z + h * 0.5], [s, 0, 0], [0, s * 0.9, 0], [0, 0, h * 0.55], c[0], 7, 4);
      if (g > 0.5) for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + x * 3; obox([x + Math.cos(a) * s * 0.7, y + Math.sin(a) * s * 0.7, z + h * 0.6], [Math.cos(a) * s * 0.45, Math.sin(a) * s * 0.45, 0], [-Math.sin(a) * s * 0.35, Math.cos(a) * s * 0.35, 0], [0, 0, 0.012], c[1], { topo: c[1] }); }
      return;
    }
    if (tipo === 'morango') {   // folhas baixas e moranguinhos pendurados na beira da calha
      esferaO([x, y, z + 0.03], [0.06 + g * 0.03, 0, 0], [0, 0.06, 0], [0, 0, 0.035], verde[0], 6, 3);
      if (g > 0.55) for (const k of [-1, 1]) { const p = [x + k * 0.04, y + lado * 0.13, z - 0.03]; viga([x, y, z + 0.02], p, 0.008, '#4ed37a'); fruto(p, 0.022, 0.028, g > 0.8 ? '#e04f5f' : '#e8f6a0'); }
      return;
    }
    // tomate, pimentão e pepino: haste com folhas e frutos que mudam de cor ao amadurecer
    const h = 0.08 + g * 0.17;
    viga([x, y, z], [x, y, z + h], 0.02, '#3a9a4a');
    for (const [q, k] of [[0.45, 1], [0.75, -1], [1, 1]]) obox([x + k * 0.04, y, z + h * q], [0.05, 0.02 * k, 0], [-0.02 * k, 0.045, 0], [0, 0, 0.012], verde[(q * 4 | 0) % 2], { topo: '#7be08f' });
    if (g < 0.55) return;
    const mad = clamp((g - 0.55) / 0.4);
    if (tipo === 'tomate') {
      const cor = mad > 0.7 ? '#e04f5f' : mad > 0.35 ? '#ff8a3d' : '#7be08f';
      for (const [dx, dy, dz] of [[0.05, 0.03, 0.55], [-0.04, -0.04, 0.7], [0.02, -0.05, 0.4], [-0.05, 0.04, 0.85]]) fruto([x + dx, y + dy, z + h * dz], 0.03, 0.028, cor);
    } else if (tipo === 'pimentao') {
      const cor = mad > 0.6 ? (Math.floor(x * 7) % 2 ? '#ffc83d' : '#e04f5f') : '#2bb673';
      for (const [dx, dy, dz] of [[0.05, 0.02, 0.5], [-0.05, -0.03, 0.7]]) fruto([x + dx, y + dy, z + h * dz], 0.032, 0.045, cor);
    } else {   // pepino: compridos, pendurados para fora da calha
      for (const k of [-1, 1]) { const p = [x + k * 0.05, y + lado * 0.15, z - 0.02]; viga([x, y, z + h * 0.6], soma(p, [0, 0, 0.06]), 0.01, '#3a9a4a'); esferaO(p, [0.025, 0, 0], [0, 0.025, 0], [0, 0, 0.07 * (0.5 + mad * 0.5)], '#1f7a45', 5, 3); }
    }
  }
  function aguaCorrendo(t, n) {
    for (let c = 0; c < n; c++) {
      const [f, nv] = CALHAS[c], y = FILAS[f], z = BZ + NIVEIS[nv] + 0.01;
      for (let p = 0; p < 3; p++) FX.push({ tipo: 'brilho', p: [lerp(CX1, CX0, (t * 0.35 + p / 3 + c * 0.17) % 1), y, z], cor: '#3fd0c9', r: 1.4 });
    }
  }
  function caboEstufa(k, pulsosT) {
    const rota = [[-5.0, 3.2], [-4.4, 2.6], [-3.8, 2.1], [-3.55, 1.3], [-3.3, 0.7]], tot = rota.length - 1;
    for (let i = 0; i < tot; i++) {
      const kk = clamp(k * tot - i);
      if (kk <= 0) break;
      const a = rota[i], b = rota[i + 1], fim = [lerp(a[0], b[0], kk), lerp(a[1], b[1], kk)];
      viga([a[0], a[1], altura(a[0], a[1], 1) + 0.06], [fim[0], fim[1], altura(fim[0], fim[1], 1) + 0.06], 0.14, '#3a2f63', { topo: '#2a2140' });
    }
    if (pulsosT != null) for (let p = 0; p < 4; p++) {
      const q = ((pulsosT * 0.6 + p / 4) % 1) * tot, i = Math.floor(q), f = q - i, a = rota[i], b = rota[i + 1];
      const x = lerp(a[0], b[0], f), y = lerp(a[1], b[1], f);
      FX.push({ tipo: 'brilho', p: [x, y, altura(x, y, 1) + 0.2], cor: '#ffe58a', r: 2 });
    }
  }
  function pilhaArcos(x, y, n) {
    const z = altura(x, y, 1);
    for (let i = 0; i < n; i++) {
      const zz = z + 0.06 + i * 0.1;
      for (let j = 0; j < 6; j++) {
        const a0 = (j / 6) * Math.PI, a1 = ((j + 1) / 6) * Math.PI;
        viga([x + Math.cos(a0) * 0.9, y + Math.sin(a0) * 0.45, zz], [x + Math.cos(a1) * 0.9, y + Math.sin(a1) * 0.45, zz], 0.08, i % 2 ? '#e4e6f0' : '#f6f7fb');
      }
    }
  }
  function pilhaPaineis(x, y, n) {
    const z = altura(x, y, 1);
    for (let i = 0; i < n; i++) caixa3(x - 0.5, y - 0.35, z + i * 0.06, x + 0.5, y + 0.35, z + i * 0.06 + 0.045, '#bfe8ff', { topo: '#e4f8ff', lado: '#8fb3d0' });
  }

  // ---------------------------------------------------------------- estado da obra no tempo tc
  const GUI = [0.4, -4.3];   // base do guindaste
  function estado(tc) {
    const s = { plano: 0, cava: 0, escav: null, formas: 0, manta: 0, malha: 0, feixe: null, concreto: FUNDO, frente: 0, cura: 0, laje: false,
                truck: null, cacamba: null, arcos: 0, arcoK: 0, vaos: 0, vaoK: 0, fundos: 0, eclusa: 0, pressao: 0,
                tanque: 0, calhas: 0, calhaK: 0, agua: false, luz: 0, cabo: 0, energia: false, mudas: 0, cresce: 0, colhe: 0,
                noite: 0, feixe: 0, aco: null, guindaste: false, gancho: null, trator: null };
    const Ee = Object.fromEntries(OB.etapas.map((e) => [e.id, e]));
    const k = (id) => (Ee[id] ? clamp((tc - Ee[id].ini) / (Ee[id].fim - Ee[id].ini)) : 0);
    const depois = (id) => Ee[id] && tc >= Ee[id].fim;
    const durante = (id) => Ee[id] && tc >= Ee[id].ini && tc < Ee[id].fim;
    s.plano = depois('terraplanagem') ? 1 : suave3(k('terraplanagem') * 1.15 - 0.1);
    if (durante('terraplanagem')) {
      const q = k('terraplanagem'), vai = (q * 3) % 1, ida = Math.floor(q * 3) % 2 === 0;
      const y = lerp(-1.4, 1.4, Math.floor(q * 3) / 2);
      s.trator = { x: ida ? lerp(-4, 3.8, suave3(vai)) : lerp(3.8, -4, suave3(vai)), y, dir: ida ? 0 : Math.PI };
    }
    // fundação: 0–0.36 escavadeira cava · 0.36–0.5 fôrmas · 0.46–0.6 manta · 0.58–0.98 malha (guindaste traz o aço)
    const kf = k('fundacao');
    s.cava = depois('fundacao') ? 1 : suave3(clamp(kf / 0.36));
    if (durante('fundacao') && kf < 0.46) {
      const sai = clamp((kf - 0.36) / 0.1);
      s.escav = { x: lerp(0.3, 4.6, suave3(sai)), y: lerp(-3.0, -4.4, suave3(sai)), dir: sai > 0 ? -0.2 : Math.PI / 2, ciclo: sai > 0 ? 0 : ((kf / 0.36) * 4) % 1, ativa: true };
    }
    s.formas = depois('fundacao') ? 1 : clamp((kf - 0.36) / 0.14);
    s.manta = depois('fundacao') ? 1 : clamp((kf - 0.46) / 0.14);
    s.malha = depois('fundacao') ? 1 : clamp((kf - 0.58) / 0.4);
    const pilha = [3.7, -3.0, 0.3];
    if (durante('fundacao') && kf > 0.5) {   // 3 viagens do guindaste: pilha → vala → volta
      const q = ((kf - 0.5) / 0.48) * 3, n = Math.floor(q), f = q - n;
      const destino = [lerp(SX0 + 0.9, SX1 - 0.9, Math.min(n, 2) / 2), 0.2, FUNDO + 0.45];
      if (n < 3) {
        if (f < 0.6) { const a = suave3(f / 0.6); s.gancho = [lerp(pilha[0], destino[0], a), lerp(pilha[1], destino[1], a), lerp(pilha[2], destino[2], a) + Math.sin(a * Math.PI) * 1.6]; s.aco = soma(s.gancho, [0, 0, -0.35]); }
        else if (f < 0.75) { s.gancho = destino; s.aco = soma(destino, [0, 0, -0.35]); }
        else { const a = suave3((f - 0.75) / 0.25); s.gancho = [lerp(destino[0], pilha[0], a), lerp(destino[1], pilha[1], a), lerp(destino[2], pilha[2] + 0.4, a) + Math.sin(a * Math.PI) * 1.4]; }
      }
    }
    // concretagem: 0–0.15 betoneira chega · 0.12–0.85 concreto sobe (bica + caçamba) · 0.82–1 alisa e cura
    const kc0 = k('concretagem');
    if (durante('concretagem')) {
      const chega = suave3(clamp(kc0 / 0.15));
      s.truck = { x: lerp(7.5, 4.15, chega), y: 0.5, dir: 0, andando: chega < 1, bica: chega >= 1 && kc0 < 0.86 };
      if (kc0 > 0.18 && kc0 < 0.84) {   // caçamba: carrega na betoneira, leva até a ponta de lá, despeja
        const q = ((kc0 - 0.18) / 0.66) * 3, f = q - Math.floor(q), carga = [3.3, 1.2, 1.2], alvo = [SX0 + 0.8 + (Math.floor(q) % 2) * 0.8, -0.6 + (Math.floor(q) % 3) * 0.6, 0.9];
        let c, cheia = true, abre = false;
        if (f < 0.2) c = carga;
        else if (f < 0.6) { const a = suave3((f - 0.2) / 0.4); c = [lerp(carga[0], alvo[0], a), lerp(carga[1], alvo[1], a), lerp(carga[2], alvo[2], a) + Math.sin(a * Math.PI) * 1.4]; }
        else if (f < 0.78) { c = alvo; abre = true; }
        else { const a = suave3((f - 0.78) / 0.22); c = [lerp(alvo[0], carga[0], a), lerp(alvo[1], carga[1], a), lerp(alvo[2], carga[2], a) + Math.sin(a * Math.PI) * 1.2]; cheia = false; }
        s.cacamba = { c, cheia, abre };
        s.gancho = soma(c, [0, 0, 0.5]);
      }
    }
    s.concreto = depois('concretagem') ? BZ : lerp(FUNDO, BZ, suave3(clamp((kc0 - 0.12) / 0.72)));
    s.frente = depois('concretagem') ? 1 : clamp((kc0 - 0.1) / 0.4);
    s.cura = depois('concretagem') ? 1 : clamp((kc0 - 0.86) / 0.12);
    s.laje = depois('concretagem');
    const ke = k('estrutura');
    if (depois('estrutura')) s.arcos = NARCOS; else if (ke > 0) { const q = clamp(ke / 0.95) * NARCOS; s.arcos = Math.min(NARCOS, Math.floor(q)); s.arcoK = q - Math.floor(q); }
    s.guindaste = (Ee.fundacao && tc >= Ee.fundacao.ini + (Ee.fundacao.fim - Ee.fundacao.ini) * 0.46 && !depois('estrutura'));
    const kc = k('cobertura');
    s.eclusa = depois('cobertura') ? 1 : clamp(kc / 0.15);
    if (depois('cobertura')) { s.vaos = NARCOS - 1; s.fundos = 1; }
    else if (kc > 0.12) { const q = clamp((kc - 0.12) / 0.55) * (NARCOS - 1); s.vaos = Math.min(NARCOS - 1, Math.floor(q)); s.vaoK = q - Math.floor(q); s.fundos = clamp((kc - 0.62) / 0.08); }
    s.pressao = depois('cobertura') ? 1 : clamp((kc - 0.72) / 0.24);
    const kh = k('hidroponia');
    s.tanque = depois('hidroponia') ? 1 : clamp(kh / 0.18);
    if (depois('hidroponia')) s.calhas = CALHAS.length; else if (kh > 0.15) { const q = clamp((kh - 0.15) / 0.62) * CALHAS.length; s.calhas = Math.min(CALHAS.length, Math.floor(q)); s.calhaK = q - Math.floor(q); }
    s.agua = depois('hidroponia') || kh > 0.8;
    const kl = k('luzes');
    s.cabo = depois('luzes') ? 1 : clamp(kl / 0.35);
    s.energia = depois('luzes') || kl > 0.4;
    s.luz = depois('luzes') ? 1 : clamp((kl - 0.45) / 0.4);
    s.noite = depois('luzes') ? 1 : suave3(clamp((kl - 0.2) / 0.3));
    s.mudas = depois('plantio') ? 1 : clamp(k('plantio') / 0.85);
    if (durante('plantio')) s.noite = 1 - suave3(clamp(k('plantio') / 0.25));   // amanhece: o plantio é de dia
    else if (depois('plantio')) s.noite = 0;
    const kk = k('colheita');
    s.cresce = depois('colheita') ? 1 : suave3(clamp(kk / 0.55));
    s.colhe = depois('colheita') ? 1 : clamp((kk - 0.6) / 0.35);
    if (durante('colheita')) {   // time-lapse: dias e noites passando rápido
      s.noite = kk < 0.55 ? 0.5 + 0.5 * Math.cos((kk / 0.55) * Math.PI * 10) : lerp(0.5 + 0.5 * Math.cos(Math.PI * 10), 0, clamp((kk - 0.55) / 0.1));
    } else if (depois('colheita')) s.noite = Ee.voo && tc >= Ee.voo.ini ? clamp((tc - Ee.voo.ini) / 1.5) : 0;
    s.feixe = 0;   // (o motor usa feixe para o brilho da Terra; aqui não tem sinal)
    return s;
  }

  // ---------------------------------------------------------------- cena
  function montar(t, tc, s) {
    FACES = []; TAGS = []; FX = []; FOCO = { pessoas: [], trator: null };
    chaoOb(s.plano);
    fazendaSolar(s.noite);
    // fundação
    if (!s.laje) {
      vala(FUNDO * -s.cava);
      monteTerra(s.cava * (s.formas < 1 || !s.laje ? 1 : 0));
      manta(s.manta, FUNDO + 0.01);
      if (s.concreto < FUNDO + 0.27) malha(s.malha);
      formas(s.formas);
      concreto(s.concreto, s.cura, t, s.frente);
    } else laje();
    if (s.escav) {
      const cac = escavadeira(s.escav.x, s.escav.y, s.escav.dir, t, s.escav.ciclo, s.escav.ativa);
      FOCO.trator = cac;
    }
    if (s.truck) {
      const bica = s.truck.bica ? [SX1 - 0.35, 0.5, s.concreto + 0.25] : null;
      const boca = betoneira(s.truck.x, s.truck.y, s.truck.dir, t, s.truck.andando, bica);
      if (bica) { FX.push({ tipo: 'jato', de: bica, para: [bica[0] - 0.15, bica[1], Math.max(FUNDO, s.concreto) + 0.01], cor: '#8a8fa6', larg: 5 }); esferaO([bica[0] - 0.2, bica[1], s.concreto], [0.3, 0, 0], [0, 0.3, 0], [0, 0, 0.08], '#7f8499', 8, 3); }
      FOCO.trator = bica || boca || [s.truck.x, s.truck.y, 0.8];
      if (s.truck.andando) FX.push({ tipo: 'poeira', p: [s.truck.x + 1, s.truck.y, 0.1], t, semente: 3 });
    }
    // estrutura
    for (let i = 0; i < s.arcos; i++) arco(i);
    tercas(s.arcos);
    let gancho = s.gancho || [3.2, -3.4, 1.4], carga = null;
    if (s.aco) { const g = Math.atan2(s.aco[1] - GUI[1], s.aco[0] - GUI[0]) + Math.PI / 2; feixeAco(s.aco, g); carga = { c: soma(s.aco, [0, 0, 0.1]), l: 0.12 }; }
    if (s.cacamba) cacamba(s.cacamba.c, s.cacamba.cheia, s.cacamba.abre);
    if (s.arcos < NARCOS && s.arcoK > 0) {
      const q = s.arcoK, alvoX = arcoX(s.arcos), solo = [2.6 - alvoX, -3.4, altura(2.6, -3.4, 1) + 0.1 - BZ];
      let d;
      if (q < 0.6) { const k2 = suave3(q / 0.6); d = [lerp(solo[0], 0, k2), lerp(solo[1], 0, k2), lerp(solo[2], 1.2, Math.min(1, k2 * 1.4))]; }
      else if (q < 0.8) d = [0, 0, lerp(1.2, 0, suave3((q - 0.6) / 0.2))];
      else d = [0, 0, 0];
      arco(s.arcos, d);
      const topo = soma(ptArco(alvoX, Math.PI / 2), d);
      gancho = soma(topo, [0, 0, 0.9]);
      carga = q < 0.8 ? { c: topo, l: 0.06 } : null;
      if (q > 0.82) for (const sy of [-1, 1]) FX.push({ tipo: 'faisca', p: [alvoX, sy * GR, BZ + 0.05], t, semente: sy });
    }
    if (s.guindaste) {
      guindaste(GUI[0], GUI[1], gancho, t, carga);
      if (E('estrutura') && tc >= E('estrutura').ini) pilhaArcos(2.6, -3.4, Math.max(0, NARCOS - s.arcos - (s.arcoK > 0 ? 1 : 0)));
      else if (E('fundacao') && tc < E('fundacao').fim) pilhaAco(3.7, -3.0, Math.max(1, Math.round((1 - s.malha) * 6)));
    }
    eclusa(s.eclusa, s.noite);
    BLOCO = s.arcos > 0 || s.arcoK > 0 ? [0.2, 0, BZ + 0.7] : null;   // a estufa entra na ordenação como uma peça só
    MARCA = 'dentro';
    tanque(s.tanque, t, s.agua);
    if (s.calhas > 0 || s.calhaK > 0) for (const f of [0, 1]) estante(f);
    for (let c = 0; c < CALHAS.length; c++) {
      const [f, n] = CALHAS[c];
      if (c < s.calhas) calha(f, n, 1); else if (c === s.calhas && s.calhaK > 0) calha(f, n, suave3(s.calhaK));
      if (c < s.calhas) led(f, n, s.luz * CALHAS.length > c + 0.5 && s.energia);
    }
    if (s.agua) aguaCorrendo(t, s.calhas);
    if (s.mudas > 0) for (let c = 0; c < CALHAS.length; c++) {
      const [f, n] = CALHAS[c], y = FILAS[f], z = BZ + NIVEIS[n];
      for (let j = 0; j < NPLANTAS; j++) {
        const ordem = (c * NPLANTAS + j) / (CALHAS.length * NPLANTAS);
        if (ordem > s.mudas) continue;
        if (s.colhe > 0 && c === 0 && j / NPLANTAS < s.colhe * 0.8) continue;   // a 1ª calha vai sendo colhida
        const nasce = clamp(((s.mudas - ordem) * CALHAS.length * NPLANTAS) / 1.5);   // pulinho ao ser plantada
        const g = (0.26 + s.cresce * (0.65 + hash(c, j, 3) * 0.25)) * (s.cresce > 0 ? 1 : 0.35 + 0.65 * quique(nasce));
        planta(CX0 + 0.12 + j * ((CX1 - CX0 - 0.24) / (NPLANTAS - 1)), y + (j % 2 ? 0.03 : -0.03), z, g, CULTURA(c, j), y < 0 ? -1 : 1);
      }
    }
    MARCA = null;
    if (s.luz > 0.3 && s.noite > 0.3 && !(E('plantio') && tc >= E('plantio').ini)) FX.push({ tipo: 'holofote', de: [0.2, 0, BZ + 0.1], para: [0.2, 0, BZ + 3.6], k: clamp((s.luz - 0.3) / 0.5) * 0.6 });
    const brilho = s.energia && s.luz > 0.2 ? clamp(s.luz) * clamp(s.noite * 1.4) : 0;
    cobertura(s.vaos, s.vaoK, s.fundos, brilho);
    if (s.vaos < NARCOS - 1 && E('cobertura') && tc < E('cobertura').fim && E('estrutura') && tc >= E('estrutura').ini) pilhaPaineis(3.6, 2.4, Math.max(1, NARCOS - 1 - s.vaos));
    caboEstufa(s.cabo, s.energia ? t : null);
    if (E('estrutura') && tc >= E('estrutura').ini && tc < E('cobertura').fim) {
      const kr = clamp((tc - E('estrutura').ini) / 4);
      rover(lerp(5.6, 4.2, suave3(kr)), lerp(-5.4, -2.4, suave3(kr)), Math.PI * 0.55, t, kr > 0 && kr < 1, true);
    }
    if (s.trator) { trator(s.trator.x, s.trator.y, s.trator.dir, t, true); FOCO.trator = [s.trator.x, s.trator.y, altura(s.trator.x, s.trator.y, 1) + 0.7]; }
    pessoas(t, s);
    return {};
  }

  // ---------------------------------------------------------------- colonos (nomes de verdade) em cada etapa
  // Ninguém se teletransporta: quando muda a etapa (ou a tarefa dentro dela), cada colono ANDA do lugar antigo até
  // o novo. Enquanto trabalha, avança em degraus (fica, faz a ação, dá uns passos até o próximo ponto). O passo da
  // perna segue a distância andada (pé plantado no chão), acelera e freia, e o corpo vira aos poucos.
  const LEGUMES = ['#e04f5f', '#ffc83d', '#2bb673', '#e04f5f', '#1f7a45', '#ff8a3d', '#7be08f'];
  const lerpAng = (a, b, k) => { const d = ((((b - a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI; return a + d * clamp(k); };
  const velDe = (q) => clamp((6 * q * (1 - q)) / 1.5 * 1.3, 0, 1);   // velocidade relativa numa ida suave (0 nas pontas)
  const FASES = { fundacao: [0.36, 0.58], colheita: [0.55] };       // onde a turma troca de tarefa dentro da etapa
  const segDe = (id, k) => (FASES[id] || []).filter((b) => k >= b).length;

  /** Onde está a próxima muda a ser plantada (m = fração já plantada). */
  function frentePlantio(m) {
    const o = Math.min(CALHAS.length * NPLANTAS - 1, m * CALHAS.length * NPLANTAS), c = Math.floor(o / NPLANTAS), j = o - c * NPLANTAS;
    return { x: CX0 + 0.12 + j * ((CX1 - CX0 - 0.24) / (NPLANTAS - 1)), y: FILAS[CALHAS[c][0]] };
  }
  function chaoEm(s, xx, yy) {
    const dentro = xx > SX0 && xx < SX1 && Math.abs(yy) < SY;
    if (s.laje) return dentro ? BZ : altura(xx, yy, s.plano);
    if (dentro) return Math.max(FUNDO * s.cava, s.concreto > FUNDO + 0.01 && xx > lerp(SX1, SX0, s.frente) ? s.concreto : FUNDO * s.cava) + (s.manta > 0 ? 0.01 : 0);
    return altura(xx, yy, s.plano);
  }

  /** Onde o colono i está e o que faz na etapa id (k = progresso da etapa, t = tempo do vídeo). */
  function alvo(id, k, i, t, s) {
    const e = E(id) || { ini: 0, fim: 1 }, dur = e.fim - e.ini, kEm = (tx) => clamp((tx - e.ini) / dur);
    const r = { x: 0, y: 0, a: 'parar', o: 0, mov: null, cesta: false, bandeja: false };
    const no = (xx, yy, a, o) => { r.x = xx; r.y = yy; r.a = a; r.o = o == null ? Math.atan2(-yy, -xx) : o; r.mov = null; return r; };
    const andando = (A, B, q, a, oA, oB) => {   // trecho de caminhada de A até B (q = 0..1)
      const d = Math.hypot(B[0] - A[0], B[1] - A[1]), e2 = suave3(q), dir = Math.atan2(B[1] - A[1], B[0] - A[0]);
      no(lerp(A[0], B[0], e2), lerp(A[1], B[1], e2), a, q < 0.18 ? lerpAng(oA, dir, q / 0.18) : q > 0.82 ? lerpAng(dir, oB, (q - 0.82) / 0.18) : dir);
      r.mov = { passo: d * e2, v: velDe(q) };
      return r;
    };
    // vai e volta entre p0 e p1, com uma pausa em cada ponta para virar
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
    // trabalha em degraus: ponto(tx) = onde deveria estar no tempo tx; a cada T segundos dá uns passos até lá
    const degraus = (ponto, T, a, o, tw = 1.0) => {
      const tt = t + i * 0.45, n = Math.floor(tt / T), f = tt - n * T, A = ponto(n * T - i * 0.45), B = ponto((n + 1) * T - i * 0.45);
      const oA = no(A[0], A[1], a, o).o, oB = no(B[0], B[1], a, o).o;
      if (f < T - tw || Math.hypot(B[0] - A[0], B[1] - A[1]) < 0.05) return no(A[0], A[1], a, o);
      return andando(A, B, (f - (T - tw)) / tw, 'andar', oA, oB);
    };
    if (id === 'terraplanagem' || id === 'abertura') {
      const ang = -2.2 + i * 0.55, acoes = ['sinalizar', 'tablet', 'pa', 'pa', 'tablet'];
      no(Math.cos(ang) * 4.6, Math.sin(ang) * 4.6, acoes[i % 5]);
      if (r.a === 'sinalizar' && s.trator) r.o = Math.atan2(s.trator.y - r.y, s.trator.x - r.x);
    } else if (id === 'fundacao') {
      if (k < 0.36) {   // escavação: um sinaliza para a escavadeira, os outros conferem o nível
        const lug = [[1.6, -2.4, 'sinalizar'], [-2.6, 2.4, 'tablet'], [2.2, 2.4, 'parar'], [-0.6, 2.5, 'tablet'], [3.4, 1.2, 'parar']];
        const [lx, ly, a] = lug[i % 5]; no(lx, ly, a);
        if (a === 'sinalizar') r.o = Math.atan2(-3.0 - ly, 0.3 - lx);
      } else if (k < 0.58) {   // fôrmas: martelando as tábuas e as estacas
        const lug = [[SX0 + 0.6, SY + 0.32, -Math.PI / 2], [0.4, SY + 0.32, -Math.PI / 2], [SX1 + 0.32, 0.4, Math.PI], [SX0 - 0.32, -0.6, 0], [-1.6, -SY - 0.32, Math.PI / 2]];
        const [lx, ly, o] = lug[i % 5]; no(lx, ly, i === 3 ? 'pa' : 'martelar', o);
      } else if (i === 4) {   // guia o guindaste
        no(SX1 + 0.4, -SY - 0.5, 'sinalizar');
        if (s.gancho) r.o = Math.atan2(s.gancho[1] - r.y, s.gancho[0] - r.x);
      } else {   // agachados amarrando a malha, avançando junto com ela
        const xm = (tx) => lerp(SX0 + 0.4, SX1 - 0.4, clamp((kEm(tx) - 0.58) / 0.4));
        degraus((tx) => [xm(tx) - 0.3 - (i % 2) * 0.55, -1.1 + i * 0.7], 3.2, 'agachar', Math.PI + (i % 2 ? 0.3 : -0.3));
      }
    } else if (id === 'concretagem') {
      if (i === 0) no(SX1 + 0.45, 1.3, 'sinalizar', Math.PI * 0.75);
      else if (i === 4) no(SX0 - 0.5, 1.0, 'tablet', 0);
      else {   // espalhando com a pá, atrás da frente de concreto
        const xf = (tx) => lerp(SX1 - 0.6, SX0 + 0.6, clamp(kEm(tx) * 1.3 - 0.1 + i * 0.05));
        degraus((tx) => [xf(tx), -1.2 + (i - 1) * 1.1], 2.6, 'pa', Math.PI + 0.3 * (i - 2));
      }
    } else if (id === 'estrutura') {
      if (i < 2) {   // soldadores: andam de arco em arco
        const T = (dur * 0.95) / NARCOS, xA = (tx) => arcoX(Math.max(0, Math.min(NARCOS, Math.floor(clamp(kEm(tx) / 0.95) * NARCOS)) - 1)) + 0.25;
        degraus((tx) => [xA(tx), i ? -GR - 0.35 : GR + 0.35], T, 'soldar', i ? Math.PI / 2 : -Math.PI / 2);
      } else {
        const lug = [null, null, [2.9, -2.6, 'sinalizar'], [-2.8, 2.4, 'tablet'], [3.3, 0.4, 'tablet']];
        const [lx, ly, a] = lug[i]; no(lx, ly, a);
        if (a === 'sinalizar') r.o = Math.atan2(GUI[1] - ly, GUI[0] - lx);
      }
    } else if (id === 'cobertura') {
      const xv = (tx) => arcoX(Math.min(NARCOS - 2, Math.floor(clamp((kEm(tx) - 0.12) / 0.55) * (NARCOS - 1)))) + 0.3;
      if (i < 2) degraus((tx) => [xv(tx), i ? -GR - 0.4 : GR + 0.4], (dur * 0.55) / (NARCOS - 1), 'chave', i ? Math.PI / 2 : -Math.PI / 2);
      else if (i === 4) caminho([3.6, 2.1], [xv(t) + 0.3, GR + 0.6], 0.55, 'carregar');
      else no(-3.7, i === 2 ? 0.9 : -0.4, i === 2 ? 'tablet' : 'parar', 0);
    } else if (id === 'hidroponia') {
      const lug = [[-1.2, 0, 'chave', Math.PI / 2], [0.4, 0, 'chave', -Math.PI / 2], [1.75, -0.05, 'tablet', 0], null, [-2.0, 0, 'chave', Math.PI / 2]];
      if (i === 3) caminho([-1.8, 0], [1.3, 0], 0.5, 'carregar');
      else { const [lx, ly, a, o] = lug[i]; no(lx, ly, a, o); }
    } else if (id === 'luzes') {
      const lug = [[-4.0, 2.4, 'chave'], [-3.6, 1.2, 'tablet'], [-0.6, 0, 'lanterna', 0], [0.9, 0, 'tablet', Math.PI / 2], [-2.7, 0, 'parar', 0]];
      const [lx, ly, a, o] = lug[i % lug.length]; no(lx, ly, a, o);
    } else if (id === 'plantio') {   // plantando muda por muda; a bandeja vem da eclusa
      if (i === 0 || i === 2) {
        const fr = (tx) => frentePlantio(clamp(kEm(tx) / 0.85));
        const lado = (tx) => (fr(tx).y < 0 ? -1 : 1);
        degraus((tx) => [fr(tx).x - (i === 2 ? 0.75 : 0) + 0.05, (i === 2 ? -0.06 : 0.06) * lado(tx)], 1.6, 'plantar', lado(t) * Math.PI / 2, 0.6);
      } else if (i === 1 || i === 3) { caminho([-1.95, i === 1 ? 0.08 : -0.08], [frentePlantio(clamp(k / 0.85)).x - 0.4, 0], 0.5, 'carregar', 1.4); r.bandeja = true; }
      else no(1.75, -0.05, 'tablet', 0);
    } else if (id === 'colheita') {
      if (k < 0.55) no(-3.9 + (i % 3) * 0.5, 1.3 + Math.floor(i / 3) * 0.6, i % 2 ? 'tablet' : 'parar', 0);
      else if (i < 2) { caminho([-1.5, 0], [-4.2, 0.2], 0.55, 'carregar'); r.cesta = true; }
      else no(-0.6 + (i - 2) * 0.9, 0, i % 2 ? 'chave' : 'festa', -Math.PI / 2);
    } else {   // voo e convite: todo mundo na frente da eclusa, comemorando
      no(-4.0 + (i % 3) * 0.55, -0.9 + Math.floor(i / 3) * 1.4 + (i % 3) * 0.3, 'festa', 0);
    }
    return r;
  }

  function pessoas(t, s) {
    const { e, k } = etapaEm(t), idx = OB.etapas.indexOf(e);
    OB.colonos.forEach((c, i) => {
      const sem = i * 1.7, cor = TRAJES[i % TRAJES.length];
      let r = alvo(e.id, k, i, t, s);
      // começo do trecho atual (etapa ou tarefa dentro dela): de onde o colono vem andando
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
          r = { ...r, x: lerp(antes.x, r.x, e2), y: lerp(antes.y, r.y, e2), a: r.a === 'carregar' ? 'carregar' : 'andar', o: olhar, mov: { passo: d * e2, v: velDe(q) }, cesta: false, bandeja: r.a === 'carregar' && r.bandeja };
        }
      }
      ULTIMA_CAIXA = null;
      MARCA = BLOCO && r.x > GX0 && r.x < GX1 && Math.abs(r.y) < GR - 0.2 ? 'dentro' : null;
      const cabeca = pessoa(r.x, r.y, chaoEm(s, r.x, r.y), cor, r.o, r.a, t, sem, r.mov);
      if (r.bandeja && ULTIMA_CAIXA) for (let q = 0; q < 6; q++) muda(soma(ULTIMA_CAIXA, [((q % 3) - 1) * 0.08, (Math.floor(q / 3) - 0.5) * 0.12, 0.0]), 0.5, q);   // bandeja de mudas
      if (r.cesta && ULTIMA_CAIXA) for (let q = 0; q < 7; q++) {   // caixa cheia de legumes e verduras
        const p = soma(ULTIMA_CAIXA, [((q % 3) - 1) * 0.07, (Math.floor(q / 3) - 1) * 0.08, 0.02 + (q % 2) * 0.02]);
        fruto(p, 0.04, 0.035, LEGUMES[q]);
      }
      MARCA = null;
      TAGS.push({ p: cabeca, nome: c.nome, cor });
      FOCO.pessoas[i] = soma(cabeca, [0, 0, -0.6]);
    });
  }

  // ---------------------------------------------------------------- câmera e HUD
  const PLANOS_E = {
    abertura: { tz: 1.1, zoom: 30, pitch: 0.36 },
    terraplanagem: { tz: 0.5, zoom: 24, pitch: 0.6 },
    fundacao: { tz: 0.0, zoom: 30, pitch: 0.72 },
    concretagem: { tz: 0.0, zoom: 29, pitch: 0.62 },
    estrutura: { tz: 1.2, zoom: 26, pitch: 0.45 },
    cobertura: { tz: 1.0, zoom: 30, pitch: 0.5 },
    hidroponia: { tx: 0.2, tz: 0.8, zoom: 46, pitch: 0.7 },
    luzes: { tx: -0.6, tz: 0.9, zoom: 32, pitch: 0.42 },
    plantio: { tx: 0.0, tz: 0.75, zoom: 58, pitch: 0.55 },
    colheita: { tz: 0.9, zoom: 34, pitch: 0.5 },
    voo: { tz: 1.1, zoom: 27, pitch: 0.36 },
    convite: { tz: 1.1, zoom: 22, pitch: 0.42 },
  };
  const CLOSES_E = {
    terraplanagem: { alvo: 'trator', zoom: 74, de: 0.34, ate: 0.6, pitch: 0.34 },
    fundacao: { alvo: 'trator', zoom: 64, de: 0.08, ate: 0.3, pitch: 0.4 },
    concretagem: { alvo: 'trator', zoom: 70, de: 0.22, ate: 0.42, pitch: 0.42 },
    estrutura: { alvo: 0, zoom: 84, de: 0.45, ate: 0.66, pitch: 0.3 },
    cobertura: { alvo: 0, zoom: 82, de: 0.32, ate: 0.52, pitch: 0.3 },
    hidroponia: { alvo: 1, zoom: 96, de: 0.5, ate: 0.72, pitch: 0.42 },
    plantio: { alvo: 0, zoom: 118, de: 0.28, ate: 0.62, pitch: 0.42 },
    colheita: { alvo: 3, zoom: 86, de: 0.66, ate: 0.9, pitch: 0.42 },
  };
  function planoDeE(id, s, k) {
    const p = { tx: 0, ty: 0, ...(PLANOS_E[id] || PLANOS_E.voo) };
    if (id === 'terraplanagem' && s.trator) { p.tx = s.trator.x * 0.6; p.ty = s.trator.y * 0.6; p.zoom = lerp(26, 34, k); }
    if (id === 'fundacao') {   // depois da escavação, close nos colonos amarrando a malha
      const w = suave3((k - 0.66) / 0.08) * (1 - suave3((k - 0.88) / 0.08));
      p.zoom = lerp(30, 58, w); p.pitch = lerp(0.72, 0.5, w); p.tx = lerp(0, lerp(SX0 + 0.4, SX1 - 0.4, s.malha) - 0.6, w); p.tz = lerp(0, -0.2, w);
    }
    if (id === 'concretagem') p.tx = lerp(1.2, -0.6, k);
    if (id === 'plantio') { const f = frentePlantio(clamp(k / 0.85)); p.tx = f.x * 0.8 + 0.2; p.ty = f.y * 0.4; }
    if (id === 'estrutura') p.tx = lerp(-1.2, 1.4, k);
    if (id === 'cobertura') p.tx = k < 0.7 ? lerp(-1.4, 1.6, k / 0.7) : lerp(1.6, -0.4, (k - 0.7) / 0.3);
    if (id === 'colheita') p.zoom = lerp(30, 38, k);
    return p;
  }
  function hudExtra(t, e, k) {
    if (e.id === 'cobertura' && k > 0.7) {   // manômetro da pressurização
      const ks = clamp((k - 0.72) / 0.24), y = 1120, a = clamp((k - 0.7) / 0.04);
      ctx.globalAlpha = a;
      caixa(140, y, W - 280, 170, 0.9, ks >= 1 ? COR.ok : COR.agua);
      texto(`PRESSÃO ${(0.7 * ks).toFixed(2).replace('.', ',')} ATM`, W / 2, y + 55, 38, '#ffffff', { contorno: false });
      ret(190, y + 95, W - 380, 22, COR.borda); ret(190, y + 95, (W - 380) * ks, 22, ks >= 1 ? COR.ok : COR.agua);
      if (ks >= 1) texto('SEM VAZAMENTO ✓', W / 2, y + 145, 26, COR.ok, { contorno: false });
      ctx.globalAlpha = 1;
    }
    if (e.id === 'colheita') {
      if (k < 0.55) {
        const sol = Math.round(lerp(16, 46, suave3(clamp(k / 0.55))));
        chip(W / 2 + 120, 1120, `SOL ${sol}`, COR.ceu, COR.ouro, 'right');
        texto('>> 30 SÓIS DEPOIS', W / 2, 1220, 36, '#ffffff');
      } else if (Math.floor(t * 3) % 4 !== 0) texto('PRIMEIRA COLHEITA!', W / 2, 1180, 56, '#7be08f');
    }
  }

  OBRAS.estufa = {
    estado, montar, planoDe: planoDeE, closes: CLOSES_E,
    pesos: { terraplanagem: 0.07, fundacao: 0.12, concretagem: 0.12, estrutura: 0.17, cobertura: 0.17, hidroponia: 0.13, luzes: 0.08, plantio: 0.06, colheita: 0.08 },
    abertura: [['UMA ESTUFA', 70], ['HIDROPÔNICA', 58], ['EM MARTE?', 70]],
    hudExtra,
  };
})();
