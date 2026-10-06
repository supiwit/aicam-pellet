/* ===========================================================
 * analyzer.js — ตรวจจับและวัดขนาดเม็ดอาหารจากภาพถ่าย (pure JS)
 *
 * หลักการ (อ้างอิงการวิเคราะห์ภาพอนุภาค ISO 13322 / ISO 9276-6):
 *  1. ประมาณพื้นหลังเป็นพื้นผิวเรียบแบบ robust → แก้แสงไม่สม่ำเสมอ โดยไม่ถูกวัตถุใหญ่/กองเม็ดดึงค่า
 *  2. แยกเม็ดที่ระดับ "กึ่งกลางระหว่างเม็ดกับพื้น" + morphological open + เติมรู + connected components
 *  3. คัดสิ่งที่ไม่ใช่เม็ดออก: วัตถุใหญ่ในเฟรม (บัตร/มือถือ) และลายพิมพ์บนวัตถุนั้น, ตัวอักษร/วงแหวน,
 *     เม็ดติดกัน (ไม่แยกเม็ด), ชนขอบภาพ, ขนาด/สีที่ผิดจากประชากรเม็ด
 *  4. วัดแต่ละเม็ดแบบ sub-pixel บนภาพความละเอียดสูง: ขอบ = จุดที่ความชันความสว่างสูงสุด
 *     (กึ่งกลางของขอบที่เบลอ — ไม่ขึ้นกับ threshold และไม่กินเงา)
 *       Ø       = ความหนากลางเม็ด ตั้งฉากแกนเม็ด (= Min Feret ของทรงกระบอก)
 *       ความยาว = ระยะปลายถึงปลายตามแนวแกนเม็ด (Feret ตั้งฉากกับ Min Feret, x_LF — แบบเดียวกับวัดด้วยเวอร์เนียร์)
 * =========================================================== */

const Analyzer = (() => {

  const PROC_MAX = 1500;   // ภาพสำหรับแยกเม็ด: ย่อด้านยาวสุดไม่เกินนี้ (ลดภาระมือถือ/กันค้าง)
  const REFINE_MAX = 3000; // ภาพเทาความละเอียดสูงสำหรับวัดขอบแบบ sub-pixel
  const CARD_MM = [85.60, 53.98]; // บัตรมาตรฐาน ISO/IEC 7810 ID-1

  function toProcCanvas(img) {
    const ow = img.naturalWidth || img.width;
    const oh = img.naturalHeight || img.height;
    const s = Math.min(1, PROC_MAX / Math.max(ow, oh));
    const w = Math.round(ow * s), h = Math.round(oh * s);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0, w, h);
    return { canvas: c, scale: ow / w };
  }

  const LUMA = { wts: [0.299, 0.587, 0.114], off: 0 };

  /**
   * ระนาบค่าเดี่ยวความละเอียดสูงสำหรับวัดขอบ: g = off + wR·R + wG·G + wB·B (ตัดช่วง 0..255)
   * ค่าเริ่ม = ความสว่าง (LUMA) · อ่านเป็นแถบ ไม่กินหน่วยความจำ · rs = พิกเซล hi ต่อ 1 พิกเซล proc
   */
  function toHiPlane(img, pw, ph, pdata, plane = LUMA) {
    const [wr, wg, wb] = plane.wts, off = plane.off + 0.5;
    const conv = (d, g, o, n) => {
      for (let i = 0, p = 0; i < n; i++, p += 4) {
        const t = off + wr * d[p] + wg * d[p + 1] + wb * d[p + 2];
        g[o + i] = t < 0 ? 0 : t > 255 ? 255 : t;
      }
    };
    const ow = img.naturalWidth || img.width, oh = img.naturalHeight || img.height;
    const s = Math.min(1, REFINE_MAX / Math.max(ow, oh));
    const hw = Math.round(ow * s), hh = Math.round(oh * s);
    if (hw < pw * 1.2) {                                   // ภาพเล็กอยู่แล้ว → ใช้ภาพ proc
      const g = new Uint8Array(pw * ph);
      conv(pdata, g, 0, pw * ph);
      return { g, w: pw, h: ph, rs: 1, rsx: 1, rsy: 1 };
    }
    const c = document.createElement('canvas');
    c.width = hw; c.height = hh;
    const cx = c.getContext('2d', { willReadFrequently: true });
    cx.imageSmoothingQuality = 'high';
    cx.drawImage(img, 0, 0, hw, hh);
    const g = new Uint8Array(hw * hh);
    const STRIP = 256;
    for (let y0 = 0; y0 < hh; y0 += STRIP) {
      const n = Math.min(STRIP, hh - y0);
      conv(cx.getImageData(0, y0, hw, n).data, g, y0 * hw, hw * n);
    }
    c.width = c.height = 0;                                // คืนหน่วยความจำ canvas
    return { g, w: hw, h: hh, rs: (hw / pw + hh / ph) / 2, rsx: hw / pw, rsy: hh / ph };
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

  /** least squares: v ≈ c0 + c1·x + c2·y + c3·x² + c4·xy + c5·y² (เฉพาะจุดที่ use=1) */
  function lsqQuad(X, Y, V, use) {
    const A = new Float64Array(36), B = new Float64Array(6), f = new Float64Array(6);
    let cnt = 0;
    for (let i = 0; i < V.length; i++) {
      if (!use[i]) continue;
      const x = X[i], y = Y[i];
      f[0] = 1; f[1] = x; f[2] = y; f[3] = x * x; f[4] = x * y; f[5] = y * y;
      for (let a = 0; a < 6; a++) {
        B[a] += f[a] * V[i];
        for (let b = a; b < 6; b++) A[a * 6 + b] += f[a] * f[b];
      }
      cnt++;
    }
    if (cnt < 40) return null;
    for (let a = 1; a < 6; a++) for (let b = 0; b < a; b++) A[a * 6 + b] = A[b * 6 + a];
    for (let c = 0; c < 6; c++) {                          // Gauss–Jordan + partial pivot
      let pv = c;
      for (let r = c + 1; r < 6; r++) if (Math.abs(A[r * 6 + c]) > Math.abs(A[pv * 6 + c])) pv = r;
      if (Math.abs(A[pv * 6 + c]) < 1e-9) return null;
      if (pv !== c) {
        for (let k = 0; k < 6; k++) { const t = A[c * 6 + k]; A[c * 6 + k] = A[pv * 6 + k]; A[pv * 6 + k] = t; }
        const t = B[c]; B[c] = B[pv]; B[pv] = t;
      }
      const d = A[c * 6 + c];
      for (let k = 0; k < 6; k++) A[c * 6 + k] /= d;
      B[c] /= d;
      for (let r = 0; r < 6; r++) {
        if (r === c) continue;
        const m = A[r * 6 + c];
        if (!m) continue;
        for (let k = 0; k < 6; k++) A[r * 6 + k] -= m * A[c * 6 + k];
        B[r] -= m * B[c];
      }
    }
    return Array.from(B);
  }
  const quad = (c, x, y) => c[0] + c[1] * x + c[2] * y + c[3] * x * x + c[4] * x * y + c[5] * y * y;

  /**
   * พื้นหลัง (กระดาษ/ผ้า) เป็นพื้นผิวกำลังสอง fit แบบ robust ต่อช่องสี
   * — พื้นหลัง = ส่วนใหญ่ของภาพ; วัตถุ/เงา/เม็ดถูกตัดออกจากการ fit ด้วย residual (MAD)
   */
  function fitBackground(data, w, h) {
    const step = Math.max(4, Math.round(Math.max(w, h) / 200));
    const nx = Math.floor((w - 1) / step) + 1, ny = Math.floor((h - 1) / step) + 1, n = nx * ny;
    const X = new Float32Array(n), Y = new Float32Array(n);
    const R = new Float32Array(n), G = new Float32Array(n), B = new Float32Array(n), L = new Float32Array(n);
    const hist = new Uint32Array(256);
    for (let j = 0, k = 0; j < ny; j++) for (let i = 0; i < nx; i++, k++) {
      const x = i * step, y = j * step, p = (y * w + x) * 4;
      X[k] = 2 * x / w - 1; Y[k] = 2 * y / h - 1;
      R[k] = data[p]; G[k] = data[p + 1]; B[k] = data[p + 2];
      L[k] = R[k] * 0.299 + G[k] * 0.587 + B[k] * 0.114;
      hist[L[k] | 0]++;
    }
    let mode = 128, best = -1;                             // ยอดฮิสโตแกรม (หน้าต่าง ±6)
    for (let t = 0; t < 256; t++) {
      let s = 0;
      for (let d = -6; d <= 6; d++) if (t + d >= 0 && t + d < 256) s += hist[t + d];
      if (s > best) { best = s; mode = t; }
    }
    const use = new Uint8Array(n);
    for (let i = 0; i < n; i++) use[i] = Math.abs(L[i] - mode) < 0.22 * mode + 14 ? 1 : 0;
    const flat = (V) => { let s = 0, c = 0; for (let i = 0; i < n; i++) if (use[i]) { s += V[i]; c++; } return [c ? s / c : mode, 0, 0, 0, 0, 0]; };
    let fit = { L: [mode, 0, 0, 0, 0, 0], R: flat(R), G: flat(G), B: flat(B) };
    const rL = new Float32Array(n), rQ = new Float32Array(n), tmp = new Float32Array(n);
    const med = (src) => { let m = 0; for (let i = 0; i < n; i++) if (use[i]) tmp[m++] = src[i]; return m ? tmp.subarray(0, m).sort()[m >> 1] : 0; };
    for (let it = 0; it < 5; it++) {
      const cL = lsqQuad(X, Y, L, use), cR = lsqQuad(X, Y, R, use), cG = lsqQuad(X, Y, G, use), cB = lsqQuad(X, Y, B, use);
      if (!cL || !cR || !cG || !cB) break;
      // residual: ความสว่าง + สีเพี้ยน (วัตถุสีอ่อน เช่น บัตรสีครีมบนกระดาษขาว สว่างพอๆ กับพื้นแต่ "สี" ต่าง)
      for (let i = 0; i < n; i++) {
        rL[i] = Math.abs(L[i] - quad(cL, X[i], Y[i]));
        const rr = R[i] / Math.max(8, quad(cR, X[i], Y[i])), gg = G[i] / Math.max(8, quad(cG, X[i], Y[i])), bb = B[i] / Math.max(8, quad(cB, X[i], Y[i]));
        const k = (rr + gg + bb) / 3;
        rQ[i] = Math.max(Math.abs(rr - k), Math.abs(gg - k), Math.abs(bb - k));
      }
      const tolL = Math.max(6, 3.2 * 1.4826 * med(rL));
      const tolQ = mode >= 80 ? Math.max(0.03, 3.2 * 1.4826 * med(rQ)) : Infinity;   // พื้นเข้ม: อัตราส่วนสีไม่นิ่ง ไม่ใช้
      const next = new Uint8Array(n);
      let cnt = 0;
      for (let i = 0; i < n; i++) { next[i] = (rL[i] < tolL && rQ[i] < tolQ) ? 1 : 0; cnt += next[i]; }
      fit = { L: cL, R: cR, G: cG, B: cB };
      if (cnt < n * 0.2) break;                            // inlier น้อยเกิน → หยุด ใช้ fit รอบนี้
      use.set(next);
      if (it === 4) {                                      // fit ครั้งสุดท้ายด้วย inlier ชุดสุดท้าย
        const fL = lsqQuad(X, Y, L, use), fR = lsqQuad(X, Y, R, use), fG = lsqQuad(X, Y, G, use), fB = lsqQuad(X, Y, B, use);
        if (fL && fR && fG && fB) fit = { L: fL, R: fR, G: fG, B: fB };
      }
    }
    return { ...fit, level: mode };
  }

  /**
   * ปรับภาพเทียบพื้นหลัง:
   *  v  = ความสว่างสัมพัทธ์ (128 = พื้นหลัง, <128 มืดกว่า, >128 สว่างกว่า — สมมาตร ใช้ได้ทั้งพื้นขาว/พื้นเข้ม)
   *  nb = "ไม่ใช่พื้นและไม่ใช่เงา" (สีเพี้ยนจากพื้น หรือมืด/สว่างเกินกว่าที่เงาจะทำได้) → ใช้หาวัตถุใหญ่ในเฟรม
   *       บิต 2 = สีเพี้ยนจากพื้นชัดเจน (เงาไม่มีบิตนี้)
   */
  function normalize(data, w, h) {
    const bg = fitBackground(data, w, h);
    const N = w * h;
    const v = new Uint8Array(N), nb = new Uint8Array(N);
    const lightBg = bg.level >= 80;
    const lo = bg.level * 0.45, hi = bg.level * 1.6 + 10;  // กัน extrapolate หลุดช่วง
    const clampBg = t => t < lo ? lo : t > hi ? hi : t;
    const row = (c, yn) => [c[0] + c[2] * yn + c[5] * yn * yn, c[1] + c[4] * yn, c[3]];
    for (let y = 0, i = 0, p = 0; y < h; y++) {
      const yn = 2 * y / h - 1;
      const qL = row(bg.L, yn), qR = row(bg.R, yn), qG = row(bg.G, yn), qB = row(bg.B, yn);
      for (let x = 0; x < w; x++, i++, p += 4) {
        const xn = 2 * x / w - 1;
        const bl = clampBg(qL[0] + xn * (qL[1] + xn * qL[2]));
        const r = data[p], g = data[p + 1], b = data[p + 2];
        const lum = r * 0.299 + g * 0.587 + b * 0.114;
        const vv = lum < bl ? 128 - 127 * (bl - lum) / Math.max(bl, 24) : 128 + 127 * (lum - bl) / Math.max(lum, 24);
        v[i] = vv;
        if (lightBg) {
          const rr = r / Math.max(8, qR[0] + xn * (qR[1] + xn * qR[2]));
          const gg = g / Math.max(8, qG[0] + xn * (qG[1] + xn * qG[2]));
          const bb = b / Math.max(8, qB[0] + xn * (qB[1] + xn * qB[2]));
          const k = (rr + gg + bb) / 3;
          const q = Math.max(Math.abs(rr - k), Math.abs(gg - k), Math.abs(bb - k));
          nb[i] = ((q > 0.075 || k < 0.5 || k > 1.18) ? 1 : 0) | (q > 0.09 ? 2 : 0);
        } else {
          nb[i] = Math.abs(vv - 128) > 45 ? 1 : 0;
        }
      }
    }
    return { v, nb, bg, lightBg };
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

  /** ระยะ chamfer 3-4 (หน่วย ≈ px×3) จากพิกเซล 1 ไปยังพิกเซล 0 ที่ใกล้สุด — นอกภาพถือว่าเป็น 1 */
  function chamfer(mask, w, h) {
    const d = new Uint16Array(w * h), INF = 60000;
    for (let i = 0; i < d.length; i++) d[i] = mask[i] ? INF : 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let m = d[i];
      if (!m) continue;
      if (x > 0 && d[i - 1] + 3 < m) m = d[i - 1] + 3;
      if (y > 0) {
        if (d[i - w] + 3 < m) m = d[i - w] + 3;
        if (x > 0 && d[i - w - 1] + 4 < m) m = d[i - w - 1] + 4;
        if (x < w - 1 && d[i - w + 1] + 4 < m) m = d[i - w + 1] + 4;
      }
      d[i] = m;
    }
    for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      let m = d[i];
      if (!m) continue;
      if (x < w - 1 && d[i + 1] + 3 < m) m = d[i + 1] + 3;
      if (y < h - 1) {
        if (d[i + w] + 3 < m) m = d[i + w] + 3;
        if (x < w - 1 && d[i + w + 1] + 4 < m) m = d[i + w + 1] + 4;
        if (x > 0 && d[i + w - 1] + 4 < m) m = d[i + w - 1] + 4;
      }
      d[i] = m;
    }
    return d;
  }

  /** connected components (4 ทิศ) → [{px, touchBorder}] เฉพาะก้อนที่มีพิกเซล ≥ minArea */
  function components(mask, w, h, minArea) {
    const N = w * h;
    const seen = new Uint8Array(N), stack = new Int32Array(N);
    const out = [];
    for (let start = 0; start < N; start++) {
      if (!mask[start] || seen[start]) continue;
      let sp = 0;
      stack[sp++] = start; seen[start] = 1;
      const px = [];
      let touchBorder = false;
      while (sp > 0) {
        const i = stack[--sp];
        px.push(i);
        const x = i % w, y = (i / w) | 0;
        // open (erode→dilate) ทำให้แถว/คอลัมน์ริมสุดเป็น 0 เสมอ → ถือว่าชนขอบเมื่ออยู่ห่างขอบ ≤ 1 px
        if (x <= 1 || y <= 1 || x >= w - 2 || y >= h - 2) touchBorder = true;
        if (x > 0     && mask[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; stack[sp++] = i - 1; }
        if (x < w - 1 && mask[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; stack[sp++] = i + 1; }
        if (y > 0     && mask[i - w] && !seen[i - w]) { seen[i - w] = 1; stack[sp++] = i - w; }
        if (y < h - 1 && mask[i + w] && !seen[i + w]) { seen[i + w] = 1; stack[sp++] = i + w; }
      }
      if (px.length >= minArea) out.push({ px, touchBorder });
    }
    return out;
  }

  /**
   * บริเวณ "วัตถุใหญ่ที่ไม่ใช่เม็ด" (บัตร/มือถือ/กองเม็ดหนา): กัดกร่อน nb ด้วยรัศมี re แล้วเก็บก้อนที่ยังใหญ่
   * → ขยายกลับ สิ่งที่อยู่ในบริเวณนี้ (ลายพิมพ์/ตัวเลขบนบัตร) จะไม่ถูกนับเป็นเม็ด
   */
  function objectZones(nb, w, h, re, minArea) {
    // ทำบนกริดหยาบ 1/4 (เสียงข้างมากต่อช่อง) → ทน noise ของ nb และเร็วขึ้น 16 เท่า
    const Z = 4, zw = Math.ceil(w / Z), zh = Math.ceil(h / Z), ZN = zw * zh;
    const cnt = new Uint8Array(ZN), tot = new Uint8Array(ZN);
    for (let y = 0, i = 0; y < h; y++) {
      const zy = ((y / Z) | 0) * zw;
      for (let x = 0; x < w; x++, i++) { const z = zy + ((x / Z) | 0); tot[z]++; if (nb[i]) cnt[z]++; }
    }
    const small = new Uint8Array(ZN);
    let any = false;
    for (let z = 0; z < ZN; z++) if (cnt[z] * 2 >= tot[z]) { small[z] = 1; any = true; }
    if (!any) return null;
    const rz = Math.max(1, re / Z);
    const d1 = chamfer(small, zw, zh);
    const core = new Uint8Array(ZN);
    for (let z = 0; z < ZN; z++) core[z] = d1[z] > rz * 3 ? 1 : 0;
    const big = new Uint8Array(ZN).fill(1);                // 1 = ยังไม่ใช่วัตถุใหญ่ (สำหรับ chamfer รอบสอง)
    let found = false;
    for (const c of components(core, zw, zh, Math.max(4, minArea / (Z * Z)))) { found = true; for (const i of c.px) big[i] = 0; }
    if (!found) return null;
    const d2 = chamfer(big, zw, zh);
    let zone = new Uint8Array(ZN);
    const lim = (rz + 1) * 3;
    for (let z = 0; z < ZN; z++) zone[z] = d2[z] <= lim ? 1 : 0;
    zone = fillHoles(zone, zw, zh);                        // ส่วนสีกลางๆ ที่ถูกล้อม (ช่องลายเซ็น/ชิป) นับเป็นวัตถุด้วย
    return { has: (x, y) => zone[((y / Z) | 0) * zw + ((x / Z) | 0)] === 1 };
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

  /** มัธยฐานถ่วงน้ำหนัก (ใช้พื้นที่เป็นน้ำหนัก → ไม่ถูกเศษ/ตัวอักษรชิ้นเล็กจำนวนมากดึงค่า) */
  function weightedMedian(vals, wts) {
    const idx = vals.map((_, i) => i).sort((a, b) => vals[a] - vals[b]);
    const total = wts.reduce((s, x) => s + x, 0);
    let acc = 0;
    for (const i of idx) { acc += wts[i]; if (acc >= total / 2) return vals[i]; }
    return vals.length ? vals[idx[idx.length - 1]] : 0;
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

  function polyPerimeter(h) {
    let p = 0;
    for (let i = 0; i < h.length; i++) {
      const j = (i + 1) % h.length;
      p += Math.hypot(h[i][0] - h[j][0], h[i][1] - h[j][1]);
    }
    return p;
  }

  function pointInPoly(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  /**
   * Feret diameters (ISO 9276-6) จาก convex hull:
   *  - maxFeret = ระยะคาลิปเปอร์สูงสุด
   *  - minFeret = ความกว้างคาลิปเปอร์ต่ำสุด, minDir = ทิศของขอบ hull ที่ให้ความกว้างต่ำสุด (= แนวแกนยาวของเม็ด)
   */
  function feret(hull) {
    let maxF = 0;
    for (let i = 0; i < hull.length; i++) {
      for (let j = i + 1; j < hull.length; j++) {
        const d = Math.hypot(hull[i][0] - hull[j][0], hull[i][1] - hull[j][1]);
        if (d > maxF) maxF = d;
      }
    }
    let minF = Infinity, minDir = [1, 0];
    for (let i = 0; i < hull.length; i++) {
      const a = hull[i], b = hull[(i + 1) % hull.length];
      let ex = b[0] - a[0], ey = b[1] - a[1];
      const el = Math.hypot(ex, ey);
      if (el < 1e-9) continue;
      ex /= el; ey /= el;
      let mn = Infinity, mx = -Infinity;
      for (const p of hull) {
        const proj = -ey * (p[0] - a[0]) + ex * (p[1] - a[1]);
        if (proj < mn) mn = proj; if (proj > mx) mx = proj;
      }
      if (mx - mn < minF) { minF = mx - mn; minDir = [ex, ey]; }
    }
    if (!isFinite(minF)) minF = 0;
    return { maxFeret: maxF, minFeret: minF, minDir };
  }

  /**
   * รูปทรงคร่าวๆ ของก้อนพิกเซล (ระดับพิกเซล): จุดศูนย์กลาง, แกนเม็ด, ขอบเขตตามแกน, solidity, ความขรุขระ
   * แกนเม็ด = แกนหลัก PCA เมื่อเม็ดยาวชัดเจน, ไม่งั้นใช้ทิศของ Min Feret (เม็ดสั้น/กลม PCA ไม่เสถียร)
   */
  function measureShape(px, w) {
    const n = px.length;
    let minY = 1e9, maxY = -1e9, sx = 0, sy = 0;
    for (let k = 0; k < n; k++) {
      const i = px[k], y = (i / w) | 0;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      sx += i % w; sy += y;
    }
    const mx = sx / n, my = sy / n, H = maxY - minY + 1;
    const rowMin = new Int32Array(H).fill(2147483647);
    const rowMax = new Int32Array(H).fill(-2147483648);
    let sxx = 0, syy = 0, sxy = 0;
    for (let k = 0; k < n; k++) {
      const i = px[k], x = i % w, y = (i / w) | 0, r = y - minY;
      if (x < rowMin[r]) rowMin[r] = x;
      if (x > rowMax[r]) rowMax[r] = x;
      const dx = x - mx, dy = y - my;
      sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
    }
    // จุดสำหรับ convex hull = ขอบซ้าย/ขวาของแต่ละแถว
    const hullPts = [];
    for (let r = 0; r < H; r++) {
      if (rowMin[r] <= rowMax[r]) {
        hullPts.push([rowMin[r], minY + r]);
        if (rowMax[r] !== rowMin[r]) hullPts.push([rowMax[r], minY + r]);
      }
    }
    const hull = convexHull(hullPts);
    const f = feret(hull);
    // hull ลากผ่าน "จุดกึ่งกลางพิกเซล" → ชดเชยขอบครึ่งพิกเซลรอบรูป ให้ solidity ของก้อนเล็กไม่เกินจริง
    const hullArea = polyArea(hull) + polyPerimeter(hull) / 2 + 1;
    const solidity = Math.min(1, n / hullArea);

    const tr = sxx + syy, det = sxx * syy - sxy * sxy;
    const disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
    const l1 = tr / 2 + disc, l2 = Math.max(1e-6, tr / 2 - disc);
    let cosT, sinT;
    if (Math.sqrt(l1 / l2) >= 1.25) {
      const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
      cosT = Math.cos(th); sinT = Math.sin(th);
    } else {
      cosT = f.minDir[0]; sinT = f.minDir[1];
    }

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
      mx, my, cosT, sinT, uMin, uMax, vMin, vMax, hull,
      lenC: uMax - uMin + 1,            // ขอบเขตตามแกนเม็ด (px)
      diaC: vMax - vMin + 1,            // ขอบเขตตั้งฉากแกน (px)
      minFeret: f.minFeret + 1, maxFeret: f.maxFeret + 1,
      solidity, roughnessPct, area: n,
    };
  }

  /** สุ่มค่าความสว่างแบบ bilinear บนภาพ hi (รับพิกัด proc) */
  function sampler(H) {
    const g = H.g, w = H.w, h = H.h, rsx = H.rsx, rsy = H.rsy;
    return (px, py) => {
      let x = (px + 0.5) * rsx - 0.5, y = (py + 0.5) * rsy - 0.5;
      if (x < 0) x = 0; else if (x > w - 1.001) x = w - 1.001;
      if (y < 0) y = 0; else if (y > h - 1.001) y = h - 1.001;
      const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0, i = y0 * w + x0;
      return (g[i] * (1 - fx) + g[i + 1] * fx) * (1 - fy) + (g[i + w] * (1 - fx) + g[i + w + 1] * fx) * fy;
    };
  }

  /**
   * หาขอบแบบ sub-pixel ตามแนวรังสี = ตำแหน่งที่ความชันความสว่างสูงสุด (กึ่งกลางของขอบที่เบลอ)
   * (x0,y0) จุดตั้งต้นพิกัด proc · (dx,dy) ทิศออกนอกวัตถุ · sA ระยะขอบคร่าวๆ · W ครึ่งหน้าต่างค้นหา (proc px)
   * pol: +1 = ออกนอกแล้วสว่างขึ้น (เม็ดเข้มบนพื้นอ่อน), -1 = มืดลง, 0 = ไม่ทราบ (ใช้ค่าสัมบูรณ์)
   * @returns {s ระยะขอบ (proc px), sigma ความเบลอของขอบ (hi px)} หรือ null
   */
  function edgeAlong(at, rs, x0, y0, dx, dy, sA, W, pol, lock = W) {
    const step = 0.5 / rs;                                 // 0.5 hi px
    const s0 = Math.max(0, sA - W), n = Math.floor((sA + W - s0) / step) + 1;
    if (n < 7) return null;
    // จุดยอดต้องอยู่ในระยะ lock จาก sA (หน้าต่างที่กว้างกว่านั้นใช้ดูช่วงราบสองข้างเท่านั้น)
    const lo = Math.max(1, Math.ceil((sA - lock - s0) / step)), hi = Math.min(n - 2, Math.floor((sA + lock - s0) / step));
    const tx = -dy * 0.75 / rs, ty = dx * 0.75 / rs;       // เฉลี่ย 3 เส้นขนาน ลด noise
    const raw = new Float32Array(n), sm = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const s = s0 + i * step, x = x0 + dx * s, y = y0 + dy * s;
      raw[i] = (at(x, y) * 2 + at(x + tx, y + ty) + at(x - tx, y - ty)) / 4;
    }
    sm[0] = raw[0]; sm[n - 1] = raw[n - 1];
    for (let i = 1; i < n - 1; i++) sm[i] = (raw[i - 1] + 2 * raw[i] + raw[i + 1]) / 4;
    const G = new Float32Array(n);                         // ความชัน (ระดับเทาต่อ 1 hi px)
    let bi = -1, bg = 0;
    for (let i = 1; i < n - 1; i++) {
      const g = sm[i + 1] - sm[i - 1];
      G[i] = pol ? pol * g : Math.abs(g);
      if (i >= lo && i <= hi && G[i] > bg) { bg = G[i]; bi = i; }
    }
    if (bi < 0 || bg < 2.4) return null;                   // ไม่มีขอบชัด (ความชัน < ~2.4 ระดับเทา/px)
    const atLimit = bi <= lo || bi >= hi;
    // ขอบ Gaussian: ความชันสูงสุด = Δ/(σ√2π) → σ = Δ/(g·√2π)
    let sigma = Math.abs(sm[n - 1] - sm[0]) / (bg * 2.5066);
    // ถอดทางลาดนอกขอบ (เงา/แสงไล่ระดับ) ที่ดึงจุดยอดความชันออกนอก: ลบแนวโน้มเชิงเส้นของความชัน
    // ที่ประมาณจากช่วงราบ "ในเม็ด" และ "นอกขอบ" (ห่างจุดยอด ~2.5σ) แล้วหาจุดยอดซ้ำ
    const ks = Math.max(3, Math.round(5 * sigma)), seg = 3;
    const i0 = bi - ks - seg, i1 = bi + ks;
    const wantW = (i0 >= 1 && i1 + seg <= n - 2) ? 0 : (ks + seg + 3) * step;   // หน้าต่างแคบไป → ขอค้นซ้ำให้กว้างพอ
    if (!wantW) {
      let gi = 0, go = 0;
      for (let k = 0; k < seg; k++) { gi += G[i0 + k]; go += G[i1 + k]; }
      gi /= seg; go /= seg;
      const ci = i0 + 1, co = i1 + 1;
      sigma = Math.abs(sm[co] - sm[ci]) / (bg * 2.5066);
      const from = bi - ks, to = bi + ks;                  // ช่วงคงที่รอบจุดยอดเดิม (bi เปลี่ยนในลูป)
      bg = 0;
      for (let i = from; i <= to; i++) {
        G[i] -= gi + (go - gi) * (i - ci) / (co - ci);
        if (G[i] > bg) { bg = G[i]; bi = i; }
      }
    }
    let d = 0;
    if (bi > 1 && bi < n - 2) {
      const a = G[bi - 1], c = G[bi + 1], den = a - 2 * bg + c;
      if (den < 0) d = Math.max(-0.5, Math.min(0.5, 0.5 * (a - c) / den));
    }
    return { s: s0 + (bi + d) * step, sigma, atLimit, wantW };
  }

  /** เดินจากนอกเข้าใน หาพิกเซลแรกที่เป็นของก้อนนี้ → ระยะขอบคร่าวๆ จากจุดตั้งต้น (proc px) */
  function anchorDist(alab, w, h, id, x0, y0, dx, dy, sMax) {
    for (let s = sMax; s >= 0; s -= 0.5) {
      const x = Math.round(x0 + dx * s), y = Math.round(y0 + dy * s);
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      if (alab[y * w + x] === id) return s + 0.5;
    }
    return -1;
  }

  /**
   * วัดเม็ดแบบ sub-pixel บนภาพความละเอียดสูง
   *  Ø       = ค่ากลางของความหนา (ตั้งฉากแกน) ช่วงกลางเม็ด
   *  ความยาว = ระยะปลายถึงปลายตามแนวแกน (เส้นขนานแกนช่วงกลางความหนา)
   * @returns {L, D, cx, cy, ax, ay, sigma} หน่วย proc px หรือ null ถ้าหาขอบไม่ได้
   */
  function refinePellet(sh, id, S) {
    const { alab, w, h, at, rs, pol } = S;
    let cx = sh.mx, cy = sh.my, ax = sh.cosT, ay = sh.sinT;
    const Lc = sh.lenC, Dc = sh.diaC;
    const elong = Lc / Math.max(1, Dc);
    const W = Math.min(4, Math.max(2, 0.3 * Dc));
    const find = (px, py, dx, dy, sMax) => {
      const a = anchorDist(alab, w, h, id, px, py, dx, dy, sMax);
      if (a < 0) return null;
      let e = edgeAlong(at, rs, px, py, dx, dy, a, W, pol);
      if (e && e.atLimit) e = edgeAlong(at, rs, px, py, dx, dy, a, W * 1.7, pol) || e;
      // ขอบเบลอกว้างกว่าหน้าต่าง → ขยายหน้าต่างให้เห็นช่วงราบสองข้าง โดยล็อกจุดยอดไว้ใกล้ตำแหน่งเดิม
      if (e && e.wantW > W) e = edgeAlong(at, rs, px, py, dx, dy, e.s, Math.min(9, e.wantW), pol, Math.max(1, W / 2)) || e;
      return e;
    };
    let sig = [], widths = [];
    for (let pass = 0; pass < 2; pass++) {
      const nx = -ay, ny = ax;
      const band = (elong >= 1.4 ? 0.6 : 0.24) * Lc, NW = 9;
      const us = [], mids = [];
      widths = []; sig = [];
      for (let j = 0; j < NW; j++) {
        const u = (j / (NW - 1) - 0.5) * band;
        const px = cx + ax * u, py = cy + ay * u;
        const e1 = find(px, py, nx, ny, Dc / 2 + 4), e2 = find(px, py, -nx, -ny, Dc / 2 + 4);
        if (!e1 || !e2) continue;
        widths.push(e1.s + e2.s); mids.push((e1.s - e2.s) / 2); us.push(u);
        sig.push(e1.sigma, e2.sigma);
      }
      if (widths.length < 4) return null;
      // เส้นกึ่งกลางเม็ด: ระยะเยื้อง m ≈ a + b·u → ขยับศูนย์กลาง + หมุนแกนให้ขนานเม็ดจริง
      const mu = us.reduce((s, x) => s + x, 0) / us.length, mm = mids.reduce((s, x) => s + x, 0) / mids.length;
      let num = 0, den = 0;
      for (let k = 0; k < us.length; k++) { num += (us[k] - mu) * (mids[k] - mm); den += (us[k] - mu) ** 2; }
      const slope = den > 0 ? num / den : 0;
      cx += nx * (mm - slope * mu); cy += ny * (mm - slope * mu);
      if (pass === 0 && elong >= 1.4 && Math.abs(slope) > 0.004) {
        const rx = ax + slope * nx, ry = ay + slope * ny, rl = Math.hypot(rx, ry);
        ax = rx / rl; ay = ry / rl;
        continue;
      }
      break;
    }
    widths.sort((a, b) => a - b);
    let midW;
    if (elong >= 1.4) {                                    // เม็ดยาว (ทรงกระบอก): ค่ากลางของความหนา ตัดหัวท้าย 25%
      const q = Math.floor(widths.length / 4);
      midW = widths.slice(q, widths.length - q);
    } else {                                               // เม็ดสั้น/กลม: ความหนาสูงสุดช่วงกลาง (แกนสั้นของวงรี)
      midW = widths.slice(-3);
    }
    const D = midW.reduce((s, x) => s + x, 0) / midW.length;

    const nx = -ay, ny = ax, NL = 7;
    const vv = [], ll = [];
    let shift = 0;
    for (let j = 0; j < NL; j++) {
      const vOff = (j / (NL - 1) - 0.5) * 0.6 * D;
      const px = cx + nx * vOff, py = cy + ny * vOff;
      const e1 = find(px, py, ax, ay, Lc / 2 + 4), e2 = find(px, py, -ax, -ay, Lc / 2 + 4);
      if (!e1 || !e2) continue;
      vv.push(vOff); ll.push(e1.s + e2.s); shift += (e1.s - e2.s) / 2;
    }
    if (ll.length < 3) return null;
    shift /= ll.length;
    cx += ax * shift; cy += ay * shift;
    return { L: profileMax(vv, ll), D, cx, cy, ax, ay, sigma: median(sig) };
  }

  /**
   * ความยาวปลายถึงปลาย = ค่าสูงสุดของพาราโบลาที่ fit กับความยาวของเส้นขนานแกน l(v)
   * (ปลายมน → เส้นกลางยาวสุด · ปลายตัดตรง → ยาวเท่ากันทุกเส้น) — ทน noise กว่าการเลือกเส้นที่ยาวสุดเส้นเดียว
   */
  function profileMax(vs, ls) {
    const n = vs.length;
    let s0 = n, s1 = 0, s2 = 0, s3 = 0, s4 = 0, t0 = 0, t1 = 0, t2 = 0;
    for (let i = 0; i < n; i++) {
      const v = vs[i], v2 = v * v;
      s1 += v; s2 += v2; s3 += v2 * v; s4 += v2 * v2;
      t0 += ls[i]; t1 += ls[i] * v; t2 += ls[i] * v2;
    }
    const mean = t0 / n;
    const det = s4 * (s2 * s0 - s1 * s1) - s3 * (s3 * s0 - s1 * s2) + s2 * (s3 * s1 - s2 * s2);
    if (n < 4 || Math.abs(det) < 1e-9) return mean;
    const a = (t2 * (s2 * s0 - s1 * s1) - s3 * (t1 * s0 - s1 * t0) + s2 * (t1 * s1 - s2 * t0)) / det;
    const b = (s4 * (t1 * s0 - s1 * t0) - t2 * (s3 * s0 - s1 * s2) + s2 * (s3 * t0 - t1 * s2)) / det;
    const c = (s4 * (s2 * t0 - t1 * s1) - s3 * (s3 * t0 - t1 * s2) + t2 * (s3 * s1 - s2 * s2)) / det;
    const f = v => a * v * v + b * v + c;
    const lo = Math.min(...vs), hi = Math.max(...vs);
    let rss = 0;
    for (let i = 0; i < n; i++) rss += (ls[i] - f(vs[i])) ** 2;
    // โค้งน้อยกว่าระดับ noise = ปลายตัดตรง → ใช้ค่าเฉลี่ย (ไม่เอนเอียงขึ้นเพราะเลือกค่าสูงสุดจาก noise)
    const sag = Math.abs(a) * (hi - lo) * (hi - lo) / 4;
    if (a >= 0 || sag < Math.max(0.35, 2 * Math.sqrt(rss / n))) return mean;
    const vx = -b / (2 * a);
    return vx > lo && vx < hi ? f(vx) : Math.max(f(lo), f(hi));
  }

  /**
   * วิเคราะห์ภาพ: แยกเม็ด → คัดสิ่งที่ไม่ใช่เม็ด → วัดแบบ sub-pixel
   *  - "ไม่แยก" เม็ดที่ติดกัน แต่ "คัดออก" จากการวัด (agglomerate rejection) ด้วย solidity/ขนาดเทียบ median ประชากร
   *  - เม็ดที่ชนขอบภาพถูกคัดออก (วัดไม่ครบ)
   * @param opts {polarity, minLenMm, maxLenMm, maxAspect, autoSplit(=คัดเม็ดติดกัน),
   *              exclude: [[ [x,y],... ]] รูปหลายเหลี่ยม (พิกัดภาพต้นฉบับ) ของวัตถุอ้างอิงที่ไม่ต้องนับ}
   */
  function analyze(img, mmPerPx, opts = {}) {
    const { canvas, scale } = toProcCanvas(img);
    const w = canvas.width, h = canvas.height, N = w * h;
    const ctx = canvas.getContext('2d');
    const data = ctx.getImageData(0, 0, w, h).data;
    const mmpp = mmPerPx * scale;

    const { v, nb, bg, lightBg } = normalize(data, w, h);

    // ---- ขั้ว (เม็ดเข้ม/สว่างกว่าพื้น) + ระดับตัด = กึ่งกลางระหว่างระดับเม็ดกับพื้น ----
    const hist = new Uint32Array(256);
    for (let i = 0; i < N; i++) hist[v[i]]++;
    let dark = 0, bright = 0;
    for (let t = 0; t <= 88; t++) dark += hist[t];
    for (let t = 168; t < 256; t++) bright += hist[t];
    let fgBright = opts.polarity === 'dark' ? true : opts.polarity === 'light' ? false : bright > dark;
    let thr;
    const tail = fgBright ? bright : dark;
    if (tail >= N * 0.0003) {
      let acc = 0, vf = fgBright ? 255 : 0;
      if (fgBright) { for (let t = 255; t >= 168; t--) { acc += hist[t]; if (acc >= tail / 2) { vf = t; break; } } }
      else { for (let t = 0; t <= 88; t++) { acc += hist[t]; if (acc >= tail / 2) { vf = t; break; } } }
      thr = (vf + 128) / 2;
    } else {                                               // คอนทราสต์ต่ำ → Otsu
      thr = otsu(hist, N);
      if (opts.polarity !== 'dark' && opts.polarity !== 'light') {
        let b = 0;
        for (let t = thr + 1; t < 256; t++) b += hist[t];
        fgBright = b < N - b;
      }
    }
    // ---- แยกเม็ด: mask → open → เติมรู → connected components + รูปทรงคร่าวๆ ----
    const minLenMm = opts.minLenMm ?? 2;
    const maxLenMm = opts.maxLenMm ?? 50;
    const maxAspect = opts.maxAspect ?? 8;                 // เกินนี้ = เส้นใย/เศษ (ISO 9276-6 elongation)
    const excludeClumps = opts.autoSplit !== false;        // ใช้ key เดิม: คัดเม็ดติดกันออก
    const minAreaPx = Math.max(12, (minLenMm * minLenMm * 0.4) / (mmpp * mmpp));
    const bgAt = (c, i) => {
      const xn = 2 * (i % w) / w - 1, yn = 2 * ((i / w) | 0) / h - 1;
      return Math.max(8, quad(c, xn, yn));
    };
    const segment = (withChroma, close = 0) => {
      let mask = new Uint8Array(N);
      for (let i = 0; i < N; i++) mask[i] = ((fgBright ? v[i] > thr : v[i] < thr) || (withChroma && (nb[i] & 2))) ? 1 : 0;
      for (let k = 0; k < close; k++) mask = erodeDilate(mask, w, h, 'dilate');   // closing: เชื่อมช่องแคบ (แถบแสงสะท้อน)
      for (let k = 0; k < close; k++) mask = erodeDilate(mask, w, h, 'erode');
      mask = erodeDilate(erodeDilate(mask, w, h, 'erode'), w, h, 'dilate');
      const pre = mask.slice();                            // ก่อนเติมรู (ใช้นับสัดส่วนรู)
      mask = fillHoles(mask, w, h);
      const list = components(mask, w, h, minAreaPx);
      for (const c of list) {
        c.sh = measureShape(c.px, w);
        c.lenMm = c.sh.lenC * mmpp;
        let holes = 0;
        for (const i of c.px) if (!pre[i]) holes++;
        c.holeFrac = holes / c.px.length;
      }
      return list;
    };
    const plausible = c => !c.touchBorder && c.lenMm >= minLenMm * 0.7 && c.lenMm <= maxLenMm;
    let comps = segment(false), withChroma = false;
    if (lightBg) {
      // เม็ดส่วนใหญ่ "มีสี" ต่างจากพื้น (น้ำตาลบนกระดาษขาว/เทา) → รวมพิกเซลที่สีเพี้ยนจากพื้นเข้า mask ด้วย
      // กันเม็ดคอนทราสต์ต่ำขาดเป็นท่อน · เม็ดดำ/เทาไม่เข้าเงื่อนไขนี้ จึงไม่เสี่ยงดึงเงาที่ติดสีเข้ามา
      let aC = 0, aT = 0;
      for (const c of comps) {
        if (!plausible(c)) continue;
        let r = 0, g = 0, b = 0;
        for (const i of c.px) { const p = i * 4; r += data[p]; g += data[p + 1]; b += data[p + 2]; }
        const n = c.px.length, i0 = Math.round(c.sh.my) * w + Math.round(c.sh.mx);
        const rr = r / n / bgAt(bg.R, i0), gg = g / n / bgAt(bg.G, i0), bb = b / n / bgAt(bg.B, i0), m = (rr + gg + bb) / 3;
        aT += n;
        if (Math.hypot(rr - m, gg - m, bb - m) >= 0.09) aC += n;
      }
      if (aT && aC >= 0.6 * aT) { withChroma = true; comps = segment(true); }
    }
    // เม็ดมันวาว: แถบแสงสะท้อนตามยาวผ่าเม็ดเป็น 2 ซีกขนานกัน → ถ้าพบ "คู่ซีกขนานชิดกัน" จำนวนมาก
    // ให้แยกใหม่แบบเชื่อมช่องแคบ (closing) — ภาพปกติไม่เข้าเงื่อนไขนี้ จึงไม่ทำให้เม็ดที่อยู่ใกล้กันถูกรวม
    {
      const el = comps.filter(c => plausible(c) && c.sh.lenC >= 2 * c.sh.diaC);
      const paired = new Set();
      for (let i = 0; i < el.length; i++) for (let j = i + 1; j < el.length; j++) {
        const a = el[i].sh, b = el[j].sh;
        if (Math.abs(a.cosT * b.cosT + a.sinT * b.sinT) < 0.94) continue;
        if (Math.min(a.lenC, b.lenC) < 0.7 * Math.max(a.lenC, b.lenC)) continue;
        const dx = b.mx - a.mx, dy = b.my - a.my;
        const along = Math.abs(dx * a.cosT + dy * a.sinT), across = Math.abs(-dx * a.sinT + dy * a.cosT);
        if (along < 0.35 * Math.max(a.lenC, b.lenC) && across < 0.9 * (a.diaC + b.diaC)) { paired.add(i); paired.add(j); }
      }
      const all = comps.filter(plausible).length;
      if (paired.size >= 6 && paired.size >= 0.3 * all) comps = segment(withChroma, 2);
    }

    // ---- บริเวณที่ไม่นับ: วัตถุใหญ่ในเฟรม + วัตถุอ้างอิงที่คาลิเบรตไว้ ----
    const sized = comps.filter(plausible);
    let zone = null;
    if (sized.length) {
      const dia0 = weightedMedian(sized.map(c => c.sh.diaC), sized.map(c => c.px.length));
      const area0 = weightedMedian(sized.map(c => c.px.length), sized.map(c => c.px.length));
      zone = objectZones(nb, w, h, Math.max(3, 0.9 * dia0), Math.max(60, 10 * area0));
    }
    const polys = (opts.exclude || []).map(poly => poly.map(p => [p[0] / scale, p[1] / scale]));
    const hidden = c => {
      const x = c.sh.mx, y = c.sh.my;
      if (zone && zone.has(Math.round(x), Math.round(y))) return true;
      return polys.some(poly => pointInPoly(x, y, poly));
    };

    // ---- เนื้อเม็ด (anchor) ของแต่ละก้อน: ตัดเงา/ขอบนุ่มออกก่อนวัด ----
    const alab = new Int32Array(N);
    const anchor = (c, id) => {
      const px = c.px, n = px.length;
      let keep = null;
      if (lightBg) {
        // เม็ดมีสีต่างจากพื้น (เช่น น้ำตาลบนกระดาษขาว): ใช้ "สีเพี้ยนจากพื้น" ซึ่งเงาไม่มี → แยกเม็ดออกจากเงาได้
        const dR = new Float32Array(n), dG = new Float32Array(n), dB = new Float32Array(n), q = new Float32Array(n);
        for (let k = 0; k < n; k++) {
          const i = px[k], p = i * 4;
          const rr = data[p] / bgAt(bg.R, i), gg = data[p + 1] / bgAt(bg.G, i), bb = data[p + 2] / bgAt(bg.B, i);
          const m = (rr + gg + bb) / 3;
          dR[k] = rr - m; dG[k] = gg - m; dB[k] = bb - m;
          q[k] = Math.hypot(dR[k], dG[k], dB[k]);
        }
        const Q = q.slice().sort()[Math.floor(n * 0.8)];
        if (Q >= 0.09) {
          let mR = 0, mG = 0, mB = 0;
          for (let k = 0; k < n; k++) if (q[k] >= 0.6 * Q) { mR += dR[k]; mG += dG[k]; mB += dB[k]; }
          const ml = Math.hypot(mR, mG, mB) || 1;
          mR /= ml; mG /= ml; mB /= ml;
          const proj = new Float32Array(n), strong = [];
          for (let k = 0; k < n; k++) { proj[k] = dR[k] * mR + dG[k] * mG + dB[k] * mB; if (q[k] >= 0.6 * Q) strong.push(proj[k]); }
          const P = median(strong);
          keep = [];
          for (let k = 0; k < n; k++) if (proj[k] >= 0.45 * P) keep.push(px[k]);
          c.chromatic = true;
        }
      }
      if (!keep) {
        // ไม่มีโครมา (เม็ดดำ/เทา หรือพื้นเข้ม): เก็บพิกเซลที่ความสว่างอยู่ใน 30% แรกจากระดับเม็ดไปหาพื้น
        const hc = new Uint32Array(256);
        for (let k = 0; k < n; k++) hc[v[px[k]]]++;
        let acc = 0, vc = 128;
        if (fgBright) { for (let t = 255; t >= 0; t--) { acc += hc[t]; if (acc >= n * 0.2) { vc = t; break; } } }
        else { for (let t = 0; t < 256; t++) { acc += hc[t]; if (acc >= n * 0.2) { vc = t; break; } } }
        const lvl = vc + 0.3 * (128 - vc);
        keep = [];
        for (let k = 0; k < n; k++) { const t = v[px[k]]; if (fgBright ? t >= lvl : t <= lvl) keep.push(px[k]); }
      }
      if (keep.length < n * 0.25) keep = px;
      for (const i of keep) alab[i] = id;
      c.apx = keep;
      const solid0 = c.sh.solidity;                        // ของก้อนเต็ม (รวมรู/แถบแสงสะท้อนที่เติมแล้ว)
      c.sh = measureShape(keep, w);
      c.solid = Math.max(solid0, c.sh.solidity);
      c.lenMm = c.sh.lenC * mmpp;
      c.area = keep.length;
      let cr = 0, cg = 0, cb = 0;
      for (const i of keep) { const p = i * 4; cr += data[p]; cg += data[p + 1]; cb += data[p + 2]; }
      c.color = { r: Math.round(cr / keep.length), g: Math.round(cg / keep.length), b: Math.round(cb / keep.length) };
    };

    const cand = [];
    const rejectedBoxes = [];
    let rejBorder = 0, rejClump = 0, rejSize = 0, rejForeign = 0;
    comps.forEach((c, k) => {
      if (c.lenMm < minLenMm * 0.7) return;                // เล็กเกิน = noise (ไม่นับ)
      if (hidden(c)) return;                               // อยู่บนวัตถุใหญ่/วัตถุอ้างอิง → ไม่นับ ไม่วาด
      if (c.touchBorder) { c.reason = 'border'; rejectedBoxes.push(c); rejBorder++; return; }
      if (c.lenMm > maxLenMm) { c.reason = 'size'; rejectedBoxes.push(c); rejSize++; return; }
      anchor(c, k + 1);
      c.id = k + 1;
      cand.push(c);
    });

    // ---- ค่ากลางประชากร (ถ่วงด้วยพื้นที่) สำหรับคัดเม็ดติดกัน ----
    const wts = cand.map(c => c.area);
    const medLen = weightedMedian(cand.map(c => c.lenMm), wts);
    const medArea = weightedMedian(wts, wts);

    let accepted = [];
    for (const c of cand) {
      const sh = c.sh;
      // กรองเศษ/สิ่งแปลกปลอมด้วยรูปทรง — เส้นใย/เส้นผม (ผอมยาว), รูปร่างเว้ามาก, วงแหวน/ตัวอักษร (มีรูใหญ่)
      if (sh.lenC / sh.diaC > maxAspect || c.solid < 0.55 || c.holeFrac > 0.3) {
        c.reason = 'foreign'; rejectedBoxes.push(c); rejForeign++; continue;
      }
      if (excludeClumps && cand.length >= 4) {
        const clump =
          (medArea > 0 && c.area > 1.5 * medArea) ||       // พื้นที่ ≈ 2 เม็ด = เม็ดติดกัน (ตัวจับหลัก)
          (medLen > 0 && c.lenMm > 1.65 * medLen) ||       // ยาว ≈ 2 เม็ด = หัวต่อหัว
          c.solid < 0.72;                                  // รูปร่างเว้ามาก = เกาะกลุ่ม (ตัวสำรอง)
        if (clump) { c.reason = 'clump'; rejectedBoxes.push(c); rejClump++; continue; }
      }
      accepted.push(c);
    }

    // ---- ระนาบสำหรับวัดขอบ ----
    // ปกติใช้ความสว่าง · ถ้าเม็ดส่วนใหญ่ "มีสีต่างจากพื้น" (เช่น น้ำตาลบนกระดาษขาว) ใช้ระนาบสีเพี้ยนจากพื้น
    // (ส่วนของสีเม็ดที่ตั้งฉากกับสีพื้น) ซึ่งเงาเป็นศูนย์ → ขอบเม็ดฝั่งเงาไม่ถูกเงากลืน
    let plane = LUMA, pol = fgBright ? -1 : 1;
    if (lightBg && accepted.length) {
      let aC = 0, aT = 0, pr = 0, pg = 0, pb = 0;
      for (const c of accepted) {
        aT += c.area;
        if (c.chromatic) { aC += c.area; pr += c.color.r * c.area; pg += c.color.g * c.area; pb += c.color.b * c.area; }
      }
      if (aC >= 0.6 * aT) {
        pr /= aC; pg /= aC; pb /= aC;
        const bR = quad(bg.R, 0, 0), bG = quad(bg.G, 0, 0), bB = quad(bg.B, 0, 0), bl = Math.hypot(bR, bG, bB) || 1;
        const dot = (pr * bR + pg * bG + pb * bB) / bl;
        const cR = pr - dot * bR / bl, cG = pg - dot * bG / bl, cB = pb - dot * bB / bl;
        const cl2 = cR * cR + cG * cG + cB * cB;
        if (Math.sqrt(cl2) > 0.1 * Math.hypot(pr, pg, pb)) {
          const k = -110 / cl2;                            // เม็ด ≈ 18, พื้น/เงา ≈ 128
          plane = { wts: [cR * k, cG * k, cB * k], off: 128 };
          pol = 1;
        }
      }
    }

    // ---- วัดแบบ sub-pixel บนภาพความละเอียดสูง ----
    const H = accepted.length ? toHiPlane(img, w, h, data, plane) : null;
    const S = H && { alab, w, h, at: sampler(H), rs: H.rs, pol };
    for (const c of accepted) {
      const sh = c.sh;
      const r = refinePellet(sh, c.id, S);
      if (r) {
        c.L = r.L; c.D = r.D; c.cx = r.cx; c.cy = r.cy; c.ax = r.ax; c.ay = r.ay; c.sigma = r.sigma;
      } else {                                             // หาขอบไม่ได้ → ใช้ขอบเขตระดับพิกเซล
        c.L = sh.lenC; c.D = sh.diaC; c.cx = sh.mx; c.cy = sh.my; c.ax = sh.cosT; c.ay = sh.sinT; c.sigma = 0;
      }
      c.lenMm = c.L * mmpp;
      c.diaMm = c.D * mmpp;
    }

    // ---- เศษเม็ดหักสั้น (ยาวน้อยกว่า Ø): ด้านยาวของเงาเม็ดคือ Ø จริง → สลับให้ Ø ตรงกับประชากร ----
    if (accepted.length >= 5) {
      const md = weightedMedian(accepted.map(c => c.D), accepted.map(c => c.area));
      for (const c of accepted) {
        if (c.D < 0.8 * md && Math.abs(c.L - md) <= 0.15 * md) {
          [c.L, c.D] = [c.D, c.L];
          [c.ax, c.ay] = [-c.ay, c.ax];
          c.lenMm = c.L * mmpp;
          c.diaMm = c.D * mmpp;
        }
      }
    }

    // ---- ความสม่ำเสมอของประชากรเม็ด: Ø หรือสีที่ผิดจากกลุ่มมาก = ไม่ใช่เม็ดตัวอย่างนี้ ----
    accepted = accepted.filter(c => {
      if (c.lenMm < minLenMm) return false;
      if (c.lenMm > maxLenMm) { c.reason = 'size'; rejectedBoxes.push(c); rejSize++; return false; }
      return true;
    });
    if (accepted.length >= 5) {
      const aw = accepted.map(c => c.area);
      const medDia = weightedMedian(accepted.map(c => c.diaMm), aw);
      const labs = accepted.map(c => rgb2lab(c.color.r, c.color.g, c.color.b));
      const mLab = { l: weightedMedian(labs.map(x => x.l), aw), a: weightedMedian(labs.map(x => x.a), aw), b: weightedMedian(labs.map(x => x.b), aw) };
      // ระดับพื้นรอบเม็ด (ด้านที่ไม่ใช่เงา): เม็ดจริงวางบนพื้นเดียวกัน · ขีด/ตัวเลขบนไม้บรรทัด-เวอร์เนียร์อยู่บนพื้นผิวอื่น
      const ring = accepted.map(c => {
        const hl = c.L / 2 + 3.5, hd = c.D / 2 + 3.5, vals = [];
        for (let k = 0; k < 28; k++) {
          const t = k / 28 * 2 * Math.PI, ux = Math.cos(t), uy = Math.sin(t);
          const r = 1 / Math.max(Math.abs(ux) / hl, Math.abs(uy) / hd);          // ระยะถึงกรอบเม็ดที่ขยายออก 3.5 px
          const x = Math.round(c.cx + (c.ax * ux - c.ay * uy) * r), y = Math.round(c.cy + (c.ay * ux + c.ax * uy) * r);
          if (x >= 0 && y >= 0 && x < w && y < h) vals.push(v[y * w + x]);
        }
        vals.sort((a, b) => a - b);
        return vals.length ? vals[Math.floor((vals.length - 1) * (fgBright ? 0.25 : 0.75))] : 128;
      });
      const medRing = weightedMedian(ring, aw);
      accepted = accepted.filter((c, k) => {
        const off = c.diaMm < 0.55 * medDia || c.diaMm > 1.6 * medDia || deltaE(labs[k], mLab) > 32 || Math.abs(ring[k] - medRing) > 16;
        if (off) { c.reason = 'foreign'; rejectedBoxes.push(c); rejForeign++; }
        return !off;
      });
    }

    for (const c of accepted) c.texture = textureMetrics(c.apx, w, data);

    // ---- ความคมของภาพ: ความเบลอของขอบเม็ด (σ) เทียบกับ Ø ----
    const sigHi = median(accepted.map(c => c.sigma).filter(s => s > 0));
    const edgeMm = H ? sigHi / H.rs * mmpp : 0;                           // σ ของขอบ (มม.)
    const medDiaMm = median(accepted.map(c => c.diaMm));
    const blurRatio = medDiaMm > 0 ? edgeMm / medDiaMm : 0;
    // ทดสอบกับภาพจำลอง: σขอบ/Ø ≈ 0.05 (ภาพคม) คลาดเคลื่อน < 0.5% · 0.10 ≈ +2% · 0.16 ≈ +5% (เบลอ+เงารวมกัน)
    const blurry = blurRatio > 0.10;

    // ---- วาดผล ----
    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    const octx = out.getContext('2d');
    octx.drawImage(canvas, 0, 0);
    const lw = Math.max(1.6, w / 700);
    // ปิดทับวัตถุอ้างอิง (ไม่ให้รายละเอียดบัตรติดไปกับภาพที่บันทึก)
    for (const poly of polys) {
      octx.beginPath();
      poly.forEach((p, i) => i ? octx.lineTo(p[0], p[1]) : octx.moveTo(p[0], p[1]));
      octx.closePath();
      octx.fillStyle = '#475569'; octx.fill();             // ทึบสนิท — ต้องอ่านเลขบัตรไม่ได้
      octx.strokeStyle = '#3b82f6'; octx.lineWidth = lw * 1.2; octx.stroke();
      const mx = poly.reduce((s, p) => s + p[0], 0) / poly.length, my = poly.reduce((s, p) => s + p[1], 0) / poly.length;
      octx.fillStyle = '#e2e8f0'; octx.font = `bold ${Math.max(14, w / 45)}px sans-serif`;
      octx.textAlign = 'center'; octx.textBaseline = 'middle';
      octx.fillText('REF', mx, my);
    }
    // กรอบเม็ดที่คัดออก (เส้นบางสี)
    const drawReject = (b, stroke) => {
      const s = b.sh;
      octx.save();
      octx.translate(s.mx, s.my);
      octx.rotate(Math.atan2(s.sinT, s.cosT));
      octx.strokeStyle = stroke; octx.lineWidth = lw;
      octx.strokeRect(s.uMin - 0.5, s.vMin - 0.5, s.uMax - s.uMin + 1, s.vMax - s.vMin + 1);
      octx.restore();
    };
    // เม็ดที่วัด: เติมสีเขียวจาง + กรอบเขียว (ตามขอบที่วัดจริง) + เส้นวัดความยาวสีแดงตามแกนเม็ด มีขีดปลาย (caliper)
    const drawPellet = (b) => {
      const hl = b.L / 2, hd = b.D / 2;
      octx.save();
      octx.translate(b.cx + 0.5, b.cy + 0.5);
      octx.rotate(Math.atan2(b.ay, b.ax));
      octx.fillStyle = 'rgba(34,197,94,.16)';
      octx.fillRect(-hl, -hd, b.L, b.D);
      octx.strokeStyle = '#22c55e'; octx.lineWidth = lw;
      octx.strokeRect(-hl, -hd, b.L, b.D);
      const cap = Math.max(3, hd * 0.7);
      octx.strokeStyle = '#ff3b30'; octx.lineWidth = lw * 1.1;
      octx.beginPath();
      octx.moveTo(-hl, 0); octx.lineTo(hl, 0);
      octx.moveTo(-hl, -cap); octx.lineTo(-hl, cap);
      octx.moveTo(hl, -cap); octx.lineTo(hl, cap);
      octx.stroke();
      octx.restore();
    };
    const rejColor = { clump: '#fb923c', foreign: '#c084fc' };
    rejectedBoxes.forEach(b => drawReject(b, rejColor[b.reason] || 'rgba(255,255,255,.45)'));
    accepted.forEach(drawPellet);
    // ป้ายความยาว แบบชิปอ่านง่าย
    const fs = Math.max(11, w / 80);
    octx.font = `bold ${fs}px sans-serif`;
    octx.textAlign = 'center'; octx.textBaseline = 'middle';
    accepted.forEach(b => {
      const label = b.lenMm.toFixed(1);
      const tx = b.cx, ty = b.cy - (Math.max(b.L * Math.abs(b.ay), b.D * Math.abs(b.ax)) / 2 + fs * 1.1);
      const wd = octx.measureText(label).width + fs * 0.7;
      octx.fillStyle = 'rgba(17,24,39,.78)';
      octx.beginPath();
      (octx.roundRect ? octx.roundRect(tx - wd / 2, ty - fs * 0.7, wd, fs * 1.4, fs * 0.4)
                      : octx.rect(tx - wd / 2, ty - fs * 0.7, wd, fs * 1.4));
      octx.fill();
      octx.fillStyle = '#4ade80';
      octx.fillText(label, tx, ty);
    });
    octx.textBaseline = 'alphabetic';

    return {
      pellets: accepted.map(b => ({
        length_mm: +b.lenMm.toFixed(2),
        diameter_mm: +b.diaMm.toFixed(2),
        color: b.color,
        roughness_pct: b.sh.roughnessPct,
        solidity: +b.solid.toFixed(3),
        aspect: +(b.L / b.D).toFixed(2),
        texture: b.texture,
        cx: Math.round((b.cx + 0.5) * scale),             // ตำแหน่งในภาพต้นฉบับ (px)
        cy: Math.round((b.cy + 0.5) * scale),
      })),
      rejected: rejectedBoxes.length,
      excluded: { clump: rejClump, border: rejBorder, size: rejSize, foreign: rejForeign },
      splits: 0,
      annotated: out,
      threshold: thr,
      edge_mm: +edgeMm.toFixed(3),                        // ความเบลอของขอบเม็ด (σ, มม.)
      blur_ratio: +blurRatio.toFixed(3),
      blurry,
    };
  }

  /** สี่เหลี่ยมล้อมรอบพื้นที่น้อยสุดของ convex hull (rotating calipers ตามขอบ hull) */
  function minAreaRect(hull) {
    let best = null;
    for (let i = 0; i < hull.length; i++) {
      const p = hull[i], q = hull[(i + 1) % hull.length];
      let ex = q[0] - p[0], ey = q[1] - p[1];
      const el = Math.hypot(ex, ey);
      if (el < 1e-9) continue;
      ex /= el; ey /= el;
      let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
      for (const r of hull) {
        const u = r[0] * ex + r[1] * ey, vv = -r[0] * ey + r[1] * ex;
        if (u < u0) u0 = u; if (u > u1) u1 = u;
        if (vv < v0) v0 = vv; if (vv > v1) v1 = vv;
      }
      const area = (u1 - u0) * (v1 - v0);
      if (!best || area < best.area) best = { area, ex, ey, u0, u1, v0, v1 };
    }
    return best;
  }

  /** วงกลม least squares (Kåsa) จากจุด [x,y] → {cx, cy, r} */
  function fitCircle(pts) {
    const n = pts.length;
    let sx = 0, sy = 0;
    for (const p of pts) { sx += p[0]; sy += p[1]; }
    const mx = sx / n, my = sy / n;
    let suu = 0, svv = 0, suv = 0, suuu = 0, svvv = 0, suvv = 0, svuu = 0;
    for (const p of pts) {
      const u = p[0] - mx, v = p[1] - my;
      suu += u * u; svv += v * v; suv += u * v;
      suuu += u * u * u; svvv += v * v * v; suvv += u * v * v; svuu += v * u * u;
    }
    const det = suu * svv - suv * suv;
    if (Math.abs(det) < 1e-9) return null;
    const a = (svv * (suuu + suvv) - suv * (svvv + svuu)) / (2 * det);
    const b = (suu * (svvv + svuu) - suv * (suuu + suvv)) / (2 * det);
    return { cx: mx + a, cy: my + b, r: Math.sqrt(a * a + b * b + (suu + svv) / n) };
  }

  /**
   * คาลิเบรตอัตโนมัติ: หาวัตถุอ้างอิงในภาพแล้ววัดขอบแบบ sub-pixel
   *  - refShape 'card'   : บัตรมาตรฐาน ISO ID-1 (85.60×53.98 มม.) — ใช้ทั้งด้านยาวและด้านสั้น
   *  - อื่นๆ (เหรียญ)    : วงกลม เส้นผ่านศูนย์กลางจริง = knownMm
   * @returns {found, mmpp (มม./พิกเซลต้นฉบับ), diaPx, annotated, region (รูปหลายเหลี่ยม พิกัดต้นฉบับ), skewPct}
   */
  function detectReference(img, knownMm, opts = {}) {
    const isCard = opts.refShape === 'card';
    const { canvas, scale } = toProcCanvas(img);
    const w = canvas.width, h = canvas.height, N = w * h;
    const data = canvas.getContext('2d').getImageData(0, 0, w, h).data;
    const { v, nb } = normalize(data, w, h);

    // วัตถุ = ทุกอย่างที่ต่างจากพื้นหลัง (รวมวัตถุสีเทา/โลหะ)
    let mask = new Uint8Array(N);
    for (let i = 0; i < N; i++) mask[i] = (nb[i] || Math.abs(v[i] - 128) > 13) ? 1 : 0;
    mask = erodeDilate(erodeDilate(mask, w, h, 'erode'), w, h, 'dilate');
    mask = fillHoles(mask, w, h);

    const H = toHiPlane(img, w, h, data);
    const at = sampler(H);
    let best = null;
    const comps = components(mask, w, h, Math.max(400, N * (isCard ? 0.004 : 0.0015))).filter(c => !c.touchBorder);
    for (const c of comps) c.sh = measureShape(c.px, w);
    if (isCard) {
      // บัตรอาจแตกเป็นหลายชิ้นใน mask (แถบแม่เหล็ก/ลายพิมพ์ที่สีใกล้พื้น) → ลองรวมชิ้นใหญ่ 1–3 ชิ้น
      // แล้วหา convex hull ที่เป็นสี่เหลี่ยมอัตราส่วน 85.60:53.98
      const big = comps.sort((p, q) => q.px.length - p.px.length).slice(0, 5);
      const tryUnion = idxs => {
        const hull = idxs.length === 1 ? big[idxs[0]].sh.hull : convexHull([].concat(...idxs.map(i => big[i].sh.hull)));
        const r = minAreaRect(hull);
        if (!r) return;
        const su = r.u1 - r.u0 + 1, sv = r.v1 - r.v0 + 1;
        const a = Math.max(su, sv), b = Math.min(su, sv);
        const ratio = a / b / (CARD_MM[0] / CARD_MM[1]);
        const area = idxs.reduce((s, i) => s + big[i].px.length, 0);
        const hullFill = (polyArea(hull) + polyPerimeter(hull) / 2 + 1) / (a * b);
        if (a * b < N * 0.012 || ratio < 0.92 || ratio > 1.09 || hullFill < 0.93 || area / (a * b) < 0.55) return;
        const score = a * b * (1 - Math.abs(ratio - 1));
        if (!best || score > best.score) best = { score, rect: r };
      };
      for (let i = 0; i < big.length; i++) {
        tryUnion([i]);
        for (let j = i + 1; j < big.length; j++) {
          tryUnion([i, j]);
          for (let k = j + 1; k < big.length; k++) tryUnion([i, j, k]);
        }
      }
    } else {
      for (const c of comps) {
        const sh = c.sh;
        const aspect = sh.maxFeret / Math.max(1, sh.minFeret);
        const fill = c.px.length / (Math.PI * (sh.maxFeret / 2) ** 2);
        if (aspect < 1.25 && sh.solidity > 0.88 && fill > 0.80) {
          if (!best || c.px.length > best.area) best = { area: c.px.length, sh };
        }
      }
    }
    if (!best) return { found: false };

    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    const octx = out.getContext('2d');
    octx.drawImage(canvas, 0, 0);
    octx.strokeStyle = '#3b82f6'; octx.lineWidth = Math.max(2, w / 400);
    const toOrig = p => [(p[0] + 0.5) * scale, (p[1] + 0.5) * scale];

    if (isCard) {
      // ขอบบัตรแบบ sub-pixel: ค่ากลางของตำแหน่งขอบหลายจุดบนแต่ละด้าน (เว้นมุมมน)
      const { ex, ey, u0, u1, v0, v1 } = best.rect;
      const P = (u, vv) => [u * ex - vv * ey, u * ey + vv * ex];       // (u,v) → (x,y)
      const side = (fixedV, isU, outSign) => {
        const offs = [];
        const lo = isU ? u0 : v0, hi = isU ? u1 : v1;
        for (let k = 0; k < 24; k++) {
          const t = lo + (hi - lo) * (0.15 + 0.7 * k / 23);
          // เริ่มจากด้านในบัตร 8 px แล้วมองออกนอก
          const inner = fixedV - outSign * 8;
          const [x0, y0] = isU ? P(t, inner) : P(inner, t);
          const dx = (isU ? -ey : ex) * outSign, dy = (isU ? ex : ey) * outSign;
          const e = edgeAlong(at, H.rs, x0, y0, dx, dy, 8.5, 5, 0);
          if (e) offs.push(inner + outSign * e.s);
        }
        return offs.length >= 8 ? median(offs) : fixedV + outSign * 0.5;
      };
      const V0 = side(v0, true, -1), V1 = side(v1, true, 1), U0 = side(u0, false, -1), U1 = side(u1, false, 1);
      const su = U1 - U0, sv = V1 - V0;
      const a = Math.max(su, sv), b = Math.min(su, sv);
      const mmA = CARD_MM[0] / (a * scale), mmB = CARD_MM[1] / (b * scale);
      const corners = [P(U0, V0), P(U1, V0), P(U1, V1), P(U0, V1)];
      octx.beginPath();
      corners.forEach((p, i) => i ? octx.lineTo(p[0] + 0.5, p[1] + 0.5) : octx.moveTo(p[0] + 0.5, p[1] + 0.5));
      octx.closePath(); octx.stroke();
      const cu = (U0 + U1) / 2, cv = (V0 + V1) / 2, grow = 1.04;
      const region = [[U0, V0], [U1, V0], [U1, V1], [U0, V1]]
        .map(([u, vv]) => toOrig(P(cu + (u - cu) * grow, cv + (vv - cv) * grow)));
      return {
        found: true, mmpp: +((mmA + mmB) / 2).toFixed(5), diaPx: +(b * scale).toFixed(1), annotated: out, region,
        skewPct: +((mmA - mmB) / ((mmA + mmB) / 2) * 100).toFixed(1),   // ด้านยาว/สั้นให้สเกลต่างกัน = ถ่ายเอียง
      };
    }

    // เหรียญ: จุดขอบตามรัศมี 72 ทิศ → fit วงกลมจากครึ่งที่ "ขอบคมกว่า" ก่อน (ฝั่งเงาขอบจะนุ่ม/เลื่อนออก)
    // แล้วรับจุดอื่นที่อยู่บนวงกลมเดียวกันเข้ามา fit ซ้ำ
    const sh = best.sh, r0 = Math.sqrt(best.area / Math.PI);
    const all = [];
    for (let k = 0; k < 72; k++) {
      const th = k * Math.PI / 36, dx = Math.cos(th), dy = Math.sin(th);
      const e = edgeAlong(at, H.rs, sh.mx, sh.my, dx, dy, r0, Math.max(4, r0 * 0.12), 0);
      if (e) all.push([sh.mx + dx * e.s, sh.my + dy * e.s, e.sigma]);
    }
    const sMed = median(all.map(p => p[2]));
    let pts = all.filter(p => p[2] <= sMed);
    let circ = pts.length >= 10 ? fitCircle(pts) : null;
    for (let it = 0; it < 3 && circ; it++) {
      const dev = p => Math.abs(Math.hypot(p[0] - circ.cx, p[1] - circ.cy) - circ.r);
      const tol = Math.max(0.5, 2.5 * 1.4826 * median(pts.map(dev)));
      const kept = all.filter(p => dev(p) <= tol);
      if (kept.length < 10) break;
      pts = kept; circ = fitCircle(pts);
    }
    // ต้องเป็นขอบจริงของวัตถุ: จุดขอบส่วนใหญ่อยู่บนวงกลมเดียวกัน และขอบคม (ไม่ใช่แสงไล่ระดับบนหน้าเหรียญ)
    if (!circ || pts.length < 40 || median(pts.map(p => p[2])) > Math.max(3, 0.05 * circ.r * H.rs)) return { found: false };
    const diaOrig = 2 * circ.r * scale;
    octx.beginPath();
    octx.arc(circ.cx + 0.5, circ.cy + 0.5, circ.r, 0, Math.PI * 2);
    octx.stroke();
    const region = [];
    for (let k = 0; k < 20; k++) {
      const th = k * Math.PI / 10;
      region.push(toOrig([circ.cx + Math.cos(th) * circ.r * 1.1, circ.cy + Math.sin(th) * circ.r * 1.1]));
    }
    return {
      found: true, mmpp: +(knownMm / diaOrig).toFixed(5), diaPx: +diaOrig.toFixed(1), annotated: out, region, skewPct: 0,
      edgePts: pts.length, edgeSigma: +median(pts.map(p => p[2])).toFixed(2),
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
      avg_aspect: +(mean(pellets.map(p => p.diameter_mm > 0 ? p.length_mm / p.diameter_mm : 1))).toFixed(2),
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
