/* ===========================================================
 * analyzer.js — ตรวจจับและวัดขนาดเม็ดอาหารจากภาพถ่าย (pure JS)
 *
 * ขั้นตอน:
 *  1. แก้แสงไม่สม่ำเสมอ (background flattening ด้วย integral image)
 *  2. Otsu threshold + เลือกขั้วอัตโนมัติ
 *  3. morphological open + เติมรูภายในเม็ด (hole filling)
 *  4. connected components
 *  5. แยกเม็ดที่ติดกันแบบหัวต่อหัว (neck split จากโปรไฟล์ความกว้าง)
 *  6. PCA วัดความยาว / เส้นผ่าศูนย์กลาง = median ความกว้างช่วงกลางเม็ด
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

  /** วัดก้อนพิกเซลหนึ่งก้อนด้วย PCA + โปรไฟล์ความกว้างตามแกนหลัก */
  function measureComponent(px, w, data) {
    const n = px.length;
    let sx = 0, sy = 0, touchBorder = false;
    for (const i of px) {
      const x = i % w, y = (i / w) | 0;
      sx += x; sy += y;
    }
    const mx = sx / n, my = sy / n;
    let cxx = 0, cyy = 0, cxy = 0;
    for (const i of px) {
      const dx = (i % w) - mx, dy = ((i / w) | 0) - my;
      cxx += dx * dx; cyy += dy * dy; cxy += dx * dy;
    }
    cxx /= n; cyy /= n; cxy /= n;
    const theta = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
    const cosT = Math.cos(theta), sinT = Math.sin(theta);

    let uMin = 1e9, uMax = -1e9, vMin = 1e9, vMax = -1e9;
    let cr = 0, cg = 0, cb = 0;
    const us = new Float32Array(n), vs = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      const i = px[k];
      const dx = (i % w) - mx, dy = ((i / w) | 0) - my;
      const u = dx * cosT + dy * sinT;
      const v = -dx * sinT + dy * cosT;
      us[k] = u; vs[k] = v;
      if (u < uMin) uMin = u; if (u > uMax) uMax = u;
      if (v < vMin) vMin = v; if (v > vMax) vMax = v;
      const p = i * 4;
      cr += data[p]; cg += data[p + 1]; cb += data[p + 2];
    }

    // โปรไฟล์ความกว้างต่อคอลัมน์ตามแกนหลัก
    const nCols = Math.max(3, Math.ceil(uMax - uMin) + 1);
    const colMin = new Float32Array(nCols).fill(1e9);
    const colMax = new Float32Array(nCols).fill(-1e9);
    const colCnt = new Uint32Array(nCols);
    const colSumV = new Float32Array(nCols);
    for (let k = 0; k < n; k++) {
      const c = Math.min(nCols - 1, Math.max(0, Math.round(us[k] - uMin)));
      colCnt[c]++;
      colSumV[c] += vs[k];
      if (vs[k] < colMin[c]) colMin[c] = vs[k];
      if (vs[k] > colMax[c]) colMax[c] = vs[k];
    }
    const widths = [];
    for (let c = 0; c < nCols; c++) {
      widths.push(colCnt[c] ? colMax[c] - colMin[c] + 1 : 0);
    }

    // Ø = median ความกว้างช่วงกลางเม็ด (ตัดปลายมน 20% ทั้งสองข้าง)
    const lo = Math.floor(nCols * 0.2), hi = Math.ceil(nCols * 0.8);
    const midWidths = widths.slice(lo, hi).filter(v => v > 0);

    // ความขรุขระผิว (Ra-like): CV ของโปรไฟล์ความกว้างช่วงกลางเม็ด × 100%
    let roughnessPct = 0;
    if (midWidths.length > 2) {
      const wMean = midWidths.reduce((s, v) => s + v, 0) / midWidths.length;
      const wSd = Math.sqrt(midWidths.reduce((s, v) => s + (v - wMean) ** 2, 0) / midWidths.length);
      roughnessPct = wMean > 0 ? +(wSd * 100 / wMean).toFixed(2) : 0;
    }

    // ความยาวแบบ robust: ตัด outlier 0.4% หัวท้าย กันพิกเซลหลุด/เงาแหลม
    let straightLen = uMax - uMin + 1;
    if (n > 50) {
      const su = Float32Array.from(us).sort();
      straightLen = su[Math.min(n - 1, Math.ceil(0.996 * (n - 1)))] -
                    su[Math.max(0, Math.floor(0.004 * (n - 1)))] + 1;
    }

    // ความยาวแบบ curvature-aware: เดินตามแกนกลางเม็ด (centroid ต่อคอลัมน์)
    // → วัดเม็ดที่โค้งงอได้ตามจริง ไม่ใช่แค่ระยะตรงปลายถึงปลาย
    let pathLen = straightLen;
    {
      const cx = [], cv = [];
      for (let c = 0; c < nCols; c++) {
        if (colCnt[c] > 0) { cx.push(c); cv.push(colSumV[c] / colCnt[c]); }
      }
      if (cx.length >= 4) {
        // smooth แกนกลางด้วยค่าเฉลี่ยเคลื่อนที่หน้าต่าง 5 กันสัญญาณรบกวนพองค่า
        const sv = cv.map((_, i) => {
          let s = 0, c = 0;
          for (let j = Math.max(0, i - 2); j <= Math.min(cv.length - 1, i + 2); j++) { s += cv[j]; c++; }
          return s / c;
        });
        let p = 0;
        for (let i = 1; i < cx.length; i++) {
          const du = cx[i] - cx[i - 1], dv = sv[i] - sv[i - 1];
          p += Math.sqrt(du * du + dv * dv);
        }
        pathLen = p + 1; // +1 ครอบคลุมพิกเซลปลายทั้งสอง
      }
    }
    // เม็ดตรง pathLen≈straightLen; เม็ดโค้ง pathLen>straightLen → เลือกค่ามากกว่า
    const lengthPx = Math.max(straightLen, pathLen);

    return {
      roughnessPct,
      mx, my, cosT, sinT, uMin, uMax, vMin, vMax,
      lengthPx,
      diaPx: midWidths.length ? median(midWidths) : (vMax - vMin + 1),
      widths, nCols,
      area: n,
      color: { r: Math.round(cr / n), g: Math.round(cg / n), b: Math.round(cb / n) },
      touchBorder,
    };
  }

  /**
   * หา "คอคอด" ในโปรไฟล์ความกว้าง — จุดที่ความกว้างยุบลึกกว่า ratio ของ median
   * คืนตำแหน่งคอลัมน์ที่ควรตัดแยก (เม็ดติดกันแบบหัวต่อหัว)
   */
  function findNecks(m, minColsPerPart, ratio = 0.55) {
    const W = median(m.widths.filter(v => v > 0));
    if (!W) return [];
    const sm = m.widths.map((v, i, a) =>
      (a[i - 1] ?? v) * 0.25 + v * 0.5 + (a[i + 1] ?? v) * 0.25);
    const necks = [];
    for (let c = minColsPerPart; c < m.nCols - minColsPerPart; c++) {
      if (sm[c] < W * ratio && sm[c] <= sm[c - 1] && sm[c] <= sm[c + 1]) {
        if (!necks.length || c - necks[necks.length - 1] >= minColsPerPart) necks.push(c);
      }
    }
    return necks;
  }

  /** แบ่งพิกเซลของก้อนตามคอคอด → คืน array ของกลุ่มพิกเซล (global index) หรือ null */
  function neckSplitGroups(m, w, minColsPerPart, ratio = 0.55) {
    const necks = findNecks(m, minColsPerPart, ratio);
    if (!necks.length) return null;
    const groups = Array.from({ length: necks.length + 1 }, () => []);
    for (const i of m.px) {
      const dx = (i % w) - m.mx, dy = ((i / w) | 0) - m.my;
      const u = dx * m.cosT + dy * m.sinT;
      const c = Math.round(u - m.uMin);
      let g = 0;
      while (g < necks.length && c > necks[g]) g++;
      groups[g].push(i);
    }
    return groups;
  }

  /**
   * แบ่งเชิงเรขาคณิต: ผ่าก้อนตามแกน "เรียงเม็ด" เป็น k แถบเท่าๆ กัน
   * (เม็ดเคียงข้างชิดสนิทไร้คอคอด) — alongV=true ผ่าตามแกนรอง, false ผ่าตามแกนหลัก
   */
  function bandGroups(blob, w, k, alongV = true) {
    const groups = Array.from({ length: k }, () => []);
    const lo = alongV ? blob.vMin : blob.uMin;
    const hi = alongV ? blob.vMax : blob.uMax;
    const span = (hi - lo + 1) / k;
    for (const i of blob.px) {
      const dx = (i % w) - blob.mx, dy = ((i / w) | 0) - blob.my;
      const coord = alongV ? (-dx * blob.sinT + dy * blob.cosT) : (dx * blob.cosT + dy * blob.sinT);
      const b = Math.floor((coord - lo) / span);
      groups[Math.max(0, Math.min(k - 1, b))].push(i);
    }
    return groups;
  }

  /**
   * แยกก้อนเม็ดติดกันด้วย distance-transform watershed:
   *  1. คำนวณระยะห่างจากขอบ (chamfer 3-4) ภายในก้อน
   *  2. หา "แกนกลาง" = บริเวณที่ระยะ ≥ 55% ของรัศมีเม็ดปกติ → marker แต่ละเม็ด
   *  3. โตกลับจากทุก marker พร้อมกัน (multi-source BFS) → แบ่งพิกเซลเป็นรายเม็ด
   * @returns array ของกลุ่มพิกเซล (global index) หรือ null ถ้าแยกไม่ได้
   */
  function watershedSplit(px, w, rNormalPx) {
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (const i of px) {
      const x = i % w, y = (i / w) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    const bw = x1 - x0 + 3, bh = y1 - y0 + 3; // กันขอบ 1 px
    if (bw * bh > 4e6) return null;
    const idx = (x, y) => y * bw + x;
    const inM = new Uint8Array(bw * bh);
    const d = new Float32Array(bw * bh);
    const gmap = new Int32Array(bw * bh).fill(-1); // local → global
    for (const i of px) {
      const lx = (i % w) - x0 + 1, ly = ((i / w) | 0) - y0 + 1;
      const k = idx(lx, ly);
      inM[k] = 1; d[k] = 1e9; gmap[k] = i;
    }
    // chamfer 3-4 ไป-กลับ
    for (let y = 1; y < bh; y++) {
      for (let x = 1; x < bw; x++) {
        const k = idx(x, y);
        if (!inM[k]) continue;
        let v = d[k];
        if (d[k - 1] + 3 < v) v = d[k - 1] + 3;
        if (d[k - bw] + 3 < v) v = d[k - bw] + 3;
        if (d[k - bw - 1] + 4 < v) v = d[k - bw - 1] + 4;
        if (x < bw - 1 && d[k - bw + 1] + 4 < v) v = d[k - bw + 1] + 4;
        d[k] = v;
      }
    }
    for (let y = bh - 2; y >= 0; y--) {
      for (let x = bw - 2; x >= 0; x--) {
        const k = idx(x, y);
        if (!inM[k]) continue;
        let v = d[k];
        if (d[k + 1] + 3 < v) v = d[k + 1] + 3;
        if (d[k + bw] + 3 < v) v = d[k + bw] + 3;
        if (d[k + bw + 1] + 4 < v) v = d[k + bw + 1] + 4;
        if (x > 0 && d[k + bw - 1] + 4 < v) v = d[k + bw - 1] + 4;
        d[k] = v;
      }
    }
    // ---- markers = local maxima ของ distance transform + non-max suppression ----
    // ให้ได้ "1 จุดศูนย์กลาง = 1 เม็ด" เสมอ แม่นกับคลัสเตอร์เคียงข้าง/3+ เม็ด
    const dmin = Math.max(4, rNormalPx * 0.5 * 3);   // ลึกขั้นต่ำที่ถือเป็นใจกลางเม็ด (หน่วย chamfer)
    const win = Math.max(1, Math.round(rNormalPx * 0.6)); // หน้าต่าง local-max
    const minSeedDist = Math.max(3, rNormalPx * 1.3); // ระยะห่างขั้นต่ำระหว่างศูนย์กลางเม็ด (px)
    const cand = [];
    for (let y = 1; y < bh - 1; y++) {
      for (let x = 1; x < bw - 1; x++) {
        const k = idx(x, y);
        if (!inM[k] || d[k] < dmin) continue;
        let isMax = true;
        for (let dy = -win; dy <= win && isMax; dy++) {
          for (let dx = -win; dx <= win; dx++) {
            const xx = x + dx, yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= bw || yy >= bh) continue;
            if (d[idx(xx, yy)] > d[k]) { isMax = false; break; }
          }
        }
        if (isMax) cand.push(k);
      }
    }
    // NMS: เรียงตามความลึกมาก→น้อย รับ seed ที่ห่างจากที่รับแล้ว ≥ minSeedDist
    cand.sort((a, b) => d[b] - d[a]);
    const seeds = [];
    for (const k of cand) {
      const x = k % bw, y = (k / bw) | 0;
      let ok = true;
      for (const s of seeds) {
        const sx = s % bw, sy = (s / bw) | 0;
        if (Math.hypot(x - sx, y - sy) < minSeedDist) { ok = false; break; }
      }
      if (ok) seeds.push(k);
    }
    if (seeds.length < 2) return null;

    const lbl = new Int32Array(bw * bh);
    let nMarkers = 0;
    const queue = new Int32Array(bw * bh);
    for (const k of seeds) lbl[k] = ++nMarkers;
    // โตกลับพร้อมกันทุก marker
    let qh = 0, qt = 0;
    for (let k = 0; k < inM.length; k++) if (lbl[k]) queue[qt++] = k;
    while (qh < qt) {
      const c = queue[qh++];
      for (const nb of [c - 1, c + 1, c - bw, c + bw]) {
        if (nb >= 0 && nb < inM.length && inM[nb] && !lbl[nb]) {
          lbl[nb] = lbl[c]; queue[qt++] = nb;
        }
      }
    }
    const groups = Array.from({ length: nMarkers }, () => []);
    for (let k = 0; k < inM.length; k++) {
      if (inM[k] && lbl[k]) groups[lbl[k] - 1].push(gmap[k]);
    }
    return groups;
  }

  /**
   * แยกก้อนเม็ดติดกันแบบ recursive รองรับคลัสเตอร์ผสม (เคียงข้าง + หัวต่อหัว):
   *  - ก้อน "อ้วน" (เคียงข้าง/เกาะกลุ่ม) → watershed ด้วย local-maxima markers
   *  - ก้อนมี "คอคอด" (หัวต่อหัว) → neck split
   *  - เคียงข้างชิดสนิทไร้คอคอด → band split
   *  - แต่ละชิ้นที่ได้ ถ้ายังใหญ่ → แยกซ้ำ (สูงสุด 3 ชั้น)
   * ปลอดภัย: ถ้าแยกไม่สมเหตุสมผลจะคืนก้อนเดิม (ไม่สร้างการแยกเทียม)
   * @returns array ของเม็ดที่วัดแล้ว (≥1 ชิ้น); ชิ้นที่มาจากการแยกมี fromSplit=true
   */
  function refineBlob(blob, w, data, mmpp, cfg) {
    const { minLenMm, maxLenMm, minAreaPx, medDiaPx, medArea, medLenPx } = cfg;
    const measure = (g) => {
      const pm = measureComponent(g, w, data);
      pm.px = g;
      let l = pm.lengthPx * mmpp, d = pm.diaPx * mmpp;
      if (l < d) { const t = l; l = d; d = t; }
      pm.lenMm = l; pm.diaMm = d;
      return pm;
    };
    const valid = (pm) =>
      pm.area >= minAreaPx && pm.lenMm >= minLenMm && pm.lenMm <= maxLenMm &&
      (pm.area / (pm.lengthPx * Math.max(1, pm.diaPx))) >= 0.4 &&
      pm.diaPx <= 1.5 * medDiaPx;
    const minCols = Math.max(4, (minLenMm / mmpp) * 0.8);

    const toParts = (groups) => groups
      ? groups.filter(x => x.length >= minAreaPx).map(measure).filter(valid)
      : [];

    function split(pm, depth) {
      if (depth >= 3) return [pm];
      const uExt = pm.uMax - pm.uMin + 1, vExt = pm.vMax - pm.vMin + 1;
      // แกน "เรียงเม็ด" (stacking) = แกนที่ extent ห่างจากความยาวเม็ดปกติมากกว่า
      const stackAlongV = Math.abs(uExt - medLenPx) <= Math.abs(vExt - medLenPx);
      const stackExt = stackAlongV ? vExt : uExt;
      const kStack = Math.round(stackExt / medDiaPx);
      const isFat = stackExt > 1.4 * medDiaPx;            // มีเม็ดเรียงกันมากกว่า 1 ตามแนวกว้าง
      const expect = Math.max(2, Math.round(pm.area / medArea)); // จำนวนเม็ดคาดหวังจากพื้นที่

      // รวบรวมผลจากทุกวิธีที่ใช้ได้ แล้วเลือกอันที่จำนวนชิ้นใกล้ค่าคาดหวังที่สุด
      const cands = [];
      if (isFat) {
        const ws = toParts(watershedSplit(pm.px, w, medDiaPx / 2));
        if (ws.length >= 2) cands.push(ws);
        // band split: แพเม็ดขนานชิดกัน (extent แกนเรียง ≈ k เท่าของ Ø เม็ดปกติ)
        if (kStack >= 2 && Math.abs(stackExt - kStack * medDiaPx) <= 0.6 * medDiaPx) {
          const bd = toParts(bandGroups(pm, w, kStack, stackAlongV));
          if (bd.length >= 2) cands.push(bd);
        }
      }
      // neck split: หัวต่อหัว (มีคอคอดจริง)
      const ng = toParts(neckSplitGroups(pm, w, minCols, 0.6));
      if (ng.length >= 2) cands.push(ng);

      if (!cands.length) return [pm];
      // เลือก: |จำนวนชิ้น − คาดหวัง| น้อยสุด, เสมอกันเลือกชิ้นมากกว่า (แยกครบกว่า)
      cands.sort((a, b) => {
        const da = Math.abs(a.length - expect), db = Math.abs(b.length - expect);
        return da !== db ? da - db : b.length - a.length;
      });

      const out = [];
      for (const p of cands[0]) {
        const sub = split(p, depth + 1);
        for (const s of sub) { s.fromSplit = true; out.push(s); }
      }
      return out;
    }
    return split(blob, 0);
  }

  /**
   * วิเคราะห์ภาพ
   * @param img      HTMLImageElement
   * @param mmPerPx  มม./พิกเซลของภาพต้นฉบับ
   * @param opts     {polarity, minLenMm, maxLenMm, autoSplit}
   */
  function analyze(img, mmPerPx, opts = {}) {
    const { canvas, scale } = toProcCanvas(img);
    const w = canvas.width, h = canvas.height;
    const ctx = canvas.getContext('2d');
    const data = ctx.getImageData(0, 0, w, h).data;
    const mmpp = mmPerPx * scale;

    // ---- grayscale ----
    let gray = new Uint8Array(w * h);
    for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
      gray[i] = (data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114) | 0;
    }

    // ---- แก้แสงไม่สม่ำเสมอ ----
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
    for (let i = 0; i < mask.length; i++) {
      mask[i] = (gray[i] > thr) === fgBright ? 1 : 0;
    }

    mask = erodeDilate(erodeDilate(mask, w, h, 'erode'), w, h, 'dilate');
    mask = fillHoles(mask, w, h);

    // ---- connected components ----
    const minLenMm = opts.minLenMm ?? 2;
    const maxLenMm = opts.maxLenMm ?? 50;
    const autoSplit = opts.autoSplit !== false;
    const minAreaPx = Math.max(20, (minLenMm * minLenMm * 0.4) / (mmpp * mmpp));
    const labels = new Int32Array(w * h);
    const stack = new Int32Array(w * h);
    const accepted = [], rejectedBoxes = [], pendingBig = [];
    let nextLabel = 0, rejectedCount = 0, splitCount = 0;

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
      m.touchBorder = touchBorder;
      m.px = px;

      // ---- ลองแยกเม็ดติดกัน (เฉพาะก้อนที่ยาวเกินปกติและมีคอคอด) ----
      const parts = [];
      if (autoSplit && !touchBorder) {
        const minColsPerPart = Math.max(4, (minLenMm / mmpp) * 0.8);
        const necks = findNecks(m, minColsPerPart);
        if (necks.length >= 1) {
          // แบ่งพิกเซลตามตำแหน่ง u
          const groups = Array.from({ length: necks.length + 1 }, () => []);
          for (const i of px) {
            const dx = (i % w) - m.mx, dy = ((i / w) | 0) - m.my;
            const u = dx * m.cosT + dy * m.sinT;
            const c = Math.round(u - m.uMin);
            let g = 0;
            while (g < necks.length && c > necks[g]) g++;
            groups[g].push(i);
          }
          for (const g of groups) {
            if (g.length >= minAreaPx) {
              const pm = measureComponent(g, w, data);
              pm.px = g;
              pm.fromSplit = true;
              parts.push(pm);
            }
          }
          if (parts.length >= 2) splitCount += parts.length - 1;
        }
      }
      const finals = parts.length >= 2 ? parts : [m];

      for (const f of finals) {
        let lenMm = f.lengthPx * mmpp;
        let diaMm = f.diaPx * mmpp;
        if (lenMm < diaMm) { const t = lenMm; lenMm = diaMm; diaMm = t; }
        f.lenMm = lenMm; f.diaMm = diaMm;
        // solidity กรอง noise รูปร่างผิดปกติ
        const solidity = f.area / (f.lengthPx * Math.max(1, f.diaPx));
        if (lenMm < minLenMm || solidity < 0.4) continue;
        if (finals.length === 1 && touchBorder) {
          rejectedCount++; rejectedBoxes.push(f); continue;
        }
        if (lenMm > maxLenMm) { pendingBig.push(f); continue; }
        accepted.push(f);
      }
    }

    // ---- ขั้นที่ 2: แยกก้อนที่ยังติดกัน (เคียงข้าง/เกาะกลุ่ม/คลัสเตอร์ผสม) ----
    // ใช้ refineBlob (watershed + neck + band แบบ recursive) กับก้อนที่ต้องสงสัย
    if (autoSplit && accepted.length >= 3) {
      const medDiaPx = median(accepted.map(a => a.diaPx));
      const medArea = median(accepted.map(a => a.area));
      const medLenPx = median(accepted.map(a => a.lengthPx));
      const cfg = { minLenMm, maxLenMm, minAreaPx, medDiaPx, medArea, medLenPx };
      const suspects = pendingBig.splice(0);
      // ดึงก้อนที่ "อ้วน" หรือ "พื้นที่ใหญ่ผิดปกติ" ออกจาก accepted มาแยกซ้ำ
      for (let i = accepted.length - 1; i >= 0; i--) {
        const a = accepted[i];
        const fat = a.diaPx > 1.5 * medDiaPx && a.area > 1.5 * medArea;
        const big = a.area > 1.7 * medArea && a.lengthPx > 1.5 * medLenPx;
        if (fat || big) { suspects.push(a); accepted.splice(i, 1); }
      }

      for (const blob of suspects) {
        const parts = refineBlob(blob, w, data, mmpp, cfg);
        if (parts.length >= 2) {
          splitCount += parts.length - 1;
          accepted.push(...parts);
        } else if (blob.lenMm > maxLenMm) {
          rejectedCount++; rejectedBoxes.push(blob);
        } else {
          accepted.push(blob); // เม็ดใหญ่จริง ไม่ใช่เม็ดติดกัน
        }
      }
    } else {
      for (const b of pendingBig) { rejectedCount++; rejectedBoxes.push(b); }
      pendingBig.length = 0;
    }

    for (const f of accepted) {
      if (!f.texture) f.texture = textureMetrics(f.px, w, data);
    }

    // ---- วาดผล ----
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
      octx.strokeStyle = '#ff3b30';
      octx.beginPath();
      octx.moveTo(b.uMin, 0); octx.lineTo(b.uMax, 0);
      octx.stroke();
      octx.restore();
    };
    // เม็ดปกติ = กรอบเหลือง · เม็ดที่ถูกแยกจากก้อนติดกัน = กรอบฟ้า (ตรวจสอบได้)
    accepted.forEach(b => drawBox(b, b.fromSplit ? '#22d3ee' : '#facc15'));
    rejectedBoxes.forEach(b => drawBox(b, 'rgba(255,255,255,.45)'));
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
        texture: b.texture,
        from_split: !!b.fromSplit,
      })),
      rejected: rejectedCount,
      splits: splitCount,
      annotated: out,
      threshold: thr,
    };
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

  return { analyze, computeStats, checkSpec, rgb2lab, deltaE, deltaE2000 };
})();
