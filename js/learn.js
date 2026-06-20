/* ===========================================================
 * learn.js — แท็บความรู้/หลักการวิชาการ (3 ภาษา) แบบ accordion
 * =========================================================== */

const Learn = (() => {
  const TOPICS = [
    {
      id: 'method', icon: '📐',
      title: { th: 'หลักการวัดขนาด (Feret / ISO)', vi: 'Nguyên lý đo (Feret / ISO)', en: 'Sizing principle (Feret / ISO)' },
      body: {
        th: 'วัดตามมาตรฐานการวิเคราะห์ภาพอนุภาค <b>ISO 13322</b> และ <b>ISO 9276</b><br>• <b>ความยาว = Max Feret diameter</b> — ระยะคาลิปเปอร์สูงสุด (ปลายถึงปลายที่ไกลที่สุด)<br>• <b>เส้นผ่านศูนย์กลาง = Min Feret diameter</b> — ความกว้างคาลิปเปอร์ต่ำสุด<br>• คำนวณจาก convex hull จึง<b>ไม่ขึ้นกับการหมุนเม็ด</b> วัดมุมไหนก็ได้ค่าเท่ากัน<br>• หน้าตัด A = π·d²/4 (สมมติทรงกระบอก)',
        vi: 'Đo theo chuẩn phân tích ảnh hạt <b>ISO 13322</b> & <b>ISO 9276</b><br>• <b>Chiều dài = Max Feret</b> — khoảng cách caliper lớn nhất<br>• <b>Đường kính = Min Feret</b> — bề rộng caliper nhỏ nhất<br>• Tính từ bao lồi nên <b>không phụ thuộc góc xoay</b><br>• Tiết diện A = π·d²/4',
        en: 'Per particle-image-analysis standards <b>ISO 13322</b> & <b>ISO 9276</b><br>• <b>Length = Max Feret diameter</b> (largest caliper span)<br>• <b>Diameter = Min Feret diameter</b> (smallest caliper width)<br>• Computed from the convex hull → <b>rotation-invariant</b><br>• Cross-section A = π·d²/4',
      },
    },
    {
      id: 'shadow', icon: '🌓',
      title: { th: 'การตัดเงา/แสง (วัดเฉพาะเนื้อเม็ด)', vi: 'Loại bóng/ánh sáng', en: 'Shadow/glare rejection' },
      body: {
        th: 'เงาและแสงนุ่มรอบเม็ดทำให้วัดยาวเกินจริง ระบบใช้ <b>2 ระดับเทรชโฮลด์</b>:<br>• ระดับหลวม (Otsu) — ตรวจจับว่ามีเม็ดอยู่ตรงไหน<br>• <b>ระดับเข้ม (core)</b> — เก็บเฉพาะพิกเซลที่สว่าง/เข้มกว่าค่ากึ่งกลางของเนื้อเม็ด ตัดวงเงานุ่มขอบทิ้งก่อนวัด<br>→ ความยาว/Ø แม่นขึ้น ไม่กินเงา<br>เคล็ดลับ: ใช้ไฟ<b>กระจายสม่ำเสมอ</b> ลดเงาทิศเดียว',
        vi: 'Bóng mềm quanh viên làm đo dài hơn thực. Dùng <b>2 ngưỡng</b>:<br>• Ngưỡng lỏng (Otsu) để phát hiện<br>• <b>Ngưỡng lõi (core)</b> chỉ giữ phần thịt viên, cắt vành bóng mềm trước khi đo<br>→ Chiều dài/Ø chính xác hơn<br>Mẹo: dùng ánh sáng <b>khuếch tán đều</b>',
        en: 'Soft shadow/glare around pellets inflates length. We use a <b>two-level threshold</b>:<br>• Loose (Otsu) for detection<br>• <b>Strict core threshold</b> keeps only true pellet body, trimming the soft penumbra before measuring<br>→ more accurate length/Ø<br>Tip: use <b>even diffuse lighting</b>',
      },
    },
    {
      id: 'agglo', icon: '✂️',
      title: { th: 'การคัดเม็ดติดกัน (Agglomerate rejection)', vi: 'Loại viên dính nhau', en: 'Agglomerate rejection' },
      body: {
        th: 'ตามหลักอุตสาหกรรม เม็ดที่ติดกัน<b>จะถูกคัดออก ไม่ใช่แยก</b> (การแยกทำให้ค่าเพี้ยน)<br>คัดด้วย: solidity (พื้นที่/convex hull), ขนาดเทียบ median ประชากร และเม็ดที่ชนขอบภาพ<br>→ ค่าที่รายงานทุกเม็ดเป็นเม็ดเดี่ยวจริง<br>ดังนั้นควร<b>เกลี่ยเม็ดไม่ให้ติดกัน</b>ตอนถ่าย เพื่อให้นับได้มากสุด',
        vi: 'Theo chuẩn công nghiệp, viên dính nhau bị <b>loại bỏ, không tách</b><br>Dựa trên: solidity, kích thước so với trung vị, viên chạm mép<br>→ Mọi giá trị là viên đơn thật<br>Hãy <b>rải viên rời nhau</b> khi chụp',
        en: 'Per industry practice, touching pellets are <b>excluded, not split</b> (splitting biases results)<br>Detected via solidity, size vs population median, and edge-touching<br>→ every reported value is a true single pellet<br>So <b>spread pellets apart</b> when shooting',
      },
    },
    {
      id: 'product', icon: '🦐',
      title: { th: 'แยกชนิดอัตโนมัติ: กุ้ง vs ปลา', vi: 'Tự nhận loại: tôm vs cá', en: 'Auto type: shrimp vs fish' },
      body: {
        th: 'ระบบดูรูปทรงเม็ดแล้วเดาชนิดเอง (ไม่ต้องเลือก):<br>• <b>กุ้ง — Pellet Mill</b> เม็ด<b>ทรงกระบอก</b> ยาว/กว้าง (aspect) ≥ 1.35<br>• <b>ปลา — Extrusion</b> เม็ด<b>กลม/ป้อม</b> aspect &lt; 1.35<br>เลือกตารางเป้าหมาย (สเปก) ของชนิดนั้นให้อัตโนมัติ',
        vi: 'Hệ tự đoán loại theo hình dạng (không cần chọn):<br>• <b>Tôm — Pellet Mill</b>: viên <b>trụ</b>, aspect ≥ 1.35<br>• <b>Cá — Ép đùn</b>: viên <b>tròn</b>, aspect &lt; 1.35<br>Tự chọn bảng tiêu chuẩn tương ứng',
        en: 'The app infers the type from shape (no selector):<br>• <b>Shrimp — Pellet Mill</b>: <b>cylindrical</b>, aspect ≥ 1.35<br>• <b>Fish — Extrusion</b>: <b>round</b>, aspect &lt; 1.35<br>It auto-picks that product’s spec table',
      },
    },
    {
      id: 'yield', icon: '⚙️',
      title: { th: '%Yield (ตะแกรงร่อน mesh)', vi: '%Yield (sàng mesh)', en: '%Yield (mesh sieve)' },
      body: {
        th: 'จำลองการ<b>ร่อนด้วยตะแกรง mesh มาตรฐาน</b>โดยจัดเม็ดตามเส้นผ่านศูนย์กลาง:<br>• <b>Undersize</b> Ø &lt; ตะแกรงล่าง = ผง/เม็ดแตก หลุดร่อง<br>• <b>Oversize</b> Ø &gt; ตะแกรงบน = เม็ดใหญ่ ค้างบนตะแกรง<br>• <b>On-size = Yield</b> ผลผลิตที่ใช้ได้<br>Yield <b>ถ่วงน้ำหนักด้วยปริมาตร (≈ มวล)</b> ตรงกับการร่อนชั่งน้ำหนักจริง · ตั้งค่า mesh แต่ละไซซ์ได้',
        vi: 'Mô phỏng <b>sàng mesh chuẩn</b> theo đường kính:<br>• <b>Undersize</b> Ø &lt; sàng dưới = bột/vụn<br>• <b>Oversize</b> Ø &gt; sàng trên<br>• <b>On-size = Yield</b><br>Yield <b>theo thể tích (≈ khối lượng)</b>, đặt mesh từng cỡ được',
        en: 'Simulates <b>standard mesh sieving</b> by diameter:<br>• <b>Undersize</b> Ø &lt; lower sieve = fines<br>• <b>Oversize</b> Ø &gt; upper sieve<br>• <b>On-size = Yield</b><br>Yield is <b>volume-weighted (≈ mass)</b>, matching real weight-based sieving · per-size mesh configurable',
      },
    },
    {
      id: 'fines', icon: '🌫️',
      title: { th: '% ฝุ่น (Fines) คืออะไร', vi: '% Bột (Fines) là gì', en: 'What are % Fines' },
      body: {
        th: '<b>Fines = เศษผง/เม็ดแตก</b>ที่เล็กกว่าตะแกรงล่าง (undersize) คิดเป็น % โดยปริมาตร<br>ทำไมสำคัญ: ฝุ่นมาก = สูญเสียวัตถุดิบ, กุ้ง/ปลากินได้น้อยลง, น้ำขุ่น/เสียคุณภาพน้ำในบ่อ<br>สาเหตุ: บดละเอียดเกิน, ไอน้ำ/ความชื้นไม่พอ, แม่พิมพ์สึก, ขนส่งกระแทก<br>เกณฑ์ทั่วไปอาหารกุ้งคุณภาพดี: ฝุ่น &lt; 1–2%',
        vi: '<b>Fines = bột/vụn</b> nhỏ hơn sàng dưới, tính % theo thể tích<br>Quan trọng: nhiều bột = hao phí, vật nuôi ăn ít, bẩn nước ao<br>Nguyên nhân: nghiền quá mịn, thiếu hơi/ẩm, khuôn mòn, va đập<br>Tốt: fines &lt; 1–2%',
        en: '<b>Fines = dust/broken bits</b> smaller than the lower sieve, as % by volume<br>Why it matters: high fines = wasted feed, poor intake, fouled pond water<br>Causes: over-grinding, low steam/moisture, worn die, transport impact<br>Good shrimp feed: fines &lt; 1–2%',
      },
    },
    {
      id: 'pdi', icon: '💪',
      title: { th: 'PDI / ความทนทานเม็ด', vi: 'PDI / Độ bền viên', en: 'PDI / Pellet durability' },
      body: {
        th: '<b>PDI (Pellet Durability Index)</b> = % เม็ดที่เหลือสภาพดีหลังทดสอบการกระแทก/หมุน (Holmen หรือ tumbling box)<br>วัดจริงต้องใช้เครื่องในแล็บ — แอป<b>ให้กรอกค่าจริง</b>และเก็บคู่กับผลขนาด/สี เพื่อดูแนวโน้ม<br>แอปยัง<b>ประเมินคร่าว</b>จากคะแนนเนื้อสัมผัส (ผิวเรียบ+เนื้อแน่น = ทนทานสูง) เป็นแนวทาง ไม่ใช่ค่าทดแทน<br>อาหารกุ้งที่ดี PDI มัก&gt; 95% (อยู่ในน้ำได้นานไม่ยุ่ย)',
        vi: '<b>PDI</b> = % viên còn nguyên sau thử va đập/quay (Holmen/tumbling)<br>Đo thực cần máy lab — app <b>cho nhập giá trị thực</b> và lưu cùng kết quả<br>App <b>ước tính</b> từ điểm kết cấu (chỉ tham khảo)<br>Tôm tốt: PDI &gt; 95%',
        en: '<b>PDI (Pellet Durability Index)</b> = % of pellets intact after impact/tumbling (Holmen/tumbling box)<br>True PDI needs a lab tester — the app lets you <b>enter the real value</b> and stores it with size/color for trends<br>It also gives a <b>rough estimate</b> from texture score (reference only)<br>Good shrimp feed: PDI &gt; 95% (water-stable)',
      },
    },
    {
      id: 'color', icon: '🎨',
      title: { th: 'สี CIELAB & ΔE00', vi: 'Màu CIELAB & ΔE00', en: 'CIELAB color & ΔE00' },
      body: {
        th: '<b>CIELAB (L*a*b*)</b> มาตรฐาน CIE วัดสีตามสายตามนุษย์: L*=สว่าง, a*=เขียว↔แดง, b*=น้ำเงิน↔เหลือง<br>ความต่างสีจากค่ามาตรฐานคิดด้วย <b>ΔE00 (CIEDE2000)</b> ที่แม่นกับสายตาที่สุด<br>เกณฑ์: ΔE00 &lt;1 มองไม่ออก · 1–3 ต่างเล็กน้อย · &gt;6 ต่างชัด<br>สีที่เพี้ยนอาจบอกการสุก/ไหม้/สูตรเปลี่ยน',
        vi: '<b>CIELAB</b> theo CIE: L*=sáng, a*=lục↔đỏ, b*=lam↔vàng<br>Chênh màu dùng <b>ΔE00 (CIEDE2000)</b><br>ΔE00 &lt;1 không thấy · 1–3 nhẹ · &gt;6 rõ<br>Lệch màu báo độ chín/cháy/đổi công thức',
        en: '<b>CIELAB</b> (CIE): L*=lightness, a*=green↔red, b*=blue↔yellow<br>Color difference uses <b>ΔE00 (CIEDE2000)</b>, closest to human vision<br>ΔE00 &lt;1 imperceptible · 1–3 slight · &gt;6 obvious<br>Color drift can signal cook/burn/formula change',
      },
    },
    {
      id: 'texture', icon: '🔬',
      title: { th: 'คุณภาพเนื้อ (GLCM Texture)', vi: 'Chất lượng bề mặt (GLCM)', en: 'Surface texture (GLCM)' },
      body: {
        th: 'วิเคราะห์เนื้อผิวตาม <b>GLCM (Haralick, 1973)</b> + Laplacian variance + ความขรุขระ Ra%<br>ได้คะแนน 0–100 และเกรด A/B/C/D<br>• Homogeneity/Energy สูง = ผิวเนียนสม่ำเสมอ<br>• Fineness สูง = เนื้อบดละเอียดอัดแน่น<br>เนื้อดี = ทนทานสูง ฝุ่นน้อย',
        vi: 'Phân tích kết cấu theo <b>GLCM (Haralick, 1973)</b> + Laplacian variance + Ra%<br>Điểm 0–100, hạng A/B/C/D<br>Bề mặt mịn/đều = bền, ít bột',
        en: 'Texture via <b>GLCM (Haralick, 1973)</b> + Laplacian variance + Ra% roughness<br>Score 0–100, grade A/B/C/D<br>Smooth/uniform surface = durable, low fines',
      },
    },
    {
      id: 'spc', icon: '📈',
      title: { th: 'SPC & แนวโน้มคุณภาพ', vi: 'SPC & xu hướng', en: 'SPC & quality trend' },
      body: {
        th: 'กราฟแนวโน้มมีเส้นควบคุม <b>CL/UCL/LCL</b> (ค่าเฉลี่ย ± 3σ) ตามหลัก SPC<br>ถ้าผลหลุดเกณฑ์<b>ติดกันหลายล็อต</b> ระบบเตือนทันที → ตรวจเครื่องอัด/หัวดาย/ความชื้น<br>เปรียบเทียบ Yield/Insize ระหว่างโรงงาน/กะ/ผู้ตรวจได้',
        vi: 'Biểu đồ có <b>CL/UCL/LCL</b> (TB ± 3σ) theo SPC<br>Nhiều lô liên tiếp không đạt → cảnh báo<br>So sánh giữa nhà máy/ca/người KT',
        en: 'Trend chart shows <b>CL/UCL/LCL</b> (mean ± 3σ) per SPC<br>Consecutive failing lots → alert (check press/die/moisture)<br>Compare Yield/Insize across factory/shift/inspector',
      },
    },
    {
      id: 'tips', icon: '🎯',
      title: { th: 'ถ่ายภาพให้แม่นยำ', vi: 'Chụp ảnh chính xác', en: 'Accurate photography' },
      body: {
        th: '• พื้นหลัง<b>เข้มสนิท ด้าน ไม่สะท้อน</b> (เม็ดสีอ่อน)<br>• ไฟ<b>กระจายสม่ำเสมอ</b> ไม่มีเงาทิศเดียว<br>• ถ่าย<b>ตั้งฉาก</b>กับพื้น (ใช้ขาตั้งดีสุด)<br>• เกลี่ยเม็ด<b>ไม่ให้ติดกัน</b><br>• วางวัตถุอ้างอิง (เหรียญ/ไม้บรรทัด) ระนาบเดียวกับเม็ด แล้วคาลิเบรต<br>• ≥ 30–50 เม็ดต่อภาพ เพื่อสถิติน่าเชื่อถือ',
        vi: '• Nền <b>tối, mờ, không phản chiếu</b><br>• Ánh sáng <b>đều</b><br>• Chụp <b>vuông góc</b> (dùng giá đỡ)<br>• Rải viên không dính<br>• Vật tham chiếu cùng mặt phẳng rồi hiệu chuẩn<br>• ≥ 30–50 viên/ảnh',
        en: '• <b>Solid matte dark</b> background<br>• <b>Even diffuse</b> light, no single-side shadow<br>• Shoot <b>perpendicular</b> (use a stand)<br>• Spread pellets apart<br>• Place a reference on the same plane, then calibrate<br>• ≥ 30–50 pellets per image',
      },
    },
    {
      id: 'storage', icon: '☁️',
      title: { th: 'เก็บออนไลน์ได้กี่ภาพ?', vi: 'Lưu được bao nhiêu ảnh?', en: 'How many images can it store?' },
      body: {
        th: 'ฐานข้อมูล Supabase แพ็กฟรี: <b>พื้นที่ไฟล์ 1 GB</b> + ดาตาเบส 0.5 GB<br>รูปที่วิเคราะห์แล้ว (JPEG ~150–300 KB/ภาพ) → เก็บได้ราว <b>3,500–6,500 ภาพ</b><br>ข้อมูลตัวเลข/รายเม็ดอีกประมาณ 5–20 KB/ล็อต → ดาตาเบสรองรับ <b>หมื่นๆ ล็อต</b><br>เมื่อใกล้เต็ม: ลบรายงานเก่า, ส่งออก CSV เก็บ, หรืออัปเกรดแพ็ก Pro (8 GB+)<br>เคล็ดลับยืดพื้นที่: ลดความละเอียดภาพที่บันทึก',
        vi: 'Supabase gói free: <b>1 GB file</b> + 0.5 GB DB<br>Ảnh ~150–300 KB → khoảng <b>3.500–6.500 ảnh</b><br>Dữ liệu số 5–20 KB/lô → <b>hàng chục nghìn lô</b><br>Gần đầy: xóa báo cáo cũ, xuất CSV, hoặc nâng Pro',
        en: 'Supabase free tier: <b>1 GB file storage</b> + 0.5 GB DB<br>Annotated JPEGs ~150–300 KB → about <b>3,500–6,500 images</b><br>Numeric/per-pellet data 5–20 KB/lot → <b>tens of thousands of lots</b><br>Near full: delete old reports, export CSV, or upgrade to Pro (8 GB+)',
      },
    },
  ];

  function render() {
    const box = document.getElementById('learn-list');
    if (!box) return;
    const lg = I18N.lang;
    box.innerHTML = TOPICS.map(tp => `
      <details class="learn-item">
        <summary>${tp.icon} ${tp.title[lg] || tp.title.en}</summary>
        <div class="learn-body">${tp.body[lg] || tp.body.en}</div>
      </details>`).join('');
  }

  return { render };
})();
