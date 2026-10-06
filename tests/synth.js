/* ===========================================================
 * synth.js — สร้าง "ภาพถ่ายจำลอง" ที่รู้ขนาดจริงทุกเม็ด (ground truth)
 * ใช้ทดสอบความแม่นยำของ analyzer.js โดยเลียนแบบสภาพภาพจริงจากหน้างาน:
 *   กระดาษขาว + เม็ดดำ, เงานุ่ม, เลนส์เบลอ, noise, แสงไม่สม่ำเสมอ,
 *   และวัตถุอ้างอิงที่ค้างในเฟรม (บัตร/เวอร์เนียร์/ลายมือ)
 * =========================================================== */

const Synth = (() => {

  function rng(seed) {                       // mulberry32 — ผลซ้ำได้ทุกครั้ง
    let a = seed >>> 0;
    return () => {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  const BG = {
    white: [216, 213, 207],
    gray:  [150, 150, 148],
    dark:  [22, 22, 24],
  };

  function pelletPath(ctx, Lp, Dp, shape) {
    ctx.beginPath();
    if (shape === 'ellipse') { ctx.ellipse(0, 0, Lp / 2, Dp / 2, 0, 0, Math.PI * 2); return; }
    const r = shape === 'capsule' ? Dp / 2 : shape === 'round' ? Dp * 0.22 : Dp * 0.05;
    ctx.roundRect(-Lp / 2, -Dp / 2, Lp, Dp, r);
  }

  /** บัตร 85.60 × 53.98 มม. มีลายพิมพ์/ตัวเลข (ตัวก่อ false detection ในภาพจริง) */
  function drawCard(ctx, k, cx, cy, ang, light, rnd) {
    const W = 85.6 / k, H = 53.98 / k;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang);
    ctx.fillStyle = light ? 'rgb(236,225,188)' : 'rgb(28,92,96)';
    ctx.beginPath(); ctx.roundRect(-W / 2, -H / 2, W, H, 3.2 / k); ctx.fill();
    const ink = light ? 'rgb(30,28,30)' : 'rgb(196,214,214)';
    if (light) {                                   // แถบแม่เหล็ก + ช่องลายเซ็น
      ctx.fillStyle = 'rgb(176,176,174)'; ctx.fillRect(-W / 2, -H / 2 + 5 / k, W, 11 / k);
      ctx.fillStyle = 'rgb(226,228,236)'; ctx.fillRect(-W / 2 + 4 / k, -H / 2 + 20 / k, 56 / k, 9 / k);
    } else {                                       // ชิป + โลโก้
      ctx.fillStyle = 'rgb(214,170,84)'; ctx.fillRect(-W / 2 + 16 / k, 6 / k, 9 / k, 8 / k);
      ctx.fillStyle = 'rgb(200,60,50)'; ctx.beginPath(); ctx.arc(W / 2 - 24 / k, 14 / k, 6.5 / k, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgb(226,150,60)'; ctx.beginPath(); ctx.arc(W / 2 - 15 / k, 14 / k, 6.5 / k, 0, 7); ctx.fill();
    }
    ctx.fillStyle = ink; ctx.textBaseline = 'middle';
    ctx.font = `bold ${4.2 / k}px sans-serif`;
    ctx.fillText('4821 7730 0196 5524', -W / 2 + 5 / k, 8 / k);
    ctx.font = `bold ${2.6 / k}px sans-serif`;
    ctx.fillText('VALID 08/29   SAMPLE BANK', -W / 2 + 5 / k, 15 / k);
    ctx.font = `${1.9 / k}px sans-serif`;
    ctx.fillText('For test purposes only - not a real card - call 0000', -W / 2 + 4 / k, -H / 2 + 2.6 / k);
    for (let i = 0; i < 14; i++) {                 // จุด/ขีดลายพิมพ์เล็กๆ
      ctx.fillRect(-W / 2 + (6 + rnd() * 72) / k, (17 + rnd() * 7) / k, (1 + rnd() * 3) / k, (0.8 + rnd() * 1.4) / k);
    }
    ctx.restore();
    return { cx, cy, ang, W, H };
  }

  /** เวอร์เนียร์/ไม้บรรทัดเหล็ก: แถบสีเหล็ก + ขีดสเกล + ตัวเลข */
  function drawCaliper(ctx, k, x, y, lenMm, rnd) {
    const W = lenMm / k, H = 16 / k;
    const g = ctx.createLinearGradient(0, y, 0, y + H);
    g.addColorStop(0, 'rgb(186,188,190)'); g.addColorStop(0.5, 'rgb(158,160,163)'); g.addColorStop(1, 'rgb(176,178,180)');
    ctx.fillStyle = g; ctx.fillRect(x, y, W, H);
    ctx.fillStyle = 'rgb(28,28,30)';
    for (let mm = 2; mm < lenMm - 2; mm++) {
      const h = mm % 10 === 0 ? 6 : mm % 5 === 0 ? 4.5 : 3;
      ctx.fillRect(x + mm / k - 0.12 / k, y + H - h / k, 0.24 / k, h / k);
    }
    ctx.font = `bold ${3.4 / k}px sans-serif`; ctx.textBaseline = 'alphabetic';
    for (let mm = 10; mm < lenMm - 6; mm += 10) ctx.fillText(String(mm), x + mm / k - 2 / k, y + H - 7.2 / k);
    return { x, y, W, H };
  }

  /** ลายมือปากกา (ตัวเลขเขียน) */
  function drawInk(ctx, k, x, y) {
    ctx.save(); ctx.strokeStyle = 'rgb(40,52,150)'; ctx.lineWidth = 0.55 / k; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.font = `${9 / k}px cursive`; ctx.strokeText('60 → 80', x, y);
    ctx.restore();
  }

  /**
   * @param o {W,H,mmpp,bg,pelletRGB,shape,L,D,Lsd,Dsd,n,shadow:{dx,dy,blur,alpha},blur,noise,vignette,objects,seed}
   * @returns {canvas, truth:[{x,y,L,D,ang}], mmpp, card?}
   */
  function scene(o = {}) {
    const W = o.W || 3200, H = o.H || 2400;
    const k = o.mmpp || 0.0625;                    // มม. ต่อพิกเซลต้นฉบับ
    const rnd = rng(o.seed || 1);
    const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const bgName = o.bg || 'white';
    const bg = BG[bgName];
    const pel = o.pelletRGB || (bgName === 'dark' ? [176, 140, 86] : [40, 36, 34]);
    const shape = o.shape || 'round';
    const n = o.n ?? 60;
    const sh = o.shadow === undefined ? { dx: 0.16, dy: 0.2, blur: 0.16, alpha: 0.34 } : o.shadow;

    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    x.fillStyle = `rgb(${bg})`; x.fillRect(0, 0, W, H);

    // ---- วัตถุอ้างอิงที่ค้างในเฟรม ----
    const blocked = [];                            // [x0,y0,x1,y1] บริเวณห้ามวางเม็ด
    const out = { mmpp: k };
    const objs = o.objects || [];
    if (objs.includes('card-dark') || objs.includes('card-light')) {
      const ang = (o.cardAngle ?? 9) * Math.PI / 180;
      const cw = 85.6 / k, ch = 53.98 / k;
      const R = Math.hypot(cw, ch) / 2 + 20;       // รัศมีครอบบัตรทุกมุมหมุน → บัตรอยู่ในเฟรมเสมอ
      const cx = R + 30, cy = H - R - 30;
      out.card = drawCard(x, k, cx, cy, ang, objs.includes('card-light'), rnd);
      blocked.push([cx - R, cy - R, cx + R, cy + R]);
    }
    if (objs.includes('coin')) {                   // เหรียญเงิน Ø20 มม. + เงา
      const r = 10 / k, cx = W - r - 90, cy = H - r - 90;
      x.save(); x.filter = `blur(${0.5 / k}px)`; x.fillStyle = 'rgba(0,0,0,.4)';
      x.beginPath(); x.arc(cx + 0.5 / k, cy + 0.7 / k, r, 0, 7); x.fill(); x.restore(); x.filter = 'none';
      const g = x.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
      g.addColorStop(0, 'rgb(206,206,204)'); g.addColorStop(0.85, 'rgb(158,159,162)'); g.addColorStop(1, 'rgb(128,129,133)');
      x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill();
      x.fillStyle = 'rgb(120,121,126)'; x.font = `bold ${7 / k}px sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText('1', cx, cy); x.textAlign = 'start';
      out.coin = { cx, cy, r };
      blocked.push([cx - r - 40, cy - r - 40, cx + r + 40, cy + r + 40]);
    }
    if (objs.includes('caliper')) {
      const len = Math.min(150, W * k - 20);
      const cal = drawCaliper(x, k, W - len / k - 60, 60, len, rnd);
      blocked.push([cal.x - 30, cal.y - 30, cal.x + cal.W + 30, cal.y + cal.H + 30]);
    }
    if (objs.includes('ink')) {
      drawInk(x, k, W * 0.06, H * 0.12);
      blocked.push([W * 0.04, H * 0.04, W * 0.04 + 46 / k, H * 0.16]);
    }

    // ---- วางเม็ดแบบไม่ติดกัน ----
    const truth = [];
    const Lmax = (o.L || 3.5) + 3 * (o.Lsd || 0);
    const margin = (Lmax / k) * 0.75 + 30;
    let guard = 0;
    while (truth.length < n && guard++ < n * 400) {
      const D = Math.max(0.3, (o.D || 1.8) + (o.Dsd ? gauss() * o.Dsd : 0));
      const frag = o.frag && rnd() < o.frag;       // เศษเม็ดหักสั้น (ยาวน้อยกว่า Ø)
      const L = frag ? D * 0.62 : Math.max(0.6, (o.L || 3.5) + (o.Lsd ? gauss() * o.Lsd : 0));
      const px = margin + rnd() * (W - 2 * margin), py = margin + rnd() * (H - 2 * margin);
      const reach = (Math.hypot(L, D) / k) / 2;
      if (blocked.some(b => px > b[0] - reach && px < b[2] + reach && py > b[1] - reach && py < b[3] + reach)) continue;
      const gap = (o.gap ?? 1.1) / k;              // ช่องว่างขั้นต่ำระหว่างเม็ด (มม.)
      if (truth.some(t => Math.hypot(t.x - px, t.y - py) < reach + (Math.hypot(t.L, t.D) / k) / 2 + gap)) continue;
      truth.push({ x: px, y: py, L, D, ang: rnd() * Math.PI });
    }

    // เม็ดที่ถูกขอบภาพตัด / คู่เม็ดที่ติดกัน (ไม่อยู่ใน truth — ถ้าถูกวัด = นับผิด)
    const all = truth.slice();
    guard = 0;
    for (let made = 0; made < (o.pairs || 0) && guard++ < 4000;) {
      const L = o.L || 3.5, D = o.D || 1.8, Lp = L / k, Dp = D / k;
      const px = margin * 1.6 + rnd() * (W - 3.2 * margin), py = margin * 1.6 + rnd() * (H - 3.2 * margin);
      const R = Lp * 1.25;
      if (blocked.some(b => px > b[0] - R && px < b[2] + R && py > b[1] - R && py < b[3] + R)) continue;
      if (all.some(t => Math.hypot(t.x - px, t.y - py) < R + (Math.hypot(t.L, t.D) / k) / 2 + 20)) continue;
      const ang = rnd() * Math.PI, ca = Math.cos(ang), sa = Math.sin(ang), kind = made % 3;
      const second = kind === 0 ? { x: px - sa * Dp * 0.97, y: py + ca * Dp * 0.97, ang }                      // ข้างชิดข้าง
        : kind === 1 ? { x: px + ca * Lp * 0.97, y: py + sa * Lp * 0.97, ang }                                // หัวต่อหัว
        : { x: px + ca * (Lp / 2 + Dp / 2) * 0.97, y: py + sa * (Lp / 2 + Dp / 2) * 0.97, ang: ang + Math.PI / 2 };  // รูปตัว T
      all.push({ x: px, y: py, L, D, ang }, { ...second, L, D });
      made++;
    }
    for (let e = 0; e < (o.edge || 0); e++) {
      const side = e % 4, along = 0.15 + 0.7 * rnd();
      all.push({ x: side === 0 ? 0 : side === 1 ? W : along * W, y: side === 2 ? 0 : side === 3 ? H : along * H, L: o.L || 3.5, D: o.D || 1.8, ang: rnd() * Math.PI });
    }

    // ---- เงา (วาดก่อนเม็ด) ----
    if (sh && sh.alpha > 0) {
      for (const t of all) {
        const Dp = t.D / k, Lp = t.L / k;
        x.save();
        x.filter = `blur(${Math.max(0.5, sh.blur * Dp)}px)`;
        x.translate(t.x + sh.dx * Dp, t.y + sh.dy * Dp); x.rotate(t.ang);
        x.fillStyle = `rgba(0,0,0,${sh.alpha})`;
        pelletPath(x, Lp, Dp, shape); x.fill();
        x.restore();
      }
      x.filter = 'none';
    }

    // ---- เม็ด (ไล่เฉดแบบทรงกระบอก: ไฮไลต์ด้านบน ขอบเข้มกว่า) ----
    for (const t of all) {
      const Dp = t.D / k, Lp = t.L / k;
      x.save(); x.translate(t.x, t.y); x.rotate(t.ang);
      const g = x.createLinearGradient(0, -Dp / 2, 0, Dp / 2);
      const hi = o.highlight ?? 0.22;
      const col = f => `rgb(${pel.map(v => Math.max(0, Math.min(255, Math.round(v * f + (f > 1 ? 255 * (f - 1) * 0.35 : 0))))).join(',')})`;
      g.addColorStop(0, col(0.86)); g.addColorStop(0.34, col(1 + hi)); g.addColorStop(0.62, col(1)); g.addColorStop(1, col(0.8));
      x.fillStyle = g;
      pelletPath(x, Lp, Dp, shape); x.fill();
      x.restore();
    }

    // ---- รอยพับกระดาษ (แถบเงานุ่ม) / เงาใหญ่ของมือ-มือถือ ----
    if (o.creases) {
      x.save(); x.globalCompositeOperation = 'multiply';
      for (let c2 = 0; c2 < o.creases; c2++) {
        const y0 = (0.1 + 0.8 * rnd()) * H, hh = 70 + rnd() * 90;
        const g = x.createLinearGradient(0, y0, 0, y0 + hh);
        g.addColorStop(0, 'rgb(255,255,255)'); g.addColorStop(0.45, 'rgb(222,222,222)'); g.addColorStop(0.55, 'rgb(246,246,246)'); g.addColorStop(1, 'rgb(255,255,255)');
        x.fillStyle = g; x.fillRect(0, y0, W, hh);
      }
      x.restore();
    }
    if (o.cast) {
      x.save(); x.globalCompositeOperation = 'multiply';
      x.filter = `blur(${o.cast.blur ?? 140}px)`;
      const a = Math.round(255 * (1 - o.cast.alpha));
      x.fillStyle = `rgb(${a},${a},${a})`;
      x.beginPath(); x.ellipse(o.cast.x * W, o.cast.y * H, o.cast.r * W, o.cast.r * H, 0, 0, Math.PI * 2); x.fill();
      x.restore(); x.filter = 'none';
    }

    // ---- แสงไม่สม่ำเสมอ (vignette + สีเพี้ยนไล่ระดับ) ----
    const vg = o.vignette ?? 0.16;
    if (vg > 0) {
      x.save(); x.globalCompositeOperation = 'multiply';
      const rg = x.createRadialGradient(W * 0.58, H * 0.42, Math.min(W, H) * 0.15, W * 0.5, H * 0.5, Math.hypot(W, H) * 0.62);
      const e = Math.round(255 * (1 - vg));
      rg.addColorStop(0, 'rgb(255,255,255)'); rg.addColorStop(1, `rgb(${e},${e},${e})`);
      x.fillStyle = rg; x.fillRect(0, 0, W, H);
      const lg = x.createLinearGradient(0, H, W, 0);
      lg.addColorStop(0, 'rgb(244,247,255)'); lg.addColorStop(1, 'rgb(255,247,242)');
      x.fillStyle = lg; x.fillRect(0, 0, W, H);
      x.restore();
    }

    // ---- เลนส์เบลอ ----
    let final = c;
    const blur = o.blur ?? 1.2;
    if (blur > 0) {
      final = document.createElement('canvas'); final.width = W; final.height = H;
      const fx = final.getContext('2d');
      fx.filter = `blur(${blur}px)`;
      fx.drawImage(c, 0, 0);
      fx.filter = 'none';
    }

    // ---- noise ของเซนเซอร์ ----
    const ns = o.noise ?? 2.5;
    if (ns > 0) {
      const fx = final.getContext('2d');
      const tab = new Float32Array(4096);
      for (let i = 0; i < tab.length; i++) tab[i] = gauss() * ns;
      let s = (o.seed || 1) * 2654435761 >>> 0;
      const STRIP = 256;
      for (let y0 = 0; y0 < H; y0 += STRIP) {
        const hh = Math.min(STRIP, H - y0);
        const id = fx.getImageData(0, y0, W, hh), d = id.data;
        for (let p = 0; p < d.length; p += 4) {
          s = s * 1664525 + 1013904223 >>> 0;
          const nz = tab[s >>> 20];
          s = s * 1664525 + 1013904223 >>> 0;
          const cz = tab[s >>> 20] * 0.35;
          d[p] += nz + cz; d[p + 1] += nz; d[p + 2] += nz - cz;   // Uint8ClampedArray ตัดค่าเอง
        }
        fx.putImageData(id, 0, y0);
      }
    }

    out.canvas = final; out.truth = truth; out.W = W; out.H = H;
    return out;
  }

  return { scene, rng };
})();
