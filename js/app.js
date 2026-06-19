/* ===========================================================
 * app.js — UI หลักของแอปวัดขนาดเม็ดอาหาร
 * (ล็อกรหัส · 3 ภาษา · เป้าหมายไซซ์ · แชร์รายงาน)
 * =========================================================== */

(() => {
  const $ = id => document.getElementById(id);
  const t = (k, v) => I18N.t(k, v);

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
  };

  /* ---------------- settings ---------------- */
  const DEFAULT_SPECS = [
    { die: '1.0', min_mm: 1.0, max_mm: 2.0, target_pct: 60 },
    { die: '1.2', min_mm: 1.5, max_mm: 2.5, target_pct: 60 },
    { die: '1.4', min_mm: 2.0, max_mm: 3.0, target_pct: 60 },
    { die: '1.8', min_mm: 2.0, max_mm: 3.0, target_pct: 60 },
    { die: '2.0', min_mm: 3.0, max_mm: 4.0, target_pct: 60 },
  ];
  const DEFAULTS = {
    mmpp: 0,
    operator: '',
    bins: '2,5,8,10,12,15,20',
    polarity: 'auto',
    minlen: 1,
    maxlen: 50,
    autosplit: true,
    refcolor: '#c8a464',
    userefcolor: false,
    demax: 10,
    pin: '1234',
    die: 'auto',
    specs: DEFAULT_SPECS,
  };
  const stored = JSON.parse(localStorage.getItem('aicam-settings') || '{}');
  const settings = { ...DEFAULTS, ...stored };
  if (!Array.isArray(settings.specs) || !settings.specs.length) settings.specs = DEFAULT_SPECS;
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
  function binsArray() {
    return settings.bins.split(',').map(s => parseFloat(s.trim())).filter(v => !isNaN(v) && v > 0);
  }
  function currentSpec() {
    return settings.specs.find(s => String(s.die) === String(settings.die)) || null;
  }

  /** เลือกสเปกอัตโนมัติ: Die ที่ Ø ใกล้ Ø เฉลี่ยที่วัดได้ที่สุด (เสมอกัน → ตัวที่ Insize สูงกว่า) */
  function autoDetectSpec(pellets, stats) {
    const cands = settings.specs.filter(s => !isNaN(parseFloat(s.die)) && s.max_mm > 0);
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

  /* ---------------- toast ---------------- */
  let toastTimer = null;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }

  /* ================= LOCK SCREEN ================= */
  function isUnlocked() {
    if (sessionStorage.getItem('aicam-unlocked') === '1') return true;
    const until = +localStorage.getItem('aicam-unlock-until') || 0;
    return Date.now() < until;
  }

  function tryUnlock() {
    const input = $('lock-input');
    if (input.value === String(settings.pin)) {
      sessionStorage.setItem('aicam-unlocked', '1');
      if ($('lock-remember').checked) {
        localStorage.setItem('aicam-unlock-until', String(Date.now() + 7 * 864e5));
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
    $('lock-hint').hidden = String(settings.pin) !== '1234';
    $('lock-btn').addEventListener('click', tryUnlock);
    $('lock-input').addEventListener('keydown', e => { if (e.key === 'Enter') tryUnlock(); });
    document.querySelectorAll('.lang-chip').forEach(chip => {
      chip.classList.toggle('active', chip.dataset.lang === I18N.lang);
      chip.addEventListener('click', () => {
        I18N.setLang(chip.dataset.lang);
        document.querySelectorAll('.lang-chip').forEach(c =>
          c.classList.toggle('active', c.dataset.lang === chip.dataset.lang));
      });
    });
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
    populateDieSelect();
    updateCalibStatus();
    checkNet();

    $('lang-select').value = I18N.lang;
    $('lang-select').addEventListener('change', e => I18N.setLang(e.target.value));
    document.addEventListener('langchange', onLangChange);

    ChatBot.init({
      lang: I18N.lang,
      getContext: () => state.results
        ? { stats: state.results.stats, specResult: state.results.specResult, spec: state.results.spec }
        : null,
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
    populateDieSelect();
    renderSpecEditor();
    if (state.results) renderResults(false);
  }

  /* ---------------- tabs ---------------- */
  function switchTab(tabId) {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
    document.querySelectorAll('.tab').forEach(tb => tb.classList.toggle('active', tb.id === tabId));
    if (tabId === 'tab-reports') loadReports();
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
      settings.specs.map(s =>
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
        renderSpecPanel(false);
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
            autoSplit: !!settings.autosplit,
          });
          const stats = Analyzer.computeStats(res.pellets, binsArray());
          const r = resolveSpec(res.pellets, stats);
          const specResult = Analyzer.checkSpec(res.pellets, r.spec);
          state.results = { ...res, stats, specResult, spec: r.spec, specAuto: r.auto };
          state.lastSavedId = null;
          renderResults(true);
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

    renderSpecPanel(animate);
    renderCharts('chart-bar', 'chart-donut', stats, state.charts);
    renderDiaChart('chart-dia', stats, state.charts);
    renderDistTable($('tbl-dist').querySelector('tbody'), stats.distribution);
    renderColor(stats);
    renderTexture(stats);
    renderPelletTable(pellets);

    if (settings.operator && !$('f-operator').value) $('f-operator').value = settings.operator;
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
    $('spec-meta').textContent =
      `${t('spec_die_dia', { d: spec.die })} · ${t('spec_range', { min: spec.min_mm, max: spec.max_mm })}${autoTag}`;
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

  /* ---------------- charts ---------------- */
  const PALETTE = ['#86efac', '#34d399', '#3b82f6', '#6366f1', '#a855f7', '#ca8a04', '#f43f5e', '#94a3b8'];

  function renderCharts(barId, donutId, stats, store) {
    const labels = stats.distribution.map(d => d.label);
    const counts = stats.distribution.map(d => d.count);
    const colors = labels.map((_, i) => PALETTE[i % PALETTE.length]);

    if (store[barId]) store[barId].destroy();
    store[barId] = new Chart($(barId), {
      type: 'bar',
      data: { labels, datasets: [{ data: counts, backgroundColor: colors, borderRadius: 4 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, title: { display: true, text: t('chart_len_title') } },
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

  function renderColor(stats) {
    const ac = stats.avg_color;
    if (!ac) return;
    $('swatch-avg').style.background = `rgb(${ac.r},${ac.g},${ac.b})`;
    $('color-rgb').textContent = `RGB(${ac.r}, ${ac.g}, ${ac.b})`;
    const refBox = $('ref-color-box'), verdict = $('color-verdict');

    const lab = ac.lab;
    let labHtml = `
      <h3 style="margin-top:0">${t('lab_title')}</h3>
      <div class="lab-vals">
        <div class="lab-val"><b>${(+lab.l).toFixed(1)}</b><span>L* (0-100)</span></div>
        <div class="lab-val"><b>${(+lab.a).toFixed(1)}</b><span>a* (−G / +R)</span></div>
        <div class="lab-val"><b>${(+lab.b).toFixed(1)}</b><span>b* (−B / +Y)</span></div>
      </div>`;

    if (settings.userefcolor) {
      const ref = hexToRgb(settings.refcolor);
      const refLab = Analyzer.rgb2lab(ref.r, ref.g, ref.b);
      const de76 = Analyzer.deltaE(lab, refLab);
      const de00 = Analyzer.deltaE2000(lab, refLab);
      ac.delta_e76 = +de76.toFixed(2);
      ac.delta_e00 = +de00.toFixed(2);
      ac.ref_lab = { l: +refLab.l.toFixed(2), a: +refLab.a.toFixed(2), b: +refLab.b.toFixed(2) };
      refBox.hidden = false;
      $('swatch-ref').style.background = settings.refcolor;
      $('color-de').textContent = `ΔE00 = ${de00.toFixed(1)}`;
      verdict.hidden = false;
      const pass = de00 <= +settings.demax;
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
    const text = t('share_text', { name: name || '', n: count, len: avgLen });
    const url = reportUrl(id);
    if (navigator.share) {
      try { await navigator.share({ title: 'AICAM', text, url }); return; } catch (e) { /* user cancelled */ }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast(t('link_copied'));
    } catch {
      prompt('URL', url);
    }
  }

  function initSaveShare() {
    $('btn-save').addEventListener('click', async () => {
      if (!state.results) return;
      const btn = $('btn-save'), st = $('save-status');
      btn.disabled = true;
      st.className = 'save-status'; st.textContent = t('saving');
      try {
        const blob = await new Promise(r => state.results.annotated.toBlob(r, 'image/jpeg', 0.85));
        const s = state.results.stats;
        const sr = state.results.specResult;
        const spec = state.results.spec;
        if ($('f-operator').value) { settings.operator = $('f-operator').value; saveSettings(); }
        const saved = await DB.saveSession({
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
        }, blob);
        state.lastSavedId = saved.id;
        st.className = 'save-status ok';
        st.textContent = t('save_ok');
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
            borderColor: '#1b6e5a', backgroundColor: 'rgba(27,110,90,.12)',
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
  }

  async function loadReports() {
    const list = $('report-list');
    list.innerHTML = `<div class="empty">${t('rep_loading')}</div>`;
    try {
      const rows = await DB.listSessions();
      if (!rows.length) {
        $('trend-box').hidden = true;
        list.innerHTML = `<div class="empty">🌾<br>${t('rep_empty')}</div>`;
        return;
      }
      renderTrend(rows.slice(0, 30));
      list.innerHTML = '';
      rows.forEach((r, idx) => {
        const div = document.createElement('div');
        div.className = 'report-item';
        div.style.animationDelay = Math.min(idx * 0.04, 0.4) + 's';
        const d = new Date(r.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
        const passChip = r.spec_pass == null ? '' :
          `<span class="report-pass ${r.spec_pass ? 'pass' : 'fail'}">${r.spec_pass ? '✓' : '✗'} ${r.insize_pct ?? ''}%</span>`;
        div.innerHTML = `
          ${r.image_url ? `<img class="report-thumb" src="${r.image_url}" loading="lazy">` : '<div class="report-thumb"></div>'}
          <div class="report-info">
            <div class="report-title">${r.sample_name || t('rep_noname')}${r.die_size ? ` · Die ${r.die_size}` : ''}</div>
            <div class="report-sub">${d}${r.operator ? ' · ' + r.operator : ''}</div>
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
        const rows = await DB.listSessions(1000);
        downloadCsv('pellet-summary.csv', [
          [t('csv_date'), t('csv_sample'), t('csv_operator'), t('csv_count'),
           t('csv_avg_len'), t('csv_avg_dia'), t('csv_die'), t('csv_insize'), t('csv_result')],
          ...rows.map(r => [new Date(r.created_at).toLocaleString(), r.sample_name, r.operator,
            r.pellet_count, r.avg_length_mm, r.avg_diameter_mm, r.die_size ?? '',
            r.insize_pct ?? '', r.spec_pass == null ? '' : (r.spec_pass ? t('csv_pass') : t('csv_fail'))]),
        ]);
      } catch (err) { alert(t('export_fail') + ': ' + (err.message || err)); }
    });
    $('modal-close').addEventListener('click', () => { $('modal').hidden = true; });
    $('modal').addEventListener('click', e => { if (e.target === $('modal')) $('modal').hidden = true; });
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
    tbody.innerHTML = settings.specs.map((s, i) => `
      <tr>
        <td><input data-spec="${i}" data-f="die" value="${s.die}"></td>
        <td><input data-spec="${i}" data-f="min_mm" type="number" step="0.1" value="${s.min_mm}"></td>
        <td><input data-spec="${i}" data-f="max_mm" type="number" step="0.1" value="${s.max_mm}"></td>
        <td><input data-spec="${i}" data-f="target_pct" type="number" step="5" value="${s.target_pct}"></td>
        <td><button class="spec-del" data-del="${i}">🗑</button></td>
      </tr>`).join('');
    tbody.querySelectorAll('input').forEach(inp => {
      inp.addEventListener('change', () => {
        const i = +inp.dataset.spec, f = inp.dataset.f;
        settings.specs[i][f] = f === 'die' ? inp.value : parseFloat(inp.value) || 0;
      });
    });
    tbody.querySelectorAll('.spec-del').forEach(btn => {
      btn.addEventListener('click', () => {
        settings.specs.splice(+btn.dataset.del, 1);
        renderSpecEditor();
      });
    });
  }

  function syncSettingsForm() {
    $('s-mmpp').value = settings.mmpp || '';
    $('s-operator').value = settings.operator;
    $('s-bins').value = settings.bins;
    $('s-polarity').value = settings.polarity;
    $('s-minlen').value = settings.minlen;
    $('s-maxlen').value = settings.maxlen;
    $('s-split').checked = !!settings.autosplit;
    $('s-refcolor').value = settings.refcolor;
    $('s-userefcolor').checked = settings.userefcolor;
    $('s-demax').value = settings.demax;
    $('s-pin').value = settings.pin;
    renderSpecEditor();
  }

  function initSettings() {
    $('btn-add-spec').addEventListener('click', () => {
      settings.specs.push({ die: '', min_mm: 0, max_mm: 0, target_pct: 60 });
      renderSpecEditor();
    });
    $('btn-save-settings').addEventListener('click', () => {
      settings.mmpp = parseFloat($('s-mmpp').value) || 0;
      settings.operator = $('s-operator').value;
      settings.bins = $('s-bins').value || DEFAULTS.bins;
      settings.polarity = $('s-polarity').value;
      settings.minlen = parseFloat($('s-minlen').value) || DEFAULTS.minlen;
      settings.maxlen = parseFloat($('s-maxlen').value) || DEFAULTS.maxlen;
      settings.autosplit = $('s-split').checked;
      settings.refcolor = $('s-refcolor').value;
      settings.userefcolor = $('s-userefcolor').checked;
      settings.demax = parseFloat($('s-demax').value) || DEFAULTS.demax;
      const pin = $('s-pin').value.trim();
      if (/^\d{4,8}$/.test(pin)) settings.pin = pin;
      settings.specs = settings.specs.filter(s => s.die !== '' && s.max_mm > 0);
      saveSettings();
      updateCalibStatus();
      populateDieSelect();
      renderSpecEditor();
      $('settings-status').textContent = t('s_saved');
      setTimeout(() => { $('settings-status').textContent = ''; }, 2500);
    });
  }

  /* ---------------- สถานะเครือข่าย ---------------- */
  async function checkNet() {
    const el = $('net-status');
    try {
      const ok = await DB.ping();
      el.className = 'net-status ' + (ok ? 'online' : 'offline');
      el.title = ok ? t('net_on') : t('net_off');
    } catch {
      el.className = 'net-status offline';
    }
  }

  /* ---------------- init ---------------- */
  I18N.apply();
  initLock();
  if (isUnlocked()) showApp();
  else $('lock-input').focus();
})();
