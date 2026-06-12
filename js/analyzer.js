/* ===========================================================
 * analyzer.js — ตรวจจับและวัดขนาดเม็ดอาหารจากภาพถ่าย (pure JS)
 * ขั้นตอน: grayscale → Otsu threshold → morphological open
 *          → connected components → PCA วัดยาว/เส้นผ่าศูนย์กลาง
 * =========================================================== */

const Analyzer = (() => {

  const PROC_MAX = 1600; // ย่อภาพให้ด้านยาวสุดไม่เกินนี้ก่อนประมวลผล

  /** วาดภาพลง canvas ขนาดประมวลผล แล้วคืน {canvas, scale} (scale = orig/proc) */
  function toProcCanvas(img) {
    const ow = img.naturalWidth || img.width;
    const oh = img.naturalHeight || img.height;
    const s = Math.min(1, PROC_MAX / Math.max(ow, oh));
    const w = Math.round(ow * s), h = Math.round(oh * s);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    return { canvas: c, scale: ow / w };
  }

  function otsu(hist, total) {
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sumB = 0, wB = 0, maxVar = 0, thr = 127;
    for (let t = 0; t < 256; t++) {
      wB += hist[t];
      if (wB === 0) continue;
      const wF = total - wB;
      if (wF === 0) break;
      sumB += t * hist[t];
      const mB = sumB / wB, mF = (sum - sumB) / wF;
      const v = wB * wF * (mB - mF) * (mB - mF);
      if (v > maxVar) { maxVar = v; thr = t; }
    }
    return thr;
  }

  function erodeDilate(src, w, h, mode) {
    const dst = new Uint8Array(w * h);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const a = src[i - w - 1] + src[i - w] + src[i - w + 1] +
                  src[i - 1]     + src[i]     + src[i + 1] +
                  src[i + w - 1] + src[i + w] + src[i + w + 1];
        dst[i] = mode === 'erode' ? (a === 9 ? 1 : 0) : (a > 0 ? 1 : 0);
      }
    }
    return dst;
  }

  /** RGB (0-255) → CIELAB (D65) */
  function rgb2lab(r, g, b) {
    let [rr, gg, bb] = [r, g, b].map(v => {
      v /= 255;
      return v > 0.04045 ? Math.pow((v + 0.055) / 1.055, 2.4) : v / 12.92;
    });
    let x = (rr * 0.4124 + gg * 0.3576 + bb * 0.1805) / 0.95047;
    let y = (rr * 0.2126 + gg * 0.7152 + bb * 0.0722);
    let z = (rr * 0.0193 + gg * 0.1192 + bb * 0.9505) / 1.08883;
    const f = v => v > 0.008856 ? Math.cbrt(v) : (7.787 * v + 16 / 116);
    [x, y, z] = [f(x), f(y), f(z)];
    return { l: 116 * y - 16, a: 500 * (x - y), b: 200 * (y - z) };
  }

  function deltaE(lab1, lab2) {
    return Math.sqrt((lab1.l - lab2.l) ** 2 + (lab1.a - lab2.a) ** 2 + (lab1.b - lab2.b) ** 2);
  }

  /**
   * วิเคราะห์ภาพ
   * @param img        HTMLImageElement
   * @param mmPerPx    มม./พิกเซล (อ้างอิงพิกเซลของภาพต้นฉบับ)
   * @param opts       {polarity:'auto'|'dark'|'light', minLenMm, maxLenMm}
   * @returns {pellets, rejected, annotated(canvas), procScale}
   */
  function analyze(img, mmPerPx, opts = {}) {
    const { canvas, scale } = toProcCanvas(img);
    const w = canvas.width, h = canvas.height;
    const ctx = canvas.getContext('2d');
    const data = ctx.getImageData(0, 0, w, h).data;
    const mmpp = mmPerPx * scale; // มม. ต่อพิกเซลของภาพที่ย่อแล้ว

    // ---- grayscale + histogram ----
    const gray = new Uint8Array(w * h);
    const hist = new Uint32Array(256);
    for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
      const g = (data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114) | 0;
      gray[i] = g; hist[g]++;
    }
    const thr = otsu(hist, w * h);

    // ---- เลือกขั้ว: เม็ด = ฝั่งที่มีพิกเซลน้อยกว่า (auto) ----
    let bright = 0;
    for (let t = thr + 1; t < 256; t++) bright += hist[t];
    let fgBright;
    if (opts.polarity === 'dark') fgBright = true;        // พื้นเข้ม → เม็ดสว่าง
    else if (opts.polarity === 'light') fgBright = false; // พื้นสว่าง → เม็ดเข้ม
    else fgBright = bright < (w * h - bright);

    let mask = new Uint8Array(w * h);
    for (let i = 0; i < mask.length; i++) {
      mask[i] = (gray[i] > thr) === fgBright ? 1 : 0;
    }

    // ---- morphological open (ลด noise) ----
    mask = erodeDilate(erodeDilate(mask, w, h, 'erode'), w, h, 'dilate');

    // ---- connected components (flood fill) ----
    const minLenMm = opts.minLenMm ?? 2;
    const maxLenMm = opts.maxLenMm ?? 50;
    const minAreaPx = Math.max(20, (minLenMm * minLenMm * 0.4) / (mmpp * mmpp));
    const labels = new Int32Array(w * h); // 0 = ยังไม่ติดป้าย
    const stack = new Int32Array(w * h);
    const pellets = [], rejectedBoxes = [];
    let nextLabel = 0, rejectedCount = 0;

    for (let start = 0; start < mask.length; start++) {
      if (!mask[start] || labels[start]) continue;
      nextLabel++;
      let sp = 0;
      stack[sp++] = start;
      labels[start] = nextLabel;
      const px = []; // เก็บ index พิกเซลของก้อนนี้
      while (sp > 0) {
        const i = stack[--sp];
        px.push(i);
        const x = i % w, y = (i / w) | 0;
        // 4-connectivity
        if (x > 0     && mask[i - 1] && !labels[i - 1]) { labels[i - 1] = nextLabel; stack[sp++] = i - 1; }
        if (x < w - 1 && mask[i + 1] && !labels[i + 1]) { labels[i + 1] = nextLabel; stack[sp++] = i + 1; }
        if (y > 0     && mask[i - w] && !labels[i - w]) { labels[i - w] = nextLabel; stack[sp++] = i - w; }
        if (y < h - 1 && mask[i + w] && !labels[i + w]) { labels[i + w] = nextLabel; stack[sp++] = i + w; }
      }
      if (px.length < minAreaPx) continue;

      // ---- PCA หาแกนหลัก ----
      let sx = 0, sy = 0;
      let touchBorder = false;
      for (const i of px) {
        const x = i % w, y = (i / w) | 0;
        sx += x; sy += y;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touchBorder = true;
      }
      const n = px.length, mx = sx / n, my = sy / n;
      let cxx = 0, cyy = 0, cxy = 0;
      for (const i of px) {
        const dx = (i % w) - mx, dy = ((i / w) | 0) - my;
        cxx += dx * dx; cyy += dy * dy; cxy += dx * dy;
      }
      cxx /= n; cyy /= n; cxy /= n;
      const theta = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
      const cosT = Math.cos(theta), sinT = Math.sin(theta);

      // ---- ฉายพิกเซลบนแกนหลัก/แกนรอง + สีเฉลี่ย ----
      let uMin = 1e9, uMax = -1e9, vMin = 1e9, vMax = -1e9;
      let cr = 0, cg = 0, cb = 0;
      for (const i of px) {
        const dx = (i % w) - mx, dy = ((i / w) | 0) - my;
        const u = dx * cosT + dy * sinT;
        const v = -dx * sinT + dy * cosT;
        if (u < uMin) uMin = u; if (u > uMax) uMax = u;
        if (v < vMin) vMin = v; if (v > vMax) vMax = v;
        const p = i * 4;
        cr += data[p]; cg += data[p + 1]; cb += data[p + 2];
      }
      let lenMm = (uMax - uMin + 1) * mmpp;
      let diaMm = (vMax - vMin + 1) * mmpp;
      if (lenMm < diaMm) { const t = lenMm; lenMm = diaMm; diaMm = t; }

      const box = {
        mx, my, cosT, sinT, uMin, uMax, vMin, vMax,
        lenMm, diaMm,
        color: { r: Math.round(cr / n), g: Math.round(cg / n), b: Math.round(cb / n) },
      };

      // กรองก้อนที่เล็ก/ใหญ่ผิดปกติ หรือชนขอบภาพ (อาจวัดไม่ครบ)
      if (lenMm < minLenMm) continue;
      if (lenMm > maxLenMm || touchBorder) { rejectedCount++; rejectedBoxes.push(box); continue; }

      pellets.push(box);
    }

    // ---- วาดผลลงภาพ ----
    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    const octx = out.getContext('2d');
    octx.drawImage(canvas, 0, 0);
    const drawBox = (b, stroke) => {
      octx.save();
      octx.translate(b.mx, b.my);
      octx.rotate(Math.atan2(b.sinT, b.cosT));
      octx.strokeStyle = stroke;
      octx.lineWidth = Math.max(1.5, w / 800);
      octx.strokeRect(b.uMin, b.vMin, b.uMax - b.uMin, b.vMax - b.vMin);
      // เส้นแกนยาว (สีแดง) เหมือนภาพตัวอย่าง
      octx.strokeStyle = '#ff3b30';
      octx.beginPath();
      octx.moveTo(b.uMin, 0); octx.lineTo(b.uMax, 0);
      octx.stroke();
      octx.restore();
    };
    pellets.forEach(b => drawBox(b, '#facc15'));
    rejectedBoxes.forEach(b => drawBox(b, 'rgba(255,255,255,.45)'));
    // ป้ายความยาว
    octx.font = `${Math.max(10, w / 90)}px sans-serif`;
    octx.fillStyle = '#4ade80';
    octx.textAlign = 'center';
    pellets.forEach(b => {
      octx.fillText(b.lenMm.toFixed(1), b.mx, b.my - (Math.abs(b.vMax) + 4));
    });

    return {
      pellets: pellets.map(b => ({ length_mm: +b.lenMm.toFixed(2), diameter_mm: +b.diaMm.toFixed(2), color: b.color })),
      rejected: rejectedCount,
      annotated: out,
      threshold: thr,
    };
  }

  /** สถิติ + การกระจายตามช่วง (binsCm = ขอบช่วงหน่วย ซม. เรียงจากน้อยไปมาก) */
  function computeStats(pellets, binsCm) {
    const lens = pellets.map(p => p.length_mm);
    const dias = pellets.map(p => p.diameter_mm);
    const n = lens.length;
    const mean = a => a.reduce((s, v) => s + v, 0) / (a.length || 1);
    const sd = (a, m) => Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length > 1 ? a.length - 1 : 1));
    const avgLen = mean(lens), avgDia = mean(dias);

    const edges = binsCm.slice().sort((a, b) => a - b);
    const bins = [];
    bins.push({ label: `<${edges[0]}`, min: 0, max: edges[0], count: 0 });
    for (let i = 0; i < edges.length - 1; i++) {
      bins.push({ label: `${edges[i]}-${edges[i + 1]}`, min: edges[i], max: edges[i + 1], count: 0 });
    }
    bins.push({ label: `>${edges[edges.length - 1]}`, min: edges[edges.length - 1], max: Infinity, count: 0 });
    for (const L of lens) {
      const cm = L / 10;
      for (const b of bins) {
        if (cm >= b.min && cm < b.max) { b.count++; break; }
      }
    }
    const distribution = bins.map(b => ({
      label: b.label, min_cm: b.min, max_cm: b.max === Infinity ? null : b.max,
      count: b.count, pct: n ? +(b.count * 100 / n).toFixed(1) : 0,
    }));

    // สีเฉลี่ยรวมทุกเม็ด
    let avgColor = null;
    if (n) {
      const r = Math.round(mean(pellets.map(p => p.color.r)));
      const g = Math.round(mean(pellets.map(p => p.color.g)));
      const b = Math.round(mean(pellets.map(p => p.color.b)));
      avgColor = { r, g, b, lab: rgb2lab(r, g, b) };
    }

    return {
      count: n,
      avg_length_mm: +avgLen.toFixed(2),
      sd_length_mm: +sd(lens, avgLen).toFixed(2),
      min_length_mm: n ? +Math.min(...lens).toFixed(2) : 0,
      max_length_mm: n ? +Math.max(...lens).toFixed(2) : 0,
      avg_diameter_mm: +avgDia.toFixed(2),
      sd_diameter_mm: +sd(dias, avgDia).toFixed(2),
      distribution,
      avg_color: avgColor,
    };
  }

  return { analyze, computeStats, rgb2lab, deltaE };
})();
