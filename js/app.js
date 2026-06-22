/* ===========================================================
 * app.js — UI หลักของแอปวัดขนาดเม็ดอาหาร
 * (ล็อกรหัส · 3 ภาษา · เป้าหมายไซซ์ · แชร์รายงาน)
 * =========================================================== */

(() => {
  const $ = id => document.getElementById(id);
  const t = (k, v) => I18N.t(k, v);

  // ลดอนิเมชั่นกราฟบนมือถือ/จอเล็ก เพื่อลดอาการค้าง
  if (typeof Chart !== 'undefined') {
    Chart.defaults.animation = (window.innerWidth < 700) ? false : { duration: 350 };
    Chart.defaults.devicePixelRatio = Math.min(2, window.devicePixelRatio || 1);
  }

  /* ---------------- state ---------------- */
  const state = {
    img: null,
    procScale: 1,
    calibrating: false,
    calibPts: [],
    results: null,       // { pellets, stats, annotated, rejected, splits, specResult }
    lastSavedId: null,
    charts: {},
    appStarted: false,
    currentUser: null,   // ข้อ 7
  };

  /* ---------------- settings ---------------- */
  // ชนิดสัตว์/สายผลิตภัณฑ์ (ข้อ 9) — สเปกแยกตาม product
  const PRODUCTS = [
    { id: 'shrimp', th: 'อาหารกุ้ง', vi: 'Thức ăn tôm', en: 'Shrimp feed' },
    { id: 'fish', th: 'อาหารปลา', vi: 'Thức ăn cá', en: 'Fish feed' },
    { id: 'other', th: 'อื่นๆ', vi: 'Khác', en: 'Other' },
  ];
  const productName = id => { const p = PRODUCTS.find(x => x.id === id); return p ? (p[I18N.lang] || p.en) : (id || ''); };

  // กะการผลิต (ข้อ 6)
  const SHIFTS = [
    { id: '', th: '— ไม่ระบุกะ —', vi: '— Không chọn ca —', en: '— No shift —' },
    { id: 'A', th: 'กะเช้า (A)', vi: 'Ca sáng (A)', en: 'Morning (A)' },
    { id: 'B', th: 'กะบ่าย (B)', vi: 'Ca chiều (B)', en: 'Afternoon (B)' },
    { id: 'C', th: 'กะดึก (C)', vi: 'Ca đêm (C)', en: 'Night (C)' },
  ];
  const shiftName = id => { const s = SHIFTS.find(x => x.id === id); return s ? (s[I18N.lang] || s.en) : (id || ''); };

  // วัตถุอ้างอิงสำหรับคาลิเบรตอัตโนมัติ (ข้อ 1) — เส้นผ่านศูนย์กลางจริง (มม.)
  const REF_OBJECTS = [
    { id: 'coin1', mm: 20.0, th: 'เหรียญ 1 บาท (Ø20.0)', vi: 'Xu (Ø20.0)', en: 'Coin Ø20.0' },
    { id: 'coin5', mm: 24.0, th: 'เหรียญ 5 บาท (Ø24.0)', vi: 'Xu (Ø24.0)', en: 'Coin Ø24.0' },
    { id: 'coin10', mm: 26.0, th: 'เหรียญ 10 บาท (Ø26.0)', vi: 'Xu (Ø26.0)', en: 'Coin Ø26.0' },
    { id: 'card', mm: 53.98, th: 'บัตร ATM/เครดิต (ด้านสั้น 54)', vi: 'Thẻ ATM (cạnh ngắn 54)', en: 'ATM/credit card (short side 54)' },
  ];
  const refName = id => { const r = REF_OBJECTS.find(x => x.id === id); return r ? (r[I18N.lang] || r.en) : id; };

  // sieve_under / sieve_over = ช่องตะแกรง mesh (มม.) สำหรับร่อน undersize/oversize · yield_target = % เป้าหมาย
  const DEFAULT_SPECS = [
    { product: 'shrimp', die: '1.0', min_mm: 1.0, max_mm: 2.0, target_pct: 60, sieve_under: 0.71, sieve_over: 1.40, yield_target: 95 },
    { product: 'shrimp', die: '1.2', min_mm: 1.5, max_mm: 2.5, target_pct: 60, sieve_under: 0.85, sieve_over: 1.70, yield_target: 95 },
    { product: 'shrimp', die: '1.4', min_mm: 2.0, max_mm: 3.0, target_pct: 60, sieve_under: 1.00, sieve_over: 2.00, yield_target: 95 },
    { product: 'shrimp', die: '1.8', min_mm: 2.0, max_mm: 3.0, target_pct: 60, sieve_under: 1.40, sieve_over: 2.50, yield_target: 95 },
    { product: 'shrimp', die: '2.0', min_mm: 3.0, max_mm: 4.0, target_pct: 60, sieve_under: 1.60, sieve_over: 2.80, yield_target: 95 },
    { product: 'fish', die: '2.5', min_mm: 3.0, max_mm: 5.0, target_pct: 70, sieve_under: 2.00, sieve_over: 3.35, yield_target: 95 },
    { product: 'fish', die: '4.0', min_mm: 5.0, max_mm: 8.0, target_pct: 70, sieve_under: 3.35, sieve_over: 5.60, yield_target: 95 },
  ];
  // เติมค่าตะแกรง mesh เริ่มต้นให้สเปกเก่าที่ยังไม่มี (อิงเส้นผ่านศูนย์กลาง die)
  function fillSieveDefaults(s) {
    const d = parseFloat(s.die) || 1;
    if (!(s.sieve_under > 0)) s.sieve_under = +(d * 0.72).toFixed(2);
    if (!(s.sieve_over > 0)) s.sieve_over = +(d * 1.4).toFixed(2);
    if (!(s.yield_target > 0)) s.yield_target = 95;
    if (!s.product) s.product = 'shrimp';
    return s;
  }

  /* ---------------- ตะแกรง mesh มาตรฐาน (ASTM E11 / US sieve) ----------------
   * แปลงระหว่างเบอร์ mesh กับขนาดช่อง (มม.) — ผู้ใช้เลือกหน่วยได้ในตั้งค่า
   */
  const MESH_TABLE = [
    [3.5, 5.60], [4, 4.75], [5, 4.00], [6, 3.35], [7, 2.80], [8, 2.36], [10, 2.00],
    [12, 1.70], [14, 1.40], [16, 1.18], [18, 1.00], [20, 0.85], [25, 0.71], [30, 0.60],
    [35, 0.50], [40, 0.425], [45, 0.355], [50, 0.30], [60, 0.25], [70, 0.212], [80, 0.18],
    [100, 0.15], [120, 0.125], [140, 0.106], [170, 0.090], [200, 0.075],
  ];
  // แปลง mesh ↔ มม. แบบ interpolate เชิงเส้นระหว่างค่ามาตรฐาน
  // (เดิมใช้ค่าใกล้สุดในตาราง → mesh 24 ถูกปัดเป็น 25 ทำให้ "บันทึกแล้วไม่จำค่า"; ตอนนี้รับเลข mesh อิสระได้)
  function meshToMm(mesh) {
    const m = +mesh;
    if (!(m > 0)) return 0;
    const T = MESH_TABLE;
    if (m <= T[0][0]) return T[0][1];
    if (m >= T[T.length - 1][0]) return T[T.length - 1][1];
    for (let i = 0; i < T.length - 1; i++) {
      const [m1, v1] = T[i], [m2, v2] = T[i + 1];
      if (m >= m1 && m <= m2) return +(v1 + (m - m1) / (m2 - m1) * (v2 - v1)).toFixed(4);
    }
    return T[T.length - 1][1];
  }
  function mmToMesh(mm) {
    const v = +mm;
    if (!(v > 0)) return 0;
    const T = MESH_TABLE; // mesh มาก = ช่องเล็ก → คอลัมน์ mm เรียงจากมากไปน้อย
    if (v >= T[0][1]) return T[0][0];
    if (v <= T[T.length - 1][1]) return T[T.length - 1][0];
    for (let i = 0; i < T.length - 1; i++) {
      const [m1, v1] = T[i], [m2, v2] = T[i + 1]; // v1 > v2
      if (v <= v1 && v >= v2) return Math.round((m1 + (v1 - v) / (v1 - v2) * (m2 - m1)) * 10) / 10;
    }
    return T[T.length - 1][0];
  }
  // โรงงานอาหารกุ้ง 4 แห่ง (เวียดนาม) — เก็บข้อมูลแยกกัน + สี/ไอคอนประจำโรงงาน
  const FACTORIES = [
    { id: 'ben-tre', th: 'เบ๊นแจ (Bến Tre)', vi: 'Bến Tre', en: 'Bến Tre', color: '#1b6e5a', icon: '🟢' },
    { id: 'ca-mau',  th: 'ก่าเมา (Cà Mau)',  vi: 'Cà Mau',  en: 'Cà Mau', color: '#2563eb', icon: '🔵' },
    { id: 'bau-xeo', th: 'บ่าวแซว (Bàu Xéo)', vi: 'Bàu Xéo', en: 'Bàu Xéo', color: '#d97706', icon: '🟠' },
    { id: 'can-tho', th: 'เกิ่นเทอ (Cần Thơ)', vi: 'Cần Thơ', en: 'Cần Thơ', color: '#9333ea', icon: '🟣' },
  ];
  const factoryName = id => {
    const f = FACTORIES.find(x => x.id === id);
    return f ? (f[I18N.lang] || f.en) : id;
  };
  const factoryColor = id => { const f = FACTORIES.find(x => x.id === id); return f ? f.color : '#94a3b8'; };
  const factoryIcon = id => { const f = FACTORIES.find(x => x.id === id); return f ? f.icon : '🏭'; };

  // ตำแหน่ง/จุดเก็บตัวอย่าง (stage) + ไอคอน
  const STAGE_ICON = { machine: '🏭', screen: '🥅', packing: '📦' };
  const STAGES = [
    { id: '', th: '— ไม่ระบุจุด —', vi: '— Không chọn —', en: '— No stage —' },
    { id: 'machine', th: 'หน้าเครื่อง', vi: 'Tại máy', en: 'At machine' },
    { id: 'screen', th: 'หลังร่อนขนาด', vi: 'Sau sàng', en: 'After screening' },
    { id: 'packing', th: 'แพ็คกิ้ง', vi: 'Đóng gói', en: 'Packing' },
  ];
  const stageName = id => { const s = STAGES.find(x => x.id === id); return s ? (s[I18N.lang] || s.en) : (id || ''); };
  const stageLabel = id => (id && STAGE_ICON[id] ? STAGE_ICON[id] + ' ' : '') + stageName(id);

  // ธีมสีหลัก (accent) — ค่าเริ่มต้นและพรีเซ็ต
  const THEMES = ['#1b6e5a', '#e3000f', '#0ea5e9', '#7c3aed', '#d97706', '#0f766e', '#be123c', '#1e3a8a'];

  const DEFAULTS = {
    mmpp: 0,
    operator: '',
    bins: '2,5,8,10,12,15,20',
    polarity: 'auto',
    minlen: 1,
    maxlen: 50,
    maxaspect: 8,
    autosplit: true,
    refcolor: '#c8a464',        // สีมาตรฐานอาหารกุ้ง
    refcolorFish: '#8a6a3a',    // สีมาตรฐานอาหารปลา (ตั้งแยก)
    userefcolor: false,
    demax: 10,                  // เกณฑ์สีกุ้ง
    demaxFish: 12,              // เกณฑ์สีปลา
    pin: '1234',
    die: 'auto',
    factory: 'ben-tre',
    product: 'shrimp',
    shift: '',
    stage: '',
    refObject: 'coin1',
    sampleWeight: 10,           // น้ำหนักชั่งเริ่มต้น (g) สำหรับ density
    colorGain: null,            // ปรับเทียบสี white/grey card {r,g,b}
    webhook: '',                // URL แจ้งเตือน SPC (Discord/Slack/อื่นๆ)
    logo: null,                 // โลโก้ที่อัปโหลด (data URL)
    theme: '#1b6e5a',
    reportFactory: '',
    sieveUnit: 'mm',   // 'mm' หรือ 'mesh'
    reportStage: '',
    users: [
      { name: 'Admin', pin: '1234', role: 'admin', factory: '' },
      { name: 'Bến Tre', pin: '1001', role: 'inspector', factory: 'ben-tre' },
      { name: 'Cà Mau', pin: '1002', role: 'inspector', factory: 'ca-mau' },
      { name: 'Bàu Xéo', pin: '1003', role: 'inspector', factory: 'bau-xeo' },
      { name: 'Cần Thơ', pin: '1004', role: 'inspector', factory: 'can-tho' },
    ],
    specs: DEFAULT_SPECS,
  };
  const stored = JSON.parse(localStorage.getItem('aicam-settings') || '{}');
  const settings = { ...DEFAULTS, ...stored };
  if (!Array.isArray(settings.specs) || !settings.specs.length) settings.specs = DEFAULT_SPECS;
  settings.specs.forEach(fillSieveDefaults); // เติมค่าตะแกรง mesh ให้สเปกเก่า
  // ปรับค่าเริ่มต้น Yield 90 → 95 (ครั้งเดียว)
  if (!settings.yieldV95) { settings.specs.forEach(s => { if (s.yield_target === 90) s.yield_target = 95; }); settings.yieldV95 = true; }
  // ผู้ใช้ (ข้อ 7): ถ้ายังไม่มีรายชื่อ สร้างจาก PIN เดิม
  if (!Array.isArray(settings.users) || !settings.users.length) {
    settings.users = [{ name: 'Admin', pin: String(settings.pin || '1234'), role: 'admin' }];
  }
  // ย้ายหน่วยช่วงความยาวจาก ซม. เป็น มม. (ครั้งเดียว เฉพาะค่าเก่าที่บันทึกไว้เป็น ซม.)
  if (stored.bins && stored.binsUnit !== 'mm') {
    settings.bins = stored.bins.split(',')
      .map(s => parseFloat(s.trim())).filter(v => !isNaN(v) && v > 0)
      .map(v => +(v * 10).toFixed(2)).join(',');
  }
  settings.binsUnit = 'mm';

  function saveSettings() {
    localStorage.setItem('aicam-settings', JSON.stringify(settings));
  }

  // คีย์ที่ใช้ร่วมทุกเครื่อง (เก็บออนไลน์) — มาตรฐาน QC องค์กร
  // (mmpp/colorGain = เฉพาะกล้องของเครื่องนั้น · theme/lang = ความชอบส่วนตัว → ไม่ sync)
  const SHARED_KEYS = ['specs', 'users', 'demax', 'demaxFish', 'bins', 'binsUnit', 'maxaspect', 'minlen', 'maxlen', 'refcolor', 'refcolorFish', 'userefcolor', 'webhook', 'sieveUnit', 'polarity', 'logo'];
  async function loadSharedConfig() {
    try {
      const cfg = await DB.getConfig();
      if (cfg && typeof cfg === 'object') {
        SHARED_KEYS.forEach(k => { if (cfg[k] !== undefined) settings[k] = cfg[k]; });
        if (Array.isArray(settings.specs)) settings.specs.forEach(fillSieveDefaults);
        localStorage.setItem('aicam-settings', JSON.stringify(settings));
        return true;
      }
    } catch (e) { /* ออฟไลน์: ใช้ค่าในเครื่อง */ }
    return false;
  }
  async function saveSharedConfig() {
    const cfg = {};
    SHARED_KEYS.forEach(k => { cfg[k] = settings[k]; });
    try { await DB.saveConfig(cfg); return true; } catch (e) { return false; }
  }
  function binsArray() {
    return settings.bins.split(',').map(s => parseFloat(s.trim())).filter(v => !isNaN(v) && v > 0);
  }
  function specsForProduct() {
    return settings.specs.filter(s => (s.product || 'shrimp') === settings.product);
  }
  function currentSpec() {
    return specsForProduct().find(s => String(s.die) === String(settings.die)) || null;
  }

  /** เลือกสเปกอัตโนมัติ: Die ที่ Ø ใกล้ Ø เฉลี่ยที่วัดได้ที่สุด (เสมอกัน → ตัวที่ Insize สูงกว่า) */
  function autoDetectSpec(pellets, stats) {
    const cands = specsForProduct().filter(s => !isNaN(parseFloat(s.die)) && s.max_mm > 0);
    if (!cands.length || !stats.count) return null;
    const d = stats.avg_diameter_mm;
    const sorted = cands.slice().sort((a, b) =>
      Math.abs(parseFloat(a.die) - d) - Math.abs(parseFloat(b.die) - d));
    let best = sorted[0];
    if (sorted[1] &&
        Math.abs(parseFloat(sorted[1].die) - d) - Math.abs(parseFloat(best.die) - d) < 0.15) {
      const i0 = Analyzer.checkSpec(pellets, best)?.insize_pct ?? 0;
      const i1 = Analyzer.checkSpec(pellets, sorted[1])?.insize_pct ?? 0;
      if (i1 > i0) best = sorted[1];
    }
    return best;
  }

  /** สเปกที่ใช้งานจริงตามโหมดที่เลือก */
  function resolveSpec(pellets, stats) {
    if (settings.die === 'auto') {
      return { spec: autoDetectSpec(pellets, stats), auto: true };
    }
    return { spec: currentSpec(), auto: false };
  }

  /* ---------------- ธีมสี ---------------- */
  function hex2rgb(h) { const v = parseInt(h.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
  function rgb2hex(r, g, b) { return '#' + [r, g, b].map(x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join(''); }
  function mix(hex, target, amt) { const [r, g, b] = hex2rgb(hex); return rgb2hex(r + (target - r) * amt, g + (target - g) * amt, b + (target - b) * amt); }
  function applyTheme(color) {
    const root = document.documentElement.style;
    root.setProperty('--green', color);
    root.setProperty('--green-dark', mix(color, 0, 0.30));   // เข้มขึ้น
    root.setProperty('--green-light', mix(color, 255, 0.86)); // อ่อนลง
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = color;
  }

  /* ---------------- % Yield (ตะแกรงร่อน mesh) ----------------
   * จำลองการร่อนด้วยตะแกรง mesh มาตรฐาน โดยจัดเม็ดตามเส้นผ่านศูนย์กลาง (Min Feret):
   *  - undersize : Ø < ช่องตะแกรงล่าง (ผง/เม็ดแตก ร่อนหลุด)
   *  - oversize  : Ø > ช่องตะแกรงบน (เม็ดใหญ่/เกาะกัน ค้างบนตะแกรง)
   *  - on-size   : อยู่ระหว่างกลาง = ผลผลิตที่ใช้ได้
   * Yield คิดแบบถ่วงน้ำหนักปริมาตร (∝ มวล) = สูตรเดียวกับร่อนชั่งน้ำหนักจริง
   */
  function computeYield(pellets, spec) {
    if (!pellets || !pellets.length || !spec) return null;
    const su = +spec.sieve_under, so = +spec.sieve_over;
    if (!(su > 0) || !(so > su)) return null;
    let cu = 0, con = 0, co = 0, vu = 0, von = 0, vo = 0, vtot = 0;
    for (const p of pellets) {
      const d = p.diameter_mm;
      const vol = Math.PI / 4 * d * d * Math.max(d, p.length_mm); // ปริมาตรทรงกระบอกโดยประมาณ
      vtot += vol;
      if (d < su) { cu++; vu += vol; }
      else if (d > so) { co++; vo += vol; }
      else { con++; von += vol; }
    }
    const n = pellets.length;
    const c = x => +(x * 100 / n).toFixed(1);
    const v = x => vtot ? +(x * 100 / vtot).toFixed(1) : 0;
    const target = +spec.yield_target || 90;
    const yieldVol = v(von);
    return {
      sieve_under: su, sieve_over: so, target,
      under_pct: c(cu), onsize_pct: c(con), over_pct: c(co),
      under_vol: v(vu), yield: yieldVol, over_vol: v(vo),
      yield_count: c(con),
      pass: yieldVol >= target,
    };
  }

  /* ---------------- toast ---------------- */
  let toastTimer = null;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }

  /* ================= LOCK SCREEN + ผู้ใช้ (ข้อ 7) ================= */
  function findUserByPin(pin) {
    return (settings.users || []).find(u => String(u.pin) === String(pin)) || null;
  }
  function setCurrentUser(u) {
    state.currentUser = u;
    sessionStorage.setItem('aicam-user', JSON.stringify(u));
    // ผู้ใช้ที่ผูกกับโรงงาน → ตั้งโรงงานให้อัตโนมัติ
    if (u && u.factory) { settings.factory = u.factory; saveSettings(); }
  }
  function isAdmin() { return state.currentUser && state.currentUser.role === 'admin'; }
  function isUnlocked() {
    if (!state.currentUser) {
      const su = sessionStorage.getItem('aicam-user');
      if (su) try { state.currentUser = JSON.parse(su); } catch (e) {}
    }
    if (sessionStorage.getItem('aicam-unlocked') === '1') return true;
    const until = +localStorage.getItem('aicam-unlock-until') || 0;
    if (Date.now() < until) {
      if (!state.currentUser) {
        const su = localStorage.getItem('aicam-user-remember');
        if (su) try { state.currentUser = JSON.parse(su); } catch (e) {}
      }
      return true;
    }
    return false;
  }

  let pickedUser = null;  // ผู้ใช้ที่เลือกบนหน้า login

  function renderLockUsers() {
    const box = $('lock-users');
    if (!box) return;
    const users = settings.users || [];
    box.innerHTML = users.map((u, i) =>
      `<button class="luser ${i === 0 ? 'active' : ''}" data-ui="${i}">${u.role === 'admin' ? '👑' : '👤'} ${u.name}</button>`
    ).join('');
    pickedUser = users[0] || null;
    box.querySelectorAll('.luser').forEach(b => b.addEventListener('click', () => {
      pickedUser = settings.users[+b.dataset.ui];
      box.querySelectorAll('.luser').forEach(x => x.classList.toggle('active', x === b));
      $('lock-input').value = '';
      $('lock-input').focus();
    }));
  }

  function tryUnlock() {
    const input = $('lock-input');
    // ถ้าเลือกผู้ใช้ไว้: ตรวจรหัสกับผู้ใช้นั้น · ไม่งั้นค้นทุกผู้ใช้
    let u = null;
    if (pickedUser && String(pickedUser.pin) === String(input.value)) u = pickedUser;
    else u = findUserByPin(input.value);
    if (u) {
      sessionStorage.setItem('aicam-unlocked', '1');
      setCurrentUser(u);
      if ($('lock-remember').checked) {
        localStorage.setItem('aicam-unlock-until', String(Date.now() + 7 * 864e5));
        localStorage.setItem('aicam-user-remember', JSON.stringify(u));
      }
      input.value = '';
      showApp();
    } else {
      const err = $('lock-error');
      err.textContent = t('lock_wrong');
      err.classList.remove('show');
      void err.offsetWidth; // restart animation
      err.classList.add('show');
      input.value = '';
      input.focus();
    }
  }

  function initLock() {
    renderLockUsers();
    $('lock-btn').addEventListener('click', tryUnlock);
    $('lock-input').addEventListener('keydown', e => { if (e.key === 'Enter') tryUnlock(); });
    document.querySelectorAll('.lang-chip').forEach(chip => {
      chip.classList.toggle('active', chip.dataset.lang === I18N.lang);
      chip.addEventListener('click', () => {
        I18N.setLang(chip.dataset.lang);
        document.querySelectorAll('.lang-chip').forEach(c =>
          c.classList.toggle('active', c.dataset.lang === chip.dataset.lang));
        renderLockUsers();
      });
    });
  }

  function logout() {
    sessionStorage.removeItem('aicam-unlocked');
    sessionStorage.removeItem('aicam-user');
    localStorage.removeItem('aicam-unlock-until');
    localStorage.removeItem('aicam-user-remember');
    location.reload();
  }

  function showApp() {
    $('lock-screen').hidden = true;
    $('app').hidden = false;
    if (!state.appStarted) {
      state.appStarted = true;
      startApp();
    }
  }

  /* ================= MAIN APP ================= */
  function startApp() {
    initTabs();
    initCapture();
    initCalibrate();
    initAnalyze();
    initSaveShare();
    initReports();
    initSettings();
    syncSettingsForm();
    populateProductSelect();
    populateDieSelect();
    populateFactorySelect();
    populateShiftSelect();
    populateStageSelect();
    populateRefSelect();
    initAutoCal();
    initColorCal();
    applyRole();
    updateUserBadge();
    syncOfflineBadge();
    Learn.render();
    $('btn-logout').addEventListener('click', () => { if (confirm(t('logout_confirm'))) logout(); });
    updateCalibStatus();
    checkNet();

    // ดึงตั้งค่ามาตรฐานองค์กรจากออนไลน์ ให้ทุกเครื่องตรงกัน
    applyLogo();
    loadSharedConfig().then(ok => {
      if (ok) {
        syncSettingsForm();
        populateDieSelect();
        renderLockUsers();
        applyRole();
        applyLogo();
      }
    });

    $('lang-select').value = I18N.lang;
    $('lang-select').addEventListener('change', e => I18N.setLang(e.target.value));
    document.addEventListener('langchange', onLangChange);

    ChatBot.init({
      lang: I18N.lang,
      getContext: () => state.results
        ? { stats: state.results.stats, specResult: state.results.specResult, spec: state.results.spec }
        : null,
    });

    // กราฟในส่วนยุบ — ปรับขนาดเมื่อกางออก (canvas ใน details ที่ปิดมีขนาด 0)
    const md = $('more-details');
    if (md) md.addEventListener('toggle', () => {
      if (md.open) ['chart-donut', 'chart-dia', 'chart-radar'].forEach(id => {
        try { state.charts[id] && state.charts[id].resize(); } catch (e) {}
      });
    });

    // deep link: ?report=<id>
    const rid = new URLSearchParams(location.search).get('report');
    if (rid) {
      switchTab('tab-reports');
      openReport(rid);
    }
  }

  function onLangChange() {
    $('lang-select').value = I18N.lang;
    updateCalibStatus();
    populateProductSelect();
    populateDieSelect();
    populateFactorySelect();
    populateShiftSelect();
    populateStageSelect();
    populateRefSelect();
    renderSpecEditor();
    renderUsersEditor();
    Learn.render();
    renderDensity();
    applyRole();
    if (state.results) renderResults(false);
    if ($('tab-reports').classList.contains('active')) loadReports();
    if ($('tab-settings').classList.contains('active')) renderStorageMeter();
  }

  /* ---------------- โรงงาน / ชนิดอาหาร / กะ / วัตถุอ้างอิง ---------------- */
  function populateFactorySelect() {
    const sel = $('factory-select');
    if (!sel) return;
    sel.innerHTML = FACTORIES.map(f => `<option value="${f.id}">${factoryName(f.id)}</option>`).join('');
    sel.value = settings.factory || FACTORIES[0].id;
    sel.onchange = () => { settings.factory = sel.value; saveSettings(); };
  }
  function populateProductSelect() {
    const sel = $('product-select');
    if (!sel) return;
    sel.innerHTML = PRODUCTS.map(p => `<option value="${p.id}">${productName(p.id)}</option>`).join('');
    sel.value = settings.product || PRODUCTS[0].id;
    sel.onchange = () => {
      settings.product = sel.value;
      settings.die = 'auto';            // รีเซ็ตเป็นอัตโนมัติเมื่อเปลี่ยนชนิดอาหาร
      saveSettings();
      populateDieSelect();
    };
  }
  function populateShiftSelect() {
    const sel = $('shift-select');
    if (!sel) return;
    sel.innerHTML = SHIFTS.map(s => `<option value="${s.id}">${shiftName(s.id)}</option>`).join('');
    sel.value = settings.shift || '';
    sel.onchange = () => { settings.shift = sel.value; saveSettings(); };
  }
  function populateRefSelect() {
    const sel = $('ref-select');
    if (!sel) return;
    sel.innerHTML = REF_OBJECTS.map(r => `<option value="${r.id}">${refName(r.id)}</option>`).join('');
    sel.value = settings.refObject || REF_OBJECTS[0].id;
    sel.onchange = () => { settings.refObject = sel.value; saveSettings(); };
  }
  function populateStageSelect() {
    const sel = $('stage-select');
    if (!sel) return;
    sel.innerHTML = STAGES.map(s => `<option value="${s.id}">${s.id ? stageLabel(s.id) : stageName(s.id)}</option>`).join('');
    sel.value = settings.stage || '';
    sel.onchange = () => { settings.stage = sel.value; saveSettings(); };
  }

  /* ---------------- ปรับเทียบสีจากการ์ดเทา/ขาว (ข้อ 7) ---------------- */
  function initColorCal() {
    const btn = $('btn-colorcal');
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (!state.img) { alert(t('cal_alert')); return; }
      // วัดสีเฉลี่ยทั้งภาพ (ถือว่าเป็นการ์ดเทา/ขาวเต็มเฟรม) แล้วคำนวณ gain ให้เป็นกลาง
      const c = document.createElement('canvas');
      const s = Math.min(1, 200 / Math.max(state.img.naturalWidth, state.img.naturalHeight));
      c.width = Math.max(1, Math.round(state.img.naturalWidth * s));
      c.height = Math.max(1, Math.round(state.img.naturalHeight * s));
      const cx = c.getContext('2d'); cx.drawImage(state.img, 0, 0, c.width, c.height);
      const d = cx.getImageData(0, 0, c.width, c.height).data;
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
      r /= n; g /= n; b /= n;
      const grey = (r + g + b) / 3;
      if (grey < 25) { toast(t('cal_color_fail')); return; }
      settings.colorGain = { r: grey / (r || 1), g: grey / (g || 1), b: grey / (b || 1) };
      saveSettings();
      toast(t('cal_color_ok'));
    });
  }

  /* ---------------- คาลิเบรตอัตโนมัติ (ข้อ 1) ---------------- */
  function initAutoCal() {
    $('btn-autocal').addEventListener('click', () => {
      if (!state.img) { alert(t('cal_alert')); return; }
      const ref = REF_OBJECTS.find(r => r.id === settings.refObject) || REF_OBJECTS[0];
      $('loading-text').textContent = t('cal_auto_run');
      $('loading').hidden = false;
      setTimeout(() => {
        try {
          const r = Analyzer.detectReference(state.img, ref.mm, { polarity: settings.polarity, refShape: ref.id === 'card' ? 'card' : 'circle' });
          if (!r.found) { toast(t(ref.id === 'card' ? 'cal_auto_fail_card' : 'cal_auto_fail')); return; }
          settings.mmpp = r.mmpp;
          saveSettings();
          syncSettingsForm();
          updateCalibStatus();
          // แสดงภาพที่ตรวจพบวัตถุอ้างอิง
          const c = $('canvas-main');
          c.width = r.annotated.width; c.height = r.annotated.height;
          c.getContext('2d').drawImage(r.annotated, 0, 0);
          state.procScale = state.img.naturalWidth / c.width;
          toast(t('cal_auto_ok', { mm: ref.mm, px: r.diaPx }));
        } catch (e) { toast(t('cal_auto_fail')); console.error(e); }
        finally { $('loading').hidden = true; }
      }, 60);
    });
  }

  /* ---------------- tabs ---------------- */
  function switchTab(tabId) {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
    document.querySelectorAll('.tab').forEach(tb => tb.classList.toggle('active', tb.id === tabId));
    if (tabId === 'tab-reports') loadReports();
    if (tabId === 'tab-settings') renderStorageMeter();
  }

  /* ---------------- มาตรวัดพื้นที่เก็บออนไลน์ (ข้อ 2) ---------------- */
  async function renderStorageMeter() {
    const el = $('storage-meter');
    if (!el) return;
    try {
      const n = await DB.countSessions();
      const perKB = 230;                  // ภาพ + ข้อมูลเฉลี่ยต่อล็อต (KB)
      const usedMB = n * perKB / 1024;
      const capMB = 1024;                 // Supabase free 1 GB
      const pct = Math.min(100, usedMB / capMB * 100);
      const cls = pct >= 85 ? 'fail' : pct >= 60 ? 'warn' : 'ok';
      el.innerHTML = `
        <div class="sm-row"><span>☁️ ${t('storage_used', { n })}</span><b>${usedMB.toFixed(0)} / ${capMB} MB</b></div>
        <div class="sm-bar"><div class="sm-fill ${cls}" style="width:${pct.toFixed(1)}%"></div></div>
        <div class="hint">${t('storage_left', { n: Math.max(0, Math.round((capMB - usedMB) * 1024 / perKB)) })}</div>`;
    } catch (e) { el.innerHTML = ''; }
  }

  /* ---------------- แจ้งเตือน SPC ผ่าน webhook (ข้อ 5) ---------------- */
  let lastAlertKey = '';
  function fireWebhook(msg) {
    const url = settings.webhook;
    if (!url || !/^https?:\/\//.test(url)) return;
    if (lastAlertKey === msg) return;     // กันยิงซ้ำ
    lastAlertKey = msg;
    try {
      fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: msg, text: msg }) }).catch(() => {});
    } catch (e) {}
  }
  function initTabs() {
    document.querySelectorAll('.nav-btn').forEach(btn =>
      btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
  }

  /* ---------------- โหลดภาพ ---------------- */
  function handleFile(file) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      state.img = img;
      const c = $('canvas-main');
      const s = Math.min(1, 1800 / Math.max(img.naturalWidth, img.naturalHeight));
      c.width = Math.round(img.naturalWidth * s);
      c.height = Math.round(img.naturalHeight * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      state.procScale = img.naturalWidth / c.width;
      state.results = null;
      state.lastSavedId = null;
      $('card-image').hidden = false;
      $('card-results').hidden = true;
      $('save-status').textContent = '';
      updateCalibStatus();
      $('card-image').scrollIntoView({ behavior: 'smooth' });
    };
    img.src = url;
  }
  function initCapture() {
    $('input-camera').addEventListener('change', e => { handleFile(e.target.files[0]); e.target.value = ''; });
    $('input-file').addEventListener('change', e => { handleFile(e.target.files[0]); e.target.value = ''; });
  }

  /* ---------------- คาลิเบรต ---------------- */
  function updateCalibStatus() {
    const el = $('calib-status');
    if (settings.mmpp > 0) {
      el.textContent = `${t('cal_scale')}: ${(+settings.mmpp).toFixed(4)} ${t('cal_unit')}`;
      el.classList.add('ok');
    } else {
      el.textContent = t('cal_none');
      el.classList.remove('ok');
    }
  }

  function endCalibration() {
    state.calibrating = false;
    state.calibPts = [];
    $('calib-hint').hidden = true;
    $('btn-calibrate').textContent = t('cal_btn');
    document.querySelector('.canvas-wrap').classList.remove('calibrating');
    updateCalibStatus();
    if (state.img) redrawBase();
  }

  function redrawBase() {
    const c = $('canvas-main');
    const ctx = c.getContext('2d');
    ctx.drawImage(state.img, 0, 0, c.width, c.height);
    ctx.fillStyle = '#3b82f6';
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 3;
    state.calibPts.forEach(p => {
      ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, Math.PI * 2); ctx.fill();
    });
    if (state.calibPts.length === 2) {
      ctx.beginPath();
      ctx.moveTo(state.calibPts[0].x, state.calibPts[0].y);
      ctx.lineTo(state.calibPts[1].x, state.calibPts[1].y);
      ctx.stroke();
    }
  }

  function initCalibrate() {
    $('btn-calibrate').addEventListener('click', () => {
      if (!state.img) return;
      if (state.calibrating) { endCalibration(); return; }
      state.calibrating = true;
      state.calibPts = [];
      $('calib-hint').hidden = false;
      $('btn-calibrate').textContent = t('cal_cancel');
      document.querySelector('.canvas-wrap').classList.add('calibrating');
      redrawBase();
    });

    $('canvas-main').addEventListener('click', e => {
      if (!state.calibrating || !state.img) return;
      const c = $('canvas-main');
      const r = c.getBoundingClientRect();
      const x = (e.clientX - r.left) * c.width / r.width;
      const y = (e.clientY - r.top) * c.height / r.height;
      state.calibPts.push({ x, y });
      redrawBase();
      if (state.calibPts.length === 2) {
        const [p1, p2] = state.calibPts;
        const distProc = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        setTimeout(() => {
          const mm = parseFloat(prompt(t('cal_prompt'), '100'));
          if (mm > 0 && distProc > 2) {
            settings.mmpp = +(mm / (distProc * state.procScale)).toFixed(5);
            saveSettings();
            syncSettingsForm();
          }
          endCalibration();
        }, 60);
      }
    });
  }

  /* ---------------- ไซซ์ die ---------------- */
  function populateDieSelect() {
    const sel = $('die-select');
    sel.innerHTML = `<option value="auto">${t('die_auto')}</option>` +
      `<option value="">${t('die_none')}</option>` +
      specsForProduct().map(s =>
        `<option value="${s.die}">Die ${s.die} — ${s.min_mm}-${s.max_mm} mm (≥${s.target_pct}%)</option>`).join('');
    sel.value = settings.die ?? 'auto';
    if (sel.selectedIndex < 0) sel.value = 'auto';
    sel.onchange = () => {
      settings.die = sel.value;
      saveSettings();
      if (state.results) {
        const r = resolveSpec(state.results.pellets, state.results.stats);
        state.results.spec = r.spec;
        state.results.specAuto = r.auto;
        state.results.specResult = Analyzer.checkSpec(state.results.pellets, r.spec);
        state.results.yield = computeYield(state.results.pellets, r.spec);
        renderSpecPanel(false);
        renderYieldPanel(false);
      }
    };
  }

  /* ---------------- วิเคราะห์ ---------------- */
  function initAnalyze() {
    $('btn-analyze').addEventListener('click', () => {
      if (!state.img) return;
      if (!(settings.mmpp > 0)) { alert(t('cal_alert')); return; }
      $('loading-text').textContent = t('analyzing');
      $('loading').hidden = false;
      $('scan-line').hidden = false;
      setTimeout(() => {
        try {
          const res = Analyzer.analyze(state.img, +settings.mmpp, {
            polarity: settings.polarity,
            minLenMm: +settings.minlen,
            maxLenMm: +settings.maxlen,
            maxAspect: +settings.maxaspect || 8,
            autoSplit: !!settings.autosplit,
          });
          const stats = Analyzer.computeStats(res.pellets, binsArray());
          // ตรวจชนิดอาหารอัตโนมัติจากรูปทรงเม็ด:
          //  เม็ดยาว/ทรงกระบอก (aspect ≥ 1.35) = กุ้ง (pellet mill) · เม็ดกลม/ป้อม (aspect < 1.35) = ปลา (extrusion)
          settings.product = (stats.avg_aspect && stats.avg_aspect < 1.35) ? 'fish' : 'shrimp';
          const r = resolveSpec(res.pellets, stats);
          const specResult = Analyzer.checkSpec(res.pellets, r.spec);
          const yieldResult = computeYield(res.pellets, r.spec);
          state.results = { ...res, stats, specResult, spec: r.spec, specAuto: r.auto, yield: yieldResult, productAuto: settings.product };
          state.lastSavedId = null;
          renderResults(true);
          if (res.blurry) toast('⚠️ ' + t('blur_warn'));
        } catch (err) {
          alert(t('analyze_fail') + ': ' + err.message);
          console.error(err);
        } finally {
          $('loading').hidden = true;
          $('scan-line').hidden = true;
        }
      }, 420);
    });
  }

  /** นับเลขวิ่งขึ้นแบบอนิเมชั่น */
  function animateNum(el, target, decimals, duration = 700) {
    const start = performance.now();
    const from = 0;
    function frame(now) {
      const p = Math.min(1, (now - start) / duration);
      const ease = 1 - Math.pow(1 - p, 3);
      el.textContent = (from + (target - from) * ease).toFixed(decimals);
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function renderResults(animate) {
    const { stats, annotated, rejected, splits, pellets } = state.results;

    const c = $('canvas-main');
    c.width = annotated.width; c.height = annotated.height;
    c.getContext('2d').drawImage(annotated, 0, 0);

    const set = (id, val, dec) => {
      if (animate) animateNum($(id), val, dec);
      else $(id).textContent = val.toFixed(dec);
    };
    set('st-count', stats.count, 0);
    set('st-avg-len', stats.avg_length_mm, 1);
    set('st-avg-dia', stats.avg_diameter_mm, 2);
    set('st-sd', stats.sd_length_mm, 1);
    set('st-min', stats.min_length_mm, 1);
    set('st-max', stats.max_length_mm, 1);
    set('st-area', stats.avg_area_mm2 || 0, 2);
    set('st-cv', stats.cv_pct || 0, 1);

    const sp = $('split-note');
    sp.hidden = false;
    sp.textContent = '📏 ' + t('split_note', {});
    const rj = $('rejected-note');
    if (rejected > 0) { rj.hidden = false; rj.textContent = '⚠️ ' + t('rejected_note', { n: rejected }); }
    else rj.hidden = true;
    const bn = $('blur-note');
    if (bn) {
      if (state.results.blurry) { bn.hidden = false; bn.textContent = '⚠️ ' + t('blur_warn') + ' (focus ' + state.results.focus + ')'; }
      else bn.hidden = true;
    }

    renderSpecPanel(animate);
    renderYieldPanel(animate);
    renderCharts('chart-bar', 'chart-donut', stats, state.charts, state.results.spec);
    renderDiaChart('chart-dia', stats, state.charts);
    renderDistTable($('tbl-dist').querySelector('tbody'), stats.distribution);
    renderColor(stats);
    renderTexture(stats);
    renderPelletTable(pellets);

    // เติมชื่อผู้ตรวจอัตโนมัติจากผู้ใช้ที่ล็อกอิน
    const defOp = (state.currentUser && state.currentUser.name) || settings.operator;
    if (defOp && !$('f-operator').value) $('f-operator').value = defOp;
    renderDensity();
    $('card-results').hidden = false;
    if (animate) $('card-results').scrollIntoView({ behavior: 'smooth' });
  }

  /* ---------------- spec panel ---------------- */
  /** คอนเฟตติฉลองตอนผ่านเกณฑ์ */
  function fireConfetti() {
    const colors = ['#34d399', '#facc15', '#3b82f6', '#f472b6', '#fb923c', '#a78bfa'];
    for (let i = 0; i < 42; i++) {
      const el = document.createElement('div');
      el.className = 'confetti';
      el.style.left = Math.random() * 100 + 'vw';
      el.style.background = colors[i % colors.length];
      el.style.animationDuration = (1.4 + Math.random() * 1.4) + 's';
      el.style.animationDelay = (Math.random() * 0.5) + 's';
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 3200);
    }
  }

  function renderSpecPanel(animate) {
    const panel = $('spec-panel');
    const spec = state.results ? state.results.spec : null;
    const sr = state.results ? state.results.specResult : null;
    if (!spec || !sr) { panel.hidden = true; return; }
    panel.hidden = false;

    const badge = $('spec-badge');
    badge.className = 'spec-badge ' + (sr.pass ? 'pass' : 'fail');
    badge.textContent = sr.pass ? t('spec_pass') : t('spec_fail');

    const autoTag = state.results.specAuto ? ` · ${t('spec_auto')}` : '';
    const prod = state.results.productAuto;
    const prodTag = prod ? `🔎 ${productName(prod)} · ${t(prod === 'fish' ? 'shape_round' : 'shape_cyl')}\n` : '';
    $('spec-meta').textContent =
      `${prodTag}${t('spec_die_dia', { d: spec.die })} · ${t('spec_range', { min: spec.min_mm, max: spec.max_mm })}${autoTag}`;
    $('spec-target').textContent = '🎯 ' + t('spec_target', { t: spec.target_pct });
    if (animate && sr.pass) fireConfetti();

    const segs = [
      ['seg-under', 'lg-under', sr.under_pct],
      ['seg-insize', 'lg-insize', sr.insize_pct],
      ['seg-over', 'lg-over', sr.over_pct],
    ];
    for (const [segId, lgId, pct] of segs) {
      const seg = $(segId);
      seg.querySelector('span').textContent = pct >= 8 ? pct + '%' : '';
      requestAnimationFrame(() => { seg.style.width = pct + '%'; });
      $(lgId).textContent = pct + '%';
    }
  }

  /* ---------------- yield panel (ตะแกรงร่อน) ---------------- */
  function yieldMeshLabel(y) {
    const mesh = settings.sieveUnit === 'mesh';
    const u = mesh ? mmToMesh(y.sieve_under) : y.sieve_under;
    const o = mesh ? mmToMesh(y.sieve_over) : y.sieve_over;
    return t('yield_mesh', { u, o, unit: mesh ? t('unit_mesh') : t('unit_mm') });
  }

  function renderYieldPanel(animate) {
    const panel = $('yield-panel');
    const y = state.results ? state.results.yield : null;
    if (!y) { panel.hidden = true; return; }
    panel.hidden = false;

    if (animate) animateNum($('yield-value'), y.yield, 1);
    else $('yield-value').textContent = y.yield.toFixed(1);
    $('yield-ring').style.setProperty('--p', y.yield);
    $('yield-ring').className = 'yield-ring ' + (y.pass ? 'pass' : 'fail');

    const badge = $('yield-badge');
    badge.className = 'spec-badge ' + (y.pass ? 'pass' : 'fail');
    badge.textContent = y.pass ? t('spec_pass') : t('spec_fail');

    $('yield-meta').textContent = yieldMeshLabel(y) + ' · 🎯 ' + t('yield_target', { t: y.target });

    const segs = [
      ['yseg-under', 'ylg-under', y.under_vol],
      ['yseg-on', 'ylg-on', y.yield],
      ['yseg-over', 'ylg-over', y.over_vol],
    ];
    for (const [segId, lgId, pct] of segs) {
      const seg = $(segId);
      seg.querySelector('span').textContent = pct >= 8 ? pct + '%' : '';
      requestAnimationFrame(() => { seg.style.width = pct + '%'; });
      $(lgId).textContent = pct + '%';
    }
    if (animate && y.pass) fireConfetti();
  }

  /* ---------------- charts ---------------- */
  const PALETTE = ['#86efac', '#34d399', '#3b82f6', '#6366f1', '#a855f7', '#ca8a04', '#f43f5e', '#94a3b8'];

  function renderCharts(barId, donutId, stats, store, spec) {
    const labels = stats.distribution.map(d => d.label);
    const counts = stats.distribution.map(d => d.count);
    // ลงสีแท่งตามเป้าหมาย (histogram + target): ในสเปก=เขียว · ต่ำกว่า=ส้ม · เกิน=แดง
    let colors;
    if (spec && spec.min_mm != null) {
      colors = stats.distribution.map(d => {
        const lo = d.min_mm ?? 0, hi = d.max_mm ?? Infinity, mid = (lo + (hi === null ? lo : hi)) / 2;
        if (hi <= spec.min_mm) return '#f59e0b';            // under
        if (lo >= spec.max_mm) return '#ef4444';            // over
        return '#16a34a';                                    // in-spec
      });
    } else {
      colors = labels.map((_, i) => PALETTE[i % PALETTE.length]);
    }

    if (store[barId]) store[barId].destroy();
    store[barId] = new Chart($(barId), {
      type: 'bar',
      data: { labels, datasets: [{ data: counts, backgroundColor: colors, borderRadius: 4 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, title: { display: true, text: t('chart_len_title') + (spec ? ` · ${t('spec_range', { min: spec.min_mm, max: spec.max_mm })}` : '') } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
      },
    });

    if (store[donutId]) store[donutId].destroy();
    store[donutId] = new Chart($(donutId), {
      type: 'doughnut',
      data: {
        labels: labels.map((l, i) => `${l} (${stats.distribution[i].pct}%)`),
        datasets: [{ data: counts, backgroundColor: colors }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { boxWidth: 14, font: { size: 11 } } },
          title: { display: true, text: t('chart_total', { n: stats.count }) },
        },
      },
    });
  }

  function renderDiaChart(id, stats, store) {
    const dd = stats.dia_distribution || [];
    if (store[id]) store[id].destroy();
    store[id] = new Chart($(id), {
      type: 'bar',
      data: {
        labels: dd.map(d => d.label),
        datasets: [{ data: dd.map(d => d.count), backgroundColor: '#0ea5e9', borderRadius: 4 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, title: { display: true, text: t('chart_dia_title') } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
      },
    });
  }

  /** รายงานเก่าบันทึกช่วงเป็น ซม. — แปลงป้ายเป็น มม. ให้ตรงหน่วยปัจจุบัน */
  function normalizeDist(dist) {
    return (dist || []).map(d => {
      if (d.min_mm !== undefined || d.min_cm === undefined) return d;
      const label = d.label.replace(/\d+(\.\d+)?/g, m => {
        const v = parseFloat(m) * 10;
        return Number.isInteger(v) ? String(v) : v.toFixed(1);
      });
      return { ...d, label };
    });
  }

  function renderDistTable(tbody, distribution) {
    tbody.innerHTML = distribution.map(d =>
      `<tr><td>${d.label}</td><td>${d.count}</td><td>${d.pct}%</td></tr>`).join('');
  }

  function hexToRgb(hex) {
    const v = parseInt(hex.slice(1), 16);
    return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
  }

  /* CIELAB → RGB (D65) สำหรับสร้างแถบสเกล ΔE00 */
  function lab2rgb(L, a, b) {
    let y = (L + 16) / 116, x = a / 500 + y, z = y - b / 200;
    const f = t => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);
    x = 0.95047 * f(x); y = 1.0 * f(y); z = 1.08883 * f(z);
    let r = x * 3.2406 - y * 1.5372 - z * 0.4986;
    let g = -x * 0.9689 + y * 1.8758 + z * 0.0415;
    let bl = x * 0.0557 - y * 0.2040 + z * 1.0570;
    const gm = c => (c > 0.0031308 ? 1.055 * Math.pow(c, 1 / 2.4) - 0.055 : 12.92 * c);
    const cl = v => Math.max(0, Math.min(255, Math.round(gm(v) * 255)));
    return [cl(r), cl(g), cl(bl)];
  }

  /* หาสีที่ห่างจาก baseLab เท่ากับ target (ΔE) โดยเลื่อนใน Lab */
  function colorAtDeltaE(baseLab, target) {
    if (target <= 0) return baseLab;
    // ทิศทางเลื่อนในปริภูมิ Lab (สว่างขึ้น + เหลืองลง) ค้นด้วย ΔE00 จริง
    let dir = [1.1, -0.25, -0.7];
    const nrm = Math.hypot(...dir); dir = dir.map(x => x / nrm);
    let lo = 0, hi = 120;
    for (let it = 0; it < 30; it++) {
      const m = (lo + hi) / 2;
      const cand = { l: baseLab.l + dir[0] * m, a: baseLab.a + dir[1] * m, b: baseLab.b + dir[2] * m };
      (Analyzer.deltaE2000(baseLab, cand) < target) ? (lo = m) : (hi = m);
    }
    const m = (lo + hi) / 2;
    return { l: Math.max(0, Math.min(100, baseLab.l + dir[0] * m)), a: baseLab.a + dir[1] * m, b: baseLab.b + dir[2] * m };
  }

  /* แถบสเกลสี ΔE00 = 0, 10, 20 จากสีตัวอย่าง */
  function renderColorRange(baseLab, sampleDe, demaxP) {
    const box = $('color-range');
    if (!box || !baseLab) { if (box) box.hidden = true; return; }
    const targets = [0, 5, 10, 15, 20];
    box.hidden = false;
    const swatches = targets.map(tg => {
      const lab = tg === 0 ? baseLab : colorAtDeltaE(baseLab, tg);
      const [r, g, b] = lab2rgb(lab.l, lab.a, lab.b);
      return `<div class="cr-item"><div class="cr-sw" style="background:rgb(${r},${g},${b})"></div><div class="cr-lab"><b>${tg}</b></div></div>`;
    }).join('');
    // เครื่องหมายตำแหน่ง ΔE00 จริงของตัวอย่าง (ถ้าเทียบสีอ้างอิง)
    let marker = '';
    if (sampleDe != null) {
      const pos = Math.max(0, Math.min(100, sampleDe / 20 * 100));
      const cls = sampleDe <= (demaxP || +settings.demax) ? 'ok' : 'bad';
      marker = `<div class="cr-marker-wrap"><div class="cr-marker ${cls}" style="left:${pos}%">▼ ${sampleDe.toFixed(1)}</div></div>`;
    }
    box.innerHTML = `<div class="cr-title">${t('color_range_title')}</div>` +
      `<div class="cr-scale"><div class="cr-swatches">${swatches}</div>${marker}</div>` +
      `<div class="cr-axis"><span>ΔE00</span><span>${t('color_range_legend')}</span></div>`;
  }

  function renderColor(stats) {
    const ac = stats.avg_color;
    if (!ac) return;
    // ใช้ค่าปรับเทียบสี (white/grey card) ถ้ามี
    const gain = settings.colorGain;
    if (gain && !ac._gained) {
      ac.r = Math.max(0, Math.min(255, Math.round(ac.r * gain.r)));
      ac.g = Math.max(0, Math.min(255, Math.round(ac.g * gain.g)));
      ac.b = Math.max(0, Math.min(255, Math.round(ac.b * gain.b)));
      const lab2 = Analyzer.rgb2lab(ac.r, ac.g, ac.b);
      ac.lab = { l: +lab2.l.toFixed(2), a: +lab2.a.toFixed(2), b: +lab2.b.toFixed(2) };
      ac._gained = true;
    }
    $('swatch-avg').style.background = `rgb(${ac.r},${ac.g},${ac.b})`;
    $('color-rgb').textContent = `RGB(${ac.r}, ${ac.g}, ${ac.b})${gain ? ' ⚖︎' : ''}`;
    const refBox = $('ref-color-box'), verdict = $('color-verdict');

    const lab = ac.lab;
    let labHtml = `
      <h3 style="margin-top:0">${t('lab_title')}</h3>
      <div class="lab-vals">
        <div class="lab-val"><b>${(+lab.l).toFixed(1)}</b><span>L* (0-100)</span></div>
        <div class="lab-val"><b>${(+lab.a).toFixed(1)}</b><span>a* (−G / +R)</span></div>
        <div class="lab-val"><b>${(+lab.b).toFixed(1)}</b><span>b* (−B / +Y)</span></div>
      </div>`;

    // สีมาตรฐานแยกตามชนิดอาหาร (กุ้ง/ปลา ตั้งค่าแยกกัน)
    const isFish = state.results && state.results.productAuto === 'fish';
    const refHex = isFish ? (settings.refcolorFish || settings.refcolor) : settings.refcolor;
    const demaxP = isFish ? (+settings.demaxFish || +settings.demax) : +settings.demax;
    if (settings.userefcolor) {
      const ref = hexToRgb(refHex);
      const refLab = Analyzer.rgb2lab(ref.r, ref.g, ref.b);
      const de76 = Analyzer.deltaE(lab, refLab);
      const de00 = Analyzer.deltaE2000(lab, refLab);
      ac.delta_e76 = +de76.toFixed(2);
      ac.delta_e00 = +de00.toFixed(2);
      ac.ref_lab = { l: +refLab.l.toFixed(2), a: +refLab.a.toFixed(2), b: +refLab.b.toFixed(2) };
      refBox.hidden = false;
      $('swatch-ref').style.background = refHex;
      $('color-de').textContent = `ΔE00 = ${de00.toFixed(1)} (${productName(isFish ? 'fish' : 'shrimp')})`;
      verdict.hidden = false;
      const pass = de00 <= demaxP;
      verdict.className = 'verdict ' + (pass ? 'pass' : 'fail');
      verdict.textContent = pass ? t('color_pass') : t('color_fail');

      const dL = lab.l - refLab.l, dA = lab.a - refLab.a, dB = lab.b - refLab.b;
      labHtml += `
        <div class="lab-vals">
          <div class="lab-val"><b>${dL >= 0 ? '+' : ''}${dL.toFixed(1)}</b><span>ΔL* (${t('color_ref')} ${refLab.l.toFixed(1)})</span></div>
          <div class="lab-val"><b>${dA >= 0 ? '+' : ''}${dA.toFixed(1)}</b><span>Δa* (${t('color_ref')} ${refLab.a.toFixed(1)})</span></div>
          <div class="lab-val"><b>${dB >= 0 ? '+' : ''}${dB.toFixed(1)}</b><span>Δb* (${t('color_ref')} ${refLab.b.toFixed(1)})</span></div>
        </div>
        <div class="lab-de">
          <div class="de-box"><b>${de76.toFixed(2)}</b><span>ΔE*ab (CIE76)</span></div>
          <div class="de-box"><b>${de00.toFixed(2)}</b><span>ΔE00 (CIEDE2000)</span></div>
        </div>
        <div class="lab-formula">ΔE*ab = √(ΔL*² + Δa*² + Δb*²) = √(${dL.toFixed(1)}² + ${dA.toFixed(1)}² + ${dB.toFixed(1)}²) = ${de76.toFixed(2)}</div>`;
    } else {
      refBox.hidden = true; verdict.hidden = true;
    }
    $('lab-panel').innerHTML = labHtml;
    $('lab-panel').hidden = false;
    renderColorRange(lab, settings.userefcolor ? ac.delta_e00 : null, demaxP);
  }

  /* ---------------- คุณภาพหน้าตัดเม็ด ---------------- */
  function renderTexture(stats) {
    const tx = stats.texture;
    const panel = $('texture-panel');
    if (!tx) { panel.hidden = true; return; }
    panel.hidden = false;

    const ring = panel.querySelector('.tex-score-ring');
    ring.style.setProperty('--p', tx.score);
    $('tex-score').textContent = tx.score.toFixed(0);
    $('tex-grade').textContent = `${t('tex_score_label')} · ${tx.grade}`;

    $('tex-cards').innerHTML = `
      <div class="tex-card"><b>${tx.fineness}</b><span>${t('tex_fineness')}</span></div>
      <div class="tex-card"><b>${tx.roughness_pct}%</b><span>${t('tex_rough')}</span></div>
      <div class="tex-card"><b>${tx.homogeneity}</b><span>${t('tex_homog')}</span></div>
      <div class="tex-card"><b>${tx.contrast}</b><span>${t('tex_contrast')}</span></div>
      <div class="tex-card"><b>${tx.entropy}</b><span>${t('tex_entropy')}</span></div>
      <div class="tex-card"><b>${tx.uniformity}</b><span>${t('tex_uniform')}</span></div>`;

    if (state.charts['chart-radar']) state.charts['chart-radar'].destroy();
    state.charts['chart-radar'] = new Chart($('chart-radar'), {
      type: 'radar',
      data: {
        labels: [t('r_fine'), t('r_homog'), t('r_uniform'), t('r_smooth'), t('r_energy')],
        datasets: [{
          data: [tx.fineness, tx.homogeneity * 100, tx.uniformity, tx.smoothness,
                 Math.min(100, tx.energy * 100 * 2)],
          backgroundColor: 'rgba(27,110,90,.25)',
          borderColor: '#1b6e5a',
          pointBackgroundColor: '#1b6e5a',
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, title: { display: true, text: t('radar_title') } },
        scales: { r: { beginAtZero: true, max: 100, ticks: { stepSize: 25, font: { size: 9 } } } },
      },
    });
  }

  function renderPelletTable(pellets) {
    $('tbl-pellets').querySelector('tbody').innerHTML = pellets.map((p, i) =>
      `<tr><td>${i + 1}</td>
       <td>${p.length_mm.toFixed(1)}</td><td>${p.diameter_mm.toFixed(2)}</td>
       <td><span class="dot" style="background:rgb(${p.color.r},${p.color.g},${p.color.b})"></span></td></tr>`
    ).join('');
  }

  /* ---------------- บันทึก / แชร์ ---------------- */
  function reportUrl(id) {
    return location.origin + location.pathname + '?report=' + id;
  }

  async function shareReport(id, name, count, avgLen) {
    if (!id) { toast(t('share_first')); return; }
    const text = t('share_text', { name: name || '', n: count, len: avgLen });
    const url = reportUrl(id);
    // 1) Web Share API (มือถือ) — เฉพาะ secure context
    if (navigator.share && window.isSecureContext) {
      try { await navigator.share({ title: 'AICAM Pellet Analyzer', text, url }); return; }
      catch (e) { if (e && e.name === 'AbortError') return; /* ผู้ใช้ยกเลิก */ }
    }
    // 2) คัดลอกลิงก์ลงคลิปบอร์ด
    try {
      await navigator.clipboard.writeText(url);
      toast(t('link_copied'));
      return;
    } catch { /* ตกไปวิธีสำรอง */ }
    // 3) สำรอง: เลือกข้อความใน input ชั่วคราว
    try {
      const ta = document.createElement('textarea');
      ta.value = url; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.focus(); ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      toast(t('link_copied'));
    } catch {
      prompt('URL', url);
    }
  }

  /* ---------------- ความหนาแน่นอาหาร (ข้อ 8) ----------------
   * Bulk density (g/L) = น้ำหนัก ÷ ปริมาตรภาชนะ × 1000 (วิธีถ้วยตวงมาตรฐาน)
   * Particle density (g/cm³) = น้ำหนัก ÷ ปริมาตรเม็ดรวมจากภาพ (Σ π/4·d²·L)
   */
  function computeDensity() {
    const w = parseFloat($('f-weight').value) || 0;     // กรัม (น้ำหนักเม็ดที่ชั่ง = เม็ดในภาพ)
    // ปริมาตรเม็ดวัดจากภาพ: Σ π/4·d²·L (mm³) → cm³
    let imgVol = null, n = 0;
    if (state.results && state.results.pellets && state.results.pellets.length) {
      n = state.results.pellets.length;
      const sumMm3 = state.results.pellets.reduce((s, p) =>
        s + Math.PI / 4 * p.diameter_mm * p.diameter_mm * p.length_mm, 0);
      imgVol = sumMm3 / 1000;                            // cm³
    }
    let particle = null;
    if (w > 0 && imgVol && imgVol > 0) particle = w / imgVol; // g/cm³ (น้ำหนัก = เม็ดในภาพ)
    return {
      weight: w || null,
      imgvol_cm3: imgVol != null ? +imgVol.toFixed(3) : null, count: n,
      particle_gcm3: particle != null ? +particle.toFixed(3) : null };
  }
  function renderDensity() {
    const out = $('density-out');
    if (!out) return;
    const d = computeDensity();
    const parts = [];
    // 1) ปริมาตรเม็ดวัดจากภาพ — แสดงเสมอเมื่อมีผลวิเคราะห์
    if (d.imgvol_cm3 != null) parts.push(`${t('density_imgvol')}: <b>${d.imgvol_cm3} cm³</b> · ${d.count} ${t('rep_items')}`);
    // 2) ความหนาแน่นเม็ด (Particle) = น้ำหนัก ÷ ปริมาตรจากภาพ — แสดงเสมอ พร้อมธงเตือนถ้าผิดช่วง
    if (d.particle_gcm3 != null) {
      const ok = d.particle_gcm3 >= 0.9 && d.particle_gcm3 <= 1.6; // ช่วงอ้างอิงอาหารเม็ดทั่วไป
      parts.push(`${t('density_particle')}: <b>${d.particle_gcm3} g/cm³</b> ${ok ? '✓' : '⚠️'}`);
      if (!ok) parts.push(`<span class="hint">⚠️ ${t('density_particle_warn')}</span>`);
    }
    out.innerHTML = parts.length ? parts.join('<br>') : t('density_hint');
  }

  function initSaveShare() {
    ['f-weight'].forEach(id => { const e = $(id); if (e) e.addEventListener('input', renderDensity); });
    $('btn-save').addEventListener('click', async () => {
      if (!state.results) return;
      const btn = $('btn-save'), st = $('save-status');
      btn.disabled = true;
      st.className = 'save-status'; st.textContent = t('saving');
      try {
        const blob = await compressCanvas(state.results.annotated);
        const s = state.results.stats;
        const sr = state.results.specResult;
        const spec = state.results.spec;
        if ($('f-operator').value) { settings.operator = $('f-operator').value; saveSettings(); }
        const record = {
          factory: settings.factory || null,
          product: settings.product || null,
          shift: settings.shift || null,
          stage: settings.stage || null,
          density: (() => { const d = computeDensity(); return (d.particle_gcm3 || d.imgvol_cm3) ? d : null; })(),
          sample_name: $('f-sample').value || null,
          operator: $('f-operator').value || null,
          notes: $('f-notes').value || null,
          pellet_count: s.count,
          avg_length_mm: s.avg_length_mm,
          sd_length_mm: s.sd_length_mm,
          min_length_mm: s.min_length_mm,
          max_length_mm: s.max_length_mm,
          avg_diameter_mm: s.avg_diameter_mm,
          sd_diameter_mm: s.sd_diameter_mm,
          distribution: s.distribution,
          avg_color: s.avg_color,
          texture: s.texture,
          mm_per_px: +settings.mmpp,
          pellets: state.results.pellets,
          die_size: spec ? String(spec.die) : null,
          spec: spec || null,
          under_pct: sr ? sr.under_pct : null,
          insize_pct: sr ? sr.insize_pct : null,
          over_pct: sr ? sr.over_pct : null,
          spec_pass: sr ? sr.pass : null,
          yield: state.results.yield || null,
        };
        try {
          const saved = await DB.saveSession(record, blob);
          state.lastSavedId = saved.id;
          st.className = 'save-status ok';
          st.textContent = t('save_ok');
        } catch (netErr) {
          // ออฟไลน์/บันทึกไม่ได้ → เก็บคิวไว้ซิงค์ภายหลัง (ข้อ 8)
          const img = blob ? await new Promise(rs => { const fr = new FileReader(); fr.onload = () => rs(fr.result); fr.readAsDataURL(blob); }) : null;
          const q = offlineQueue(); q.push({ record, image: img }); setQueue(q);
          st.className = 'save-status ok';
          st.textContent = t('save_offline');
          console.warn('queued offline:', netErr);
        }
      } catch (err) {
        st.className = 'save-status err';
        st.textContent = t('save_err') + ': ' + (err.message || err);
        console.error(err);
      } finally {
        btn.disabled = false;
      }
    });

    $('btn-share').addEventListener('click', () => {
      if (!state.results) return;
      if (!state.lastSavedId) { toast(t('share_first')); return; }
      const s = state.results.stats;
      shareReport(state.lastSavedId, $('f-sample').value, s.count, s.avg_length_mm.toFixed(1));
    });

    $('btn-csv').addEventListener('click', () => {
      if (!state.results) return;
      const s = {
        ...state.results.stats,
        pellet_count: state.results.stats.count,
        sample_name: $('f-sample').value, operator: $('f-operator').value, notes: $('f-notes').value,
        die_size: state.results.spec ? String(state.results.spec.die) : null,
        under_pct: state.results.specResult?.under_pct,
        insize_pct: state.results.specResult?.insize_pct,
        over_pct: state.results.specResult?.over_pct,
        spec_pass: state.results.specResult?.pass,
      };
      downloadCsv(`pellet-${Date.now()}.csv`, sessionCsvRows(s, state.results.pellets));
    });

    $('btn-pdf').addEventListener('click', () => { if (state.results) exportPDF(); });
  }

  /* ---------------- บีบอัดรูปก่อนอัปโหลด (ข้อ 1) — ยืดพื้นที่เก็บ ---------------- */
  function compressCanvas(src) {
    const MAXW = 1100;                       // จำกัดความกว้างรูปที่บันทึก
    let c = src;
    if (src.width > MAXW) {
      const s = MAXW / src.width;
      c = document.createElement('canvas');
      c.width = MAXW; c.height = Math.round(src.height * s);
      c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    }
    // ใช้ WebP ถ้ารองรับ (เล็กกว่า JPEG ~30%) ไม่งั้น JPEG
    const webp = c.toDataURL('image/webp', 0.7).startsWith('data:image/webp');
    return new Promise(r => c.toBlob(r, webp ? 'image/webp' : 'image/jpeg', 0.72));
  }

  /* ---------------- PDF (พิมพ์/บันทึก) ข้อ 4 ---------------- */
  function exportPDF() {
    const s = state.results.stats, sr = state.results.specResult, y = state.results.yield, sp = state.results.spec;
    const ac = s.avg_color;
    const img = state.results.annotated.toDataURL('image/jpeg', 0.85);
    const row = (k, v) => `<tr><td>${k}</td><td><b>${v}</b></td></tr>`;
    const now = new Date().toLocaleString();
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>AICAM Report</title>
      <style>
        body{font-family:-apple-system,"Segoe UI",Roboto,"Sarabun",sans-serif;color:#1f2937;margin:24px;}
        h1{color:#1b6e5a;margin:0 0 2px;font-size:22px;} .sub{color:#6b7280;font-size:13px;margin-bottom:14px;}
        table{border-collapse:collapse;width:100%;margin:8px 0 16px;font-size:13px;}
        td{border:1px solid #e5e7eb;padding:6px 10px;} td:first-child{color:#6b7280;width:55%;}
        .imgs{display:flex;gap:12px;flex-wrap:wrap;} img{max-width:340px;border:1px solid #ddd;border-radius:8px;}
        .badge{display:inline-block;padding:3px 10px;border-radius:99px;font-weight:700;font-size:12px;}
        .pass{background:#dcfce7;color:#16a34a;} .fail{background:#fee2e2;color:#dc2626;}
        .grid{display:flex;gap:18px;flex-wrap:wrap;}
        @media print{ button{display:none;} }
      </style></head><body>
      <h1>🌾 AICAM Pellet Analyzer — รายงานคุณภาพอาหารเม็ด</h1>
      <div class="sub">${now} · ${factoryName(settings.factory)} · ${productName(settings.product)}${settings.shift ? ' · ' + shiftName(settings.shift) : ''} · ${t('rep_inspector')}: ${$('f-operator').value || '-'}${$('f-sample').value ? ' · ' + $('f-sample').value : ''}</div>
      <div class="grid"><div style="flex:1;min-width:260px">
        <table>
          ${row(t('st_count'), s.count)}
          ${row(t('st_avg_len') + ' มม.', s.avg_length_mm.toFixed(2))}
          ${row(t('st_avg_dia') + ' มม.', s.avg_diameter_mm.toFixed(2))}
          ${row(t('st_sd'), s.sd_length_mm.toFixed(2))}
          ${row(t('st_min') + '/' + t('st_max'), s.min_length_mm.toFixed(1) + ' / ' + s.max_length_mm.toFixed(1))}
          ${row(t('st_area'), (s.avg_area_mm2 || 0).toFixed(2))}
          ${row(t('st_cv'), (s.cv_pct || 0).toFixed(1) + '%')}
          ${sp && sr ? row('Die ' + sp.die + ' · Insize', sr.insize_pct + '% <span class="badge ' + (sr.pass ? 'pass' : 'fail') + '">' + (sr.pass ? t('csv_pass') : t('csv_fail')) + '</span>') : ''}
          ${y ? row('%Yield (' + yieldMeshLabel(y) + ')', y.yield + '% <span class="badge ' + (y.pass ? 'pass' : 'fail') + '">' + (y.pass ? t('csv_pass') : t('csv_fail')) + '</span>') : ''}
          ${(() => { const d = computeDensity(); return d.particle_gcm3 ? row(t('density_particle'), d.particle_gcm3 + ' g/cm³') : ''; })()}
          ${ac && ac.lab ? row('CIELAB', 'L*' + (+ac.lab.l).toFixed(1) + ' a*' + (+ac.lab.a).toFixed(1) + ' b*' + (+ac.lab.b).toFixed(1) + (ac.delta_e00 != null ? ' · ΔE00 ' + ac.delta_e00 : '')) : ''}
          ${s.texture ? row(t('tex_title'), s.texture.score + '/100 (' + s.texture.grade + ')') : ''}
        </table>
      </div>
      <div class="imgs"><img src="${img}"></div></div>
      <p class="sub">วัดด้วย Max/Min Feret diameter (ISO 13322/9276) · คัดเม็ดติดกัน/สิ่งแปลกปลอม · %Yield จากตะแกรงร่อน mesh</p>
      <button onclick="window.print()" style="padding:10px 18px;font-size:15px;border:none;border-radius:8px;background:#1b6e5a;color:#fff;cursor:pointer">🖨 พิมพ์ / บันทึก PDF</button>
      <script>window.onload=()=>setTimeout(()=>window.print(),400)<\/script>
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) { toast(t('pdf_popup')); return; }
    w.document.write(html); w.document.close();
  }

  /* ---------------- CSV ---------------- */
  function downloadCsv(name, rows) {
    const csv = '﻿' + rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function sessionCsvRows(s, pellets) {
    const rows = [
      [t('csv_report_title')],
      [t('csv_date'), s.created_at ? new Date(s.created_at).toLocaleString() : new Date().toLocaleString()],
      [t('csv_sample'), s.sample_name || ''], [t('csv_operator'), s.operator || ''], [t('csv_notes'), s.notes || ''],
      [],
      [t('csv_count'), s.pellet_count],
      [t('csv_avg_len'), s.avg_length_mm], [t('csv_sd'), s.sd_length_mm],
      [t('csv_min'), s.min_length_mm], [t('csv_max'), s.max_length_mm],
      [t('csv_avg_dia'), s.avg_diameter_mm],
    ];
    if (s.die_size != null && s.insize_pct != null) {
      rows.push([],
        [t('csv_die'), s.die_size],
        [t('csv_under'), s.under_pct], [t('csv_insize'), s.insize_pct], [t('csv_over'), s.over_pct],
        [t('csv_result'), s.spec_pass ? t('csv_pass') : t('csv_fail')]);
    }
    if (s.yield) {
      const y = s.yield;
      rows.push([],
        [t('yield_title'), ''],
        [t('yield_mesh_csv'), `${y.sieve_under} - ${y.sieve_over} mm`],
        [t('yield_under'), y.under_vol + '%'], [t('yield_onsize'), y.yield + '%'], [t('yield_over'), y.over_vol + '%'],
        [t('csv_result'), y.pass ? t('csv_pass') : t('csv_fail')]);
    }
    if (s.avg_color && s.avg_color.lab) {
      const lab = s.avg_color.lab;
      rows.push([],
        ['CIELAB', ''],
        ['L*', lab.l], ['a*', lab.a], ['b*', lab.b]);
      if (s.avg_color.delta_e76 != null) {
        rows.push(['ΔE*ab (CIE76)', s.avg_color.delta_e76], ['ΔE00 (CIEDE2000)', s.avg_color.delta_e00]);
      }
    }
    if (s.texture) {
      const tx = s.texture;
      rows.push([],
        [t('tex_title'), ''],
        [t('tex_score_label'), tx.score], ['Grade', tx.grade],
        [t('tex_fineness'), tx.fineness], [t('tex_rough'), tx.roughness_pct],
        [t('tex_homog'), tx.homogeneity], [t('tex_contrast'), tx.contrast],
        [t('tex_entropy'), tx.entropy], ['Energy (GLCM)', tx.energy],
        ['Laplacian variance', tx.lap_var], ['CV', tx.cv]);
    }
    rows.push([],
      [t('th_range_cm'), t('th_count'), t('th_pct')],
      ...normalizeDist(s.distribution).map(d => [d.label, d.count, d.pct]),
      [],
      [t('th_no'), t('th_len'), t('th_dia'), 'R', 'G', 'B'],
      ...(pellets || []).map((p, i) => [i + 1, p.length_mm, p.diameter_mm, p.color?.r, p.color?.g, p.color?.b]));
    return rows;
  }

  /* ---------------- รายงาน ---------------- */
  function renderTrend(rows) {
    const box = $('trend-box');
    const data = rows.slice().reverse(); // เก่า → ใหม่
    if (data.length < 2) { box.hidden = true; return; }
    box.hidden = false;
    const labels = data.map(r => new Date(r.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }));
    if (state.charts['chart-trend']) state.charts['chart-trend'].destroy();
    state.charts['chart-trend'] = new Chart($('chart-trend'), {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: t('trend_len'), data: data.map(r => +r.avg_length_mm),
            borderColor: settings.theme || '#1b6e5a', backgroundColor: mix(settings.theme || '#1b6e5a', 255, 0.85),
            tension: .35, fill: true, yAxisID: 'y',
          },
          {
            label: t('trend_insize'), data: data.map(r => r.insize_pct != null ? +r.insize_pct : null),
            borderColor: '#3b82f6', borderDash: [6, 4],
            tension: .35, spanGaps: true, yAxisID: 'y2',
          },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 14, font: { size: 11 } } } },
        scales: {
          y: { beginAtZero: true, title: { display: true, text: 'mm', font: { size: 10 } } },
          y2: { position: 'right', min: 0, max: 100, grid: { drawOnChartArea: false }, title: { display: true, text: '%', font: { size: 10 } } },
        },
      },
    });
    // ---- SPC: เส้นควบคุม (ข้อ 5) บนแกน insize ----
    const ins = data.map(r => r.insize_pct).filter(v => v != null).map(Number);
    if (ins.length >= 3) {
      const mean = ins.reduce((a, b) => a + b, 0) / ins.length;
      const sd = Math.sqrt(ins.reduce((a, b) => a + (b - mean) ** 2, 0) / ins.length);
      const ucl = Math.min(100, mean + 3 * sd), lcl = Math.max(0, mean - 3 * sd);
      const ch = state.charts['chart-trend'];
      ch.data.datasets.push(
        { label: 'CL', data: labels.map(() => +mean.toFixed(1)), borderColor: '#16a34a', borderWidth: 1, borderDash: [2, 3], pointRadius: 0, yAxisID: 'y2' },
        { label: 'UCL', data: labels.map(() => +ucl.toFixed(1)), borderColor: '#dc2626', borderWidth: 1, borderDash: [4, 4], pointRadius: 0, yAxisID: 'y2' },
        { label: 'LCL', data: labels.map(() => +lcl.toFixed(1)), borderColor: '#dc2626', borderWidth: 1, borderDash: [4, 4], pointRadius: 0, yAxisID: 'y2' },
      );
      ch.update();
    }
    // ---- แจ้งเตือนเมื่อหลุดสเปกติดกัน ----
    const recent = data.slice(-3).filter(r => r.spec_pass != null);
    const fails = recent.filter(r => !r.spec_pass).length;
    const alertEl = $('spc-alert');
    if (recent.length >= 2 && fails >= 2) {
      alertEl.hidden = false;
      alertEl.textContent = t('spc_warn', { n: fails });
      fireWebhook('AICAM SPC: ' + t('spc_warn', { n: fails }) + ' — ' + factoryName(settings.reportFactory || settings.factory));
    } else alertEl.hidden = true;
  }

  /* เปรียบเทียบ (ข้อ 6) — Yield/Insize เฉลี่ย ตามโรงงาน/ผู้ตรวจ/กะ */
  let cmpMode = 'factory';
  function renderCompare(rows) {
    const box = $('compare-box');
    if (rows.length < 2) { box.hidden = true; return; }
    box.hidden = false;
    const keyFn = {
      factory: r => factoryName(r.factory) || '—',
      operator: r => r.operator || '—',
      shift: r => shiftName(r.shift) || '—',
    }[cmpMode];
    const groups = {};
    for (const r of rows) {
      const k = keyFn(r);
      (groups[k] = groups[k] || []).push(r);
    }
    const labels = Object.keys(groups);
    const avgIns = labels.map(k => {
      const v = groups[k].map(r => r.insize_pct).filter(x => x != null).map(Number);
      return v.length ? +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : 0;
    });
    const passRate = labels.map(k => {
      const v = groups[k].filter(r => r.spec_pass != null);
      return v.length ? Math.round(v.filter(r => r.spec_pass).length * 100 / v.length) : 0;
    });
    if (state.charts['chart-compare']) state.charts['chart-compare'].destroy();
    state.charts['chart-compare'] = new Chart($('chart-compare'), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: t('trend_insize'), data: avgIns, backgroundColor: settings.theme || '#1b6e5a', borderRadius: 4 },
          { label: t('daily_pass') + ' %', data: passRate, backgroundColor: '#3b82f6', borderRadius: 4 },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 14, font: { size: 11 } } } },
        scales: { y: { beginAtZero: true, max: 100 } },
      },
    });
  }

  /* แถบกรองโรงงาน */
  function renderFactoryFilter() {
    const box = $('factory-filter');
    if (!box) return;
    const chips = [{ id: '', label: t('factory_all'), color: '#64748b' }]
      .concat(FACTORIES.map(f => ({ id: f.id, label: factoryIcon(f.id) + ' ' + factoryName(f.id), color: f.color })));
    box.innerHTML = chips.map(c => {
      const active = (settings.reportFactory || '') === c.id;
      return `<button class="fchip ${active ? 'active' : ''}" data-fid="${c.id}" style="${active ? `background:${c.color};border-color:${c.color}` : `border-color:${c.color};color:${c.color}`}">${c.label}</button>`;
    }).join('');
    box.querySelectorAll('.fchip').forEach(b => b.addEventListener('click', () => {
      settings.reportFactory = b.dataset.fid;
      saveSettings();
      renderFactoryFilter();
      loadReports();
    }));
  }

  function renderStageFilter() {
    const box = $('stage-filter');
    if (!box) return;
    const chips = [{ id: '', label: t('stage_all') }]
      .concat(STAGES.filter(s => s.id).map(s => ({ id: s.id, label: stageLabel(s.id) })));
    box.innerHTML = chips.map(c =>
      `<button class="fchip ${(settings.reportStage || '') === c.id ? 'active' : ''}" data-sid="${c.id}">${c.label}</button>`
    ).join('');
    box.querySelectorAll('.fchip').forEach(b => b.addEventListener('click', () => {
      settings.reportStage = b.dataset.sid;
      saveSettings();
      renderStageFilter();
      loadReports();
    }));
  }

  /* สรุปผลรายวัน (ภาพรวม) จากรายการที่กรองแล้ว */
  function renderDaily(rows) {
    const box = $('daily-box'), list = $('daily-list');
    if (!rows.length) { box.hidden = true; return; }
    const byDay = {};
    for (const r of rows) {
      const key = new Date(r.created_at).toLocaleDateString();
      (byDay[key] = byDay[key] || []).push(r);
    }
    const days = Object.keys(byDay).slice(0, 14); // ใหม่→เก่า (rows เรียงใหม่สุดก่อน)
    box.hidden = false;
    list.innerHTML = days.map(day => {
      const g = byDay[day];
      const lots = g.length;
      const pellets = g.reduce((s, r) => s + (r.pellet_count || 0), 0);
      const avgLen = g.reduce((s, r) => s + (+r.avg_length_mm || 0), 0) / lots;
      const withSpec = g.filter(r => r.spec_pass != null);
      const passN = withSpec.filter(r => r.spec_pass).length;
      const passRate = withSpec.length ? Math.round(passN * 100 / withSpec.length) : null;
      const insVals = g.filter(r => r.insize_pct != null).map(r => +r.insize_pct);
      const avgIns = insVals.length ? (insVals.reduce((a, b) => a + b, 0) / insVals.length) : null;
      const passCls = passRate == null ? '' : (passRate >= 80 ? 'pass' : passRate >= 50 ? 'warn' : 'fail');
      return `
        <div class="daily-card">
          <div class="daily-date">${day}</div>
          <div class="daily-metrics">
            <span><b>${lots}</b> ${t('daily_lots')}</span>
            <span><b>${pellets}</b> ${t('rep_items')}</span>
            <span><b>${avgLen.toFixed(1)}</b> ${t('daily_avglen')} มม.</span>
            ${avgIns != null ? `<span><b>${avgIns.toFixed(0)}%</b> Insize</span>` : ''}
          </div>
          ${passRate != null ? `<div class="daily-pass ${passCls}">${t('daily_pass')} ${passRate}%</div>` : ''}
        </div>`;
    }).join('');
  }

  async function loadReports() {
    const list = $('report-list');
    renderFactoryFilter();
    renderStageFilter();
    list.innerHTML = `<div class="empty">${t('rep_loading')}</div>`;
    try {
      let rows = await DB.listSessions(300, settings.reportFactory || null);
      if (settings.reportStage) rows = rows.filter(r => r.stage === settings.reportStage);
      if (!rows.length) {
        $('trend-box').hidden = true;
        $('daily-box').hidden = true;
        $('compare-box').hidden = true;
        $('spc-alert').hidden = true;
        list.innerHTML = `<div class="empty">🦐<br>${t('rep_empty')}</div>`;
        return;
      }
      state.reportRows = rows;
      renderDaily(rows);
      renderTrend(rows.slice(0, 30));
      renderCompare(rows);
      list.innerHTML = '';
      rows.forEach((r, idx) => {
        const div = document.createElement('div');
        div.className = 'report-item';
        div.style.animationDelay = Math.min(idx * 0.04, 0.4) + 's';
        if (r.factory) div.style.borderLeft = `5px solid ${factoryColor(r.factory)}`;  // แถบสีประจำโรงงาน
        const d = new Date(r.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
        const passChip = r.spec_pass == null ? '' :
          `<span class="report-pass ${r.spec_pass ? 'pass' : 'fail'}">${r.spec_pass ? '✓' : '✗'} ${r.insize_pct ?? ''}%</span>`;
        div.innerHTML = `
          ${r.image_url ? `<img class="report-thumb" src="${r.image_url}" loading="lazy">` : '<div class="report-thumb"></div>'}
          <div class="report-info">
            <div class="report-title">${r.sample_name || t('rep_noname')}${r.die_size ? ` · Die ${r.die_size}` : ''}</div>
            <div class="report-sub">${d}${r.factory ? ' · ' + factoryIcon(r.factory) + ' ' + factoryName(r.factory) : ''}${r.stage ? ' · ' + stageLabel(r.stage) : ''}${r.operator ? ' · ' + r.operator : ''}</div>
            <div class="report-stats">${r.pellet_count} ${t('rep_items')} · ${t('rep_avg')} ${(+r.avg_length_mm).toFixed(1)} mm · Ø ${(+r.avg_diameter_mm).toFixed(2)} mm</div>
          </div>
          ${passChip}`;
        div.addEventListener('click', () => openReport(r.id));
        list.appendChild(div);
      });
    } catch (err) {
      list.innerHTML = `<div class="empty">${t('rep_load_fail')}: ${err.message || err}</div>`;
    }
  }

  function initReports() {
    $('btn-refresh').addEventListener('click', loadReports);
    $('btn-export-all').addEventListener('click', async () => {
      try {
        const rows = await DB.listSessions(1000, settings.reportFactory || null);
        downloadCsv('pellet-summary.csv', [
          [t('factory_label'), t('csv_date'), t('csv_sample'), t('csv_operator'), t('csv_count'),
           t('csv_avg_len'), t('csv_avg_dia'), t('csv_die'), t('csv_insize'), t('csv_result')],
          ...rows.map(r => [r.factory ? factoryName(r.factory) : '', new Date(r.created_at).toLocaleString(), r.sample_name, r.operator,
            r.pellet_count, r.avg_length_mm, r.avg_diameter_mm, r.die_size ?? '',
            r.insize_pct ?? '', r.spec_pass == null ? '' : (r.spec_pass ? t('csv_pass') : t('csv_fail'))]),
        ]);
      } catch (err) { alert(t('export_fail') + ': ' + (err.message || err)); }
    });
    const closeModal = () => {
      $('modal').hidden = true;
      // ล้าง ?report= ออกจาก URL กันค้าง/เปิดซ้ำตอนรีเฟรช
      if (new URLSearchParams(location.search).get('report')) {
        history.replaceState(null, '', location.pathname);
      }
    };
    $('modal-close').addEventListener('click', closeModal);
    $('modal').addEventListener('click', e => { if (e.target === $('modal')) closeModal(); });
    // แท็บเปรียบเทียบ (ข้อ 6)
    document.querySelectorAll('.cmp-tab').forEach(b => b.addEventListener('click', () => {
      cmpMode = b.dataset.cmp;
      document.querySelectorAll('.cmp-tab').forEach(x => x.classList.toggle('active', x === b));
      if (state.reportRows) renderCompare(state.reportRows);
    }));
  }

  async function openReport(id) {
    const modal = $('modal'), content = $('modal-content');
    modal.hidden = false;
    content.innerHTML = `<div class="empty">${t('rep_loading')}</div>`;
    try {
      const s = await DB.getSession(id);
      const d = new Date(s.created_at).toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'short' });
      const ac = s.avg_color;
      const specHtml = (s.insize_pct == null) ? '' : `
        <div class="spec-panel">
          <div class="spec-head">
            <h3>${t('spec_title')}${s.die_size ? ` — Die ${s.die_size}` : ''}</h3>
            <span class="spec-badge ${s.spec_pass ? 'pass' : 'fail'}">${s.spec_pass ? t('spec_pass') : t('spec_fail')}</span>
          </div>
          ${s.spec ? `<div class="spec-meta">${t('spec_range', { min: s.spec.min_mm, max: s.spec.max_mm })} · ${t('spec_target', { t: s.spec.target_pct })}</div>` : ''}
          <div class="spec-bar">
            <div class="spec-seg under" style="width:${s.under_pct}%"><span>${s.under_pct >= 8 ? s.under_pct + '%' : ''}</span></div>
            <div class="spec-seg insize" style="width:${s.insize_pct}%"><span>${s.insize_pct >= 8 ? s.insize_pct + '%' : ''}</span></div>
            <div class="spec-seg over" style="width:${s.over_pct}%"><span>${s.over_pct >= 8 ? s.over_pct + '%' : ''}</span></div>
          </div>
          <div class="spec-legend">
            <div><i class="lg under"></i>${t('spec_under')} <b>${s.under_pct}%</b></div>
            <div><i class="lg insize"></i>${t('spec_insize')} <b>${s.insize_pct}%</b></div>
            <div><i class="lg over"></i>${t('spec_over')} <b>${s.over_pct}%</b></div>
          </div>
        </div>`;
      const y = s.yield;
      const yieldHtml = !y ? '' : `
        <div class="yield-panel">
          <div class="spec-head">
            <h3>${t('yield_title')}</h3>
            <span class="spec-badge ${y.pass ? 'pass' : 'fail'}">${y.pass ? t('spec_pass') : t('spec_fail')}</span>
          </div>
          <div class="yield-row">
            <div class="yield-ring ${y.pass ? 'pass' : 'fail'}" style="--p:${y.yield}"><div class="yield-value">${y.yield}</div><div class="yield-unit">% Yield</div></div>
            <div class="yield-side">
              <div class="spec-meta">${yieldMeshLabel(y)} · 🎯 ${t('yield_target', { t: y.target })}</div>
              <div class="spec-bar">
                <div class="spec-seg under" style="width:${y.under_vol}%"><span>${y.under_vol >= 8 ? y.under_vol + '%' : ''}</span></div>
                <div class="spec-seg insize" style="width:${y.yield}%"><span>${y.yield >= 8 ? y.yield + '%' : ''}</span></div>
                <div class="spec-seg over" style="width:${y.over_vol}%"><span>${y.over_vol >= 8 ? y.over_vol + '%' : ''}</span></div>
              </div>
              <div class="spec-legend">
                <div><i class="lg under"></i>${t('yield_under')} <b>${y.under_vol}%</b></div>
                <div><i class="lg insize"></i>${t('yield_onsize')} <b>${y.yield}%</b></div>
                <div><i class="lg over"></i>${t('yield_over')} <b>${y.over_vol}%</b></div>
              </div>
            </div>
          </div>
        </div>`;
      content.innerHTML = `
        <h2>${s.sample_name || t('rep_noname')}</h2>
        <p class="hint">${d}${s.operator ? ` · ${t('rep_inspector')}: ${s.operator}` : ''}${s.notes ? `<br>${t('rep_note')}: ${s.notes}` : ''}</p>
        ${s.image_url ? `<img class="modal-img" src="${s.image_url}">` : ''}
        <div class="stat-grid">
          <div class="stat"><div class="stat-num">${s.pellet_count}</div><div class="stat-label">${t('st_count')}</div></div>
          <div class="stat"><div class="stat-num">${(+s.avg_length_mm).toFixed(1)}</div><div class="stat-label">${t('st_avg_len')}</div></div>
          <div class="stat"><div class="stat-num">${(+s.avg_diameter_mm).toFixed(2)}</div><div class="stat-label">${t('st_avg_dia')}</div></div>
          <div class="stat"><div class="stat-num">${(+s.sd_length_mm).toFixed(1)}</div><div class="stat-label">${t('st_sd')}</div></div>
          <div class="stat"><div class="stat-num">${(+s.min_length_mm).toFixed(1)}</div><div class="stat-label">${t('st_min')}</div></div>
          <div class="stat"><div class="stat-num">${(+s.max_length_mm).toFixed(1)}</div><div class="stat-label">${t('st_max')}</div></div>
        </div>
        ${specHtml}
        ${yieldHtml}
        <div class="chart-box"><canvas id="m-chart-bar"></canvas></div>
        <div class="chart-box donut"><canvas id="m-chart-donut"></canvas></div>
        <h3>${t('dist_title')}</h3>
        <table class="tbl"><thead><tr><th>${t('th_range_cm')}</th><th>${t('th_count')}</th><th>${t('th_pct')}</th></tr></thead>
        <tbody id="m-dist"></tbody></table>
        ${ac ? `<h3>${t('color_title')}</h3>
          <div class="color-row"><div class="swatch-box">
            <div class="swatch" style="background:rgb(${ac.r},${ac.g},${ac.b})"></div>
            <div class="swatch-label">RGB(${ac.r}, ${ac.g}, ${ac.b})${ac.delta_e00 != null ? `<br>ΔE00 = ${ac.delta_e00}` : (ac.delta_e != null ? `<br>ΔE = ${ac.delta_e}` : '')}</div>
          </div></div>
          ${ac.lab ? `<div class="lab-panel">
            <div class="lab-vals">
              <div class="lab-val"><b>${(+ac.lab.l).toFixed(1)}</b><span>L*</span></div>
              <div class="lab-val"><b>${(+ac.lab.a).toFixed(1)}</b><span>a*</span></div>
              <div class="lab-val"><b>${(+ac.lab.b).toFixed(1)}</b><span>b*</span></div>
            </div>
            ${ac.delta_e76 != null ? `<div class="lab-de">
              <div class="de-box"><b>${ac.delta_e76}</b><span>ΔE*ab (CIE76)</span></div>
              <div class="de-box"><b>${ac.delta_e00}</b><span>ΔE00 (CIEDE2000)</span></div>
            </div>` : ''}
          </div>` : ''}` : ''}
        ${s.texture ? `<h3>${t('tex_title')}</h3>
          <div class="texture-panel">
            <div class="tex-head">
              <div class="tex-score-ring" style="--p:${s.texture.score}">
                <div class="tex-score">${(+s.texture.score).toFixed(0)}</div>
                <div class="tex-grade">${t('tex_score_label')} · ${s.texture.grade}</div>
              </div>
              <div class="tex-cards">
                <div class="tex-card"><b>${s.texture.fineness}</b><span>${t('tex_fineness')}</span></div>
                <div class="tex-card"><b>${s.texture.roughness_pct}%</b><span>${t('tex_rough')}</span></div>
                <div class="tex-card"><b>${s.texture.homogeneity}</b><span>${t('tex_homog')}</span></div>
                <div class="tex-card"><b>${s.texture.entropy}</b><span>${t('tex_entropy')}</span></div>
              </div>
            </div>
          </div>` : ''}
        <div class="btn-row">
          <button class="btn" id="m-share">${t('share_btn')}</button>
          <button class="btn" id="m-csv">${t('csv_btn')}</button>
          <button class="btn" id="m-del" style="color:var(--danger)">${t('rep_delete')}</button>
        </div>`;
      const dist = normalizeDist(s.distribution);
      renderDistTable($('m-dist'), dist);
      renderCharts('m-chart-bar', 'm-chart-donut',
        { distribution: dist, count: s.pellet_count }, state.charts);
      $('m-share').addEventListener('click', () =>
        shareReport(id, s.sample_name, s.pellet_count, (+s.avg_length_mm).toFixed(1)));
      $('m-csv').addEventListener('click', () => downloadCsv(`pellet-${id.slice(0, 8)}.csv`, sessionCsvRows(s, s.pellets)));
      $('m-del').addEventListener('click', async () => {
        if (!isAdmin()) { toast(t('admin_only')); return; }
        if (!confirm(t('rep_delete_confirm'))) return;
        await DB.deleteSession(id, s.image_url);
        modal.hidden = true;
        loadReports();
      });
    } catch (err) {
      content.innerHTML = `<div class="empty">${t('rep_load_fail')}: ${err.message || err}</div>`;
    }
  }

  /* ---------------- ตั้งค่า ---------------- */
  function renderSpecEditor() {
    const tbody = $('tbl-specs').querySelector('tbody');
    const mesh = settings.sieveUnit === 'mesh';
    const sv = mm => mesh ? mmToMesh(mm) : mm;     // ค่าที่แสดงในช่อง
    const step = mesh ? '1' : '0.05';
    // หัวคอลัมน์ตะแกรงเปลี่ยนตามหน่วย
    $('th-sieve-u').textContent = mesh ? t('th_sieve_u_mesh') : t('th_sieve_u');
    $('th-sieve-o').textContent = mesh ? t('th_sieve_o_mesh') : t('th_sieve_o');
    const prodOpts = i => PRODUCTS.map(p => `<option value="${p.id}"${(settings.specs[i].product || 'shrimp') === p.id ? ' selected' : ''}>${productName(p.id)}</option>`).join('');
    tbody.innerHTML = settings.specs.map((s, i) => `
      <tr>
        <td><select data-spec="${i}" data-f="product">${prodOpts(i)}</select></td>
        <td><input data-spec="${i}" data-f="die" value="${s.die}"></td>
        <td><input data-spec="${i}" data-f="min_mm" type="number" step="0.1" value="${s.min_mm}"></td>
        <td><input data-spec="${i}" data-f="max_mm" type="number" step="0.1" value="${s.max_mm}"></td>
        <td><input data-spec="${i}" data-f="target_pct" type="number" step="5" value="${s.target_pct}"></td>
        <td><input data-spec="${i}" data-f="sieve_under" data-sieve="1" type="number" step="${step}" value="${sv(s.sieve_under)}"></td>
        <td><input data-spec="${i}" data-f="sieve_over" data-sieve="1" type="number" step="${step}" value="${sv(s.sieve_over)}"></td>
        <td><input data-spec="${i}" data-f="yield_target" type="number" step="5" value="${s.yield_target}"></td>
        <td><button class="spec-del" data-del="${i}">🗑</button></td>
      </tr>`).join('');
    tbody.querySelectorAll('input,select').forEach(inp => {
      inp.addEventListener('change', () => {
        const i = +inp.dataset.spec, f = inp.dataset.f;
        if (f === 'die' || f === 'product') { settings.specs[i][f] = inp.value; return; }
        let val = parseFloat(inp.value) || 0;
        if (inp.dataset.sieve && mesh) val = meshToMm(val); // แปลง mesh → มม. ก่อนเก็บ
        settings.specs[i][f] = val;
      });
    });
    tbody.querySelectorAll('.spec-del').forEach(btn => {
      btn.addEventListener('click', () => {
        readSpecEditor();   // กันค่าที่ยังไม่ commit หายตอนลบแถว
        settings.specs.splice(+btn.dataset.del, 1);
        renderSpecEditor();
      });
    });
  }

  // อ่านค่าจากตารางสเปกตรงๆ (กันค่าหายตอนยังไม่ blur/change บนมือถือ) — แก้บั๊ก "บันทึกแล้วไม่เก็บ"
  function readSpecEditor() {
    const mesh = settings.sieveUnit === 'mesh';
    document.querySelectorAll('#tbl-specs tbody input,#tbl-specs tbody select').forEach(inp => {
      const i = +inp.dataset.spec, f = inp.dataset.f;
      if (!settings.specs[i]) return;
      if (f === 'die' || f === 'product') { settings.specs[i][f] = inp.value; return; }
      let val = parseFloat(inp.value) || 0;
      if (inp.dataset.sieve && mesh) val = meshToMm(val);
      settings.specs[i][f] = val;
    });
  }
  function readUsersEditor() {
    document.querySelectorAll('#tbl-users tbody input,#tbl-users tbody select').forEach(inp => {
      const i = +inp.dataset.u, f = inp.dataset.f;
      if (settings.users[i]) settings.users[i][f] = inp.value;
    });
  }

  /* ---------------- ผู้ใช้และสิทธิ์ (ข้อ 7) ---------------- */
  function renderUsersEditor() {
    const tbody = $('tbl-users').querySelector('tbody');
    if (!tbody) return;
    const roleOpts = r => ['admin', 'inspector'].map(x => `<option value="${x}"${r === x ? ' selected' : ''}>${t('role_' + x)}</option>`).join('');
    tbody.innerHTML = settings.users.map((u, i) => `
      <tr>
        <td><input data-u="${i}" data-f="name" value="${u.name || ''}"></td>
        <td><input data-u="${i}" data-f="pin" inputmode="numeric" value="${u.pin || ''}"></td>
        <td><select data-u="${i}" data-f="role">${roleOpts(u.role || 'inspector')}</select></td>
        <td><button class="spec-del" data-deluser="${i}">🗑</button></td>
      </tr>`).join('');
    tbody.querySelectorAll('input,select').forEach(inp => {
      inp.addEventListener('change', () => { settings.users[+inp.dataset.u][inp.dataset.f] = inp.value; });
    });
    tbody.querySelectorAll('.spec-del').forEach(btn => btn.addEventListener('click', () => {
      if (settings.users.length <= 1) return;   // ต้องมีอย่างน้อย 1
      settings.users.splice(+btn.dataset.deluser, 1);
      renderUsersEditor();
    }));
  }

  function syncSettingsForm() {
    $('s-mmpp').value = settings.mmpp || '';
    $('s-operator').value = settings.operator;
    $('s-bins').value = settings.bins;
    $('s-polarity').value = settings.polarity;
    $('s-minlen').value = settings.minlen;
    $('s-maxlen').value = settings.maxlen;
    $('s-maxaspect').value = settings.maxaspect;
    $('s-split').checked = !!settings.autosplit;
    $('s-refcolor').value = settings.refcolor;
    $('s-refcolor-fish').value = settings.refcolorFish || '#8a6a3a';
    $('s-userefcolor').checked = settings.userefcolor;
    $('s-demax').value = settings.demax;
    $('s-demax-fish').value = settings.demaxFish || 12;
    $('s-webhook').value = settings.webhook || '';
    $('s-theme').value = settings.theme;
    $('s-sieveunit').value = settings.sieveUnit || 'mm';
    const lp = $('logo-preview');
    if (settings.logo) { lp.src = settings.logo; lp.hidden = false; } else lp.hidden = true;
    renderThemeSwatches();
    renderSpecEditor();
    renderUsersEditor();
  }

  /* ---------------- โลโก้องค์กร (อัปโหลดไฟล์) ---------------- */
  function applyLogo() {
    const logo = settings.logo;
    // หัวแอป
    const hi = $('header-logo-img'), hs = document.querySelector('.logo .logo-machine');
    if (hi && hs) { if (logo) { hi.src = logo; hi.hidden = false; hs.style.display = 'none'; } else { hi.hidden = true; hs.style.display = ''; } }
    // หน้าล็อก
    const li = $('lock-logo-img'), lm = document.querySelector('.lock-logo .lock-machine');
    if (li && lm) { if (logo) { li.src = logo; li.hidden = false; lm.style.display = 'none'; } else { li.hidden = true; lm.style.display = ''; } }
  }

  function renderThemeSwatches() {
    const box = $('theme-swatches');
    if (!box) return;
    box.innerHTML = THEMES.map(c =>
      `<button class="theme-dot ${settings.theme === c ? 'active' : ''}" data-color="${c}" style="background:${c}"></button>`
    ).join('');
    box.querySelectorAll('.theme-dot').forEach(b => b.addEventListener('click', () => {
      settings.theme = b.dataset.color;
      $('s-theme').value = b.dataset.color;
      applyTheme(settings.theme);
      saveSettings();
      renderThemeSwatches();
    }));
  }

  function initSettings() {
    $('btn-add-spec').addEventListener('click', () => {
      settings.specs.push({ product: settings.product || 'shrimp', die: '', min_mm: 0, max_mm: 0, target_pct: 60, sieve_under: 0, sieve_over: 0, yield_target: 95 });
      renderSpecEditor();
    });
    $('btn-add-user').addEventListener('click', () => {
      settings.users.push({ name: '', pin: '', role: 'inspector', factory: '' });
      renderUsersEditor();
    });
    // อัปโหลดไฟล์โลโก้ (ย่อ ≤256px เก็บเป็น data URL)
    $('s-logo-file').addEventListener('change', e => {
      const f = e.target.files[0]; e.target.value = '';
      if (!f) return;
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, 256 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        settings.logo = c.toDataURL('image/png');
        saveSettings();
        $('logo-preview').src = settings.logo; $('logo-preview').hidden = false;
        applyLogo();
        toast(t('s_logo_set') + ' — ' + t('saving'));
      };
      img.src = URL.createObjectURL(f);
    });
    $('btn-logo-clear').addEventListener('click', () => {
      settings.logo = null; saveSettings(); $('logo-preview').hidden = true; applyLogo();
    });
    $('s-theme').addEventListener('input', e => {
      settings.theme = e.target.value;
      applyTheme(settings.theme);
      renderThemeSwatches();
    });
    $('s-sieveunit').addEventListener('change', e => {
      settings.sieveUnit = e.target.value;
      saveSettings();
      renderSpecEditor();
    });
    $('btn-save-settings').addEventListener('click', () => {
      if (!isAdmin()) { toast(t('admin_only')); return; }
      readSpecEditor();   // อ่านค่าตารางสเปก/ตะแกรง + ผู้ใช้ ที่ยังไม่ commit ก่อนบันทึก
      readUsersEditor();
      settings.mmpp = parseFloat($('s-mmpp').value) || 0;
      settings.operator = $('s-operator').value;
      settings.bins = $('s-bins').value || DEFAULTS.bins;
      settings.polarity = $('s-polarity').value;
      settings.minlen = parseFloat($('s-minlen').value) || DEFAULTS.minlen;
      settings.maxlen = parseFloat($('s-maxlen').value) || DEFAULTS.maxlen;
      settings.maxaspect = parseFloat($('s-maxaspect').value) || DEFAULTS.maxaspect;
      settings.autosplit = $('s-split').checked;
      settings.refcolor = $('s-refcolor').value;
      settings.refcolorFish = $('s-refcolor-fish').value;
      settings.userefcolor = $('s-userefcolor').checked;
      settings.demax = parseFloat($('s-demax').value) || DEFAULTS.demax;
      settings.demaxFish = parseFloat($('s-demax-fish').value) || DEFAULTS.demaxFish;
      settings.webhook = $('s-webhook').value.trim();
      settings.theme = $('s-theme').value || DEFAULTS.theme;
      settings.users = settings.users.filter(u => u.name && /^\d{4,8}$/.test(String(u.pin)));
      if (!settings.users.length) settings.users = [{ name: 'Admin', pin: '1234', role: 'admin' }];
      if (!settings.users.some(u => u.role === 'admin')) settings.users[0].role = 'admin';
      settings.specs = settings.specs.filter(s => s.die !== '' && s.max_mm > 0).map(fillSieveDefaults);
      saveSettings();
      updateCalibStatus();
      populateDieSelect();
      renderSpecEditor();
      renderUsersEditor();
      renderLockUsers();
      // คำนวณ yield ใหม่ถ้ามีผลค้างอยู่
      if (state.results && state.results.spec) {
        state.results.yield = computeYield(state.results.pellets, currentSpec() || state.results.spec);
      }
      $('settings-status').textContent = t('saving');
      // บันทึกตั้งค่ามาตรฐานขึ้นออนไลน์ (ใช้ร่วมทุกเครื่อง)
      saveSharedConfig().then(ok => {
        $('settings-status').textContent = ok ? t('s_saved_sync') : t('s_saved');
        setTimeout(() => { $('settings-status').textContent = ''; }, 2800);
      });
    });
  }

  /* ---------------- สถานะเครือข่าย ---------------- */
  async function checkNet() {
    const el = $('net-status');
    try {
      const ok = await DB.ping();
      el.className = 'net-status ' + (ok ? 'online' : 'offline');
      el.title = ok ? t('net_on') : t('net_off');
      if (ok) flushOfflineQueue();
    } catch {
      el.className = 'net-status offline';
    }
  }

  /* ---------------- ผู้ใช้ / สิทธิ์ (ข้อ 7) ---------------- */
  function updateUserBadge() {
    const b = $('user-badge');
    if (!b) return;
    if (state.currentUser) {
      b.hidden = false;
      b.textContent = (state.currentUser.role === 'admin' ? '👑 ' : '👤 ') + state.currentUser.name;
    } else b.hidden = true;
    b.onclick = () => { if (confirm(t('logout_confirm'))) logout(); };
  }
  function applyRole() {
    // เฉพาะ admin เท่านั้นที่แก้ตั้งค่าได้ — inspector: ปิดทุก input + ซ่อนปุ่ม + แจ้งเตือน
    const admin = isAdmin();
    ['btn-save-settings', 'btn-add-spec', 'btn-add-user', 'btn-logout'].forEach(id => {
      const el = $(id); if (el && id !== 'btn-logout') el.style.display = admin ? '' : 'none';
    });
    const tab = $('tab-settings');
    if (tab) tab.querySelectorAll('input, select, button').forEach(el => {
      if (el.id === 'btn-logout') { el.disabled = false; return; }   // ออกจากระบบได้เสมอ
      el.disabled = !admin;
    });
    const note = $('role-note');
    if (note) { note.hidden = admin; note.textContent = admin ? '' : '🔒 ' + t('admin_only'); }
  }

  /* ---------------- คิวออฟไลน์ (ข้อ 8) ---------------- */
  function offlineQueue() { try { return JSON.parse(localStorage.getItem('aicam-queue') || '[]'); } catch { return []; } }
  function setQueue(q) { localStorage.setItem('aicam-queue', JSON.stringify(q)); syncOfflineBadge(); }
  function syncOfflineBadge() {
    const n = offlineQueue().length;
    const el = $('offline-badge');
    if (!el) return;
    el.hidden = n === 0;
    $('offline-count').textContent = n;
  }
  let flushing = false;
  async function flushOfflineQueue() {
    if (flushing) return;
    const q = offlineQueue();
    if (!q.length) return;
    flushing = true;
    const remain = [];
    for (const item of q) {
      try {
        const blob = item.image ? await (await fetch(item.image)).blob() : null;
        await DB.saveSession(item.record, blob);
      } catch (e) { remain.push(item); }
    }
    setQueue(remain);
    flushing = false;
    if (q.length && !remain.length) toast(t('offline_synced', { n: q.length }));
    if (state.appStarted && document.getElementById('tab-reports').classList.contains('active')) loadReports();
  }

  /* ---------------- init ---------------- */
  applyTheme(settings.theme || DEFAULTS.theme);
  I18N.apply();
  initLock();
  applyLogo();
  // ดึงโลโก้องค์กรจากออนไลน์มาแสดงบนหน้าล็อกด้วย (กรณียังไม่ล็อกอิน)
  DB.getConfig().then(cfg => { if (cfg && cfg.logo) { settings.logo = cfg.logo; applyLogo(); } }).catch(() => {});
  if (isUnlocked()) showApp();
  else $('lock-input').focus();
  window.addEventListener('online', () => { checkNet(); });
  // ลงทะเบียน service worker (PWA — ข้อ 8)
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
