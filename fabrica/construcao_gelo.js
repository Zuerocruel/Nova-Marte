// Operação Marte Zero · "Como se constrói um EXTRATOR DE GELO em Marte?" — cena da obra para o construcao.js.
// Usa só as primitivas do motor de lá (faces, caixas, vigas, colonos, FX) e se registra em OBRAS.gelo.
// TUDO aqui é exclusivo deste vídeo (pedido do dono): sem trator, guindaste, rover ou concreto das outras obras.
//
// O gelo fica a 2 m de profundidade (o radar do ep. 6 achou). Etapas:
//   radar de solo (carrinho empurrado à mão; o radargrama aparece no painel de corte)
//   → aplainar (como toda obra da série, mas com máquina própria: nível a laser no tripé + motoniveladora que corta
//     faixa por faixa, ida e volta, com o receptor do laser na lâmina)
//   → fundação (sem concreto: trilhos + pórtico de micro-ondas que derrete a poeira numa laje de "vidro"; 6 chumbadores)
//   → piso de aço (6 colunas parafusadas nos chumbadores, vigas e chapas)
//   → mastro da broca (montado DEITADO em cima de um cavalete e erguido por um guincho, girando na dobradiça)
//   → perfuração (o cabeçote desce; o corte mostra poeira, rocha e gelo; o cascalho cai numa caçamba)
//   → água quente (poço Rodwell: caldeira manda água quente, o gelo derrete lá embaixo e a bomba puxa de volta)
//   → filtragem (poeira e percloratos) → tanque enchendo e a água seguindo para a colônia.
(function () {
  const SX0 = -2.0, SX1 = 2.0, SY0 = -1.5, SY1 = 1.5;          // piso de aço
  const Z0 = 0.4, RPL = 3.2;                                     // altura e raio do platô que a motoniveladora deixa
  const FX0 = -2.4, FX1 = 2.4, FY0 = -1.9, FY1 = 1.9, SZ = Z0 + 0.12;   // laje sinterizada
  const DZ = SZ + 0.55;                                          // piso de aço em cima das colunas
  const LANES = 4, LW = 1.5, LY0 = -3.0, GX = 4.6;               // faixas da motoniveladora (ao longo de x)
  const LASER = [-3.6, 4.2];                                     // tripé do nível a laser (fora do corte)
  const RAIL_Y = [FY0 - 0.3, FY1 + 0.3], RX0 = FX0 - 0.5, RX1 = FX1 + 0.7;
  let S = null;
  // quanto do terreno já foi cortado no ponto (x, y): a faixa da vez só fica plana atrás da lâmina
  function fPlano(x, y) {
    if (!S) return 0;
    if (S.terra == null) return S.plano;
    const j = clamp(Math.floor((y - LY0) / LW), 0, LANES - 1), qt = clamp((S.terra * LANES - j) / 0.85);
    if (qt >= 1) return 1;
    if (qt <= 0) return 0;
    const gx = j % 2 === 0 ? lerp(-GX, GX, qt) : lerp(GX, -GX, qt);
    return suave3((j % 2 === 0 ? gx - x : x - gx) / 0.5);
  }
  const dentroPl = (x, y) => 1 - suave3((Math.hypot(x, y) - RPL) / 1.4);
  const hG = (x, y, f) => lerp(alturaBruta(x, y), Z0, dentroPl(x, y) * f);
  const chao = (x, y) => hG(x, y, fPlano(x, y));
  const chaoFinal = (x, y) => hG(x, y, 1);
  const PES =[[SX0 + 0.2, SY0 + 0.2], [0, SY0 + 0.2], [SX1 - 0.2, SY0 + 0.2], [SX1 - 0.2, SY1 - 0.2], [0, SY1 - 0.2], [SX0 + 0.2, SY1 - 0.2]];
  const CHAPAS = [];   // 4 x 2 chapas do piso, na ordem em que são colocadas
  for (let j = 0; j < 2; j++) for (let i = 0; i < 4; i++) CHAPAS.push([SX0 + i, SY0 + j * 1.5]);
  const NMOD = 4, HM = 0.95, TOPO = DZ + NMOD * HM;
  const ladoT = (h) => lerp(0.5, 0.28, clamp(h / (NMOD * HM)));   // h = altura acima do piso
  const L0 = ladoT(0);
  const GUINCHO = [0, 1.15], CAVALETE = [0, 1.45];               // guincho e o "A" que ergue o cabo
  const CALD = { x0: -1.85, x1: -1.15, y0: 0.35, y1: 1.05, h: 0.62 };
  const FILTROS = [[0.55, 1.05], [1.0, 1.05], [1.45, 1.05]];
  const TANQ = [3.15, -0.5], RT = 0.6, HT = 1.35;
  const ZT = Math.max(...[[0, 0], [RT, 0], [-RT, 0], [0, RT], [0, -RT]].map(([a, b]) => chaoFinal(TANQ[0] + a, TANQ[1] + b))) + 0.1;
  const CACAMBA = { x0: -1.2, x1: -0.55, y0: -1.3, y1: -0.8 };
  const P = (x, y, dz = 0.07) => [x, y, DZ + dz];
  const ROTA_CALD = [P(-1.15, 0.7), P(-0.4, 0.7), P(-0.12, 0.12)];
  const ROTA_FILT = [P(0.12, 0.08), P(0.55, 0.08), P(0.55, 0.82)];
  const ROTA_ENTRE = [P(0.55, 0.82), P(1.45, 0.82)];
  const ROTA_TANQ = [P(1.45, 0.82), P(1.85, 0.82), P(1.85, -0.5), P(2.15, -0.5), [2.15, -0.5, ZT + 0.55], [TANQ[0] - RT, -0.5, ZT + 0.55]];
  const ROTA_COL = [[TANQ[0], TANQ[1] - RT - 0.05], [3.1, -2.4], [3.8, -4.1], [4.6, -5.8]];   // pelo chão, até a colônia
  const E = (id) => OB.etapas.find((e) => e.id === id);
  const sobrePiso = (x, y) => x > SX0 - 0.02 && x < SX1 + 0.02 && y > SY0 - 0.02 && y < SY1 + 0.02;
  const naLaje = (x, y) => S && S.laje > 0 && x > FX0 - 0.02 && x < lerp(FX0, FX1, S.laje) + 0.02 && y > FY0 - 0.02 && y < FY1 + 0.02;
  const zc = (x, y) => (S && S.piso && sobrePiso(x, y) ? DZ : naLaje(x, y) ? SZ : chao(x, y));

  // ---------------------------------------------------------------- terreno (malha fina: o corte aparece faixa por faixa)
  function chaoG() {
    const st = 0.5;
    for (let x = -T; x < T - 1e-6; x += st) for (let y = -T; y < T - 1e-6; y += st) {
      const a = [x, y, chao(x, y)], b = [x + st, y, chao(x + st, y)], c = [x + st, y + st, chao(x + st, y + st)], d = [x, y + st, chao(x, y + st)];
      const cx = x + st / 2, cy = y + st / 2, v = hash(Math.floor(cx), Math.floor(cy), 2);
      const cortado = fPlano(cx, cy) * dentroPl(cx, cy) > 0.6;
      const cor = cortado ? (hash(Math.floor(cx * 2), Math.floor(cy * 2), 3) < 0.5 ? '#c98a5e' : '#c08257')
        : v < 0.33 ? '#c4643c' : v < 0.66 ? '#bb5a35' : '#cc6d43';
      face([a, b, c], cor, { fundo: true }); face([a, c, d], cor, { fundo: true });
    }
    const camadas = [[0, -0.5, '#a24c30'], [-0.5, -1.4, '#7e3a26'], [-1.4, -2.6, '#5e2c1b']];
    const borda = (p, q) => {
      face([[p[0], p[1], camadas[0][1]], [q[0], q[1], camadas[0][1]], [q[0], q[1], chao(q[0], q[1])], [p[0], p[1], chao(p[0], p[1])]], camadas[0][2], { fundo: true });
      for (const [z0, z1, cor] of camadas.slice(1)) face([[p[0], p[1], z1], [q[0], q[1], z1], [q[0], q[1], z0], [p[0], p[1], z0]], cor, { fundo: true });
    };
    for (let i = -T; i < T - 1e-6; i += st) {
      borda([i + st, T], [i, T]); borda([i, -T], [i + st, -T]);
      borda([T, i], [T, i + st]); borda([-T, i + st], [-T, i]);
    }
    for (let i = 0; i < 14; i++) {   // pedras (fora do corte)
      const x = -T + 0.6 + hash(i, 1, 7) * (2 * T - 1.2), y = -T + 0.6 + hash(i, 2, 7) * (2 * T - 1.2);
      if (Math.hypot(x, y) < 4.7 || Math.hypot(x - LASER[0], y - LASER[1]) < 0.8) continue;
      const s = 0.15 + hash(i, 3, 7) * 0.3, z = chao(x, y);
      obox([x, y, z + s * 0.6], [s, s * 0.3, 0], [-s * 0.25, s * 0.8, 0], [0, 0, s * 0.7], '#8f4129', { topo: '#a85a3a' });
    }
  }

  // ---------------------------------------------------------------- aplainar: nível a laser + motoniveladora
  function graderEm(q) {   // serpentina: 4 faixas, ida e volta, com a curva no fim de cada uma
    const f = clamp(q) * LANES, j = Math.min(LANES - 1, Math.floor(f)), w = f - j, ida = j % 2 === 0, yc = LY0 + LW * (j + 0.5), R = LW / 2;
    if (w < 0.85 || j === LANES - 1) {
      const qt = clamp(w / 0.85);
      return { x: ida ? lerp(-GX, GX, qt) : lerp(GX, -GX, qt), y: yc, dir: ida ? 0 : Math.PI, corta: qt < 1, anda: f * 9 };
    }
    const a = ((w - 0.85) / 0.15) * Math.PI, sx = ida ? 1 : -1;
    return { x: sx * (GX + R * Math.sin(a)), y: yc + R - R * Math.cos(a), dir: ida ? a : Math.PI - a, corta: false, anda: f * 9 };
  }
  function motoniveladora(g, t) {
    const c = Math.cos(g.dir), s = Math.sin(g.dir);
    const z = (chao(g.x + c * 0.9, g.y + s * 0.9) + chao(g.x - c * 0.6, g.y - s * 0.6)) / 2;
    const { u, v, at } = local([g.x, g.y, z], g.dir), giro = Math.floor(g.anda * 3);
    const roda = (a, b) => cilindro(at(a, b - 0.06, 0.15), at(a, b + 0.06, 0.15), 0.15, 8, '#2a2140', { tampa: '#6b6f86', lados: (i) => ((i + giro) % 4 ? '#2a2140' : '#4a4466') });
    for (const b of [-0.36, 0.36]) { roda(0.95, b); roda(-0.38, b); roda(-0.72, b); }
    viga(at(-0.55, 0, 0.42), at(0.95, 0, 0.44), 0.12, '#ffc83d', { topo: '#ffd86a' });                 // chassi comprido
    viga(at(0.95, 0, 0.44), at(0.95, 0, 0.18), 0.1, '#e0a920');
    obox(at(-0.6, 0, 0.42), mul(u, 0.2), mul(v, 0.3), [0, 0, 0.16], '#ffc83d', { topo: '#e0a920' });     // motor
    obox(at(-0.25, 0, 0.74), mul(u, 0.17), mul(v, 0.24), [0, 0, 0.2], '#eef0f8', { topo: '#c9ced9' });  // cabine
    obox(at(-0.07, 0, 0.78), mul(u, 0.01), mul(v, 0.2), [0, 0, 0.11], '#3fd0c9', { emis: true });
    // lâmina inclinada embaixo do meio, com o receptor do laser na ponta
    obox(at(0.15, 0, 0.13), soma(mul(u, -0.1), mul(v, 0.8)), mul(u, 0.03), [0, 0, 0.11], '#9aa0b5', { topo: '#c9ced9' });
    viga(at(0.15, 0, 0.24), at(0.15, 0, 0.42), 0.06, '#6b6f86');
    const rx = at(0.05, 0.78, 0.95);
    viga(at(0.05, 0.78, 0.24), rx, 0.03, '#c9ced9');
    obox(rx, mul(u, 0.05), mul(v, 0.05), [0, 0, 0.06], g.corta ? '#ff4d4d' : '#6b6f86', { emis: g.corta });
    if (Math.floor(t * 3) % 2) FX.push({ tipo: 'brilho', p: at(-0.25, 0, 0.98), cor: '#ff8a3d', r: 1.6 });   // giroflex
    if (g.corta) { FX.push({ tipo: 'poeira', p: at(0.05, 0.85, 0.08), t, semente: 4 }); FX.push({ tipo: 'poeira', p: at(0.25, -0.8, 0.08), t, semente: 7 }); }
    return { rx, foco: at(0.1, 0, 0.5) };
  }
  function tripe(k, t, alvoP) {   // nível a laser: o feixe gira e "trava" no receptor da lâmina
    if (k <= 0) return;
    const [x, y] = LASER, z = chao(x, y), hz = z + 0.95 * suave3(k);
    for (const a of [0.4, 2.5, 4.6]) viga([x + Math.cos(a) * 0.32, y + Math.sin(a) * 0.32, z], [x, y, hz - 0.08], 0.03, '#9aa0b5');
    cilindro([x, y, hz - 0.08], [x, y, hz + 0.08], 0.1, 8, '#ffc83d', { tampa: '#e0a920' });
    if (k < 1) return;
    const cab = [x, y, hz + 0.14];
    cilindro([x, y, hz + 0.08], [x, y, hz + 0.2], 0.05, 6, '#e2603b', { tampa: '#ff8a5c' });
    if (alvoP) linha3(cab, alvoP, '#ff4d4d', 1, true);
    else { const a = t * 5; linha3(cab, [x + Math.cos(a) * 1.8, y + Math.sin(a) * 1.8, cab[2]], '#ff4d4d', 1, true); }
    FX.push({ tipo: 'brilho', p: cab, cor: '#ff4d4d', r: 1.8 });
  }

  // ---------------------------------------------------------------- fundação: trilhos, pórtico de micro-ondas, laje de vidro
  function trilhos(k) {
    if (k <= 0) return;
    const xs = lerp(RX0, RX1, suave3(k)), st = 0.3;
    for (const yr of RAIL_Y) for (let x = RX0; x < xs - 1e-6; x += st) {
      const x1 = Math.min(xs, x + st);
      caixa3(x + 0.08, yr - 0.16, chao(x, yr), x + 0.16, yr + 0.16, chao(x, yr) + 0.03, '#6b4a35');   // dormente
      viga([x, yr, chao(x, yr) + 0.06], [x1, yr, chao(x1, yr) + 0.06], 0.05, '#9aa0b5', { topo: '#c9ced9' });
    }
  }
  function laje(frente, gxCalor) {   // a poeira derretida brilha laranja atrás do pórtico e esfria até virar vidro escuro
    if (frente <= 0) return;
    const xf = lerp(FX0, FX1, frente), N = 16, w = (FX1 - FX0) / N;
    for (let i = 0; i < N; i++) {
      const a = FX0 + i * w, b = Math.min(xf, a + w);
      if (b <= a + 1e-4) break;
      const calor = gxCalor == null ? 0 : clamp(1 - (gxCalor - (a + b) / 2) / 1.8);
      const [cor, topo, emis] = calor > 0.7 ? ['#e2603b', '#ffb05a', true] : calor > 0.42 ? ['#a8452f', '#ff8a3d', true]
        : calor > 0.15 ? ['#6e3a3a', '#8a4a40', false] : ['#4a3d55', i % 2 ? '#5f5070' : '#5a4b6b', false];
      caixa3(a, FY0, Z0 - 0.05, b, FY1, SZ, cor, { topo, emis });
    }
  }
  function portico(gx, k, ligado, t) {
    if (k <= 0) return null;
    const H = Z0 + 1.3 * suave3(k);
    for (const yr of RAIL_Y) {
      const zb = chao(gx, yr) + 0.08;
      caixa3(gx - 0.32, yr - 0.12, zb, gx + 0.32, yr + 0.12, zb + 0.14, '#3a2f63', { topo: '#4a4466' });   // carrinho no trilho
      for (const s of [-1, 1]) viga([gx + s * 0.26, yr, zb + 0.14], [gx, yr, H], 0.07, '#eef0f8');
    }
    caixa3(gx - 0.14, RAIL_Y[0] - 0.06, H, gx + 0.14, RAIL_Y[1] + 0.06, H + 0.18, '#e2603b', { topo: '#ff8a5c' });
    if (k < 1) return null;
    caixa3(gx - 0.28, FY0 + 0.05, SZ + 0.18, gx + 0.28, FY1 - 0.05, SZ + 0.42, '#4a4466', { topo: '#6b6f86' });   // emissor
    for (let y = FY0 + 0.4; y < FY1; y += 0.75) viga([gx, y, SZ + 0.42], [gx, y, H], 0.03, '#9aa0b5');
    if (ligado) {
      face([[gx - 0.28, FY0 + 0.05, SZ + 0.175], [gx + 0.28, FY0 + 0.05, SZ + 0.175], [gx + 0.28, FY1 - 0.05, SZ + 0.175], [gx - 0.28, FY1 - 0.05, SZ + 0.175]],
        '#ffb05a', { n: [0, 0, -1], emis: true, duplo: true });
      for (let y = FY0 + 0.3; y < FY1; y += 0.6) FX.push({ tipo: 'brilho', p: [gx, y, SZ + 0.08], cor: '#ff8a3d', r: 2.4 + Math.sin(t * 12 + y * 3) * 0.5 });
      FX.push({ tipo: 'fumaca', p: [gx - 0.45, Math.sin(t * 0.7) * 1.2, SZ + 0.15], t, semente: 3 });
    }
    return [gx, 0, SZ + 0.3];
  }
  function chumbador(x, y, k) {   // placa amarela + parafuso entrando na laje
    if (k <= 0) return;
    prisma(x, y, SZ, SZ + 0.04, 0.17, 0.17, 6, '#ffc83d', { topo: '#e0a920' });
    cilindro([x, y, SZ + 0.04], [x, y, SZ + 0.04 + 0.14 * (1 - suave3(k)) + 0.03], 0.035, 6, '#c9ced9', { tampa: '#eef0f8' });
  }

  // ---------------------------------------------------------------- radar de solo
  const PASSES = [-1.0, 0.0, 1.0], XR = 2.6;
  function radarEm(q) {
    const n = PASSES.length, f = clamp(q) * n, i = Math.min(n - 1, Math.floor(f)), w = f - i, ida = i % 2 === 0;
    return { x: ida ? lerp(-XR, XR, w) : lerp(XR, -XR, w), y: PASSES[i], dir: ida ? 0 : Math.PI, passo: clamp(q) * n * 2 * XR, w };
  }
  function carrinhoRadar(x, y, dir, t, ativo) {
    const z = chao(x, y), { u, v, at } = local([x, y, z], dir);
    obox(at(0, 0, 0.16), mul(u, 0.28), mul(v, 0.2), [0, 0, 0.07], '#ffc83d', { topo: '#ffd86a' });
    obox(at(0, 0, 0.05), mul(u, 0.3), mul(v, 0.22), [0, 0, 0.03], '#2a2140');
    for (const a of [-0.2, 0.2]) for (const s of [-1, 1]) cilindro(at(a, s * 0.2, 0.08), at(a, s * 0.26, 0.08), 0.08, 6, '#2a2140', { tampa: '#6b6f86' });
    viga(at(-0.25, 0, 0.22), at(-0.55, 0, 0.72), 0.04, '#9aa0b5');
    viga(at(-0.55, -0.15, 0.72), at(-0.55, 0.15, 0.72), 0.04, '#6b6f86');
    obox(at(-0.38, 0, 0.55), mul(u, 0.02), mul(v, 0.1), [0, 0, 0.07], '#3fd0c9', { emis: true });
    if (ativo) FX.push({ tipo: 'impacto', p: at(0, 0, 0.02), k: (t * 1.4) % 1 });
    return at(0, 0, 0.3);
  }
  function bandeirinha(x, y) {
    const z = chao(x, y);
    viga([x, y, z], [x, y, z + 0.55], 0.025, '#eef0f8');
    face([[x, y, z + 0.55], [x + 0.22, y, z + 0.49], [x, y, z + 0.42]], '#ff8a3d', { duplo: true, n: [0, 1, 0] });
  }

  // ---------------------------------------------------------------- piso de aço sobre os chumbadores
  function coluna(x, y, k) {   // coluna montada em 3 gomos, de baixo para cima
    if (k <= 0) return null;
    const h = (DZ - 0.1 - SZ - 0.04), n = 3, z0 = SZ + 0.04;
    for (let g = 0; g < n; g++) {
      const kk = clamp(k * n - g);
      if (kk <= 0) break;
      cilindro([x, y, z0 + (g / n) * h], [x, y, z0 + ((g + suave3(kk)) / n) * h], 0.08, 8, g % 2 ? '#ff8a5c' : '#e2603b', { tampa: '#c94f2e' });
    }
    if (k >= 1) caixa3(x - 0.13, y - 0.13, DZ - 0.12, x + 0.13, y + 0.13, DZ - 0.1, '#6b6f86');
    return [x, y, z0 + h * k];
  }
  function vigasBase(k, inclina = 0) {   // perfil de aço em volta e no meio
    if (k <= 0) return;
    const z = (x) => DZ - 0.1 + inclina * x * 0.08;
    const lados = [[[SX0, SY0], [SX1, SY0]], [[SX0, SY1], [SX1, SY1]], [[SX0, SY0], [SX0, SY1]], [[SX1, SY0], [SX1, SY1]], [[0, SY0], [0, SY1]]];
    lados.forEach(([a, b], i) => {
      const kk = clamp(k * lados.length - i);
      if (kk <= 0) return;
      const fx = lerp(a[0], b[0], kk), fy = lerp(a[1], b[1], kk);
      viga([a[0], a[1], z(a[0])], [fx, fy, z(fx)], 0.1, '#e2603b', { topo: '#ff8a5c' });
    });
  }
  function chapa(i, inclina, cai = 0) {
    const [x, y] = CHAPAS[i], z = (xx) => DZ - 0.04 + inclina * xx * 0.08 + cai;
    const a = [x + 0.02, y + 0.02, z(x)], b = [x + 0.98, y + 0.02, z(x + 1)], c = [x + 0.98, y + 1.48, z(x + 1)], d = [x + 0.02, y + 1.48, z(x)];
    face([a, b, c, d], i % 2 ? '#9aa0b5' : '#a3a8bd', { n: [0, 0, 1], duplo: true });
    for (let q = 0.25; q < 1; q += 0.25) linha3([x + q, y + 0.05, z(x + q) + 0.003], [x + q, y + 1.45, z(x + q) + 0.003], '#6b6f86', 1, false);   // ranhuras
  }
  function escada(k) {   // escadinha do chão até o piso (lado da frente)
    if (k <= 0) return;
    const x = -0.9, y0 = SY0, zt = DZ, zb = chao(x, y0 - 0.9);
    for (const s of [-0.22, 0.22]) viga([x + s, y0, zt], [x + s, y0 - 0.9, zb], 0.04, '#9aa0b5');
    for (let i = 1; i < 5; i++) { const q = i / 5; viga([x - 0.22, y0 - 0.9 * q, lerp(zt, zb, q)], [x + 0.22, y0 - 0.9 * q, lerp(zt, zb, q)], 0.03, '#c9ced9'); }
  }
  function guardaCorpo() {   // corrimão amarelo nas bordas de trás e dos lados
    for (const [a, b] of [[[SX0, SY1], [SX1, SY1]], [[SX0, SY0], [SX0, SY1]], [[SX1, SY0], [SX1, SY1]]]) {
      viga([a[0], a[1], DZ + 0.45], [b[0], b[1], DZ + 0.45], 0.03, '#ffc83d');
      const n = Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.75);
      for (let i = 0; i <= n; i++) { const x = lerp(a[0], b[0], i / n), y = lerp(a[1], b[1], i / n); viga([x, y, DZ], [x, y, DZ + 0.45], 0.025, '#e0a920'); }
    }
  }

  // ---------------------------------------------------------------- mastro: montado deitado e erguido pelo guincho
  // coordenadas do mastro: (x, y, h) com h ao longo do mastro; th = 0 deitado (o topo aponta para -y), th = 90° em pé.
  // A dobradiça é a aresta da frente da base (y = -L0, no piso).
  function TM(th) {
    const U = [0, -Math.cos(th), Math.sin(th)], Y = [0, Math.sin(th), Math.cos(th)];
    return (x, y, h) => soma([x, -L0, DZ], soma(soma([x * 0, 0, 0], mul(Y, y + L0)), mul(U, h)));
  }
  function moduloMastro(i, th, k = 1) {   // k < 1: o módulo ainda chegando (os colonos trazem e encaixam)
    if (k <= 0) return;
    const M = TM(th), h0 = i * HM, h1 = h0 + HM * suave3(k), l0 = ladoT(h0), l1 = ladoT(h0 + HM);
    const C = (l, h) => [[-l, -l], [l, -l], [l, l], [-l, l]].map(([x, y]) => M(x, y, h));
    const A = C(l0, h0), B = C(lerp(l0, l1, suave3(k)), h1);
    for (let j = 0; j < 4; j++) {
      viga(A[j], B[j], 0.06, '#e2603b');
      if (k < 0.9) continue;
      const n = (j + 1) % 4;
      viga(A[j], B[n], 0.03, '#eef0f8'); viga(A[n], B[j], 0.03, '#eef0f8');
      viga(B[j], B[n], 0.045, '#e2603b');
    }
  }
  function dobradica(k) {
    if (k <= 0) return;
    for (const s of [-1, 1]) cilindro([s * L0 - 0.08 * s, -L0, DZ + 0.06], [s * L0 + 0.08 * s, -L0, DZ + 0.06], 0.07, 8, '#4a4466', { tampa: '#9aa0b5' });
  }
  function cavaleteApoio(k) {   // o mastro deitado descansa num cavalete de madeira lá na ponta
    if (k <= 0) return;
    const y = -L0 - NMOD * HM + 0.4, zt = DZ + 2 * L0 * 0.5, zb = chao(0, y);
    for (const s of [-1, 1]) { viga([s * 0.45, y - 0.25, zb], [s * 0.3, y, zt], 0.06, '#8f6a45'); viga([s * 0.45, y + 0.25, zb], [s * 0.3, y, zt], 0.06, '#8f6a45'); }
    viga([-0.5, y, zt], [0.5, y, zt], 0.07, '#a07a50');
  }
  function guincho(t, puxando) {   // tambor com o cabo enrolando + motor
    const [x, y] = GUINCHO, z = DZ;
    caixa3(x - 0.45, y - 0.2, z, x + 0.45, y + 0.2, z + 0.1, '#3a2f63', { topo: '#4a4466' });
    const g = puxando ? Math.floor(t * 8) : 0;
    cilindro([x - 0.3, y, z + 0.32], [x + 0.3, y, z + 0.32], 0.2, 10, '#ffc83d', { tampa: '#e0a920', lados: (i) => ((i + g) % 3 ? '#ffc83d' : '#1b1530') });
    for (const s of [-1, 1]) caixa3(x + s * 0.36 - 0.04, y - 0.18, z + 0.1, x + s * 0.36 + 0.04, y + 0.18, z + 0.5, '#6b6f86');
    caixa3(x + 0.42, y - 0.16, z + 0.1, x + 0.7, y + 0.16, z + 0.38, '#e2603b', { topo: '#c94f2e' });   // motor
    if (puxando) FX.push({ tipo: 'brilho', p: [x + 0.72, y, z + 0.3], cor: '#4ed37a', r: 1.6 });
    return [x, y, z + 0.52];
  }
  function aFrame() {   // o "A" que levanta o cabo (desvia o puxão para cima)
    const [x, y] = CAVALETE, topo = [x, y, DZ + 2.0];
    for (const s of [-1, 1]) viga([x + s * 0.6, y + 0.02, DZ], topo, 0.06, '#9aa0b5');
    cilindro([x - 0.1, y, DZ + 2.0], [x + 0.1, y, DZ + 2.0], 0.12, 8, '#6b6f86', { tampa: '#c9ced9' });
    return topo;
  }
  function coroa(k, t) {
    if (k <= 0) return;
    const l = ladoT(NMOD * HM);
    caixa3(-l, -l, TOPO, l, l, TOPO + 0.12 * k, '#6b6f86', { topo: '#9aa0b5' });
    if (k >= 1) {
      cilindro([0, -0.18, TOPO + 0.28], [0, 0.18, TOPO + 0.28], 0.16, 10, '#9aa0b5', { tampa: '#c9ced9' });
      if (Math.floor(t * 2) % 2) FX.push({ tipo: 'brilho', p: [0, 0, TOPO + 0.5], cor: '#ff4d4d', r: 1.8 });
    }
  }
  function cabecote(zcab, t, gira) {
    const g = gira ? Math.floor(t * 10) : 0;
    obox([0, 0, zcab], [0.2, 0, 0], [0, 0.2, 0], [0, 0, 0.16], '#3f8efc', { topo: '#8fe6ff' });
    cilindro([0, 0, zcab + 0.16], [0, 0, zcab + 0.34], 0.1, 8, '#4a4466', { tampa: '#6b6f86' });
    cilindro([0, 0, DZ - 0.02], [0, 0, zcab - 0.16], 0.05, 6, '#9aa0b5', { lados: (i) => ((i + g) % 2 ? '#9aa0b5' : '#6b6f86') });
    linha3([0, 0.12, TOPO + 0.2], [0, 0.12, zcab + 0.34], '#1b1530', 1, false);
    linha3([0, -0.12, TOPO + 0.2], [0, -0.12, zcab + 0.34], '#1b1530', 1, false);
    for (const s of [-1, 1]) viga([s * ladoT(zcab - DZ), 0, zcab], [s * 0.2, 0, zcab], 0.03, '#6b6f86');
  }
  function cacamba(k, gelo) {   // caixa de cascalho ao lado do furo (enche enquanto a broca desce)
    const { x0, x1, y0, y1 } = CACAMBA;
    caixa3(x0, y0, DZ, x1, y1, DZ + 0.05, '#4a4466');
    for (const [a, b, c, d] of [[x0, y0, x1, y0 + 0.04], [x0, y1 - 0.04, x1, y1], [x0, y0, x0 + 0.04, y1], [x1 - 0.04, y0, x1, y1]]) caixa3(a, b, DZ, c, d, DZ + 0.3, '#ffc83d', { topo: '#e0a920' });
    if (k > 0) {
      caixa3(x0 + 0.04, y0 + 0.04, DZ + 0.05, x1 - 0.04, y1 - 0.04, DZ + 0.05 + 0.22 * k, '#a24c30', { topo: gelo ? '#dff3ff' : '#b85a37' });
      viga([-0.1, -0.1, DZ + 0.1], [(x0 + x1) / 2 + 0.15, (y0 + y1) / 2 + 0.1, DZ + 0.32], 0.05, '#6b6f86');   // calha do furo à caçamba
    }
  }

  // ---------------------------------------------------------------- água: caldeira, filtros, tanque, canos
  function caldeira(k, ligada, t) {
    if (k <= 0) return;
    const { x0, x1, y0, y1, h } = CALD, hh = h * suave3(clamp(k / 0.7));
    caixa3(x0, y0, DZ, x1, y1, DZ + hh, '#eef0f8', { topo: '#c9ced9' });
    caixa3(x0 - 0.01, y0 + 0.05, DZ + 0.08, x1 + 0.01, y0 + 0.12, DZ + hh * 0.9, '#e2603b');   // faixa
    if (k > 0.7) {
      const kc = clamp((k - 0.7) / 0.3);
      cilindro([x0 + 0.18, y1 - 0.18, DZ + h], [x0 + 0.18, y1 - 0.18, DZ + h + 0.55 * kc], 0.08, 8, '#6b6f86', { tampa: '#2a2140' });
      caixa3(x1 - 0.01, y0 + 0.2, DZ + 0.18, x1 + 0.02, y0 + 0.45, DZ + 0.36, ligada ? '#ff8a3d' : '#2a2140', { emis: ligada });
      if (ligada) FX.push({ tipo: 'brilho', p: [x1 + 0.04, y0 + 0.33, DZ + 0.27], cor: '#ff8a3d', r: 2.2 + Math.sin(t * 9) * 0.4 });
    }
  }
  function filtro(i, k, cor) {
    if (k <= 0) return;
    const [x, y] = FILTROS[i], h = 0.75 * suave3(k);
    cilindro([x, y, DZ], [x, y, DZ + h], 0.17, 10, '#3f8efc', { tampa: '#c9ced9' });
    if (k >= 1 && cor) cilindro([x, y, DZ + 0.3], [x, y, DZ + 0.48], 0.175, 10, cor, { emis: true, tampa: cor });
  }
  function tanque(k, nivel) {
    if (k <= 0) return;
    const [x, y] = TANQ, h = HT * suave3(k);
    caixa3(x - RT - 0.1, y - RT - 0.1, ZT - 0.35, x + RT + 0.1, y + RT + 0.1, ZT, '#6b6f86', { topo: '#9aa0b5' });   // berço de aço
    cilindro([x, y, ZT], [x, y, ZT + h], RT, 12, '#eef0f8', { tampa: '#c9ced9', lados: (i) => (i % 3 === 0 ? '#c9ced9' : '#eef0f8') });
    if (k >= 1) {
      const gx = x - RT - 0.07, gy = y + 0.25;
      cilindro([gx, gy, ZT + 0.03], [gx, gy, ZT + HT], 0.04, 6, '#2a2140');
      if (nivel > 0) cilindro([gx, gy, ZT + 0.03], [gx, gy, ZT + 0.03 + (HT - 0.06) * nivel], 0.045, 6, '#3fd0c9', { emis: true });
      prisma(x + RT * 0.72, y - RT * 0.72, ZT + 0.6, ZT + 0.85, 0.1, 0.01, 6, '#3f8efc', { topo: '#8fe6ff' });
    }
  }
  function canos(rota, k, pulsosT, cor) {   // rota em 3D
    const tot = rota.length - 1;
    for (let i = 0; i < tot; i++) {
      const kk = clamp(k * tot - i);
      if (kk <= 0) break;
      const a = rota[i], b = rota[i + 1];
      viga(a, [lerp(a[0], b[0], kk), lerp(a[1], b[1], kk), lerp(a[2], b[2], kk)], 0.08, '#9aa0b5', { topo: '#c9ced9' });
    }
    if (pulsosT != null && k >= 1) for (let p = 0; p < 3; p++) {
      const q = ((pulsosT * 0.6 + p / 3) % 1) * tot, i = Math.floor(q), f = q - i, a = rota[i], b = rota[i + 1];
      FX.push({ tipo: 'brilho', p: [lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f) + 0.1], cor, r: 2 });
    }
  }
  function canoChao(rota2, k, pulsosT) {   // cano que segue o chão (em pedacinhos), com suportes
    const pts = [];
    for (let i = 0; i < rota2.length - 1; i++) {
      const a = rota2[i], b = rota2[i + 1], n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.4);
      for (let j = 0; j < n; j++) { const x = lerp(a[0], b[0], j / n), y = lerp(a[1], b[1], j / n); pts.push([x, y, chao(x, y) + 0.14]); }
    }
    const l = rota2[rota2.length - 1]; pts.push([l[0], l[1], chao(l[0], l[1]) + 0.14]);
    pts.forEach((p, j) => { if (j / pts.length < k && j % 2 === 0) viga([p[0], p[1], p[2] - 0.14], p, 0.03, '#6b6f86'); });
    canos(pts, k, pulsosT, '#8fe6ff');
  }

  // ---------------------------------------------------------------- estado da obra no tempo tc
  function estado(tc) {
    const s = { radar: null, bandeiras: 0, plano: 0, terra: null, grader: null, tripe: 0,
                trilhos: 0, porticoX: RX0, porticoK: 0, ligado: false, calorX: null, laje: 0, ancoras: 0, temp: 0,
                cols: 0, vigas: 0, chapas: 0, chapaK: 0, inclina: 0, piso: false, escada: 0,
                mods: 0, modK: 0, th: 0, cabo: 0, puxando: false, cavalete: 0, montagem: false, coroa: 0,
                prof: 0, zcab: TOPO - 0.4, gira: false, cascalho: 0, cald: 0, caboCald: 0, quente: false, bolsao: 0,
                filt: [0, 0, 0], caboFilt: 0, agua: 0, amostra: 0, tanq: 0, caboTanq: 0, nivel: 0, caboCol: 0, noite: 0, feixe: 0 };
    const Ee = Object.fromEntries(OB.etapas.map((e) => [e.id, e]));
    const k = (id) => (Ee[id] ? clamp((tc - Ee[id].ini) / (Ee[id].fim - Ee[id].ini)) : 0);
    const depois = (id) => Ee[id] && tc >= Ee[id].fim;
    const durante = (id) => Ee[id] && tc >= Ee[id].ini && tc < Ee[id].fim;
    // radar: 0–0.78 as 3 passadas; 0.78–1 bandeirinhas em volta do gelo
    const kr = k('radar');
    if (durante('radar')) s.radar = { ...radarEm(kr / 0.78), ativo: kr < 0.78 };
    s.bandeiras = depois('radar') ? 4 : Math.floor(clamp((kr - 0.8) / 0.18) * 4.99);
    // aplainar: tripé 0–0.1 (as bandeirinhas saem) · motoniveladora 0.14–1, faixa por faixa
    const kt = k('aplainar');
    if (depois('aplainar')) { s.plano = 1; s.bandeiras = 0; }
    else if (kt > 0) {
      s.tripe = clamp(kt / 0.1);
      s.bandeiras = Math.max(0, 4 - Math.floor(clamp((kt - 0.02) / 0.1) * 4.99));
      s.terra = clamp((kt - 0.14) / 0.84);
      if (kt > 0.14) s.grader = graderEm(s.terra);
    }
    // fundação: trilhos 0–0.18 · pórtico chega 0.18–0.22 · sinteriza 0.22–0.82 · esfria · chumbadores 0.84–0.98
    const kf = k('fundacao');
    if (depois('fundacao')) { s.laje = 1; s.ancoras = PES.length; }
    else if (kf > 0) {
      s.trilhos = clamp(kf / 0.18);
      s.porticoK = clamp((kf - 0.18) / 0.04);
      const kp = clamp((kf - 0.22) / 0.6);
      s.porticoX = lerp(FX0 - 0.45, FX1 + 0.45, kp);
      s.ligado = kf > 0.22 && kf < 0.82;
      s.laje = clamp((s.porticoX - FX0) / (FX1 - FX0));
      s.calorX = s.porticoX + clamp((kf - 0.82) / 0.12) * 2;
      s.temp = s.ligado ? Math.round(lerp(1100, 1160, 0.5 + 0.5 * Math.sin(tc * 3))) : 0;
      s.ancoras = clamp((kf - 0.84) / 0.14) * PES.length;
    }
    // piso de aço: colunas 0–0.3 · vigas 0.3–0.5 · chapas 0.5–0.86 · escada e corrimão 0.87–1
    const kb = k('base');
    if (depois('base')) { s.cols = 1; s.vigas = 1; s.chapas = CHAPAS.length; s.piso = true; s.escada = 1; }
    else if (kb > 0) {
      s.cols = clamp(kb / 0.3); s.vigas = clamp((kb - 0.3) / 0.2);
      const q = clamp((kb - 0.5) / 0.36) * CHAPAS.length; s.chapas = Math.min(CHAPAS.length, Math.floor(q)); s.chapaK = q - Math.floor(q);
      s.piso = kb > 0.86; s.escada = clamp((kb - 0.87) / 0.1);
    }
    // mastro: módulos montados deitados 0–0.5 · cabo preso 0.5–0.56 · ergue 0.56–0.9 · trava e coroa 0.9–1
    const km = k('mastro');
    if (depois('mastro')) { s.mods = NMOD; s.th = Math.PI / 2; s.coroa = 1; }
    else if (km > 0) {
      const q = clamp(km / 0.5) * NMOD; s.mods = Math.min(NMOD, Math.floor(q)); s.modK = q - Math.floor(q);
      s.montagem = true; s.cavalete = clamp(km / 0.05);
      s.cabo = clamp((km - 0.5) / 0.06);
      const sobe = clamp((km - 0.56) / 0.34);
      s.th = (Math.PI / 2) * (sobe < 1 ? suave3(sobe) : 1);
      s.puxando = sobe > 0 && sobe < 1;
      s.coroa = clamp((km - 0.92) / 0.08);
    }
    // perfuração
    const kp = k('perfuracao');
    if (depois('perfuracao')) { s.prof = 2.4; s.zcab = DZ + 0.55; s.cascalho = 1; }
    else if (kp > 0) {
      const q = clamp((kp - 0.06) / 0.86);
      s.prof = 2.4 * q; s.gira = kp > 0.04 && kp < 0.94; s.cascalho = q; s.zcab = lerp(TOPO - 0.4, DZ + 0.55, q);
    }
    // água quente
    const ka = k('aquecimento');
    s.cald = depois('aquecimento') ? 1 : clamp(ka / 0.3);
    s.caboCald = depois('aquecimento') ? 1 : clamp((ka - 0.25) / 0.15);
    s.quente = depois('aquecimento') || ka > 0.42;
    s.bolsao = depois('aquecimento') ? 1 : clamp((ka - 0.45) / 0.5);
    // filtragem
    const kl = k('filtragem');
    s.filt = [0, 1, 2].map((i) => (depois('filtragem') ? 1 : clamp((kl - i * 0.08) / 0.16)));
    s.caboFilt = depois('filtragem') ? 1 : clamp((kl - 0.25) / 0.17);
    s.agua = depois('filtragem') ? 1 : clamp((kl - 0.45) / 0.1);
    s.amostra = depois('filtragem') ? 1 : clamp((kl - 0.6) / 0.35);
    // tanque
    const kq = k('tanque');
    s.tanq = depois('tanque') ? 1 : clamp(kq / 0.3);
    s.caboTanq = depois('tanque') ? 1 : clamp((kq - 0.28) / 0.12);
    s.nivel = depois('tanque') ? 0.92 : clamp((kq - 0.42) / 0.43) * 0.92;
    s.caboCol = depois('tanque') ? 1 : clamp((kq - 0.8) / 0.18);
    if (Ee.voo && tc >= Ee.voo.ini) s.noite = clamp((tc - Ee.voo.ini) / 3) * 0.7;
    return s;
  }

  // ---------------------------------------------------------------- cena
  function montar(t, tc, s) {
    FACES = []; TAGS = []; FX = []; FOCO = { pessoas: [], trator: null };
    S = s;
    chaoG();
    if (s.radar) FOCO.trator = carrinhoRadar(s.radar.x, s.radar.y, s.radar.dir, t, s.radar.ativo);
    for (let i = 0; i < s.bandeiras; i++) bandeirinha([-0.6, 0.6, 0.6, -0.6][i], [-0.6, -0.6, 0.6, 0.6][i]);
    // aplainar
    if (s.grader) { const g = motoniveladora(s.grader, t); FOCO.trator = g.foco; tripe(s.tripe, t, g.rx); }
    else tripe(s.tripe, t, null);
    // fundação
    trilhos(s.trilhos);
    laje(s.laje, s.calorX);
    if (s.porticoK > 0) { const p = portico(s.porticoX, s.porticoK, s.ligado, t); if (p) FOCO.trator = p; }
    PES.forEach(([x, y], i) => chumbador(x, y, clamp(s.ancoras - i)));
    if (s.ancoras > 0 && s.ancoras < PES.length) { const [x, y] = PES[Math.floor(s.ancoras)]; FOCO.trator = [x, y, SZ + 0.3]; }
    // piso de aço
    PES.forEach(([x, y], i) => { const p = coluna(x, y, clamp(s.cols * PES.length - i)); if (p && s.cols < 1 && i === Math.floor(s.cols * PES.length)) FOCO.trator = p; });
    vigasBase(s.vigas);
    for (let i = 0; i < s.chapas; i++) chapa(i, 0);
    if (s.chapas < CHAPAS.length && s.chapaK > 0.3) chapa(s.chapas, 0, 0.5 * (1 - suave3((s.chapaK - 0.3) / 0.6)));   // a chapa da vez descendo
    if (s.piso) { escada(s.escada); guardaCorpo(); }
    // mastro
    if (s.mods > 0 || s.montagem) {
      dobradica(1);
      if (s.th < 0.05) cavaleteApoio(s.cavalete);
      for (let i = 0; i < s.mods; i++) moduloMastro(i, s.th);
      if (s.mods < NMOD && s.modK > 0) moduloMastro(s.mods, s.th, s.modK);
      if (s.montagem) {
        const tambor = guincho(t, s.puxando), a = aFrame();
        if (s.cabo > 0) {
          const ponta = TM(s.th)(0, 0, NMOD * HM - 0.1);
          linha3(tambor, a, '#1b1530', 1, false);
          linha3(a, [lerp(a[0], ponta[0], s.cabo), lerp(a[1], ponta[1], s.cabo), lerp(a[2], ponta[2], s.cabo)], '#1b1530', 1, false);
          FOCO.trator = ponta;
        } else FOCO.trator = TM(0)(0, 0, Math.min(NMOD, s.mods + s.modK) * HM);
      }
    }
    coroa(s.coroa, t);
    if (s.coroa >= 1) {
      cabecote(s.zcab, t, s.gira);
      if (s.gira) { FX.push({ tipo: 'poeira', p: [0.15, 0.1, DZ + 0.05], t, semente: 2 }); FOCO.trator = [0, 0, s.zcab]; }
    }
    if (s.prof > 0) { SOBRE = true; prisma(0, 0, DZ + 0.002, DZ + 0.006, 0.13, 0.13, 10, '#1b1530'); SOBRE = false; cacamba(s.cascalho, s.prof > 2); }
    // água
    caldeira(s.cald, s.quente, t);
    canos(ROTA_CALD, s.caboCald, s.quente ? t : null, '#ff8a3d');
    for (let i = 0; i < 3; i++) filtro(i, s.filt[i], s.agua > 0 ? ['#b5683f', '#d9a77a', '#8fe6ff'][i] : null);
    canos(ROTA_FILT, s.caboFilt, s.agua > 0 ? t + 0.2 : null, '#d9a77a');
    canos(ROTA_ENTRE, s.caboFilt, s.agua > 0 ? t + 0.5 : null, '#8fe6ff');
    tanque(s.tanq, s.nivel);
    canos(ROTA_TANQ, s.caboTanq, s.nivel > 0 ? t + 0.1 : null, '#8fe6ff');
    if (s.caboCol > 0) canoChao(ROTA_COL, s.caboCol, s.caboCol >= 1 ? t + 0.3 : null);
    if (s.noite > 0.2) for (const [x, y] of [[SX0, SY1], [SX1, SY1], [SX1, SY0]]) FX.push({ tipo: 'brilho', p: [x, y, DZ + 0.5], cor: '#ffe58a', r: 2.4 });
    pessoas(t, s);
    return {};
  }

  // ---------------------------------------------------------------- colonos (nomes de verdade) em cada etapa
  const lerpAng = (a, b, k) => { const d = ((((b - a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI; return a + d * clamp(k); };
  const velDe = (q) => clamp((6 * q * (1 - q)) / 1.5 * 1.3, 0, 1);
  const FASES = { radar: [0.78], aplainar: [0.14], fundacao: [0.2, 0.84], base: [0.3, 0.5, 0.88], mastro: [0.5, 0.92], aquecimento: [0.42], filtragem: [0.3, 0.6], tanque: [0.4, 0.85] };
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
    if (id === 'abertura') {   // de pé no chão torto, olhando o terreno das bandeirinhas
      no(-1.6 + i * 0.8, -3.0 + (i % 2) * 0.4, ['tablet', 'parar', 'sinalizar', 'parar', 'tablet'][i % 5], Math.PI / 2);
    } else if (id === 'radar') {
      if (k < 0.78 && i < 2) {
        const R = radarEm(kEm(t) / 0.78), atras = i === 0 ? -0.62 : -0.3, lado = i === 0 ? 0 : 0.6, ux = Math.cos(R.dir), uy = Math.sin(R.dir);
        no(R.x + ux * atras - uy * lado, R.y + uy * atras + ux * lado, i === 0 ? 'carregar' : 'andar', R.dir);
        r.mov = { passo: R.passo, v: R.w < 0.06 || R.w > 0.94 ? 0.3 : 0.8 };
      } else if (k >= 0.78) {
        const p = [[-0.6, -0.6], [0.6, -0.6], [0.6, 0.6], [-0.6, 0.6], [0, -1.7]][i];
        no(p[0] * 1.5, p[1] * 1.5, i === 4 ? 'tablet' : 'martelar', Math.atan2(-p[1], -p[0]));
      } else no([-3.4, 3.3, -3.0][i - 2], [-2.6, -2.4, 2.6][i - 2], ['tablet', 'parar', 'sinalizar'][i - 2]);
    } else if (id === 'aplainar') {
      if (k < 0.14) {   // um monta o tripé do laser, um confere no tablet, três arrancam as bandeirinhas
        if (i === 0) no(LASER[0] + 0.45, LASER[1] - 0.3, 'chave', Math.atan2(0.3, -0.45));
        else if (i === 1) no(LASER[0] - 0.35, LASER[1] - 0.55, 'tablet', 1.0);
        else { const p = [[-0.6, -0.6], [0.6, -0.6], [0.6, 0.6]][i - 2]; no(p[0], p[1] - 0.35, 'agachar', Math.PI / 2); }
      } else {   // longe da faixa da máquina: um no laser, um sinaliza, três assistem
        if (i === 0) no(LASER[0] + 0.4, LASER[1] - 0.4, 'tablet', -0.8);
        else if (i === 1) no(-5.0, -3.9, 'sinalizar', 0.7);
        else { const p = [[-1.6, -5.0], [0.2, -5.15], [2.0, -5.0]][i - 2]; no(p[0], p[1], i === 3 ? 'tablet' : 'parar', Math.PI / 2); }
      }
    } else if (id === 'fundacao') {
      if (k < 0.2) {   // assentam os trilhos, martelando os dormentes
        if (i < 4) { const yr = RAIL_Y[i % 2], x = i < 2 ? -1.2 : 1.4; no(x, yr + (yr < 0 ? -0.4 : 0.4), 'martelar', yr < 0 ? Math.PI / 2 : -Math.PI / 2); }
        else no(RX0 - 0.6, 0, 'tablet', 0);
      } else if (k < 0.84) {   // um acompanha o pórtico de tablet; os outros longe do calor
        if (i === 0) { no(s.porticoX, RAIL_Y[0] - 0.75, 'tablet', Math.PI / 2); r.mov = { passo: s.porticoX, v: s.ligado ? 0.5 : 0 }; }
        else { const lug = [[RX0 - 0.8, -0.9, 'parar', 0], [RX0 - 0.8, 0.7, 'agachar', 0], [-1.0, RAIL_Y[1] + 0.9, 'tablet', -Math.PI / 2], [1.6, RAIL_Y[1] + 0.9, 'parar', -Math.PI / 2]][i - 1]; no(lug[0], lug[1], lug[2], lug[3]); }
      } else {   // parafusam os chumbadores na laje
        const [x, y] = PES[i === 4 && s.ancoras > 5 ? 5 : i], fora = y < 0 ? -0.4 : 0.4;
        no(x, y + fora, 'chave', y < 0 ? Math.PI / 2 : -Math.PI / 2);
      }
    } else if (id === 'base') {
      if (k < 0.3) {   // montam as colunas nos chumbadores
        const [x, y] = PES[i === 4 && s.cols * PES.length > 5 ? 5 : i], fora = y < 0 ? -0.42 : 0.42;
        no(x, y + fora, 'chave', y < 0 ? Math.PI / 2 : -Math.PI / 2);
      } else if (k < 0.5) {   // soldam as vigas em volta
        const p = [[-1.0, SY0 - 0.4], [1.0, SY0 - 0.4], [-1.0, SY1 + 0.4], [1.0, SY1 + 0.4], [SX1 + 0.35, 0]][i];
        no(p[0], p[1], 'soldar', i === 4 ? Math.PI : p[1] < 0 ? Math.PI / 2 : -Math.PI / 2);
      } else if (k < 0.88) {   // duplas carregam as chapas para cima da base; um confere
        if (i < 4) caminho([-2.6 + (i % 2) * 0.3, -2.4], [CHAPAS[Math.min(CHAPAS.length - 1, s.chapas)][0] + 0.5, SY0 - 0.35], 0.7, 'carregar', 0.8);
        else no(SX1 + 0.6, SY0 - 0.4, 'tablet', 2.4);
      } else no(-1.4 + i * 0.7, 0.2 + (i % 2) * 0.5, i === 2 ? 'tablet' : 'festa', -Math.PI / 2);   // em cima do piso pronto
    } else if (id === 'mastro') {
      if (k < 0.5) {   // montando o mastro deitado: dois parafusam, dois trazem o módulo, um confere
        const hAtual = (Math.min(NMOD, s.mods + 0.5)) * HM, y = -L0 - hAtual;
        if (i < 2) no(i ? 0.85 : -0.85, Math.max(SY0 - 2.8, y), 'chave', i ? Math.PI : 0);
        else if (i < 4) caminho([1.9, -2.0 + (i - 2) * 0.3], [i === 2 ? 0.75 : -0.75, Math.max(SY0 - 2.8, y + 0.4)], 0.6, 'carregar', 0.9);
        else no(1.6, -1.0, 'tablet', Math.PI);
      } else if (k < 0.92) {   // um opera o guincho, os outros se afastam e sinalizam
        if (i === 0) no(GUINCHO[0] + 0.9, GUINCHO[1] - 0.3, 'chave', Math.PI);
        else if (i === 1) no(-1.4, 0.8, 'sinalizar', -1.2);
        else no(-1.6 + (i - 2) * 1.6, 0.25, i === 3 ? 'tablet' : 'parar', -Math.PI / 2);
      } else {   // pinos travados na dobradiça
        if (i < 2) no(i ? L0 + 0.35 : -L0 - 0.35, -L0 - 0.2, 'martelar', i ? Math.PI : 0);
        else no(-1.4 + (i - 2) * 1.0, 0.6, 'festa', -Math.PI / 2);
      }
    } else if (id === 'perfuracao') {
      const lug = [[0.75, -0.6, 'chave', Math.PI * 0.8], [-1.3, 0.2, 'tablet', -0.2], [-0.9, -0.55, 'parar', -Math.PI / 2], [0.6, 0.6, 'agachar', -Math.PI * 0.75], [1.6, -1.0, 'tablet', Math.PI * 0.85]][i];
      no(lug[0], lug[1], lug[2], lug[3]);
      if (i === 2 && s.cascalho > 0.2 && Math.floor(t * 0.5) % 2) r.a = 'agachar';   // espia a caçamba
    } else if (id === 'aquecimento') {
      const lug = k < 0.42
        ? [[CALD.x0 - 0.0, CALD.y0 - 0.35, Math.PI / 2, 'martelar'], [CALD.x1 + 0.3, 0.6, Math.PI, 'soldar'], [-0.6, 0.4, Math.PI / 2, 'agachar'], [-1.45, -0.2, Math.PI / 2, 'chave'], [-1.6, -1.0, 0.6, 'tablet']][i]
        : [[CALD.x1 + 0.35, 0.3, Math.PI, 'tablet'], [-0.4, 0.3, Math.PI / 4, 'chave'], [-0.9, -0.5, 0.6, 'parar'], [0.6, -0.7, 2.4, 'parar'], [-1.7, -0.6, 0.6, 'tablet']][i];
      no(lug[0], lug[1], lug[3], lug[2]);
    } else if (id === 'filtragem') {
      if (k < 0.3) { const f = FILTROS[i % 3]; no(f[0] + (i > 2 ? 0.3 : 0), f[1] - 0.45, i === 4 ? 'tablet' : 'chave', Math.PI / 2); }
      else if (k < 0.6) { const lug = [[0.75, 0.3, 'chave'], [1.25, 0.3, 'chave'], [0.3, -0.5, 'tablet'], [1.7, 0.4, 'parar'], [-0.8, -0.5, 'parar']][i]; no(lug[0], lug[1], lug[2], Math.PI / 2); }
      else if (i === 0) no(FILTROS[2][0] + 0.4, FILTROS[2][1] - 0.35, 'agachar', 2.4);
      else if (i === 1) no(FILTROS[2][0] + 0.3, FILTROS[2][1] - 0.75, 'tablet', 2.0);
      else no(0.2 + i * 0.35, -0.6, kEm(t) > 0.92 ? 'festa' : 'parar', Math.PI / 2);
    } else if (id === 'tanque') {
      if (k < 0.4) { const ang = 2.0 + i * (Math.PI * 2 / 5); no(TANQ[0] + Math.cos(ang) * (RT + 0.45), TANQ[1] + Math.sin(ang) * (RT + 0.45), i % 2 ? 'soldar' : 'martelar', ang + Math.PI); }
      else if (k < 0.85) { const lug = [[1.6, -0.2, 'chave', 0], [2.6, 0.6, 'tablet', -1.2], [1.2, -0.9, 'parar', 0], [2.4, -1.5, 'tablet', 0.9], [1.1, 0.3, 'parar', 0]][i]; no(lug[0], lug[1], lug[2], lug[3]); }
      else no(0.4 + (i % 3) * 0.6, -0.7 - Math.floor(i / 3) * 0.5, 'festa', Math.PI / 2);
    } else {   // voo e convite: em cima da base, comemorando
      no(-1.2 + (i % 3) * 0.8, -0.8 - Math.floor(i / 3) * 0.5, 'festa', -Math.PI / 2);
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
      else if (idx > 0) antes = alvo(OB.etapas[idx - 1].id, 0.9999, i, tIni, s);
      if (antes) {
        const d = Math.hypot(r.x - antes.x, r.y - antes.y), dur = clamp(d / 0.8, 0.8, 3.4), q = (t - tIni) / dur;
        if (d > 0.12 && q < 1) {
          const e2 = suave3(q), dir = Math.atan2(r.y - antes.y, r.x - antes.x);
          const olhar = q < 0.15 ? lerpAng(antes.o, dir, q / 0.15) : q > 0.85 ? lerpAng(dir, r.o, (q - 0.85) / 0.15) : dir;
          r = { ...r, x: lerp(antes.x, r.x, e2), y: lerp(antes.y, r.y, e2), a: r.a === 'carregar' ? 'carregar' : 'andar', o: olhar, mov: { passo: d * e2, v: velDe(q) } };
        }
      }
      if (r.a === 'soldar' && !(r.mov && r.mov.v > 0.05) && Math.floor(t * 4 + i) % 5) {
        const hx = r.x + Math.cos(r.o) * 0.42, hy = r.y + Math.sin(r.o) * 0.42;
        FX.push({ tipo: 'faisca', p: [hx, hy, zc(hx, hy) + 0.78], t, semente: i + 11 });
        FX.push({ tipo: 'brilho', p: [hx, hy, zc(hx, hy) + 0.8], cor: '#e8f6ff', r: 2.5 });
      }
      ULTIMA_CAIXA = null;
      const cabeca = pessoa(r.x, r.y, zc(r.x, r.y), cor, r.o, r.a, t, sem, r.mov);
      if (r.a === 'carregar' && ULTIMA_CAIXA) {
        if (e.id === 'base') obox(soma(ULTIMA_CAIXA, [0, 0, 0.05]), [0.32, 0, 0], [0, 0.24, 0], [0, 0, 0.015], '#a3a8bd', { topo: '#9aa0b5' });   // chapa do piso
        if (e.id === 'mastro') viga(soma(ULTIMA_CAIXA, [-0.3, 0, 0.05]), soma(ULTIMA_CAIXA, [0.3, 0, 0.05]), 0.06, '#e2603b');               // barra do mastro
      }
      TAGS.push({ p: cabeca, nome: c.nome, cor });
      FOCO.pessoas[i] = soma(cabeca, [0, 0, -0.6]);
    });
  }

  // ---------------------------------------------------------------- câmera e HUD
  const PLANOS_G = {
    abertura: { tz: DZ + 1.2, zoom: 24, pitch: 0.42 },
    radar: { tz: 1.3, zoom: 25, pitch: 0.55 },
    aplainar: { tz: 0.9, zoom: 23, pitch: 0.52 },
    fundacao: { tz: SZ + 0.35, zoom: 27, pitch: 0.55 },
    base: { tz: DZ - 0.1, zoom: 30, pitch: 0.4 },
    mastro: { ty: -1.6, tz: DZ + 0.4, zoom: 27, pitch: 0.42, yaw: 1.5 },
    perfuracao: { tz: DZ + 1.4, zoom: 23, pitch: 0.38 },
    aquecimento: { tx: -0.8, ty: 0.4, tz: DZ + 0.4, zoom: 31, pitch: 0.46 },
    filtragem: { tx: 0.9, ty: 0.8, tz: DZ + 0.4, zoom: 34, pitch: 0.46 },
    tanque: { tx: 2.0, ty: -0.2, tz: DZ + 0.1, zoom: 26, pitch: 0.42 },
    voo: { tz: DZ + 1.2, zoom: 23, pitch: 0.38 },
    convite: { tz: DZ + 1.1, zoom: 23, pitch: 0.42 },
  };
  const CLOSES_G = {
    radar: { alvo: 'trator', zoom: 62, de: 0.3, ate: 0.5, pitch: 0.34 },
    aplainar: { alvo: 'trator', zoom: 58, de: 0.36, ate: 0.54, pitch: 0.28 },   // a lâmina cortando
    fundacao: { alvo: 'trator', zoom: 58, de: 0.46, ate: 0.62, pitch: 0.26 },   // o vidro brilhando atrás do pórtico
    base: { alvo: 'trator', zoom: 58, de: 0.08, ate: 0.24, pitch: 0.24 },
    mastro: { alvo: 'trator', zoom: 44, de: 0.66, ate: 0.84, pitch: 0.2 },
    perfuracao: { alvo: 'trator', zoom: 60, de: 0.2, ate: 0.4, pitch: 0.3 },
    filtragem: { alvo: 0, zoom: 84, de: 0.66, ate: 0.86, pitch: 0.32 },
    tanque: { alvo: 1, zoom: 70, de: 0.55, ate: 0.75, pitch: 0.32 },
  };
  function planoDeG(id, s, k) {
    const p = { tx: 0, ty: 0, ...(PLANOS_G[id] || PLANOS_G.voo) };
    if (id === 'radar' && s.radar) { p.tx = s.radar.x * 0.5; p.ty = s.radar.y * 0.5; }
    if (id === 'aplainar' && s.grader) { p.tx = s.grader.x * 0.45; p.ty = s.grader.y * 0.45; }
    if (id === 'fundacao' && s.porticoK > 0) p.tx = s.porticoX * 0.4;
    if (id === 'mastro') { const w = suave3(clamp((k - 0.56) / 0.34)); p.ty = lerp(-1.9, 0, w); p.tz = lerp(DZ + 0.4, DZ + 1.9, w); p.zoom = lerp(27, 20, w); }
    return p;
  }

  // painel de corte do solo (à direita): radargrama, broca descendo e bolsão de água
  const PX0 = W - 400, PY0 = 470, PW = 350, PH = 620, MPX = 150;
  const camadaCor = (m) => (m < 0.3 ? '#c4643c' : m < 1.2 ? '#a24c30' : m < 2.0 ? '#8f4129' : '#9fd8e8');
  function painelCorte(titulo, alfa, desenho) {
    if (alfa <= 0) return;
    ctx.save(); ctx.globalAlpha = alfa;
    caixa(PX0 - 12, PY0 - 70, PW + 24, PH + 90, 0.92, COR.agua);
    texto(titulo, PX0 + PW / 2, PY0 - 36, 22, '#ffffff', { contorno: false });
    const y0 = PY0 + 20;
    for (let py = 0; py < PH - 30; py += 6) { ctx.fillStyle = camadaCor(py / MPX); ctx.fillRect(PX0, y0 + py, PW, 6); }
    for (let i = 0; i < 60; i++) {
      const m = hash(i, 1, 8) * 3.8, x = PX0 + hash(i, 2, 8) * (PW - 8);
      ctx.fillStyle = m >= 2 ? '#e8f8ff' : m > 1.2 ? (i % 2 ? '#dff3ff' : '#6e3020') : '#7a3520';
      ctx.fillRect(Math.round(x), Math.round(y0 + m * MPX), 6, 6);
    }
    ctx.fillStyle = '#1b1530'; ctx.fillRect(PX0, y0 - 4, PW, 4);
    for (let m = 0; m <= 3; m++) {
      const yy = y0 + m * MPX;
      ctx.fillStyle = '#ffffff'; ctx.fillRect(PX0, yy, 14, 3);
      texto(`${m} m`, PX0 + 22, yy + 2, 16, '#ffffff', { alinhar: 'left', contorno: true });
    }
    desenho(y0);
    ctx.restore();
  }
  function sobreCena(t, s) {
    const { e, k } = etapaEm(t), entra = (a, b) => clamp((k - a) / 0.06) * (1 - clamp((k - b) / 0.06));
    if (e.id === 'radar') painelCorte('RADAR DE SOLO', entra(0.05, 0.95), (y0) => {
      const q = clamp(k / 0.78), colunas = 44, cw = PW / colunas;
      ctx.save(); ctx.globalAlpha *= 0.55; ctx.fillStyle = '#140f26'; ctx.fillRect(PX0 + q * PW, y0, PW * (1 - q), PH - 30); ctx.restore();
      for (let c = 0; c < colunas * q; c++) {
        const xm = (c / colunas) * 2 - 1, temGelo = Math.abs(xm) < 0.62, yy = y0 + (2.0 + xm * xm * 0.25) * MPX;
        ctx.fillStyle = temGelo ? '#bff8ff' : '#e8b48c';
        ctx.fillRect(PX0 + c * cw, Math.round(yy), Math.ceil(cw), temGelo ? 8 : 3);
      }
      ctx.fillStyle = '#3fd0c9'; ctx.fillRect(Math.round(PX0 + q * PW) - 2, y0, 4, PH - 30);
      if (k > 0.45 && Math.floor(t * 3) % 3) texto('GELO A 2 m!', PX0 + PW / 2, y0 + 2.0 * MPX - 40, 26, '#bff8ff');
    });
    if (e.id === 'perfuracao') painelCorte('CORTE DO SOLO', entra(0.02, 0.97), (y0) => {
      const prof = s.prof, cx = PX0 + PW / 2, fundo = y0 + prof * MPX;
      ctx.fillStyle = '#1b1530'; ctx.fillRect(cx - 14, y0, 28, Math.max(0, fundo - y0));
      ctx.fillStyle = '#9aa0b5'; ctx.fillRect(cx - 5, y0 - 20, 10, Math.max(0, fundo - y0 + 6));
      const g = Math.floor(t * 12) % 2;
      ctx.fillStyle = '#6b6f86'; ctx.beginPath(); ctx.moveTo(cx - 16, fundo - 16); ctx.lineTo(cx + 16, fundo - 16); ctx.lineTo(cx, fundo + 10); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffc83d'; ctx.fillRect(cx - 16 + g * 8, fundo - 14, 8, 6); ctx.fillRect(cx + g * 8, fundo - 8, 6, 6);
      if (s.gira) for (let i = 0; i < 10; i++) {
        const q = (t * 2.4 + i / 10) % 1, a = hash(i, Math.floor(t * 2.4 + i / 10), 3) * Math.PI;
        ctx.fillStyle = prof > 2 && i % 2 ? '#e8f8ff' : '#7a3520';
        ctx.fillRect(Math.round(cx + Math.cos(a) * 40 * q * (i % 2 ? 1 : -1)), Math.round(fundo - Math.sin(a) * 30 * q), 6, 6);
      }
      texto(`${prof.toFixed(1).replace('.', ',')} m`, cx, PY0 + PH - 40, 30, prof >= 2 ? '#bff8ff' : '#ffffff');
      if (prof >= 2 && Math.floor(t * 3) % 3) texto('GELO!', cx, fundo + 50, 44, '#bff8ff');
    });
    if (e.id === 'aquecimento' && k > 0.38) painelCorte('POÇO DE ÁGUA', entra(0.4, 0.97), (y0) => {
      const cx = PX0 + PW / 2, fundo = y0 + 2.4 * MPX, b = s.bolsao;
      if (b > 0) {
        const rx = 30 + b * 120, ry = 20 + b * 70;
        ctx.fillStyle = '#3f8efc'; ctx.beginPath(); ctx.ellipse(cx, fundo + ry * 0.2, rx, ry, 0, 0, 7); ctx.fill();
        ctx.fillStyle = '#8fe6ff';
        for (let i = 0; i < 6; i++) ctx.fillRect(Math.round(cx - rx * 0.7 + i * rx * 0.28), Math.round(fundo + Math.sin(t * 3 + i) * 6), 10, 4);
      }
      ctx.fillStyle = '#1b1530'; ctx.fillRect(cx - 14, y0, 28, fundo - y0);
      ctx.fillStyle = '#ff8a3d'; ctx.fillRect(cx - 10, y0, 6, fundo - y0);
      ctx.fillStyle = '#8fe6ff'; ctx.fillRect(cx + 4, y0, 6, fundo - y0);
      for (let i = 0; i < 4; i++) {
        const q = (t * 0.8 + i / 4) % 1;
        ctx.fillStyle = '#ffe0c0'; ctx.fillRect(cx - 12, Math.round(lerp(y0, fundo, q)), 10, 10);
        ctx.fillStyle = '#ffffff'; ctx.fillRect(cx + 2, Math.round(lerp(fundo, y0, q)), 10, 10);
      }
      texto('QUENTE', cx - 90, y0 + 40, 18, '#ffb07a', { contorno: true });
      texto('ÁGUA', cx + 80, y0 + 40, 18, '#bff8ff', { contorno: true });
      texto(`${Math.round(b * 800)} L`, cx, PY0 + PH - 40, 30, '#8fe6ff');
    });
    if (s.quente && s.cald >= 1) {   // vapor da chaminé da caldeira
      const p = proj([CALD.x0 + 0.18, CALD.y1 - 0.18, DZ + CALD.h + 0.6]);
      for (let i = 0; i < 7; i++) {
        const q = (t * 0.5 + i / 7) % 1;
        ctx.globalAlpha = 0.5 * (1 - q); ctx.fillStyle = '#f3eefe';
        ctx.beginPath(); ctx.arc(p.x * RE + Math.sin(t + i) * 14 + q * 40, p.y * RE - q * 160, 10 + q * 34, 0, 7); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  function hudExtra(t, e, k) {
    const s = estado(t), y = 400;
    if (e.id === 'aplainar' && k > 0.16) {   // o laser mede quanto falta cortar
      const cm = Math.round(60 * (1 - s.terra)), ok = cm === 0;
      caixa(240, y, W - 480, 120, 0.9, ok ? COR.ok : COR.ouro);
      texto(`DESNÍVEL ${cm} cm`, W / 2, y + 40, 32, '#ffffff', { contorno: false });
      ret(300, y + 78, W - 600, 20, COR.borda);
      ret(300, y + 78, (W - 600) * (1 - s.terra), 20, '#ff4d4d');
    }
    if (e.id === 'fundacao' && k > 0.22 && k < 0.97) {
      const ok = k >= 0.82;
      caixa(240, y, W - 480, 120, 0.9, ok ? COR.ok : '#e2603b');
      texto(ok ? 'LAJE PRONTA' : 'SINTERIZANDO', W / 2, y + 38, 30, '#ffffff', { contorno: false });
      texto(ok ? 'POEIRA VIROU VIDRO' : `${s.temp.toLocaleString('pt-BR')} °C`, W / 2, y + 84, ok ? 26 : 34, ok ? '#e8fff0' : '#ffe0a0', { contorno: false });
    }
    if (e.id === 'filtragem' && s.amostra > 0) {
      caixa(140, y, W - 280, 230, 0.9, s.amostra >= 1 ? COR.ok : COR.agua);
      texto('AMOSTRA DE ÁGUA', W / 2, y + 45, 32, '#ffffff', { contorno: false });
      [['POEIRA', 0.25], ['PERCLORATO', 0.55], ['POTÁVEL', 0.85]].forEach(([n, q], j) => {
        const ok = s.amostra >= q;
        texto(n, 200, y + 100 + j * 42, 24, '#ffffff', { alinhar: 'left', contorno: false });
        texto(ok ? (j < 2 ? '0%' : 'SIM') : '...', W - 200, y + 100 + j * 42, 24, ok ? COR.ok : COR.areia, { alinhar: 'right', contorno: false });
      });
    }
    if ((e.id === 'tanque' && k > 0.42) || e.id === 'voo') {
      const litros = Math.round((s.nivel / 0.92) * 5000);
      caixa(140, y, W - 280, 150, 0.9, '#3fd0c9');
      texto(`TANQUE ${litros.toLocaleString('pt-BR')} L`, W / 2, y + 55, 38, '#ffffff', { contorno: false });
      ret(190, y + 95, W - 380, 22, COR.borda);
      ret(190, y + 95, (W - 380) * (s.nivel / 0.92), 22, '#3fd0c9');
    }
    if (e.id === 'tanque' && k > 0.82 && Math.floor(t * 3) % 4 !== 0) texto('ÁGUA NA COLÔNIA!', W / 2, y + 215, 50, '#8fe6ff');
    if (e.id === 'mastro' && k > 0.56 && k < 0.9 && Math.floor(t * 3) % 4 !== 0) texto('ERGUENDO O MASTRO!', W / 2, y + 40, 44, COR.ouro);
  }

  OBRAS.gelo = {
    estado, montar, planoDe: planoDeG, closes: CLOSES_G,
    pesos: { radar: 0.07, aplainar: 0.1, fundacao: 0.12, base: 0.1, mastro: 0.19, perfuracao: 0.17, aquecimento: 0.1, filtragem: 0.08, tanque: 0.07 },
    abertura: [['UM EXTRATOR', 64], ['DE GELO', 84], ['EM MARTE?', 70]],
    hudExtra, sobreCena,
  };
})();
