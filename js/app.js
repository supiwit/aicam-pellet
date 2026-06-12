/* ===========================================================
 * app.js — UI หลักของแอปวัดขนาดเม็ดอาหาร
 * =========================================================== */

(() => {
  const $ = id => document.getElementById(id);

  /* ---------------- state ---------------- */
  const state = {
    img: null,          // HTMLImageElement ต้นฉบับ
    procCanvas: null,   // ภาพย่อสำหรับแสดง/คาลิเบรต
    procScale: 1,       // orig px / proc px
    calibrating: false,
    calibPts: [],
    results: null,      // { pellets, stats, annotated, rejected }
    charts: {},
  };

  /* ---------------- settings ---------------- */
  const DEFAULTS = {
    mmpp: 0,
    operator: '',
    bins: '0.2,0.5,0.8,1.0,1.2,1.5,2.0',
    polarity: 'auto',
    minlen: 2,
    maxlen: 50,
    refcolor: '#c8a464',
    userefcolor: false,
    demax: 10,
  };
  const settings = { ...DEFAULTS, ...JSON.parse(localStorage.getItem('aicam-settings') || '{}') };

  function saveSettings() {
    localStorage.setItem('aicam-settings', JSON.stringify(settings));
  }
  function binsArray() {
    return settings.bins.split(',').map(s => parseFloat(s.trim())).filter(v => !isNaN(v) && v > 0);
  }

  /* ---------------- tabs ---------------- */
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === btn.dataset.tab));
      if (btn.dataset.tab === 'tab-reports') loadReports();
    });
  });

  /* ---------------- โหลดภาพ ---------------- */
  function handleFile(file) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      state.img = img;
      // เตรียมภาพย่อสำหรับแสดง
      const c = $('canvas-main');
      const maxW = 1600;
      const s = Math.min(1, maxW / Math.max(img.naturalWidth, img.naturalHeight));
      c.width = Math.round(img.naturalWidth * s);
      c.height = Math.round(img.naturalHeight * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      state.procScale = img.naturalWidth / c.width;
      state.results = null;
      $('card-image').hidden = false;
      $('card-results').hidden = true;
      $('save-status').textContent = '';
      updateCalibStatus();
      $('card-image').scrollIntoView({ behavior: 'smooth' });
    };
    img.src = url;
  }
  $('input-camera').addEventListener('change', e => { handleFile(e.target.files[0]); e.target.value = ''; });
  $('input-file').addEventListener('change', e => { handleFile(e.target.files[0]); e.target.value = ''; });

  /* ---------------- คาลิเบรต ---------------- */
  function updateCalibStatus() {
    const el = $('calib-status');
    if (settings.mmpp > 0) {
      el.textContent = `มาตราส่วน: ${(+settings.mmpp).toFixed(4)} มม./พิกเซล`;
      el.classList.add('ok');
    } else {
      el.textContent = 'ยังไม่ได้คาลิเบรต';
      el.classList.remove('ok');
    }
  }

  $('btn-calibrate').addEventListener('click', () => {
    if (!state.img) return;
    state.calibrating = !state.calibrating;
    state.calibPts = [];
    $('calib-hint').hidden = !state.calibrating;
    $('btn-calibrate').textContent = state.calibrating ? '✕ ยกเลิก' : '📏 คาลิเบรต';
    document.querySelector('.canvas-wrap').classList.toggle('calibrating', state.calibrating);
    if (state.calibrating) redrawBase();
  });

  function redrawBase() {
    const c = $('canvas-main');
    const ctx = c.getContext('2d');
    ctx.drawImage(state.img, 0, 0, c.width, c.height);
    // วาดจุดคาลิเบรต
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
        const mm = parseFloat(prompt('ความยาวจริงระหว่าง 2 จุด (มม.)', '100'));
        if (mm > 0 && distProc > 2) {
          // mm ต่อพิกเซลภาพต้นฉบับ
          settings.mmpp = +(mm / (distProc * state.procScale)).toFixed(5);
          saveSettings();
          syncSettingsForm();
        }
        state.calibrating = false;
        state.calibPts = [];
        $('calib-hint').hidden = true;
        $('btn-calibrate').textContent = '📏 คาลิเบรต';
        document.querySelector('.canvas-wrap').classList.remove('calibrating');
        updateCalibStatus();
        redrawBase();
      }, 60);
    }
  });

  /* ---------------- วิเคราะห์ ---------------- */
  $('btn-analyze').addEventListener('click', () => {
    if (!state.img) return;
    if (!(settings.mmpp > 0)) {
      alert('กรุณาคาลิเบรตมาตราส่วนก่อน (กดปุ่ม 📏 คาลิเบรต แล้วแตะ 2 จุดบนวัตถุที่ทราบความยาว)');
      return;
    }
    const btn = $('btn-analyze');
    btn.disabled = true; btn.textContent = '⏳ กำลังวิเคราะห์…';
    setTimeout(() => {
      try {
        const res = Analyzer.analyze(state.img, +settings.mmpp, {
          polarity: settings.polarity,
          minLenMm: +settings.minlen,
          maxLenMm: +settings.maxlen,
        });
        const stats = Analyzer.computeStats(res.pellets, binsArray());
        state.results = { ...res, stats };
        renderResults();
      } catch (err) {
        alert('วิเคราะห์ไม่สำเร็จ: ' + err.message);
        console.error(err);
      } finally {
        btn.disabled = false; btn.textContent = '🔬 วิเคราะห์ภาพ';
      }
    }, 30);
  });

  function renderResults() {
    const { stats, annotated, rejected, pellets } = state.results;

    // แสดงภาพ annotated บน canvas หลัก
    const c = $('canvas-main');
    c.width = annotated.width; c.height = annotated.height;
    c.getContext('2d').drawImage(annotated, 0, 0);

    $('st-count').textContent = stats.count;
    $('st-avg-len').textContent = stats.avg_length_mm.toFixed(1);
    $('st-avg-dia').textContent = stats.avg_diameter_mm.toFixed(1);
    $('st-sd').textContent = stats.sd_length_mm.toFixed(1);
    $('st-min').textContent = stats.min_length_mm.toFixed(1);
    $('st-max').textContent = stats.max_length_mm.toFixed(1);

    const rj = $('rejected-note');
    if (rejected > 0) {
      rj.hidden = false;
      rj.textContent = `⚠️ มี ${rejected} ก้อนที่ไม่ถูกนับ (ใหญ่ผิดปกติ/เม็ดติดกัน/ชนขอบภาพ) — แสดงเป็นกรอบสีขาวจาง`;
    } else rj.hidden = true;

    renderCharts('chart-bar', 'chart-donut', stats, state.charts);
    renderDistTable($('tbl-dist').querySelector('tbody'), stats.distribution);
    renderColor(stats);
    renderPelletTable(pellets);

    if (settings.operator && !$('f-operator').value) $('f-operator').value = settings.operator;
    $('card-results').hidden = false;
    $('card-results').scrollIntoView({ behavior: 'smooth' });
  }

  /* ---------------- charts ---------------- */
  function renderCharts(barId, donutId, stats, store) {
    const labels = stats.distribution.map(d => d.label);
    const counts = stats.distribution.map(d => d.count);
    const palette = ['#86efac', '#34d399', '#3b82f6', '#6366f1', '#a855f7', '#ca8a04', '#f43f5e', '#94a3b8'];
    const colors = labels.map((_, i) => palette[i % palette.length]);

    if (store[barId]) store[barId].destroy();
    store[barId] = new Chart($(barId), {
      type: 'bar',
      data: { labels, datasets: [{ data: counts, backgroundColor: colors, borderRadius: 4 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, title: { display: true, text: 'จำนวนเม็ดตามช่วงความยาว (ซม.)' } },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
      },
    });

    if (store[donutId]) store[donutId].destroy();
    store[donutId] = new Chart($(donutId), {
      type: 'doughnut',
      data: {
        labels: labels.map((l, i) => `${l} ซม. (${stats.distribution[i].pct}%)`),
        datasets: [{ data: counts, backgroundColor: colors }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { boxWidth: 14, font: { size: 11 } } },
          title: { display: true, text: `รวมทั้งหมด ${stats.count} เม็ด` },
        },
      },
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
    if (settings.userefcolor) {
      const ref = hexToRgb(settings.refcolor);
      const de = Analyzer.deltaE(ac.lab, Analyzer.rgb2lab(ref.r, ref.g, ref.b));
      ac.delta_e = +de.toFixed(1);
      refBox.hidden = false;
      $('swatch-ref').style.background = settings.refcolor;
      $('color-de').textContent = `ΔE = ${de.toFixed(1)}`;
      verdict.hidden = false;
      const pass = de <= +settings.demax;
      verdict.className = 'verdict ' + (pass ? 'pass' : 'fail');
      verdict.textContent = pass ? '✓ สีผ่านเกณฑ์' : '✗ สีไม่ผ่านเกณฑ์';
    } else {
      refBox.hidden = true; verdict.hidden = true;
    }
  }

  function renderPelletTable(pellets) {
    $('tbl-pellets').querySelector('tbody').innerHTML = pellets.map((p, i) =>
      `<tr><td>${i + 1}</td><td>${p.length_mm.toFixed(1)}</td><td>${p.diameter_mm.toFixed(1)}</td>
       <td><span class="dot" style="background:rgb(${p.color.r},${p.color.g},${p.color.b})"></span></td></tr>`
    ).join('');
  }

  /* ---------------- บันทึกขึ้นออนไลน์ ---------------- */
  $('btn-save').addEventListener('click', async () => {
    if (!state.results) return;
    const btn = $('btn-save'), st = $('save-status');
    btn.disabled = true;
    st.className = 'save-status'; st.textContent = '⏳ กำลังบันทึก…';
    try {
      const blob = await new Promise(r => state.results.annotated.toBlob(r, 'image/jpeg', 0.85));
      const s = state.results.stats;
      if ($('f-operator').value) { settings.operator = $('f-operator').value; saveSettings(); }
      await DB.saveSession({
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
        mm_per_px: +settings.mmpp,
        pellets: state.results.pellets,
      }, blob);
      st.className = 'save-status ok';
      st.textContent = '✓ บันทึกเรียบร้อย — ดูได้ในแท็บ "รายงาน"';
    } catch (err) {
      st.className = 'save-status err';
      st.textContent = '✗ บันทึกไม่สำเร็จ: ' + (err.message || err);
      console.error(err);
    } finally {
      btn.disabled = false;
    }
  });

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
      ['รายงานการวัดขนาดเม็ดอาหาร'],
      ['วันที่', s.created_at ? new Date(s.created_at).toLocaleString('th-TH') : new Date().toLocaleString('th-TH')],
      ['ตัวอย่าง', s.sample_name || ''], ['ผู้ตรวจ', s.operator || ''], ['หมายเหตุ', s.notes || ''],
      [],
      ['จำนวนเม็ด', s.pellet_count],
      ['ความยาวเฉลี่ย (มม.)', s.avg_length_mm], ['SD ความยาว', s.sd_length_mm],
      ['สั้นสุด (มม.)', s.min_length_mm], ['ยาวสุด (มม.)', s.max_length_mm],
      ['เส้นผ่าศูนย์กลางเฉลี่ย (มม.)', s.avg_diameter_mm],
      [],
      ['ช่วง (ซม.)', 'จำนวน', '%'],
      ...(s.distribution || []).map(d => [d.label, d.count, d.pct]),
      [],
      ['#', 'ความยาว (มม.)', 'เส้นผ่าศูนย์กลาง (มม.)', 'R', 'G', 'B'],
      ...(pellets || []).map((p, i) => [i + 1, p.length_mm, p.diameter_mm, p.color?.r, p.color?.g, p.color?.b]),
    ];
    return rows;
  }

  $('btn-csv').addEventListener('click', () => {
    if (!state.results) return;
    const s = {
      ...state.results.stats,
      pellet_count: state.results.stats.count,
      sample_name: $('f-sample').value, operator: $('f-operator').value, notes: $('f-notes').value,
    };
    downloadCsv(`pellet-${Date.now()}.csv`, sessionCsvRows(s, state.results.pellets));
  });

  /* ---------------- รายงาน (ออนไลน์) ---------------- */
  async function loadReports() {
    const list = $('report-list');
    list.innerHTML = '<div class="empty">กำลังโหลด…</div>';
    try {
      const rows = await DB.listSessions();
      if (!rows.length) {
        list.innerHTML = '<div class="empty">ยังไม่มีข้อมูล — วัดและบันทึกผลจากแท็บ "วัดขนาด"</div>';
        return;
      }
      list.innerHTML = '';
      rows.forEach(r => {
        const div = document.createElement('div');
        div.className = 'report-item';
        const d = new Date(r.created_at).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
        div.innerHTML = `
          ${r.image_url ? `<img class="report-thumb" src="${r.image_url}" loading="lazy">` : '<div class="report-thumb"></div>'}
          <div class="report-info">
            <div class="report-title">${r.sample_name || 'ไม่ระบุชื่อตัวอย่าง'}</div>
            <div class="report-sub">${d}${r.operator ? ' · ' + r.operator : ''}</div>
            <div class="report-stats">${r.pellet_count} เม็ด · ยาวเฉลี่ย ${(+r.avg_length_mm).toFixed(1)} มม. · Ø ${(+r.avg_diameter_mm).toFixed(1)} มม.</div>
          </div>`;
        div.addEventListener('click', () => openReport(r.id));
        list.appendChild(div);
      });
    } catch (err) {
      list.innerHTML = `<div class="empty">โหลดไม่สำเร็จ: ${err.message || err}</div>`;
    }
  }
  $('btn-refresh').addEventListener('click', loadReports);

  $('btn-export-all').addEventListener('click', async () => {
    try {
      const rows = await DB.listSessions(1000);
      downloadCsv('pellet-summary.csv', [
        ['วันที่', 'ตัวอย่าง', 'ผู้ตรวจ', 'จำนวนเม็ด', 'ยาวเฉลี่ย (มม.)', 'Ø เฉลี่ย (มม.)'],
        ...rows.map(r => [new Date(r.created_at).toLocaleString('th-TH'), r.sample_name, r.operator,
          r.pellet_count, r.avg_length_mm, r.avg_diameter_mm]),
      ]);
    } catch (err) { alert('ส่งออกไม่สำเร็จ: ' + (err.message || err)); }
  });

  async function openReport(id) {
    const modal = $('modal'), content = $('modal-content');
    modal.hidden = false;
    content.innerHTML = '<div class="empty">กำลังโหลด…</div>';
    try {
      const s = await DB.getSession(id);
      const d = new Date(s.created_at).toLocaleString('th-TH', { dateStyle: 'full', timeStyle: 'short' });
      const ac = s.avg_color;
      content.innerHTML = `
        <h2>${s.sample_name || 'ไม่ระบุชื่อตัวอย่าง'}</h2>
        <p class="hint">${d}${s.operator ? ' · ผู้ตรวจ: ' + s.operator : ''}${s.notes ? '<br>หมายเหตุ: ' + s.notes : ''}</p>
        ${s.image_url ? `<img class="modal-img" src="${s.image_url}">` : ''}
        <div class="stat-grid">
          <div class="stat"><div class="stat-num">${s.pellet_count}</div><div class="stat-label">จำนวนเม็ด</div></div>
          <div class="stat"><div class="stat-num">${(+s.avg_length_mm).toFixed(1)}</div><div class="stat-label">ยาวเฉลี่ย (มม.)</div></div>
          <div class="stat"><div class="stat-num">${(+s.avg_diameter_mm).toFixed(1)}</div><div class="stat-label">Ø เฉลี่ย (มม.)</div></div>
          <div class="stat"><div class="stat-num">${(+s.sd_length_mm).toFixed(1)}</div><div class="stat-label">SD ความยาว</div></div>
          <div class="stat"><div class="stat-num">${(+s.min_length_mm).toFixed(1)}</div><div class="stat-label">สั้นสุด (มม.)</div></div>
          <div class="stat"><div class="stat-num">${(+s.max_length_mm).toFixed(1)}</div><div class="stat-label">ยาวสุด (มม.)</div></div>
        </div>
        <div class="chart-box"><canvas id="m-chart-bar"></canvas></div>
        <div class="chart-box donut"><canvas id="m-chart-donut"></canvas></div>
        <h3>ตารางสัดส่วน</h3>
        <table class="tbl"><thead><tr><th>ช่วง (ซม.)</th><th>จำนวน</th><th>%</th></tr></thead>
        <tbody id="m-dist"></tbody></table>
        ${ac ? `<h3>สีเฉลี่ย</h3>
          <div class="color-row"><div class="swatch-box">
            <div class="swatch" style="background:rgb(${ac.r},${ac.g},${ac.b})"></div>
            <div class="swatch-label">RGB(${ac.r}, ${ac.g}, ${ac.b})${ac.delta_e != null ? `<br>ΔE = ${ac.delta_e}` : ''}</div>
          </div></div>` : ''}
        <div class="btn-row">
          <button class="btn" id="m-csv">⬇️ CSV</button>
          <button class="btn" id="m-del" style="color:var(--danger)">🗑 ลบรายงานนี้</button>
        </div>`;
      renderDistTable($('m-dist'), s.distribution || []);
      renderCharts('m-chart-bar', 'm-chart-donut',
        { distribution: s.distribution || [], count: s.pellet_count }, state.charts);
      $('m-csv').addEventListener('click', () => downloadCsv(`pellet-${id.slice(0, 8)}.csv`, sessionCsvRows(s, s.pellets)));
      $('m-del').addEventListener('click', async () => {
        if (!confirm('ลบรายงานนี้ถาวร?')) return;
        await DB.deleteSession(id, s.image_url);
        modal.hidden = true;
        loadReports();
      });
    } catch (err) {
      content.innerHTML = `<div class="empty">โหลดไม่สำเร็จ: ${err.message || err}</div>`;
    }
  }
  $('modal-close').addEventListener('click', () => { $('modal').hidden = true; });
  $('modal').addEventListener('click', e => { if (e.target === $('modal')) $('modal').hidden = true; });

  /* ---------------- ตั้งค่า ---------------- */
  function syncSettingsForm() {
    $('s-mmpp').value = settings.mmpp || '';
    $('s-operator').value = settings.operator;
    $('s-bins').value = settings.bins;
    $('s-polarity').value = settings.polarity;
    $('s-minlen').value = settings.minlen;
    $('s-maxlen').value = settings.maxlen;
    $('s-refcolor').value = settings.refcolor;
    $('s-userefcolor').checked = settings.userefcolor;
    $('s-demax').value = settings.demax;
  }

  $('btn-save-settings').addEventListener('click', () => {
    settings.mmpp = parseFloat($('s-mmpp').value) || 0;
    settings.operator = $('s-operator').value;
    settings.bins = $('s-bins').value || DEFAULTS.bins;
    settings.polarity = $('s-polarity').value;
    settings.minlen = parseFloat($('s-minlen').value) || DEFAULTS.minlen;
    settings.maxlen = parseFloat($('s-maxlen').value) || DEFAULTS.maxlen;
    settings.refcolor = $('s-refcolor').value;
    settings.userefcolor = $('s-userefcolor').checked;
    settings.demax = parseFloat($('s-demax').value) || DEFAULTS.demax;
    saveSettings();
    updateCalibStatus();
    $('settings-status').textContent = '✓ บันทึกการตั้งค่าแล้ว';
    setTimeout(() => { $('settings-status').textContent = ''; }, 2500);
  });

  /* ---------------- สถานะเครือข่าย ---------------- */
  async function checkNet() {
    const el = $('net-status');
    try {
      const ok = await DB.ping();
      el.className = 'net-status ' + (ok ? 'online' : 'offline');
      el.title = ok ? 'เชื่อมต่อฐานข้อมูลออนไลน์แล้ว' : 'เชื่อมต่อฐานข้อมูลไม่ได้';
    } catch {
      el.className = 'net-status offline';
    }
  }

  /* ---------------- init ---------------- */
  syncSettingsForm();
  updateCalibStatus();
  checkNet();
})();
