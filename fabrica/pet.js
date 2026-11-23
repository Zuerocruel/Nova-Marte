// Pet do Colono: desenho e animação. UMA fonte só para o vídeo (render.html carrega antes do diretor.js) e
// para o site (lib/pet-arte.ts importa este arquivo). Mudou aqui, muda nos dois.
//
// O pet é desenhado em pixel art (16x13 + contorno), de lado e olhando para a direita, em várias POSES,
// cada uma com seus quadros de animação:
//   parado   — abana o rabo, pisca, às vezes ofega com a língua de fora
//   andando  — 4 quadros de patas (pares diagonais), cabeça balança
//   correndo — galope em 2 quadros, orelhas para trás, língua de fora, poeirinha nas patas
//   sentado  — sentado abanando o rabo no chão
//   pulando  — patas encolhidas, orelhas para cima
//   comendo  — cabeça na tigela, mastigando
//   xixi     — pata de trás levantada
//   coco     — agachado, rabo em pé, cara de esforço
//   dormindo — enroladinho, respirando, com "z" subindo
//   coçando  — sentado, coçando a orelha com a pata de trás
// A pelagem vem do dono (seed): caramelo, preto e branco, cinza ou malhado. Coleira azul com plaquinha dourada.
(function (raiz) {
  const CONTORNO = '#1b1530';
  const PELAGENS = [
    { C: '#f2b46a', c: '#9a5418', w: '#fff0d8', m: '#c97f35', nome: 'caramelo' },
    { C: '#55506e', c: '#2e2a45', w: '#f3eefe', m: '#f3eefe', nome: 'preto e branco' },
    { C: '#b4bccf', c: '#6b7390', w: '#f3f5fb', m: '#8a93ad', nome: 'cinza' },
    { C: '#f3eefe', c: '#7a6a8a', w: '#ffffff', m: '#4a3f5e', nome: 'malhado' },
  ];
  const COLEIRA = '#3fd0c9', PLACA = '#ffc83d', LINGUA = '#ff8fa3', OLHO = '#1b1530', NARIZ = '#1b1530';
  const QUADROS = { parado: 4, andando: 4, correndo: 2, sentado: 4, pulando: 1, comendo: 2, xixi: 2, coco: 2, dormindo: 2, cocando: 2 };
  const FPS = { parado: 5, andando: 8, correndo: 10, sentado: 4, pulando: 1, comendo: 4, xixi: 2, coco: 2, dormindo: 0.7, cocando: 9 };
  const cache = new Map();

  const pelagemDe = (seed) => PELAGENS[Math.abs(Math.floor(seed || 0)) % PELAGENS.length];

  // ---------------------------------------------------------------- partes do corpo (grade 16x13, chão na linha 12)
  function pintar(x, pose, q, pisca, pel) {
    const P = (px, py, w, h, cor) => { x.fillStyle = cor; x.fillRect(px + 1, py + 1, w, h); };
    const { C, c, w, m } = pel;
    const olho = (ox, oy) => P(ox, oy, 1, 1, pisca ? c : OLHO);
    const rabo = (pts) => pts.forEach(([px, py], i) => P(px, py, 1, 1, i === pts.length - 1 ? w : C));
    // pernas: [x, comprimento, cor]; pé (último pixel) mais claro = "meia"
    const perna = (px, topo, alt, cor) => { if (alt <= 0) return; P(px, topo, 1, alt - 1, cor); P(px, topo + alt - 1, 1, 1, w); };

    if (pose === 'dormindo') {   // enroladinho; q = respiração
      const sobe = q ? 0 : 1;
      P(4, 7 + sobe, 7, 1, C); P(3, 8 + sobe, 9, 3 - sobe, C); P(4, 11, 8, 1, C);
      P(5, 8 + sobe, 3, 1, m);                                  // mancha nas costas
      P(5, 12, 7, 1, C); P(11, 12, 1, 1, w);                     // rabo em volta, ponta clara
      P(10, 8 + sobe, 4, 4 - sobe, C); P(13, 10, 2, 2, w);       // cabeça deitada no rabo
      P(10, 8 + sobe, 2, 2, c);                                  // orelha caída
      P(12, 10, 1, 1, c);                                        // olho fechado
      P(15, 10, 1, 1, NARIZ);
      P(9, 10 + (sobe ? 0 : 0), 1, 2, COLEIRA);
      return;
    }

    let corpoY = 5, cabX = 10, cabY = 2, orelha = 'caida', lingua = false, boca = false;
    let pernas = [[4, 10, 3, c], [6, 10, 3, C], [9, 10, 3, c], [11, 10, 3, C]];   // trás longe, trás perto, frente longe, frente perto
    let caudaPts = [[3, 5], [2, 4], [2, 3]];
    const WAG = [[[3, 5], [2, 4], [2, 3]], [[3, 5], [3, 4], [3, 3]], [[3, 5], [2, 4], [1, 4]], [[3, 6], [2, 5], [1, 5]]];

    if (pose === 'parado') { caudaPts = WAG[q % 4]; lingua = boca = q >= 2; }
    if (pose === 'andando') {
      const a = [1, 0, -1, 0][q], b = [-1, 0, 1, 0][q], la = q === 1 ? 2 : 3, lb = q === 3 ? 2 : 3;
      pernas = [[4 + b, 10, lb, c], [6 + a, 10, la, C], [9 + a, 10, la, c], [11 + b, 10, lb, C]];
      caudaPts = WAG[(q * 2) % 4];
      cabY = q % 2 ? 2 : 3;
    }
    if (pose === 'correndo') {
      orelha = 'tras'; lingua = boca = true; caudaPts = [[3, 6], [2, 6], [1, 5]];
      if (q === 0) { corpoY = 5; pernas = [[3, 10, 2, c], [4, 10, 3, C], [12, 10, 2, c], [13, 10, 3, C]]; }
      else { corpoY = 4; cabY = 1; pernas = [[6, 9, 2, c], [7, 9, 2, C], [8, 9, 2, c], [9, 9, 2, C]]; }
    }
    if (pose === 'pulando') {
      orelha = 'cima'; boca = true; corpoY = 4; cabY = 1; caudaPts = [[3, 4], [2, 3], [2, 2]];
      pernas = [[3, 9, 2, c], [4, 9, 2, C], [12, 9, 2, c], [13, 9, 2, C]];
    }
    if (pose === 'xixi') {
      caudaPts = [[3, 5], [2, 4], [2, 3]];
      pernas = [[4, 10, 3, c], [9, 10, 3, c], [11, 10, 3, C]];
      P(5, 8, 1, 1, C); P(4, 7, 1, 1, C); P(3, 7, 1, 1, w);      // pata levantada
      if (q) P(3, 10, 1, 2, '#f2d14b');                          // jatinho
    }
    if (pose === 'comendo') {
      cabX = 11; cabY = 5 + (q ? 1 : 0); orelha = 'frente';
      caudaPts = WAG[q ? 0 : 2];
    }

    if (pose === 'sentado' || pose === 'cocando' || pose === 'coco') {
      // corpo inclinado: peito em pé na frente, quadril sentado atrás
      const coco = pose === 'coco';
      P(6, 5, 5, 5, C); P(4, 8, 4, 3, C); P(5, 6, 2, 2, m);
      P(9, 7, 2, 3, w);                                          // peito claro
      P(9, 10, 1, 2, c); P(10, 10, 1, 2, C); P(9, 12, 1, 1, w); P(10, 12, 1, 1, w);   // patas da frente retas
      if (pose === 'cocando') {                                  // pata de trás coçando a orelha
        P(7, 5 + (q ? 0 : 1), 1, 3, C); P(8, 4 + (q ? 0 : 1), 1, 1, w);
        P(4, 11, 3, 1, c); P(3, 12, 3, 1, w);
      } else { P(4, 11, 3, 1, C); P(3, 12, 4, 1, w); }          // pata de trás deitada no chão
      if (coco) { P(3, 5, 1, 3, C); P(3, 4, 1, 1, w); }          // rabo em pé
      else { const sobe = q % 2; P(1, 11 - sobe, 3, 1, C); P(0, 11 - sobe * 2, 1, 1, w); }   // rabo varrendo o chão
      // cabeça
      const hx = 9, hy = pose === 'cocando' ? 2 : 1;
      P(hx, hy, 5, 4, C); P(hx + 2, hy + 3, 3, 1, w); P(hx + 4, hy + 2, 2, 2, w); P(hx + 5, hy + 2, 1, 1, NARIZ);
      if (coco) { P(hx + 2, hy + 1, 2, 1, OLHO); } else olho(hx + 3, hy + 1);   // cara de esforço = olho apertado
      if (pose === 'cocando') { P(hx + 1, hy - 1, 2, 1, c); P(hx + 2, hy - 2, 1, 1, c); }   // orelha levantada pela pata
      else { P(hx, hy + 1, 2, 3, c); P(hx + 1, hy, 1, 1, c); }
      if (pose === 'sentado' && q >= 2) { P(hx + 4, hy + 4, 1, 1, LINGUA); }
      P(hx, hy + 4, 2, 1, COLEIRA); P(hx + 1, hy + 5, 1, 1, PLACA);
      return;
    }

    // ---- de pé (parado, andando, correndo, pulando, comendo, xixi)
    rabo(caudaPts);
    for (const [px, py, alt, cor] of pernas) if (cor === c) perna(px, py, alt, cor);   // pernas do lado de lá
    P(4, corpoY, 8, 5, C);                                       // corpo
    P(5, corpoY + 4, 6, 1, w);                                   // barriga clara
    P(6, corpoY, 3, 2, m);                                       // mancha nas costas
    for (const [px, py, alt, cor] of pernas) if (cor === C) perna(px, py, alt, cor);   // pernas do lado de cá
    // cabeça
    P(cabX, cabY, 5, 4, C);
    P(cabX + 2, cabY + 3, 3, 1, w);                              // queixo
    P(cabX + 4, cabY + 2, 2, 2, w);                              // focinho
    P(cabX + 5, cabY + 2, 1, 1, NARIZ);
    olho(cabX + 3, cabY + 1);
    if (boca) P(cabX + 4, cabY + 3, 1, 1, OLHO);
    if (lingua) P(cabX + 4, cabY + 4, 1, 1, LINGUA);
    if (orelha === 'caida') { P(cabX, cabY + 1, 2, 3, c); P(cabX + 1, cabY, 1, 1, c); }
    if (orelha === 'tras') { P(cabX - 1, cabY + 1, 2, 2, c); }
    if (orelha === 'cima') { P(cabX + 1, cabY - 1, 1, 2, c); P(cabX + 2, cabY - 2, 1, 2, c); }
    if (orelha === 'frente') { P(cabX + 1, cabY + 1, 2, 3, c); }
    P(cabX, corpoY + (pose === 'comendo' ? 0 : 1), 2, 2, COLEIRA);   // coleira e plaquinha
    P(cabX + 1, corpoY + (pose === 'comendo' ? 2 : 3), 1, 1, PLACA);
  }

  /** Sprite (com contorno) da pose/quadro. 18x15 px. */
  function sprite(pose, q, pisca, pel) {
    const k = `${pose}:${q}:${pisca ? 1 : 0}:${pel.nome}`;
    let s = cache.get(k);
    if (s) return s;
    const base = document.createElement('canvas'); base.width = 18; base.height = 15;
    pintar(base.getContext('2d'), pose, q, pisca, pel);
    s = document.createElement('canvas'); s.width = 18; s.height = 15;
    const x = s.getContext('2d');
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) x.drawImage(base, dx, dy);
    x.globalCompositeOperation = 'source-in'; x.fillStyle = CONTORNO; x.fillRect(0, 0, 18, 15);
    x.globalCompositeOperation = 'source-over'; x.drawImage(base, 0, 0);
    cache.set(k, s);
    return s;
  }

  const h01 = (a, b) => { const v = Math.sin(a * 91.7 + b * 47.3) * 43758.5453; return v - Math.floor(v); };

  /**
   * Desenha o pet com os PÉS em (x, y), em pixels do mundo (1 casa = 16).
   * o = { pose, dir (1 = direita, -1 = esquerda), t (segundos), seed (do dono: pelagem e ritmo), pulo (px), escala }
   */
  function desenhar(ctx, x, y, o) {
    const pose = QUADROS[o.pose] ? o.pose : 'parado';
    const t = o.t || 0, seed = o.seed || 0, E = o.escala || 0.72, pel = pelagemDe(seed);
    const q = Math.floor(t * FPS[pose] + seed * 0.37) % QUADROS[pose];
    const pisca = pose !== 'dormindo' && ((t + seed * 1.3) % 3.4) < 0.14;
    const pulo = o.pulo || 0;
    // sombra (encolhe no ar)
    ctx.globalAlpha = 0.28; ctx.fillStyle = '#000';
    const sw = Math.max(3, 9 - pulo * 1.2) * E / 0.72;
    ctx.fillRect(Math.round(x - sw / 2), Math.round(y - 0.6), Math.round(sw), 1);
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.translate(x, y - pulo);
    if (o.dir < 0) ctx.scale(-1, 1);
    ctx.drawImage(sprite(pose, q, pisca, pel), -9 * E, -14 * E, 18 * E, 15 * E);
    ctx.restore();
    // efeitos em volta
    if (pose === 'correndo') for (let i = 0; i < 2; i++) {   // poeirinha atrás das patas
      const k = (t * 3 + i * 0.5 + seed) % 1;
      ctx.globalAlpha = 0.6 * (1 - k); ctx.fillStyle = '#e8b48c';
      ctx.fillRect(Math.round(x - o.dir * (5 + k * 4)), Math.round(y - 1 - k * 2), 1 + (k < 0.5 ? 1 : 0), 1);
    }
    if (pose === 'dormindo') for (let i = 0; i < 2; i++) {   // "z" subindo
      const k = (t * 0.45 + i * 0.5) % 1;
      ctx.globalAlpha = Math.min(1, (1 - k) * 1.6); ctx.fillStyle = '#f3eefe';
      const zx = Math.round(x + o.dir * (3 + k * 4)), zy = Math.round(y - 9 - k * 8), s = k > 0.5 ? 2 : 1;
      ctx.fillRect(zx, zy, 2 * s, 1); ctx.fillRect(zx + s, zy + 1, 1, s - 1 || 1); ctx.fillRect(zx, zy + 1 + s, 2 * s, 1);
    }
    if (pose === 'comendo' && Math.floor(t * 4) % 2) { ctx.fillStyle = '#a0613f'; ctx.fillRect(Math.round(x + o.dir * 7), Math.round(y - 3), 1, 1); }   // farelo
    ctx.globalAlpha = 1;
  }

  /** Bolinha de brinquedo (x, y no chão; alt = altura do quique). */
  function desenharBola(ctx, x, y, alt) {
    ctx.globalAlpha = 0.25; ctx.fillStyle = '#000'; ctx.fillRect(Math.round(x - 1), Math.round(y - 0.5), 3, 1); ctx.globalAlpha = 1;
    const by = Math.round(y - 2 - (alt || 0));
    ctx.fillStyle = CONTORNO; ctx.fillRect(Math.round(x - 1), by - 1, 3, 4); ctx.fillRect(Math.round(x - 2), by, 5, 2);
    ctx.fillStyle = '#d7f25a'; ctx.fillRect(Math.round(x - 1), by, 3, 2);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(x), by, 1, 1);
  }

  /**
   * Rotina do pet no VÍDEO (sem relógio de parede): brinca de bolinha, corre, senta, coça a orelha, cochila.
   * Retorna { x, y, dir, pose, pulo, bola: {x, y, alt} | null }. (cx, cy) = canto da casa do dono, em casas.
   */
  function rotinaVideo(cx, cy, t, seed) {
    const CASA = 16, x0 = cx * CASA + 3, x1 = cx * CASA + 14, y0 = cy * CASA + 16, y1 = cy * CASA + 19;
    const ponto = (j, s) => ({ x: x0 + h01(seed + j, s) * (x1 - x0), y: y0 + h01(seed - j, s + 3) * (y1 - y0) });
    const SEG = 3.2, tt = t + h01(seed, 9) * 20, j = Math.floor(tt / SEG), f = (tt - j * SEG) / SEG;
    const tipo = ['bola', 'bola', 'passeio', 'senta', 'bola', 'coca', 'passeio', 'senta', 'bola', 'pula'][Math.floor(h01(seed, j) * 10)];
    const de = ponto(j - 1, 1), para = ponto(j, 1);
    const suave = (k) => { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k); };
    const dirDe = (a, b, d0) => (Math.abs(b.x - a.x) < 0.5 ? d0 : b.x < a.x ? -1 : 1);
    if (tipo === 'bola') {   // a bolinha sai quicando na frente e o pet vai atrás; depois volta com ela na boca
      const kb = suave(f / 0.35), kp = suave((f - 0.1) / 0.55);
      const pos = { x: de.x + (para.x - de.x) * kp, y: de.y + (para.y - de.y) * kp };
      const dir = dirDe(de, para, 1);
      const pega = f > 0.65;
      const bola = pega ? { x: pos.x + dir * 6, y: pos.y - 1, alt: 2 }
        : { x: de.x + (para.x - de.x) * kb + dir * 2, y: de.y + (para.y - de.y) * kb, alt: Math.abs(Math.sin(f * 18)) * 4 * (1 - kb) };
      return { ...pos, dir, pose: kp > 0 && kp < 1 ? 'correndo' : 'parado', pulo: 0, bola };
    }
    if (tipo === 'passeio') {
      const k = suave(f / 0.8), pos = { x: de.x + (para.x - de.x) * k, y: de.y + (para.y - de.y) * k };
      return { ...pos, dir: dirDe(de, para, 1), pose: k < 1 ? 'andando' : 'parado', pulo: 0, bola: null };
    }
    if (tipo === 'pula') return { ...de, dir: h01(seed, j + 5) < 0.5 ? 1 : -1, pose: 'pulando', pulo: Math.abs(Math.sin(f * Math.PI * 3)) * 4, bola: null };
    return { ...de, dir: h01(seed, j + 5) < 0.5 ? 1 : -1, pose: tipo === 'coca' ? 'cocando' : 'sentado', pulo: 0, bola: null };
  }

  raiz.PetArte = { desenhar, desenharBola, rotinaVideo, pelagemDe, PELAGENS };
})(typeof window !== 'undefined' ? window : globalThis);
