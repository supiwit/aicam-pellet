/* ===========================================================
 * analyzer.js — ตรวจจับและวัดขนาดเม็ดอาหารจากภาพถ่าย (pure JS)
 *
 * หลักการวัดตามมาตรฐานการวิเคราะห์ภาพอนุภาคในอุตสาหกรรม (ISO 13322 / ISO 9276):
 *  1. แก้แสงไม่สม่ำเสมอ (background flattening ด้วย integral image)
 *  2. Otsu threshold + เลือกขั้วอัตโนมัติ
 *  3. morphological open + เติมรูภายในเม็ด (hole filling)
 *  4. connected components
 *  5. วัดความยาว = Max Feret diameter, Ø = Min Feret diameter (หลักคาลิปเปอร์)
 *  6. คัดเม็ดที่ติดกัน/ชนขอบออกจากการวัด (agglomerate rejection) — ไม่แยกเม็ด
 * =========================================================== */

const Analyzer = (() => {

  const PROC_MAX = 1800; // ย่อภาพให้ด้านยาวสุดไม่เกินนี้ก่อนประมวลผล

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

  /** ลบพื้นหลังแสงไม่สม่ำเสมอ: gray - boxBlur(gray, r) + 128 (ใช้ integral image) */
  function flattenIllumination(gray, w, h) {
    const integ = new Float64Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) {
      let rowSum = 0;
      for (let x = 0; x < w; x++) {
        rowSum += gray[y * w + x];
        integ[(y + 1) * (w + 1) + (x + 1)] = integ[y * (w + 1) + (x + 1)] + rowSum;
      }
    }
    const r = Math.max(20, Math.round(Math.max(w, h) / 12));
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const y1 = Math.max(0, y - r), y2 = Math.min(h, y + r + 1);
      for (let x = 0; x < w; x++) {
        const x1 = Math.max(0, x - r), x2 = Math.min(w, x + r + 1);
        const area = (y2 - y1) * (x2 - x1);
        const s = integ[y2 * (w + 1) + x2] - integ[y1 * (w + 1) + x2]
                - integ[y2 * (w + 1) + x1] + integ[y1 * (w + 1) + x1];
        const v = gray[y * w + x] - s / area + 128;
        out[y * w + x] = v < 0 ? 0 : v > 255 ? 255 : v | 0;
      }
    }
    return out;
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

  /** เติมรูภายในเม็ด: flood พื้นหลังจากขอบภาพ จุดที่ไม่ใช่เม็ดและไปไม่ถึง = รู → เติม */
  function fillHoles(mask, w, h) {
    const visited = new Uint8Array(w * h);
    const stack = [];
    for (let x = 0; x < w; x++) { stack.push(x); stack.push((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { stack.push(y * w); stack.push(y * w + w - 1); }
    while (stack.length) {
      const i = stack.pop();
      if (visited[i] || mask[i]) continue;
      visited[i] = 1;
      const x = i % w, y = (i / w) | 0;
      if (x > 0) stack.push(i - 1);
      if (x < w - 1) stack.push(i + 1);
      if (y > 0) stack.push(i - w);
      if (y < h - 1) stack.push(i + w);
    }
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i] && !visited[i]) mask[i] = 1; // รูภายใน → เติม
    }
    return mask;
  }

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

  /** ΔE*ab (CIE76) */
  function deltaE(lab1, lab2) {
    return Math.sqrt((lab1.l - lab2.l) ** 2 + (lab1.a - lab2.a) ** 2 + (lab1.b - lab2.b) ** 2);
  }

  /** ΔE00 (CIEDE2000, kL=kC=kH=1) — มาตรฐาน CIE ปัจจุบันสำหรับความต่างสี */
  function deltaE2000(lab1, lab2) {
    const { l: L1, a: a1, b: b1 } = lab1, { l: L2, a: a2, b: b2 } = lab2;
    const rad = Math.PI / 180;
    const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2);
    const Cb = (C1 + C2) / 2;
    const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
    const a1p = (1 + G) * a1, a2p = (1 + G) * a2;
    const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
    const h1p = C1p ? (Math.atan2(b1, a1p) / rad + 360) % 360 : 0;
    const h2p = C2p ? (Math.atan2(b2, a2p) / rad + 360) % 360 : 0;
    const dLp = L2 - L1, dCp = C2p - C1p;
    let dhp = 0;
    if (C1p * C2p) {
      dhp = h2p - h1p;
      if (dhp > 180) dhp -= 360; else if (dhp < -180) dhp += 360;
    }
    const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(dhp * rad / 2);
    const Lbp = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2;
    let hbp = h1p + h2p;
    if (C1p * C2p) {
      if (Math.abs(h1p - h2p) > 180) hbp += (h1p + h2p < 360) ? 360 : -360;
      hbp /= 2;
    }
    const T = 1 - 0.17 * Math.cos((hbp - 30) * rad) + 0.24 * Math.cos(2 * hbp * rad)
            + 0.32 * Math.cos((3 * hbp + 6) * rad) - 0.20 * Math.cos((4 * hbp - 63) * rad);
    const dTheta = 30 * Math.exp(-(((hbp - 275) / 25) ** 2));
    const RC = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
    const SL = 1 + 0.015 * (Lbp - 50) ** 2 / Math.sqrt(20 + (Lbp - 50) ** 2);
    const SC = 1 + 0.045 * Cbp, SH = 1 + 0.015 * Cbp * T;
    const RT = -Math.sin(2 * dTheta * rad) * RC;
    return Math.sqrt((dLp / SL) ** 2 + (dCp / SC) ** 2 + (dHp / SH) ** 2 + RT * (dCp / SC) * (dHp / SH));
  }

  /**
   * วิเคราะห์เนื้อสัมผัสหน้าตัดเม็ด (texture) ตามหลักวิชาการ:
   *  - GLCM (Haralick, 1973): contrast, homogeneity, energy, entropy (16 ระดับเทา, เพื่อนบ้านแนวนอน+ตั้ง)
   *  - Laplacian variance: พลังงานความถี่สูง → ดัชนีความละเอียดเนื้อเม็ด
   *  - CV ความเข้มแสง: ความสม่ำเสมอของผิว
   */
  function textureMetrics(px, w, data) {
    const set = new Set(px);
    const grayAt = i => {
      const p = i * 4;
      return data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114;
    };
    const n = px.length;
    let sum = 0, sum2 = 0;
    for (const i of px) { const v = grayAt(i); sum += v; sum2 += v * v; }
    const mu = sum / n;
    const sigma = Math.sqrt(Math.max(0, sum2 / n - mu * mu));
    const cv = mu > 0 ? sigma / mu : 0;

    // GLCM 16 ระดับ
    const L = 16;
    const glcm = new Float64Array(L * L);
    let pairs = 0;
    const q = v => Math.min(L - 1, (v * L / 256) | 0);
    for (const i of px) {
      if (set.has(i + 1)) { glcm[q(grayAt(i)) * L + q(grayAt(i + 1))]++; pairs++; }
      if (set.has(i + w)) { glcm[q(grayAt(i)) * L + q(grayAt(i + w))]++; pairs++; }
    }
    let contrast = 0, homogeneity = 0, energy = 0, entropy = 0;
    if (pairs) {
      for (let a = 0; a < L; a++) for (let b = 0; b < L; b++) {
        const p = glcm[a * L + b] / pairs;
        if (!p) continue;
        contrast += p * (a - b) * (a - b);
        homogeneity += p / (1 + Math.abs(a - b));
        energy += p * p;
        entropy -= p * Math.log2(p);
      }
    }

    // Laplacian variance (เฉพาะพิกเซลที่มีเพื่อนบ้านครบ 4 ภายในเม็ด)
    let ls = 0, ls2 = 0, ln = 0;
    for (const i of px) {
      if (set.has(i + 1) && set.has(i - 1) && set.has(i + w) && set.has(i - w)) {
        const lap = 4 * grayAt(i) - grayAt(i + 1) - grayAt(i - 1) - grayAt(i + w) - grayAt(i - w);
        ls += lap; ls2 += lap * lap; ln++;
      }
    }
    const lapVar = ln ? Math.max(0, ls2 / ln - (ls / ln) ** 2) : 0;

    return {
      cv: +cv.toFixed(4),
      contrast: +contrast.toFixed(3),
      homogeneity: +homogeneity.toFixed(4),
      energy: +energy.toFixed(4),
      entropy: +entropy.toFixed(3),
      lap_var: +lapVar.toFixed(1),
    };
  }

  function median(arr) {
    if (!arr.length) return 0;
    const a = arr.slice().sort((x, y) => x - y);
    const m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }

  /** convex hull (Andrew monotone chain) ของจุด [x,y] → คืน vertices */
  function convexHull(pts) {
    pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (pts.length < 3) return pts;
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [];
    for (const p of pts) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
      lower.push(p);
    }
    const upper = [];
    for (let i = pts.length - 1; i >= 0; i--) {
      const p = pts[i];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
      upper.push(p);
    }
    lower.pop(); upper.pop();
    return lower.concat(upper);
  }

  function polyArea(h) {
    let a = 0;
    for (let i = 0; i < h.length; i++) {
      const j = (i + 1) % h.length;
      a += h[i][0] * h[j][1] - h[j][0] * h[i][1];
    }
    return Math.abs(a) / 2;
  }

  /**
   * Feret diameters (มาตรฐาน ISO 9276 / ISO 13322):
   *  - maxFeret = ความยาวคาลิปเปอร์สูงสุด = ความยาวเม็ด
   *  - minFeret = ความกว้างคาลิปเปอร์ต่ำสุด = เส้นผ่าศูนย์กลาง (breadth)
   */
  function feret(hull) {
    let maxF = 0, dir = [1, 0];
    for (let i = 0; i < hull.length; i++) {
      for (let j = i + 1; j < hull.length; j++) {
        const dx = hull[i][0] - hull[j][0], dy = hull[i][1] - hull[j][1];
        const d = Math.hypot(dx, dy);
        if (d > maxF) { maxF = d; dir = [dx / d, dy / d]; }
      }
    }
    let minF = Infinity;
    for (let i = 0; i < hull.length; i++) {
      const a = hull[i], b = hull[(i + 1) % hull.length];
      let ex = b[0] - a[0], ey = b[1] - a[1];
      const el = Math.hypot(ex, ey) || 1; ex /= el; ey /= el;
      let mn = Infinity, mx = -Infinity;
      for (const p of hull) {
        const proj = -ey * (p[0] - a[0]) + ex * (p[1] - a[1]);
        if (proj < mn) mn = proj; if (proj > mx) mx = proj;
      }
      const wdt = mx - mn;
      if (wdt < minF) minF = wdt;
    }
    if (!isFinite(minF)) minF = 0;
    return { maxFeret: maxF, minFeret: minF, dir };
  }

  /**
   * วัดก้อนพิกเซลหนึ่งเม็ด ด้วยหลักการอุตสาหกรรม (Feret + solidity):
   *  - ความยาว  = Max Feret diameter
   *  - Ø        = Min Feret diameter
   *  - solidity = พื้นที่จริง / พื้นที่ convex hull (ใช้คัดก้อนที่เป็นเม็ดติดกัน)
   */
  function measureComponent(px, w, data) {
    const n = px.length;
    let minY = 1e9, maxY = -1e9;
    for (const i of px) { const y = (i / w) | 0; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    const H = maxY - minY + 1;
    const rowMin = new Int32Array(H).fill(2147483647);
    const rowMax = new Int32Array(H).fill(-2147483648);
    let sx = 0, sy = 0, cr = 0, cg = 0, cb = 0;
    for (const i of px) {
      const x = i % w, y = (i / w) | 0;
      sx += x; sy += y;
      const r = y - minY;
      if (x < rowMin[r]) rowMin[r] = x;
      if (x > rowMax[r]) rowMax[r] = x;
      const p = i * 4; cr += data[p]; cg += data[p + 1]; cb += data[p + 2];
    }
    const mx = sx / n, my = sy / n;

    // จุดสำหรับ convex hull = ขอบซ้าย/ขวาของแต่ละแถว
    const hullPts = [];
    for (let r = 0; r < H; r++) {
      if (rowMin[r] <= rowMax[r]) {
        const y = minY + r;
        hullPts.push([rowMin[r], y]);
        if (rowMax[r] !== rowMin[r]) hullPts.push([rowMax[r], y]);
      }
    }
    const hull = convexHull(hullPts);
    const hullArea = polyArea(hull);
    const { maxFeret, minFeret, dir } = feret(hull);
    const lengthPx = maxFeret + 1;          // +1 รวมความกว้างพิกเซลปลาย
    const diaPx = minFeret + 1;
    const solidity = hullArea > 0 ? Math.min(1, n / hullArea) : 1;

    // orientation = แนว Max Feret (ใช้วาดกรอบ + โปรไฟล์ความกว้างสำหรับ roughness)
    const cosT = dir[0], sinT = dir[1];
    let uMin = 1e9, uMax = -1e9, vMin = 1e9, vMax = -1e9;
    const us = new Float32Array(n), vs = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      const i = px[k];
      const dx = (i % w) - mx, dy = ((i / w) | 0) - my;
      const u = dx * cosT + dy * sinT;
      const v = -dx * sinT + dy * cosT;
      us[k] = u; vs[k] = v;
      if (u < uMin) uMin = u; if (u > uMax) uMax = u;
      if (v < vMin) vMin = v; if (v > vMax) vMax = v;
    }
    // โปรไฟล์ความกว้างต่อคอลัมน์ → ความขรุขระผิว (Ra-like)
    const nCols = Math.max(3, Math.ceil(uMax - uMin) + 1);
    const colMin = new Float32Array(nCols).fill(1e9);
    const colMax = new Float32Array(nCols).fill(-1e9);
    const colCnt = new Uint32Array(nCols);
    for (let k = 0; k < n; k++) {
      const c = Math.min(nCols - 1, Math.max(0, Math.round(us[k] - uMin)));
      colCnt[c]++;
      if (vs[k] < colMin[c]) colMin[c] = vs[k];
      if (vs[k] > colMax[c]) colMax[c] = vs[k];
    }
    const widths = [];
    for (let c = 0; c < nCols; c++) widths.push(colCnt[c] ? colMax[c] - colMin[c] + 1 : 0);
    const loC = Math.floor(nCols * 0.2), hiC = Math.ceil(nCols * 0.8);
    const midWidths = widths.slice(loC, hiC).filter(v => v > 0);
    let roughnessPct = 0;
    if (midWidths.length > 2) {
      const wMean = midWidths.reduce((s, v) => s + v, 0) / midWidths.length;
      const wSd = Math.sqrt(midWidths.reduce((s, v) => s + (v - wMean) ** 2, 0) / midWidths.length);
      roughnessPct = wMean > 0 ? +(wSd * 100 / wMean).toFixed(2) : 0;
    }

    return {
      roughnessPct, solidity,
      aspect: diaPx > 0 ? lengthPx / diaPx : 1,   // ISO 9276-6 elongation (ยาว/กว้าง)
      mx, my, cosT, sinT, uMin, uMax, vMin, vMax,
      lengthPx, diaPx,
      area: n,
      color: { r: Math.round(cr / n), g: Math.round(cg / n), b: Math.round(cb / n) },
      touchBorder: false,
    };
  }


  /**
   * วิเคราะห์ภาพตามหลักการวิเคราะห์ภาพอนุภาคที่ยอมรับในอุตสาหกรรม (ISO 13322 / ISO 9276):
   *  - วัดความยาว = Max Feret, Ø = Min Feret ของแต่ละเม็ดที่แยกชัด
   *  - "ไม่แยก" เม็ดที่ติดกัน แต่ "คัดออก" จากการวัด (agglomerate rejection)
   *    ด้วย solidity และขนาดเทียบกับ median ประชากร เพื่อกันค่าผิดเข้าสถิติ
   *  - เม็ดที่ชนขอบภาพถูกคัดออก (วัดไม่ครบ)
   * @param opts {polarity, minLenMm, maxLenMm, autoSplit(=คัดเม็ดติดกัน)}
   */
  function analyze(img, mmPerPx, opts = {}) {
    const { canvas, scale } = toProcCanvas(img);
    const w = canvas.width, h = canvas.height;
    const ctx = canvas.getContext('2d');
    const data = ctx.getImageData(0, 0, w, h).data;
    const mmpp = mmPerPx * scale;

    // ---- grayscale + แก้แสงไม่สม่ำเสมอ + Otsu ----
    let gray = new Uint8Array(w * h);
    for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
      gray[i] = (data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114) | 0;
    }
    gray = flattenIllumination(gray, w, h);
    const hist = new Uint32Array(256);
    for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
    const thr = otsu(hist, w * h);
    let bright = 0;
    for (let t = thr + 1; t < 256; t++) bright += hist[t];
    let fgBright;
    if (opts.polarity === 'dark') fgBright = true;
    else if (opts.polarity === 'light') fgBright = false;
    else fgBright = bright < (w * h - bright);
    let mask = new Uint8Array(w * h);
    for (let i = 0; i < mask.length; i++) mask[i] = (gray[i] > thr) === fgBright ? 1 : 0;
    mask = erodeDilate(erodeDilate(mask, w, h, 'erode'), w, h, 'dilate');
    mask = fillHoles(mask, w, h);

    // ---- connected components ----
    const minLenMm = opts.minLenMm ?? 2;
    const maxLenMm = opts.maxLenMm ?? 50;
    const excludeClumps = opts.autoSplit !== false; // ใช้ key เดิม: คัดเม็ดติดกันออก
    const minAreaPx = Math.max(20, (minLenMm * minLenMm * 0.4) / (mmpp * mmpp));
    const labels = new Int32Array(w * h);
    const stack = new Int32Array(w * h);
    const comps = [];

    let nextLabel = 0;
    for (let start = 0; start < mask.length; start++) {
      if (!mask[start] || labels[start]) continue;
      nextLabel++;
      let sp = 0;
      stack[sp++] = start;
      labels[start] = nextLabel;
      const px = [];
      let touchBorder = false;
      while (sp > 0) {
        const i = stack[--sp];
        px.push(i);
        const x = i % w, y = (i / w) | 0;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touchBorder = true;
        if (x > 0     && mask[i - 1] && !labels[i - 1]) { labels[i - 1] = nextLabel; stack[sp++] = i - 1; }
        if (x < w - 1 && mask[i + 1] && !labels[i + 1]) { labels[i + 1] = nextLabel; stack[sp++] = i + 1; }
        if (y > 0     && mask[i - w] && !labels[i - w]) { labels[i - w] = nextLabel; stack[sp++] = i - w; }
        if (y < h - 1 && mask[i + w] && !labels[i + w]) { labels[i + w] = nextLabel; stack[sp++] = i + w; }
      }
      if (px.length < minAreaPx) continue;
      const m = measureComponent(px, w, data);
      m.px = px;
      m.touchBorder = touchBorder;
      m.lenMm = m.lengthPx * mmpp;
      m.diaMm = m.diaPx * mmpp;
      comps.push(m);
    }

    // ---- ค่ากลางประชากร (จากก้อนไม่ชนขอบ ขนาดอยู่ในช่วง) สำหรับคัดเม็ดติดกัน ----
    const ref = comps.filter(c => !c.touchBorder && c.lenMm >= minLenMm && c.lenMm <= maxLenMm);
    const medLen = median(ref.map(c => c.lenMm));
    const medArea = median(ref.map(c => c.area));

    const maxAspect = opts.maxAspect ?? 8;   // เกินนี้ = เส้นใย/เศษ (ISO 9276-6 elongation)
    const accepted = [], rejectedBoxes = [];
    let rejBorder = 0, rejClump = 0, rejSize = 0, rejForeign = 0;
    for (const c of comps) {
      if (c.lenMm < minLenMm) continue;                 // เล็กเกิน = noise (ไม่นับ)
      if (c.touchBorder) { c.reason = 'border'; rejectedBoxes.push(c); rejBorder++; continue; }
      if (c.lenMm > maxLenMm) { c.reason = 'size'; rejectedBoxes.push(c); rejSize++; continue; }
      // (4) กรองเศษ/สิ่งแปลกปลอมด้วยรูปทรง — เส้นใย/เส้นผม (ผอมยาวผิดปกติ)
      //     หรือรูปร่างเว้ามาก (ไม่ใช่เม็ดอาหาร) ตาม ISO 9276-6
      if (c.aspect > maxAspect || c.solidity < 0.55) {
        c.reason = 'foreign'; rejectedBoxes.push(c); rejForeign++; continue;
      }
      if (excludeClumps && ref.length >= 4) {
        const clump =
          (medArea > 0 && c.area > 1.5 * medArea) ||     // พื้นที่ ≈ 2 เม็ด = เม็ดติดกัน (ตัวจับหลัก)
          (medLen > 0 && c.lenMm > 1.65 * medLen) ||     // ยาว ≈ 2 เม็ด = หัวต่อหัว
          c.solidity < 0.72;                             // รูปร่างเว้ามาก = เกาะกลุ่ม (ตัวสำรอง)
        if (clump) { c.reason = 'clump'; rejectedBoxes.push(c); rejClump++; continue; }
      }
      accepted.push(c);
    }

    for (const c of accepted) if (!c.texture) c.texture = textureMetrics(c.px, w, data);

    // ---- วาดผล ----
    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    const octx = out.getContext('2d');
    octx.drawImage(canvas, 0, 0);
    const drawBox = (b, stroke, axis) => {
      octx.save();
      octx.translate(b.mx, b.my);
      octx.rotate(Math.atan2(b.sinT, b.cosT));
      octx.strokeStyle = stroke;
      octx.lineWidth = Math.max(1.5, w / 800);
      octx.strokeRect(b.uMin, b.vMin, b.uMax - b.uMin, b.vMax - b.vMin);
      if (axis) {
        octx.strokeStyle = '#ff3b30';
        octx.beginPath();
        octx.moveTo(b.uMin, 0); octx.lineTo(b.uMax, 0);
        octx.stroke();
      }
      octx.restore();
    };
    // เม็ดที่วัด = กรอบเหลือง (แกนแดง) · เม็ดติดกัน = ส้ม · สิ่งแปลกปลอม = ม่วง · ชนขอบ/ผิดขนาด = ขาวจาง
    const rejColor = { clump: '#fb923c', foreign: '#c084fc' };
    rejectedBoxes.forEach(b => drawBox(b, rejColor[b.reason] || 'rgba(255,255,255,.4)', false));
    accepted.forEach(b => drawBox(b, '#facc15', true));
    octx.font = `bold ${Math.max(11, w / 85)}px sans-serif`;
    octx.fillStyle = '#4ade80';
    octx.strokeStyle = 'rgba(0,0,0,.6)';
    octx.lineWidth = 3;
    octx.textAlign = 'center';
    accepted.forEach(b => {
      const tx = b.mx, ty = b.my - (Math.abs(b.vMax) + 5);
      octx.strokeText(b.lenMm.toFixed(1), tx, ty);
      octx.fillText(b.lenMm.toFixed(1), tx, ty);
    });

    return {
      pellets: accepted.map(b => ({
        length_mm: +b.lenMm.toFixed(2),
        diameter_mm: +b.diaMm.toFixed(2),
        color: b.color,
        roughness_pct: b.roughnessPct,
        solidity: +b.solidity.toFixed(3),
        aspect: +b.aspect.toFixed(2),
        texture: b.texture,
      })),
      rejected: rejectedBoxes.length,
      excluded: { clump: rejClump, border: rejBorder, size: rejSize, foreign: rejForeign },
      splits: 0,
      annotated: out,
      threshold: thr,
    };
  }

  /**
   * คาลิเบรตอัตโนมัติ: หาวัตถุอ้างอิงทรงกลม (เหรียญ/วงกลม) ที่ใหญ่และกลมที่สุดในภาพ
   * คืน mm ต่อพิกเซล(ต้นฉบับ) จากเส้นผ่านศูนย์กลางจริง knownMm
   * @returns {found, mmpp, diaPx, annotated} หรือ {found:false}
   */
  function detectReference(img, knownMm, opts = {}) {
    const { canvas, scale } = toProcCanvas(img);
    const w = canvas.width, h = canvas.height;
    const ctx = canvas.getContext('2d');
    const data = ctx.getImageData(0, 0, w, h).data;
    let gray = new Uint8Array(w * h);
    for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
      gray[i] = (data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114) | 0;
    }
    gray = flattenIllumination(gray, w, h);
    const hist = new Uint32Array(256);
    for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
    const thr = otsu(hist, w * h);
    let bright = 0;
    for (let t = thr + 1; t < 256; t++) bright += hist[t];
    let fgBright;
    if (opts.polarity === 'dark') fgBright = true;
    else if (opts.polarity === 'light') fgBright = false;
    else fgBright = bright < (w * h - bright);
    let mask = new Uint8Array(w * h);
    for (let i = 0; i < mask.length; i++) mask[i] = (gray[i] > thr) === fgBright ? 1 : 0;
    mask = erodeDilate(erodeDilate(mask, w, h, 'erode'), w, h, 'dilate');
    mask = fillHoles(mask, w, h);

    const labels = new Int32Array(w * h);
    const stack = new Int32Array(w * h);
    let best = null;
    for (let start = 0; start < mask.length; start++) {
      if (!mask[start] || labels[start]) continue;
      let sp = 0; stack[sp++] = start; labels[start] = 1;
      const px = []; let touch = false;
      while (sp > 0) {
        const i = stack[--sp]; px.push(i);
        const x = i % w, y = (i / w) | 0;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touch = true;
        if (x > 0 && mask[i - 1] && !labels[i - 1]) { labels[i - 1] = 1; stack[sp++] = i - 1; }
        if (x < w - 1 && mask[i + 1] && !labels[i + 1]) { labels[i + 1] = 1; stack[sp++] = i + 1; }
        if (y > 0 && mask[i - w] && !labels[i - w]) { labels[i - w] = 1; stack[sp++] = i - w; }
        if (y < h - 1 && mask[i + w] && !labels[i + w]) { labels[i + w] = 1; stack[sp++] = i + w; }
      }
      if (touch || px.length < 400) continue;          // ใหญ่พอและไม่ชนขอบ
      const m = measureComponent(px, w, data);
      const aspect = m.lengthPx / Math.max(1, m.diaPx);
      const circleArea = Math.PI * (m.lengthPx / 2) ** 2;
      const fill = px.length / circleArea;             // ใกล้ 1 = วงกลมเต็ม
      if (aspect < 1.25 && m.solidity > 0.88 && fill > 0.80) {
        if (!best || px.length > best.area) {
          best = { area: px.length, diaEqProc: 2 * Math.sqrt(px.length / Math.PI), m };
        }
      }
    }
    if (!best) return { found: false };
    const diaPxOrig = best.diaEqProc * scale;
    const mmpp = +(knownMm / diaPxOrig).toFixed(5);

    // วาดวงกลมรอบวัตถุอ้างอิง
    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    const octx = out.getContext('2d');
    octx.drawImage(canvas, 0, 0);
    octx.strokeStyle = '#3b82f6'; octx.lineWidth = Math.max(2, w / 400);
    octx.beginPath();
    octx.arc(best.m.mx, best.m.my, best.diaEqProc / 2, 0, Math.PI * 2);
    octx.stroke();
    return { found: true, mmpp, diaPx: +diaPxOrig.toFixed(1), annotated: out };
  }


  /** สถิติ + การกระจายตามช่วง (binsMm หน่วย มม.) */
  function computeStats(pellets, binsMm) {
    const lens = pellets.map(p => p.length_mm);
    const dias = pellets.map(p => p.diameter_mm);
    const n = lens.length;
    const mean = a => a.reduce((s, v) => s + v, 0) / (a.length || 1);
    const sd = (a, m) => Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length > 1 ? a.length - 1 : 1));
    const avgLen = mean(lens), avgDia = mean(dias);

    const edges = binsMm.slice().sort((a, b) => a - b);
    const bins = [];
    bins.push({ label: `<${edges[0]}`, min: 0, max: edges[0], count: 0 });
    for (let i = 0; i < edges.length - 1; i++) {
      bins.push({ label: `${edges[i]}-${edges[i + 1]}`, min: edges[i], max: edges[i + 1], count: 0 });
    }
    bins.push({ label: `>${edges[edges.length - 1]}`, min: edges[edges.length - 1], max: Infinity, count: 0 });
    for (const L of lens) {
      for (const b of bins) {
        if (L >= b.min && L < b.max) { b.count++; break; }
      }
    }
    const distribution = bins.map(b => ({
      label: b.label, min_mm: b.min, max_mm: b.max === Infinity ? null : b.max,
      count: b.count, pct: n ? +(b.count * 100 / n).toFixed(1) : 0,
    }));

    // การกระจาย Ø แบบช่วงอัตโนมัติ 0.5 มม.
    let diaDist = [];
    if (n) {
      const dMin = Math.floor(Math.min(...dias) * 2) / 2;
      const dMax = Math.ceil(Math.max(...dias) * 2) / 2;
      for (let v = dMin; v < dMax || diaDist.length === 0; v += 0.5) {
        const hi = v + 0.5;
        const count = dias.filter(d => d >= v && d < hi).length;
        diaDist.push({ label: `${v.toFixed(1)}-${hi.toFixed(1)}`, count, pct: +(count * 100 / n).toFixed(1) });
        if (diaDist.length > 20) break;
      }
    }

    let avgColor = null;
    if (n) {
      const r = Math.round(mean(pellets.map(p => p.color.r)));
      const g = Math.round(mean(pellets.map(p => p.color.g)));
      const b = Math.round(mean(pellets.map(p => p.color.b)));
      const lab = rgb2lab(r, g, b);
      avgColor = { r, g, b, lab: { l: +lab.l.toFixed(2), a: +lab.a.toFixed(2), b: +lab.b.toFixed(2) } };
    }

    // ---- คุณภาพหน้าตัดเม็ด (เฉลี่ยทุกเม็ด) ----
    // FI = 100·e^(−Var(∇²I)/500), Uniformity = 100(1−3·CV), Smoothness = 100(1−Ra%/30)
    // Score = 0.3·FI + 0.3·Homogeneity·100 + 0.2·Uniformity + 0.2·Smoothness
    let texture = null;
    const tx = pellets.filter(p => p.texture);
    if (tx.length) {
      const m = f => mean(tx.map(f));
      const lapVar = m(p => p.texture.lap_var);
      const homogeneity = m(p => p.texture.homogeneity);
      const fineness = 100 * Math.exp(-lapVar / 500);
      const cv = m(p => p.texture.cv);
      const roughness = m(p => p.roughness_pct || 0);
      const uniformity = 100 * Math.max(0, 1 - cv * 3);
      const smoothness = 100 * Math.max(0, 1 - roughness / 30);
      const score = 0.3 * fineness + 0.3 * homogeneity * 100 + 0.2 * uniformity + 0.2 * smoothness;
      texture = {
        fineness: +fineness.toFixed(1),
        homogeneity: +homogeneity.toFixed(3),
        contrast: +m(p => p.texture.contrast).toFixed(2),
        entropy: +m(p => p.texture.entropy).toFixed(2),
        energy: +m(p => p.texture.energy).toFixed(3),
        cv: +cv.toFixed(3),
        lap_var: +lapVar.toFixed(1),
        roughness_pct: +roughness.toFixed(1),
        uniformity: +uniformity.toFixed(1),
        smoothness: +smoothness.toFixed(1),
        score: +score.toFixed(1),
        grade: score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 50 ? 'C' : 'D',
      };
    }

    // หน้าตัดเม็ด (สมมติทรงกระบอก): A = π·d²/4 ต่อเม็ด
    const areas = dias.map(d => Math.PI * d * d / 4);
    const avgArea = mean(areas);

    return {
      texture,
      avg_area_mm2: +avgArea.toFixed(3),
      sd_area_mm2: +sd(areas, avgArea).toFixed(3),
      cv_pct: avgLen > 0 ? +((sd(lens, avgLen) / avgLen) * 100).toFixed(1) : 0,
      count: n,
      avg_length_mm: +avgLen.toFixed(2),
      sd_length_mm: +sd(lens, avgLen).toFixed(2),
      min_length_mm: n ? +Math.min(...lens).toFixed(2) : 0,
      max_length_mm: n ? +Math.max(...lens).toFixed(2) : 0,
      avg_diameter_mm: +avgDia.toFixed(2),
      sd_diameter_mm: +sd(dias, avgDia).toFixed(2),
      distribution,
      dia_distribution: diaDist,
      avg_color: avgColor,
    };
  }

  /** เทียบสเปกไซซ์: คืน {under_pct, insize_pct, over_pct, pass} จากความยาวเม็ด (มม.) */
  function checkSpec(pellets, spec) {
    const n = pellets.length;
    if (!n || !spec) return null;
    let under = 0, insize = 0, over = 0;
    for (const p of pellets) {
      if (p.length_mm < spec.min_mm) under++;
      else if (p.length_mm <= spec.max_mm) insize++;
      else over++;
    }
    const pct = v => +(v * 100 / n).toFixed(1);
    const insizePct = pct(insize);
    return {
      under_pct: pct(under),
      insize_pct: insizePct,
      over_pct: pct(over),
      pass: insizePct >= spec.target_pct,
    };
  }

  return { analyze, detectReference, computeStats, checkSpec, rgb2lab, deltaE, deltaE2000 };
})();
