/* ===========================================================
 * chatbot.js — บอทแชทผู้ช่วยแนะนำการใช้งานและอธิบายผล (3 ภาษา)
 * rule-based ทำงานในเครื่อง ไม่ส่งข้อมูลออกภายนอก
 * =========================================================== */

const ChatBot = (() => {

  const UI = {
    th: {
      title: '🤖 ผู้ช่วย AICAM', placeholder: 'พิมพ์คำถาม…', send: 'ส่ง',
      hello: 'สวัสดีครับ 👋 ผมคือผู้ช่วย AICAM ถามได้เลย เช่น วิธีใช้งาน การคาลิเบรต ความหมายค่า L*a*b* หรือให้ผมอธิบายผลการวัดล่าสุดก็ได้ครับ',
      fallback: 'ขอโทษครับ ยังไม่เข้าใจคำถามนี้ ลองเลือกหัวข้อด้านล่าง หรือพิมพ์คำว่า "วิธีใช้", "คาลิเบรต", "สี", "เนื้อเม็ด", "อธิบายผล" ครับ',
      chips: ['วิธีใช้งาน', 'อธิบายผลล่าสุด', 'ค่า L*a*b* คืออะไร', 'ความละเอียดเนื้อเม็ด', 'เคล็ดลับให้วัดแม่น'],
    },
    vi: {
      title: '🤖 Trợ lý AICAM', placeholder: 'Nhập câu hỏi…', send: 'Gửi',
      hello: 'Xin chào 👋 Tôi là trợ lý AICAM. Hãy hỏi tôi về cách sử dụng, hiệu chuẩn, ý nghĩa L*a*b*, hoặc nhờ tôi giải thích kết quả đo gần nhất.',
      fallback: 'Xin lỗi, tôi chưa hiểu câu hỏi. Hãy chọn chủ đề bên dưới hoặc gõ "cách dùng", "hiệu chuẩn", "màu", "kết cấu", "giải thích".',
      chips: ['Cách sử dụng', 'Giải thích kết quả', 'L*a*b* là gì', 'Độ mịn viên', 'Mẹo đo chính xác'],
    },
    en: {
      title: '🤖 AICAM Assistant', placeholder: 'Type a question…', send: 'Send',
      hello: 'Hi 👋 I\'m the AICAM assistant. Ask me how to use the app, calibration, what L*a*b* means, or ask me to explain your latest results.',
      fallback: 'Sorry, I didn\'t understand. Pick a topic below, or type "how to", "calibrate", "color", "texture", "explain".',
      chips: ['How to use', 'Explain my results', 'What is L*a*b*', 'Pellet fineness', 'Accuracy tips'],
    },
  };

  /* ฐานความรู้: keywords ต่อภาษา + คำตอบ (string หรือ function(ctx)) */
  const KB = [
    {
      id: 'howto',
      kw: {
        th: ['วิธีใช้', 'ใช้งาน', 'เริ่ม', 'ขั้นตอน', 'ทำยังไง', 'ใช้ยังไง'],
        vi: ['cách dùng', 'cách sử dụng', 'bắt đầu', 'hướng dẫn', 'các bước'],
        en: ['how to', 'how do i', 'start', 'guide', 'steps', 'use the app'],
      },
      ans: {
        th: '📋 <b>ขั้นตอนการใช้งาน 5 ขั้น</b><br>1️⃣ วางเม็ดบน<b>พื้นเรียบสีตัดกับเม็ด</b> (เม็ดเข้ม → กระดาษขาว) เกลี่ยไม่ให้ติดกัน วาง<b>บัตร ATM/บัตรประชาชน</b>ไว้ข้างกลุ่มเม็ด ให้เห็นทั้งใบ<br>2️⃣ กด 📷 ถ่ายรูป (ถือกล้องขนานกับพื้น สูง ~20–30 ซม.)<br>3️⃣ กด 🪙 อัตโนมัติ ให้แอปหาบัตรและตั้งสเกลเอง (หรือ 📏 คาลิเบรต แตะ 2 จุดบนไม้บรรทัด/เวอร์เนียร์)<br>4️⃣ กด 🔬 วิเคราะห์ภาพ<br>5️⃣ ตรวจผล → กด 💾 บันทึกขึ้นออนไลน์ → 🔗 แชร์ต่อได้',
        vi: '📋 <b>5 bước sử dụng</b><br>1️⃣ Đặt viên trên <b>nền phẳng, màu tương phản với viên</b> (viên sẫm → giấy trắng), rải không dính nhau, đặt <b>thẻ ATM/CCCD</b> bên cạnh các viên, thấy trọn thẻ<br>2️⃣ Nhấn 📷 chụp ảnh (giữ máy song song mặt bàn, cao ~20–30 cm)<br>3️⃣ Nhấn 🪙 Tự động để ứng dụng tìm thẻ và đặt tỉ lệ (hoặc 📏 Hiệu chuẩn, chạm 2 điểm trên thước/thước kẹp)<br>4️⃣ Nhấn 🔬 Phân tích<br>5️⃣ Xem kết quả → 💾 Lưu trực tuyến → 🔗 Chia sẻ',
        en: '📋 <b>5 steps</b><br>1️⃣ Place pellets on a <b>plain background that contrasts with them</b> (dark pellets → white paper), spread apart, with an <b>ATM/ID card</b> beside them, fully visible<br>2️⃣ Tap 📷 to photograph (phone parallel to the surface, ~20–30 cm above)<br>3️⃣ Tap 🪙 Auto so the app finds the card and sets the scale (or 📏 Calibrate and tap 2 points on a ruler/caliper)<br>4️⃣ Tap 🔬 Analyze<br>5️⃣ Review → 💾 Save online → 🔗 Share',
      },
    },
    {
      id: 'calibrate',
      kw: {
        th: ['คาลิเบรต', 'มาตราส่วน', 'สเกล', 'ไม้บรรทัด'],
        vi: ['hiệu chuẩn', 'tỷ lệ', 'thước'],
        en: ['calibrat', 'scale', 'ruler', 'mm/pixel', 'mm per pixel'],
      },
      ans: {
        th: '📏 <b>การคาลิเบรต</b> คือการบอกแอปว่า 1 พิกเซลในภาพ = กี่มิลลิเมตรจริง<br><br>• <b>แนะนำ: บัตร ATM/บัตรประชาชน</b> (ขนาดมาตรฐาน 85.6×54 มม.) วางข้างกลุ่มเม็ดให้เห็นทั้งใบ <b>ระนาบเดียวกับเม็ด</b> แล้วกด 🪙 อัตโนมัติ — แอปวัดขอบบัตรเอง และจะไม่นับบัตรเป็นเม็ด<br>• หรือกด 📏 คาลิเบรต → แตะ 2 จุดบนไม้บรรทัด/เวอร์เนียร์ (ห่างกันมากๆ เช่น 0–100 มม.) → ลากจุดปรับละเอียดด้วยแว่นขยาย → ยืนยัน → กรอกระยะจริง<br>• ถ่ายด้วยมือ<b>ต้องคาลิเบรตใหม่ทุกภาพ</b> เพราะระยะกล้องเปลี่ยน (ใช้ขาตั้งระยะคงที่จึงคาลิเบรตครั้งเดียวได้)',
        vi: '📏 <b>Hiệu chuẩn</b> cho ứng dụng biết 1 pixel = bao nhiêu mm thực tế<br><br>• <b>Khuyên dùng: thẻ ATM/CCCD</b> (chuẩn 85,6×54 mm) đặt bên cạnh các viên, thấy trọn thẻ, <b>cùng mặt phẳng với viên</b>, rồi nhấn 🪙 Tự động — ứng dụng tự đo mép thẻ và không đếm thẻ là viên<br>• Hoặc nhấn 📏 → chạm 2 điểm trên thước/thước kẹp (càng xa càng tốt, VD 0–100 mm) → kéo điểm để chỉnh tinh bằng kính lúp → xác nhận → nhập chiều dài thực<br>• Chụp cầm tay thì <b>phải hiệu chuẩn lại mỗi ảnh</b> vì khoảng cách thay đổi (dùng giá đỡ cố định mới chỉ cần 1 lần)',
        en: '📏 <b>Calibration</b> tells the app how many real mm one pixel equals<br><br>• <b>Recommended: an ATM/ID card</b> (standard 85.6×54 mm) beside the pellets, fully visible, <b>on the same plane as the pellets</b>, then tap 🪙 Auto — the app measures the card edges itself and does not count the card as pellets<br>• Or tap 📏 → tap 2 points on a ruler/caliper (far apart, e.g. 0–100 mm) → drag the points to fine-tune with the magnifier → confirm → enter the real length<br>• Hand-held shots must be <b>calibrated for every photo</b> because the camera distance changes (a fixed rig lets you calibrate once)',
      },
    },
    {
      id: 'lab',
      kw: {
        th: ['lab', 'l*a*b', 'cielab', 'ค่าสี', 'สีคือ', 'สี l', 'แอล เอ บี'],
        vi: ['lab', 'cielab', 'màu là gì', 'giá trị màu'],
        en: ['lab', 'cielab', 'l*a*b', 'color value', 'what is l'],
      },
      ans: {
        th: '🎨 <b>ระบบสี CIELAB (L*a*b*)</b> — มาตรฐาน CIE 1976 สำหรับวัดสีตามการมองเห็นของมนุษย์<br><br>• <b>L*</b> = ความสว่าง (0 ดำสนิท → 100 ขาวสนิท)<br>• <b>a*</b> = แกนเขียว(−) ↔ แดง(+)<br>• <b>b*</b> = แกนน้ำเงิน(−) ↔ เหลือง(+)<br><br>ความต่างสีคำนวณ 2 สูตร:<br>• <b>ΔE*ab (CIE76)</b> = √(ΔL*² + Δa*² + Δb*²)<br>• <b>ΔE00 (CIEDE2000)</b> = สูตรปรับปรุงที่ตรงกับสายตามนุษย์มากที่สุด (แอปใช้ตัวนี้ตัดสินผ่าน/ไม่ผ่าน)<br><br>เกณฑ์ทั่วไป: ΔE00 &lt; 1 มองไม่ออก · 1-3 ต่างเล็กน้อย · 3-6 เห็นได้ชัด · &gt;6 ต่างมาก',
        vi: '🎨 <b>Hệ màu CIELAB (L*a*b*)</b> — chuẩn CIE 1976, đo màu theo cảm nhận của mắt người<br><br>• <b>L*</b> = độ sáng (0 đen → 100 trắng)<br>• <b>a*</b> = xanh lá(−) ↔ đỏ(+)<br>• <b>b*</b> = xanh dương(−) ↔ vàng(+)<br><br>Chênh lệch màu có 2 công thức:<br>• <b>ΔE*ab (CIE76)</b> = √(ΔL*² + Δa*² + Δb*²)<br>• <b>ΔE00 (CIEDE2000)</b> = công thức cải tiến, sát với mắt người nhất (ứng dụng dùng để đánh giá đạt/không đạt)<br><br>Tham khảo: ΔE00 &lt;1 không nhận ra · 1-3 khác nhẹ · 3-6 thấy rõ · &gt;6 khác nhiều',
        en: '🎨 <b>CIELAB (L*a*b*)</b> — the CIE 1976 standard for perceptual color measurement<br><br>• <b>L*</b> = lightness (0 black → 100 white)<br>• <b>a*</b> = green(−) ↔ red(+)<br>• <b>b*</b> = blue(−) ↔ yellow(+)<br><br>Color difference, two formulas:<br>• <b>ΔE*ab (CIE76)</b> = √(ΔL*² + Δa*² + Δb*²)<br>• <b>ΔE00 (CIEDE2000)</b> = the refined formula closest to human vision (used for the pass/fail verdict)<br><br>Guide: ΔE00 &lt;1 imperceptible · 1-3 slight · 3-6 noticeable · &gt;6 large',
      },
    },
    {
      id: 'texture',
      kw: {
        th: ['เนื้อเม็ด', 'ความละเอียด', 'หน้าตัด', 'texture', 'ผิวเม็ด', 'ขรุขระ', 'glcm', 'เกรด'],
        vi: ['kết cấu', 'độ mịn', 'bề mặt', 'texture', 'nhám', 'glcm'],
        en: ['texture', 'fineness', 'surface', 'rough', 'glcm', 'grade', 'quality score'],
      },
      ans: {
        th: '🔬 <b>การวิเคราะห์คุณภาพหน้าตัดเม็ด</b> ใช้ 3 ตัวชี้วัดตามหลักวิชาการ:<br><br>1️⃣ <b>GLCM (Haralick, 1973)</b> — วิเคราะห์ลวดลายเนื้อผิวจากคู่พิกเซลข้างเคียง ได้ค่า Homogeneity (ความเรียบเนียน 0-1), Contrast, Entropy<br>2️⃣ <b>Laplacian Variance</b> — พลังงานความถี่สูงของภาพ → <b>ดัชนีความละเอียดเนื้อเม็ด FI = 100·e^(−Var(∇²I)/500)</b> ยิ่งสูง = เนื้อบดละเอียด อัดแน่นดี<br>3️⃣ <b>ความขรุขระผิว (Ra%)</b> — ความผันแปรของความกว้างตลอดแนวเม็ด ผิวเรียบ = ขอบคม = ตัดเม็ดดี<br><br>🏆 คะแนนรวม = 0.3·FI + 0.3·Homogeneity + 0.2·Uniformity + 0.2·Smoothness<br>เกรด A ≥80 · B ≥65 · C ≥50 · D &lt;50<br><br>⚠️ ควรถ่ายด้วยแสงและโฟกัสคงที่ทุกครั้ง เพื่อให้เทียบข้ามล็อตได้',
        vi: '🔬 <b>Phân tích chất lượng bề mặt viên</b> dùng 3 chỉ số học thuật:<br><br>1️⃣ <b>GLCM (Haralick, 1973)</b> — phân tích kết cấu từ cặp pixel lân cận: Homogeneity (độ mịn 0-1), Contrast, Entropy<br>2️⃣ <b>Laplacian Variance</b> — năng lượng tần số cao → <b>chỉ số độ mịn FI = 100·e^(−Var(∇²I)/500)</b>, càng cao = nghiền mịn, ép chặt<br>3️⃣ <b>Độ nhám bề mặt (Ra%)</b> — biến động chiều rộng dọc viên; bề mặt phẳng = cắt viên tốt<br><br>🏆 Điểm = 0.3·FI + 0.3·Homogeneity + 0.2·Uniformity + 0.2·Smoothness<br>Hạng A ≥80 · B ≥65 · C ≥50 · D &lt;50<br><br>⚠️ Chụp với ánh sáng và tiêu cự cố định để so sánh giữa các lô',
        en: '🔬 <b>Pellet surface quality analysis</b> uses 3 academic measures:<br><br>1️⃣ <b>GLCM (Haralick, 1973)</b> — texture from neighboring pixel pairs: Homogeneity (smoothness 0-1), Contrast, Entropy<br>2️⃣ <b>Laplacian Variance</b> — high-frequency energy → <b>Fineness Index FI = 100·e^(−Var(∇²I)/500)</b>; higher = finer grind, better compaction<br>3️⃣ <b>Surface roughness (Ra%)</b> — width variation along the pellet; smooth surface = clean cut<br><br>🏆 Score = 0.3·FI + 0.3·Homogeneity + 0.2·Uniformity + 0.2·Smoothness<br>Grade A ≥80 · B ≥65 · C ≥50 · D &lt;50<br><br>⚠️ Use consistent lighting and focus to compare across lots',
      },
    },
    {
      id: 'explain',
      kw: {
        th: ['อธิบายผล', 'ผลล่าสุด', 'แปลผล', 'สรุปผล', 'ผลเป็นไง', 'ทำไมไม่ผ่าน', 'ไม่ผ่าน'],
        vi: ['giải thích', 'kết quả', 'tóm tắt', 'tại sao không đạt'],
        en: ['explain', 'my result', 'summary', 'why fail', 'interpret'],
      },
      ans: { th: ctx => explainResults(ctx, 'th'), vi: ctx => explainResults(ctx, 'vi'), en: ctx => explainResults(ctx, 'en') },
    },
    {
      id: 'tips',
      kw: {
        th: ['เคล็ดลับ', 'แม่นยำ', 'วัดแม่น', 'ไม่ตรง', 'คลาดเคลื่อน', 'ผิดพลาด'],
        vi: ['mẹo', 'chính xác', 'sai số', 'không đúng'],
        en: ['tip', 'accura', 'precise', 'wrong', 'error', 'incorrect'],
      },
      ans: {
        th: '🎯 <b>เคล็ดลับให้วัดแม่นระดับโรงงาน</b><br>• พื้นเรียบสีตัดกับเม็ด: เม็ดเข้ม → <b>กระดาษขาว</b>, เม็ดสีอ่อน → พื้นเข้มด้าน<br>• เกลี่ยเม็ดไม่ให้ติดกัน — เม็ดที่ติดกันจะถูก<b>คัดออก ไม่นำมาวัด</b> (กรอบสีส้ม)<br>• ถือกล้อง<b>ขนานกับพื้น</b> — ถ่ายเอียงทำให้สเกลเพี้ยน (แอปเตือนเมื่อบัตรเอียงเกิน 3%)<br>• โฟกัสให้ชัด แสงพอ กล้องนิ่ง — แอปเตือนเมื่อขอบเม็ดเบลอ<br>• บัตร/ไม้บรรทัดต้องอยู่ระนาบเดียวกับเม็ด และอยู่ครบในภาพ<br>• ควรมี 30–50 เม็ดขึ้นไปต่อภาพ เพื่อให้ % น่าเชื่อถือทางสถิติ',
        vi: '🎯 <b>Mẹo đo chính xác cấp nhà máy</b><br>• Nền phẳng, tương phản với viên: viên sẫm → <b>giấy trắng</b>, viên sáng màu → nền tối mờ<br>• Rải viên không dính nhau — viên dính nhau bị <b>loại, không đo</b> (khung cam)<br>• Giữ máy <b>song song mặt bàn</b> — chụp nghiêng làm sai tỉ lệ (ứng dụng cảnh báo khi thẻ lệch quá 3%)<br>• Lấy nét rõ, đủ sáng, giữ máy chắc — ứng dụng cảnh báo khi mép viên bị nhòe<br>• Thẻ/thước phải cùng mặt phẳng với viên và nằm trọn trong ảnh<br>• Nên có từ 30–50 viên mỗi ảnh để % có ý nghĩa thống kê',
        en: '🎯 <b>Factory-grade accuracy tips</b><br>• Plain background that contrasts with the pellets: dark pellets → <b>white paper</b>, light pellets → matte dark sheet<br>• Spread pellets apart — touching pellets are <b>excluded, not measured</b> (orange boxes)<br>• Hold the phone <b>parallel to the surface</b> — a tilted shot skews the scale (the app warns when the card is more than 3% off)<br>• Sharp focus, enough light, steady camera — the app warns when pellet edges are blurred<br>• The card/ruler must lie on the same plane as the pellets and be fully inside the frame<br>• Use 30–50+ pellets per image for statistically reliable percentages',
      },
    },
    {
      id: 'share',
      kw: {
        th: ['แชร์', 'ส่งต่อ', 'ลิงก์', 'ส่งรายงาน'],
        vi: ['chia sẻ', 'gửi', 'liên kết'],
        en: ['share', 'send report', 'link'],
      },
      ans: {
        th: '🔗 <b>การแชร์รายงาน</b><br>• หลังบันทึกขึ้นออนไลน์ กดปุ่ม 🔗 แชร์ → ส่งทาง LINE/อีเมลได้เลย<br>• รายงานเก่า: เปิดในแท็บ 📊 รายงาน แล้วกดแชร์ในหน้ารายละเอียด<br>• ผู้รับเปิดลิงก์แล้วเห็นรายงานเต็มทันที (ต้องรู้รหัสเข้าแอป)<br>• ส่งออก CSV ได้ทั้งรายงานเดี่ยวและสรุปทุกล็อต',
        vi: '🔗 <b>Chia sẻ báo cáo</b><br>• Sau khi lưu trực tuyến, nhấn 🔗 Chia sẻ → gửi qua Zalo/email<br>• Báo cáo cũ: mở tab 📊 Báo cáo rồi nhấn chia sẻ trong chi tiết<br>• Người nhận mở liên kết thấy báo cáo đầy đủ (cần biết mã truy cập)<br>• Xuất CSV từng báo cáo hoặc tổng hợp tất cả',
        en: '🔗 <b>Sharing reports</b><br>• After saving online, tap 🔗 Share → send via chat/email<br>• Old reports: open in 📊 Reports tab, tap share in the detail view<br>• The recipient opens the link and sees the full report (access code required)<br>• Export CSV per report or a summary of all lots',
      },
    },
    {
      id: 'pin',
      kw: {
        th: ['รหัส', 'เปลี่ยนรหัส', 'pin', 'ล็อก'],
        vi: ['mã', 'đổi mã', 'pin', 'khóa'],
        en: ['pin', 'password', 'access code', 'lock', 'change code'],
      },
      ans: {
        th: '🔐 จัดการผู้ใช้/รหัสได้ที่แท็บ ⚙️ ตั้งค่า → "ผู้ใช้และสิทธิ์" (ชื่อ/รหัส 4-8 หลัก/บทบาท admin หรือ inspector) — admin เท่านั้นที่แก้ตั้งค่า/ลบรายงานได้<br>รหัสเริ่มต้น 1234 ควรเปลี่ยนเมื่อใช้จริง',
        vi: '🔐 Quản lý người dùng/mã ở ⚙️ Cài đặt → "Người dùng & quyền" (admin/inspector). Mặc định 1234, nên đổi.',
        en: '🔐 Manage users/PINs in ⚙️ Settings → "Users & roles" (admin/inspector). Default 1234 — change it.',
      },
    },
    {
      id: 'fines',
      kw: {
        th: ['ฝุ่น', 'fines', 'เม็ดแตก', 'ผง'],
        vi: ['bột', 'fines', 'vụn'],
        en: ['fines', 'dust', 'powder', 'broken'],
      },
      ans: {
        th: '🌫️ <b>% ฝุ่น (Fines)</b> = เศษผง/เม็ดแตกที่เล็กกว่าตะแกรงล่าง คิดเป็น % โดยปริมาตร<br>ฝุ่นมาก = สูญเสียวัตถุดิบ สัตว์กินได้น้อย น้ำในบ่อเสีย<br>สาเหตุ: บดละเอียดเกิน, ไอน้ำ/ความชื้นไม่พอ, แม่พิมพ์สึก, ขนส่งกระแทก<br>อาหารกุ้งดี: ฝุ่น &lt; 1–2% · อ่านเพิ่มในแท็บ 📚 ความรู้',
        vi: '🌫️ <b>% Bột (Fines)</b> = bột/vụn nhỏ hơn sàng dưới, % theo thể tích<br>Nhiều = hao phí, bẩn nước. Nguyên nhân: nghiền quá mịn, thiếu hơi/ẩm, khuôn mòn<br>Tốt: &lt; 1–2%',
        en: '🌫️ <b>% Fines</b> = dust/broken bits below the lower sieve, % by volume<br>High fines = waste, poor intake, fouled water. Causes: over-grinding, low steam/moisture, worn die<br>Good: &lt; 1–2% · see the 📚 Learn tab',
      },
    },
    {
      id: 'pdi',
      kw: {
        th: ['pdi', 'ทนทาน', 'durability', 'ความแข็ง', 'holmen'],
        vi: ['pdi', 'độ bền', 'durability', 'holmen'],
        en: ['pdi', 'durability', 'hardness', 'holmen'],
      },
      ans: {
        th: '💪 <b>PDI (Pellet Durability Index)</b> = % เม็ดที่เหลือดีหลังทดสอบกระแทก/หมุน (Holmen/tumbling)<br>วัดจริงต้องใช้เครื่องแล็บ — กรอกค่าจริงในช่อง "PDI" ตอนบันทึก เพื่อเก็บแนวโน้ม<br>แอปประเมินคร่าวจากคะแนนเนื้อสัมผัสให้ดูแนวทาง (ไม่ใช่ค่าแทน)<br>อาหารกุ้งดี PDI &gt; 95% (อยู่ในน้ำได้นานไม่ยุ่ย)',
        vi: '💪 <b>PDI</b> = % viên còn nguyên sau thử va đập/quay<br>Đo thực cần máy lab — nhập giá trị thực khi lưu. App chỉ ước tính từ kết cấu<br>Tôm tốt: PDI &gt; 95%',
        en: '💪 <b>PDI (Pellet Durability Index)</b> = % intact pellets after impact/tumbling<br>Needs a lab tester — enter the real value when saving. The app only estimates from texture<br>Good shrimp feed: PDI &gt; 95%',
      },
    },
    {
      id: 'yield',
      kw: {
        th: ['yield', 'ตะแกรง', 'mesh', 'ร่อน', 'oversize', 'undersize'],
        vi: ['yield', 'sàng', 'mesh'],
        en: ['yield', 'sieve', 'mesh', 'oversize', 'undersize'],
      },
      ans: {
        th: '⚙️ <b>%Yield</b> จำลองร่อนด้วยตะแกรง mesh มาตรฐานตามเส้นผ่านศูนย์กลางเม็ด: ตัด undersize (ฝุ่น) + oversize (ใหญ่เกิน) ออก เหลือ on-size = Yield<br>คิดแบบถ่วงน้ำหนักปริมาตร (≈ มวล) เหมือนร่อนชั่งจริง<br>ตั้งค่า mesh แต่ละไซซ์ (มม. หรือเบอร์ mesh) ได้ในตั้งค่า',
        vi: '⚙️ <b>%Yield</b> mô phỏng sàng mesh theo đường kính: loại undersize + oversize, còn on-size = Yield (theo thể tích). Đặt mesh từng cỡ trong Cài đặt',
        en: '⚙️ <b>%Yield</b> simulates mesh sieving by diameter: removes undersize (fines) + oversize, leaving on-size = Yield (volume-weighted). Configure mesh per size in Settings',
      },
    },
    {
      id: 'product',
      kw: {
        th: ['กุ้ง', 'ปลา', 'ชนิด', 'extrusion', 'ทรงกระบอก', 'ทรงกลม', 'แยกชนิด'],
        vi: ['tôm', 'cá', 'loại', 'extrusion', 'trụ', 'tròn'],
        en: ['shrimp', 'fish', 'extrusion', 'cylindrical', 'round', 'type'],
      },
      ans: {
        th: '🦐🐟 ระบบ<b>แยกชนิดอัตโนมัติ</b>จากรูปทรงเม็ด ไม่ต้องเลือกเอง:<br>• เม็ด<b>ทรงกระบอก</b> (ยาว/กว้าง ≥ 1.35) = <b>กุ้ง (Pellet Mill)</b><br>• เม็ด<b>ทรงกลม/ป้อม</b> (&lt; 1.35) = <b>ปลา (Extrusion)</b><br>แล้วเลือกตารางสเปกของชนิดนั้นให้เอง',
        vi: '🦐🐟 Tự nhận loại theo hình dạng: trụ (≥1.35)=tôm (Pellet Mill); tròn (&lt;1.35)=cá (ép đùn). Tự chọn bảng tiêu chuẩn',
        en: '🦐🐟 Auto-detects type by shape: cylindrical (≥1.35)=shrimp (Pellet Mill); round (&lt;1.35)=fish (extrusion). Picks the matching spec table',
      },
    },
    {
      id: 'storage',
      kw: {
        th: ['เก็บได้กี่', 'พื้นที่', 'กี่ภาพ', 'เต็ม', 'storage'],
        vi: ['bao nhiêu ảnh', 'dung lượng', 'đầy'],
        en: ['how many', 'storage', 'capacity', 'full', 'space'],
      },
      ans: {
        th: '☁️ แพ็กฟรี Supabase: ไฟล์ 1 GB + ดาตาเบส 0.5 GB<br>รูปวิเคราะห์ ~150–300 KB/ภาพ → เก็บได้ราว <b>3,500–6,500 ภาพ</b> · ข้อมูลตัวเลขรองรับหมื่นๆ ล็อต<br>ใกล้เต็ม: ลบรายงานเก่า / ส่งออก CSV / อัปเกรด Pro',
        vi: '☁️ Supabase free: 1 GB file + 0.5 GB DB → ~<b>3.500–6.500 ảnh</b>. Gần đầy: xóa cũ/xuất CSV/nâng Pro',
        en: '☁️ Supabase free: 1 GB files + 0.5 GB DB → about <b>3,500–6,500 images</b>. Near full: delete old / export CSV / upgrade Pro',
      },
    },
    {
      id: 'accuracy',
      kw: {
        th: ['เงา', 'แสง', 'แม่นยำ', 'คลาดเคลื่อน', 'shadow'],
        vi: ['bóng', 'ánh sáng', 'chính xác', 'shadow'],
        en: ['shadow', 'glare', 'accuracy', 'lighting', 'precise'],
      },
      ans: {
        th: '🌓 แอปหาขอบเม็ดจาก<b>จุดที่ความสว่างเปลี่ยนเร็วที่สุด</b> (ระดับ sub-pixel) ไม่ได้ใช้ค่า threshold ตายตัว จึง<b>ไม่วัดรวมเงา</b>ที่ทอดข้างเม็ด<br>ผลทดสอบกับภาพจำลองที่รู้ขนาดจริง: ภาพคม คลาดเคลื่อนราว ±0.5% · ภาพเบลอร่วมกับเงาเข้ม อาจเกินจริง 2–5% (แอปจะเตือน)<br>เพื่อผลดีที่สุด: ไฟกระจายสม่ำเสมอ (เลี่ยงไฟทิศเดียวที่ทำให้เงายาว) + ถือกล้องขนานกับพื้น',
        vi: '🌓 Ứng dụng tìm mép viên tại <b>điểm độ sáng thay đổi nhanh nhất</b> (mức sub-pixel), không dùng ngưỡng cố định nên <b>không đo cả bóng</b> bên cạnh viên<br>Thử với ảnh mô phỏng đã biết kích thước: ảnh nét sai lệch khoảng ±0,5% · ảnh nhòe kèm bóng đậm có thể lớn hơn thực 2–5% (ứng dụng sẽ cảnh báo)<br>Tốt nhất: ánh sáng đều (tránh đèn một hướng tạo bóng dài) + giữ máy song song mặt bàn',
        en: '🌓 The app locates each pellet edge at the <b>point where brightness changes fastest</b> (sub-pixel), not at a fixed threshold, so the <b>shadow beside a pellet is not measured</b><br>Tested on simulated photos of known size: sharp photos are within about ±0.5% · blurred photos with dark shadows can read 2–5% high (the app warns)<br>For best results: even lighting (avoid a single directional lamp that casts long shadows) + phone parallel to the surface',
      },
    },
  ];

  let lang = 'th';
  let getContext = () => null;

  /* -------- อธิบายผลล่าสุดแบบไดนามิก -------- */
  function explainResults(ctx, lg) {
    const M = {
      th: {
        none: 'ยังไม่มีผลการวัดในหน้านี้ครับ — ถ่ายรูปแล้วกด 🔬 วิเคราะห์ภาพก่อน แล้วค่อยให้ผมอธิบายผลครับ',
        head: n => `📊 <b>สรุปผลล่าสุด (${n} เม็ด)</b><br>`,
        size: (l, sd, d) => `• ความยาวเฉลี่ย <b>${l} มม.</b> (SD ${sd}) · Ø เฉลี่ย <b>${d} มม.</b><br>`,
        cvGood: '• ขนาดสม่ำเสมอดี (CV ต่ำ) แสดงว่าการตัดเม็ดคงที่ ✅<br>',
        cvBad: '• ขนาดกระจายมาก (CV สูง) — ตรวจความเร็วใบมีด/ลูกกลิ้งอัดเม็ด ⚠️<br>',
        spec: (u, i, o, tg, pass) => `• Under ${u}% · <b>Insize ${i}%</b> · Over ${o}% (เป้า ≥${tg}%) → ${pass ? '<b>✓ ผ่านเกณฑ์</b>' : '<b>✗ ไม่ผ่านเกณฑ์</b>'}<br>`,
        underHigh: '→ เม็ดสั้นเกินมาก: ใบมีดตัดถี่ไป หรือเม็ดแตกหักหลังอัด ลองลดความเร็วใบมีด/เช็คความชื้นวัตถุดิบ<br>',
        overHigh: '→ เม็ดยาวเกินมาก: ใบมีดตัดห่างไป หรือใบมีดทื่อ ลองเพิ่มความเร็วใบมีด/ลับใบมีด<br>',
        color: (L, a, b, de) => `• สี L*=${L}, a*=${a}, b*=${b}${de != null ? ` · ΔE00 เทียบสีอ้างอิง = <b>${de}</b>` : ''}<br>`,
        tex: (sc, gr, fi, ra) => `• คุณภาพหน้าตัด: คะแนน <b>${sc}/100 (เกรด ${gr})</b> · ความละเอียดเนื้อ ${fi} · ขรุขระผิว ${ra}%<br>`,
        texA: '→ เนื้อเม็ดละเอียดอัดแน่นดีมาก 🏆', texB: '→ คุณภาพเนื้อเม็ดดี ใช้งานได้',
        texC: '→ เนื้อเม็ดหยาบปานกลาง — เช็คความละเอียดการบด (hammer mill screen)', texD: '→ เนื้อเม็ดหยาบ/ผิวแตก — ตรวจการบดวัตถุดิบและความดันอัดเม็ด ⚠️',
      },
      vi: {
        none: 'Chưa có kết quả đo — hãy chụp ảnh và nhấn 🔬 Phân tích trước, rồi tôi sẽ giải thích.',
        head: n => `📊 <b>Tóm tắt kết quả (${n} viên)</b><br>`,
        size: (l, sd, d) => `• Dài TB <b>${l} mm</b> (SD ${sd}) · Ø TB <b>${d} mm</b><br>`,
        cvGood: '• Kích thước đồng đều (CV thấp) — dao cắt ổn định ✅<br>',
        cvBad: '• Kích thước phân tán (CV cao) — kiểm tra tốc độ dao/trục ép ⚠️<br>',
        spec: (u, i, o, tg, pass) => `• Under ${u}% · <b>Insize ${i}%</b> · Over ${o}% (mục tiêu ≥${tg}%) → ${pass ? '<b>✓ Đạt</b>' : '<b>✗ Không đạt</b>'}<br>`,
        underHigh: '→ Nhiều viên quá ngắn: dao cắt quá dày hoặc viên vỡ — giảm tốc độ dao/kiểm tra độ ẩm<br>',
        overHigh: '→ Nhiều viên quá dài: dao cắt thưa hoặc cùn — tăng tốc độ dao/mài dao<br>',
        color: (L, a, b, de) => `• Màu L*=${L}, a*=${a}, b*=${b}${de != null ? ` · ΔE00 so với chuẩn = <b>${de}</b>` : ''}<br>`,
        tex: (sc, gr, fi, ra) => `• Chất lượng bề mặt: <b>${sc}/100 (hạng ${gr})</b> · độ mịn ${fi} · độ nhám ${ra}%<br>`,
        texA: '→ Kết cấu mịn, ép chặt rất tốt 🏆', texB: '→ Chất lượng tốt, dùng được',
        texC: '→ Hơi thô — kiểm tra độ mịn nghiền (lưới hammer mill)', texD: '→ Thô/nứt bề mặt — kiểm tra nghiền nguyên liệu và áp lực ép ⚠️',
      },
      en: {
        none: 'No measurement on this page yet — take a photo and tap 🔬 Analyze first, then ask me to explain.',
        head: n => `📊 <b>Latest result summary (${n} pellets)</b><br>`,
        size: (l, sd, d) => `• Avg length <b>${l} mm</b> (SD ${sd}) · avg Ø <b>${d} mm</b><br>`,
        cvGood: '• Sizes are uniform (low CV) — consistent cutting ✅<br>',
        cvBad: '• Sizes vary a lot (high CV) — check knife speed / die roller ⚠️<br>',
        spec: (u, i, o, tg, pass) => `• Under ${u}% · <b>Insize ${i}%</b> · Over ${o}% (target ≥${tg}%) → ${pass ? '<b>✓ PASS</b>' : '<b>✗ FAIL</b>'}<br>`,
        underHigh: '→ Too many short pellets: knife cutting too often or pellets breaking — slow the knife / check feed moisture<br>',
        overHigh: '→ Too many long pellets: knife too slow or dull — speed up / sharpen the knife<br>',
        color: (L, a, b, de) => `• Color L*=${L}, a*=${a}, b*=${b}${de != null ? ` · ΔE00 vs reference = <b>${de}</b>` : ''}<br>`,
        tex: (sc, gr, fi, ra) => `• Surface quality: <b>${sc}/100 (grade ${gr})</b> · fineness ${fi} · roughness ${ra}%<br>`,
        texA: '→ Very fine, well-compacted texture 🏆', texB: '→ Good texture quality',
        texC: '→ Moderately coarse — check grinding fineness (hammer mill screen)', texD: '→ Coarse/cracked surface — check raw material grind and die pressure ⚠️',
      },
    }[lg];

    if (!ctx || !ctx.stats) return M.none;
    const s = ctx.stats, sr = ctx.specResult, tx = s.texture;
    let out = M.head(s.count);
    out += M.size(s.avg_length_mm.toFixed(1), s.sd_length_mm.toFixed(1), s.avg_diameter_mm.toFixed(2));
    const cv = s.avg_length_mm ? s.sd_length_mm / s.avg_length_mm : 0;
    out += cv <= 0.18 ? M.cvGood : M.cvBad;
    if (sr && ctx.spec) {
      out += M.spec(sr.under_pct, sr.insize_pct, sr.over_pct, ctx.spec.target_pct, sr.pass);
      if (!sr.pass) {
        if (sr.under_pct >= sr.over_pct) out += M.underHigh;
        else out += M.overHigh;
      }
    }
    if (s.avg_color && s.avg_color.lab) {
      const lab = s.avg_color.lab;
      out += M.color(lab.l.toFixed(1), lab.a.toFixed(1), lab.b.toFixed(1),
        s.avg_color.delta_e00 != null ? s.avg_color.delta_e00 : null);
    }
    if (tx) {
      out += M.tex(tx.score, tx.grade, tx.fineness, tx.roughness_pct);
      out += { A: M.texA, B: M.texB, C: M.texC, D: M.texD }[tx.grade];
    }
    return out;
  }

  /* -------- matching -------- */
  function answer(text) {
    const q = text.toLowerCase();
    for (const intent of KB) {
      const kws = [...(intent.kw[lang] || []), ...(intent.kw.en || [])];
      if (kws.some(k => q.includes(k))) {
        const a = intent.ans[lang] || intent.ans.th;
        return typeof a === 'function' ? a(getContext()) : a;
      }
    }
    return UI[lang].fallback;
  }

  /* -------- UI -------- */
  function addMsg(html, who) {
    const box = document.getElementById('chat-msgs');
    const div = document.createElement('div');
    div.className = 'chat-msg ' + who;
    div.innerHTML = html;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  }

  function renderChips() {
    const box = document.getElementById('chat-chips');
    box.innerHTML = '';
    UI[lang].chips.forEach(c => {
      const b = document.createElement('button');
      b.className = 'chat-chip';
      b.textContent = c;
      b.addEventListener('click', () => send(c));
      box.appendChild(b);
    });
  }

  function send(text) {
    text = (text || '').trim();
    if (!text) return;
    addMsg(text.replace(/</g, '&lt;'), 'me');
    document.getElementById('chat-input').value = '';
    setTimeout(() => addMsg(answer(text), 'bot'), 350);
  }

  function applyLang(l) {
    lang = UI[l] ? l : 'th';
    document.getElementById('chat-title').textContent = UI[lang].title;
    document.getElementById('chat-input').placeholder = UI[lang].placeholder;
    document.getElementById('chat-send').textContent = UI[lang].send;
    renderChips();
  }

  function init(opts) {
    getContext = opts.getContext || getContext;
    applyLang(opts.lang || 'th');

    const panel = document.getElementById('chat-panel');
    document.getElementById('chat-fab').addEventListener('click', () => {
      panel.hidden = !panel.hidden;
      if (!panel.hidden && !document.getElementById('chat-msgs').children.length) {
        addMsg(UI[lang].hello, 'bot');
      }
    });
    document.getElementById('chat-close').addEventListener('click', () => { panel.hidden = true; });
    document.getElementById('chat-send').addEventListener('click', () => send(document.getElementById('chat-input').value));
    document.getElementById('chat-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') send(e.target.value);
    });
    document.addEventListener('langchange', () => applyLang(I18N.lang));
  }

  return { init };
})();
