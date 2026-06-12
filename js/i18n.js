/* ===========================================================
 * i18n.js — ระบบ 3 ภาษา ไทย / Tiếng Việt / English
 * =========================================================== */

const I18N = (() => {
  const dict = {
    th: {
      app_title: 'AICAM — วัดขนาดเม็ดอาหาร',
      nav_measure: 'วัดขนาด', nav_reports: 'รายงาน', nav_settings: 'ตั้งค่า',

      lock_title: 'AICAM Pellet Analyzer',
      lock_sub: 'กรอกรหัสผ่านเพื่อเข้าใช้งาน',
      lock_placeholder: 'รหัสผ่าน',
      lock_btn: 'เข้าใช้งาน',
      lock_wrong: 'รหัสไม่ถูกต้อง',
      lock_remember: 'จดจำเครื่องนี้ 7 วัน',
      lock_default_hint: 'รหัสเริ่มต้น 1234 — เปลี่ยนได้ในหน้าตั้งค่า',

      cap_title: '1. ถ่ายรูปเม็ดอาหาร',
      cap_hint: 'วางเม็ดอาหารบนพื้นเข้ม ไม่ให้เม็ดติดกัน พร้อมวัตถุอ้างอิงขนาดที่ทราบ (เช่น ไม้บรรทัด/เหรียญ)',
      cap_camera: '📷 ถ่ายรูป', cap_file: '🖼 เลือกรูปจากเครื่อง',

      cal_title: '2. คาลิเบรต & เลือกไซซ์',
      cal_none: 'ยังไม่ได้คาลิเบรต',
      cal_scale: 'มาตราส่วน', cal_unit: 'มม./พิกเซล',
      cal_btn: '📏 คาลิเบรต', cal_cancel: '✕ ยกเลิก',
      cal_hint: 'แตะ 2 จุด บนภาพ ที่ปลายทั้งสองข้างของวัตถุอ้างอิงที่ทราบความยาว',
      cal_prompt: 'ความยาวจริงระหว่าง 2 จุด (มม.)',
      cal_alert: 'กรุณาคาลิเบรตมาตราส่วนก่อน (กดปุ่ม 📏 คาลิเบรต แล้วแตะ 2 จุดบนวัตถุที่ทราบความยาว)',
      die_label: 'ไซซ์อาหาร (Die)', die_none: '— ไม่ระบุ —',
      analyze_btn: '🔬 วิเคราะห์ภาพ', analyzing: 'กำลังวิเคราะห์…',
      analyze_fail: 'วิเคราะห์ไม่สำเร็จ',

      res_title: '3. ผลการวิเคราะห์',
      st_count: 'จำนวนเม็ด', st_avg_len: 'ยาวเฉลี่ย (มม.)', st_avg_dia: 'Ø เฉลี่ย (มม.)',
      st_sd: 'SD ความยาว', st_min: 'สั้นสุด (มม.)', st_max: 'ยาวสุด (มม.)',
      rejected_note: 'มี {n} ก้อนที่ไม่ถูกนับ (ใหญ่ผิดปกติ/ชนขอบภาพ) — แสดงเป็นกรอบสีขาวจาง',
      split_note: 'แยกเม็ดที่ติดกันอัตโนมัติ {n} จุด',

      spec_title: 'เทียบเป้าหมายไซซ์',
      spec_under: 'Under', spec_insize: 'Insize', spec_over: 'Over',
      spec_target: 'เป้าหมาย Insize ≥ {t}%',
      spec_range: 'ช่วง {min}–{max} มม.',
      spec_pass: '✓ ผ่านเกณฑ์', spec_fail: '✗ ไม่ผ่านเกณฑ์',
      spec_die_dia: 'Ø หัวดาย {d} มม.',

      chart_len: 'การกระจายความยาว (มม.)',
      chart_len_title: 'จำนวนเม็ดตามช่วงความยาว (มม.)',
      chart_dia: 'การกระจายเส้นผ่าศูนย์กลาง (มม.)',
      chart_dia_title: 'จำนวนเม็ดตามช่วง Ø (มม.)',
      chart_total: 'รวมทั้งหมด {n} เม็ด',
      dist_title: 'ตารางสัดส่วน',
      th_range_cm: 'ช่วง (มม.)', th_count: 'จำนวน', th_pct: '%',

      color_title: 'สีเฉลี่ยของเม็ดอาหาร',
      color_sample: 'สีตัวอย่าง', color_ref: 'สีอ้างอิง',
      color_pass: '✓ สีผ่านเกณฑ์', color_fail: '✗ สีไม่ผ่านเกณฑ์',

      pellet_details: 'ดูข้อมูลรายเม็ด',
      th_no: '#', th_len: 'ยาว (มม.)', th_dia: 'Ø (มม.)', th_color: 'สี',

      save_title: 'บันทึกผล',
      f_sample: 'ชื่อตัวอย่าง / ล็อต', f_sample_ph: 'เช่น ล็อต A-2026-06-12',
      f_operator: 'ผู้ตรวจ', f_operator_ph: 'ชื่อผู้ตรวจ',
      f_notes: 'หมายเหตุ', f_notes_ph: 'หมายเหตุเพิ่มเติม',
      save_btn: '💾 บันทึกขึ้นออนไลน์', csv_btn: '⬇️ CSV', share_btn: '🔗 แชร์',
      saving: '⏳ กำลังบันทึก…',
      save_ok: '✓ บันทึกเรียบร้อย — ดูได้ในแท็บ "รายงาน"',
      save_err: '✗ บันทึกไม่สำเร็จ',
      share_first: 'กรุณาบันทึกขึ้นออนไลน์ก่อนแชร์',
      link_copied: '✓ คัดลอกลิงก์แล้ว',

      rep_title: '📊 รายงานผลการวัด',
      rep_hint: 'ข้อมูลทั้งหมดเก็บออนไลน์ — เปิดดูจากเครื่องไหนก็ได้',
      rep_refresh: '🔄 โหลดใหม่', rep_export: '⬇️ CSV สรุปทั้งหมด',
      rep_loading: 'กำลังโหลด…',
      rep_empty: 'ยังไม่มีข้อมูล — วัดและบันทึกผลจากแท็บ "วัดขนาด"',
      rep_load_fail: 'โหลดไม่สำเร็จ',
      rep_noname: 'ไม่ระบุชื่อตัวอย่าง',
      rep_items: 'เม็ด', rep_avg: 'ยาวเฉลี่ย',
      rep_delete: '🗑 ลบรายงานนี้', rep_delete_confirm: 'ลบรายงานนี้ถาวร?',
      rep_inspector: 'ผู้ตรวจ', rep_note: 'หมายเหตุ',
      export_fail: 'ส่งออกไม่สำเร็จ',

      set_title: '⚙️ ตั้งค่า',
      s_mmpp: 'มาตราส่วน (มม./พิกเซล)', s_mmpp_ph: 'คาลิเบรตจากภาพ หรือกรอกเอง',
      s_operator: 'ผู้ตรวจ (ค่าเริ่มต้น)',
      s_bins: 'ขอบช่วงความยาว (มม. คั่นด้วย , )',
      s_polarity: 'พื้นหลังภาพ',
      s_pol_auto: 'ตรวจอัตโนมัติ', s_pol_dark: 'พื้นเข้ม เม็ดสว่าง', s_pol_light: 'พื้นสว่าง เม็ดเข้ม',
      s_minlen: 'ขนาดเล็กสุดที่นับ (มม.)', s_maxlen: 'ขนาดใหญ่สุดที่นับ (มม.)',
      s_split: 'แยกเม็ดที่ติดกันอัตโนมัติ',
      s_refcolor: 'สีอ้างอิง (มาตรฐาน)', s_userefcolor: 'เปรียบเทียบสีกับสีอ้างอิง',
      s_demax: 'เกณฑ์สีผ่าน (ΔE00 ≤)',
      s_pin: 'รหัสเข้าใช้งาน (4-8 หลัก)',
      s_spec_title: 'ตารางเป้าหมายไซซ์อาหาร',
      s_spec_hint: 'กำหนดช่วงขนาดและ % Insize ขั้นต่ำของแต่ละหัวดาย',
      th_die: 'Die (มม.)', th_min: 'ต่ำสุด (มม.)', th_max: 'สูงสุด (มม.)', th_target: 'Insize ≥ %',
      s_spec_add: '+ เพิ่มไซซ์',
      s_save: 'บันทึกการตั้งค่า', s_saved: '✓ บันทึกการตั้งค่าแล้ว',

      csv_report_title: 'รายงานการวัดขนาดเม็ดอาหาร',
      csv_date: 'วันที่', csv_sample: 'ตัวอย่าง', csv_operator: 'ผู้ตรวจ', csv_notes: 'หมายเหตุ',
      csv_count: 'จำนวนเม็ด', csv_avg_len: 'ความยาวเฉลี่ย (มม.)', csv_sd: 'SD ความยาว',
      csv_min: 'สั้นสุด (มม.)', csv_max: 'ยาวสุด (มม.)', csv_avg_dia: 'เส้นผ่าศูนย์กลางเฉลี่ย (มม.)',
      csv_die: 'ไซซ์ Die', csv_under: 'Under %', csv_insize: 'Insize %', csv_over: 'Over %',
      csv_result: 'ผล', csv_pass: 'ผ่าน', csv_fail: 'ไม่ผ่าน',


      tex_title: 'คุณภาพหน้าตัดเม็ด (Texture)',
      tex_hint: 'วิเคราะห์ตามหลักวิชาการ: GLCM (Haralick, 1973) + Laplacian variance + ความขรุขระผิว Ra% — แตะ 💬 ถามบอทเพื่อคำอธิบายละเอียด',
      tex_fineness: 'ความละเอียดเนื้อ (FI)', tex_rough: 'ขรุขระผิว (Ra%)',
      tex_homog: 'Homogeneity (GLCM)', tex_contrast: 'Contrast (GLCM)',
      tex_entropy: 'Entropy (GLCM)', tex_uniform: 'ความสม่ำเสมอ',
      tex_smooth: 'ความเรียบผิว', tex_score_label: 'คะแนน',
      r_fine: 'ละเอียด', r_homog: 'เนียน', r_uniform: 'สม่ำเสมอ', r_smooth: 'ผิวเรียบ', r_energy: 'เป็นระเบียบ',
      radar_title: 'โปรไฟล์คุณภาพเนื้อเม็ด (0-100)',
      lab_title: '🧪 ค่าสีระบบ CIELAB',

      die_auto: '🤖 อัตโนมัติ (จาก Ø ที่วัดได้)',
      spec_auto: 'เลือกอัตโนมัติจาก Ø เฉลี่ย',
      st_area: 'หน้าตัดเฉลี่ย (มม.²)', st_cv: 'CV ความยาว (%)',
      trend_title: '📈 แนวโน้มคุณภาพย้อนหลัง',
      trend_len: 'ยาวเฉลี่ย (มม.)', trend_insize: 'Insize %',
      net_on: 'เชื่อมต่อฐานข้อมูลออนไลน์แล้ว', net_off: 'เชื่อมต่อฐานข้อมูลไม่ได้',
      share_text: 'รายงานวัดขนาดเม็ดอาหาร {name} — {n} เม็ด ยาวเฉลี่ย {len} มม.',
    },

    vi: {
      app_title: 'AICAM — Đo kích thước viên thức ăn',
      nav_measure: 'Đo', nav_reports: 'Báo cáo', nav_settings: 'Cài đặt',

      lock_title: 'AICAM Pellet Analyzer',
      lock_sub: 'Nhập mã truy cập để sử dụng',
      lock_placeholder: 'Mã truy cập',
      lock_btn: 'Đăng nhập',
      lock_wrong: 'Mã không đúng',
      lock_remember: 'Ghi nhớ thiết bị này 7 ngày',
      lock_default_hint: 'Mã mặc định 1234 — đổi trong phần Cài đặt',

      cap_title: '1. Chụp ảnh viên thức ăn',
      cap_hint: 'Đặt viên trên nền tối, không để dính nhau, kèm vật tham chiếu đã biết kích thước (thước/đồng xu)',
      cap_camera: '📷 Chụp ảnh', cap_file: '🖼 Chọn ảnh từ máy',

      cal_title: '2. Hiệu chuẩn & chọn cỡ',
      cal_none: 'Chưa hiệu chuẩn',
      cal_scale: 'Tỷ lệ', cal_unit: 'mm/pixel',
      cal_btn: '📏 Hiệu chuẩn', cal_cancel: '✕ Hủy',
      cal_hint: 'Chạm 2 điểm trên ảnh ở hai đầu vật tham chiếu đã biết chiều dài',
      cal_prompt: 'Chiều dài thực giữa 2 điểm (mm)',
      cal_alert: 'Vui lòng hiệu chuẩn trước (nhấn 📏 Hiệu chuẩn rồi chạm 2 điểm trên vật đã biết chiều dài)',
      die_label: 'Cỡ thức ăn (Die)', die_none: '— Không chọn —',
      analyze_btn: '🔬 Phân tích ảnh', analyzing: 'Đang phân tích…',
      analyze_fail: 'Phân tích thất bại',

      res_title: '3. Kết quả phân tích',
      st_count: 'Số viên', st_avg_len: 'Dài TB (mm)', st_avg_dia: 'Ø TB (mm)',
      st_sd: 'SD chiều dài', st_min: 'Ngắn nhất (mm)', st_max: 'Dài nhất (mm)',
      rejected_note: 'Có {n} khối không được đếm (quá lớn/chạm mép ảnh) — khung trắng mờ',
      split_note: 'Đã tự động tách {n} chỗ viên dính nhau',

      spec_title: 'So với mục tiêu cỡ',
      spec_under: 'Under', spec_insize: 'Insize', spec_over: 'Over',
      spec_target: 'Mục tiêu Insize ≥ {t}%',
      spec_range: 'Khoảng {min}–{max} mm',
      spec_pass: '✓ Đạt', spec_fail: '✗ Không đạt',
      spec_die_dia: 'Ø khuôn {d} mm',

      chart_len: 'Phân bố chiều dài (mm)',
      chart_len_title: 'Số viên theo khoảng chiều dài (mm)',
      chart_dia: 'Phân bố đường kính (mm)',
      chart_dia_title: 'Số viên theo khoảng Ø (mm)',
      chart_total: 'Tổng cộng {n} viên',
      dist_title: 'Bảng tỷ lệ',
      th_range_cm: 'Khoảng (mm)', th_count: 'Số lượng', th_pct: '%',

      color_title: 'Màu trung bình của viên',
      color_sample: 'Màu mẫu', color_ref: 'Màu chuẩn',
      color_pass: '✓ Màu đạt', color_fail: '✗ Màu không đạt',

      pellet_details: 'Xem dữ liệu từng viên',
      th_no: '#', th_len: 'Dài (mm)', th_dia: 'Ø (mm)', th_color: 'Màu',

      save_title: 'Lưu kết quả',
      f_sample: 'Tên mẫu / Lô', f_sample_ph: 'VD: Lô A-2026-06-12',
      f_operator: 'Người kiểm tra', f_operator_ph: 'Tên người kiểm tra',
      f_notes: 'Ghi chú', f_notes_ph: 'Ghi chú thêm',
      save_btn: '💾 Lưu trực tuyến', csv_btn: '⬇️ CSV', share_btn: '🔗 Chia sẻ',
      saving: '⏳ Đang lưu…',
      save_ok: '✓ Đã lưu — xem trong tab "Báo cáo"',
      save_err: '✗ Lưu thất bại',
      share_first: 'Vui lòng lưu trực tuyến trước khi chia sẻ',
      link_copied: '✓ Đã sao chép liên kết',

      rep_title: '📊 Báo cáo đo lường',
      rep_hint: 'Dữ liệu lưu trực tuyến — xem từ bất kỳ thiết bị nào',
      rep_refresh: '🔄 Tải lại', rep_export: '⬇️ CSV tổng hợp',
      rep_loading: 'Đang tải…',
      rep_empty: 'Chưa có dữ liệu — đo và lưu từ tab "Đo"',
      rep_load_fail: 'Tải thất bại',
      rep_noname: 'Không có tên mẫu',
      rep_items: 'viên', rep_avg: 'dài TB',
      rep_delete: '🗑 Xóa báo cáo này', rep_delete_confirm: 'Xóa vĩnh viễn báo cáo này?',
      rep_inspector: 'Người kiểm tra', rep_note: 'Ghi chú',
      export_fail: 'Xuất thất bại',

      set_title: '⚙️ Cài đặt',
      s_mmpp: 'Tỷ lệ (mm/pixel)', s_mmpp_ph: 'Hiệu chuẩn từ ảnh hoặc nhập tay',
      s_operator: 'Người kiểm tra (mặc định)',
      s_bins: 'Mốc khoảng chiều dài (mm, cách bằng , )',
      s_polarity: 'Nền ảnh',
      s_pol_auto: 'Tự động', s_pol_dark: 'Nền tối, viên sáng', s_pol_light: 'Nền sáng, viên tối',
      s_minlen: 'Kích thước nhỏ nhất tính (mm)', s_maxlen: 'Kích thước lớn nhất tính (mm)',
      s_split: 'Tự động tách viên dính nhau',
      s_refcolor: 'Màu chuẩn', s_userefcolor: 'So sánh màu với màu chuẩn',
      s_demax: 'Ngưỡng màu đạt (ΔE00 ≤)',
      s_pin: 'Mã truy cập (4-8 số)',
      s_spec_title: 'Bảng mục tiêu cỡ thức ăn',
      s_spec_hint: 'Đặt khoảng kích thước và % Insize tối thiểu cho mỗi khuôn',
      th_die: 'Die (mm)', th_min: 'Min (mm)', th_max: 'Max (mm)', th_target: 'Insize ≥ %',
      s_spec_add: '+ Thêm cỡ',
      s_save: 'Lưu cài đặt', s_saved: '✓ Đã lưu cài đặt',

      csv_report_title: 'Báo cáo đo kích thước viên thức ăn',
      csv_date: 'Ngày', csv_sample: 'Mẫu', csv_operator: 'Người kiểm tra', csv_notes: 'Ghi chú',
      csv_count: 'Số viên', csv_avg_len: 'Chiều dài TB (mm)', csv_sd: 'SD chiều dài',
      csv_min: 'Ngắn nhất (mm)', csv_max: 'Dài nhất (mm)', csv_avg_dia: 'Đường kính TB (mm)',
      csv_die: 'Cỡ Die', csv_under: 'Under %', csv_insize: 'Insize %', csv_over: 'Over %',
      csv_result: 'Kết quả', csv_pass: 'Đạt', csv_fail: 'Không đạt',


      tex_title: 'Chất lượng bề mặt viên (Texture)',
      tex_hint: 'Phân tích học thuật: GLCM (Haralick, 1973) + Laplacian variance + độ nhám Ra% — nhấn 💬 để bot giải thích chi tiết',
      tex_fineness: 'Độ mịn (FI)', tex_rough: 'Độ nhám (Ra%)',
      tex_homog: 'Homogeneity (GLCM)', tex_contrast: 'Contrast (GLCM)',
      tex_entropy: 'Entropy (GLCM)', tex_uniform: 'Đồng đều',
      tex_smooth: 'Độ phẳng', tex_score_label: 'Điểm',
      r_fine: 'Mịn', r_homog: 'Mượt', r_uniform: 'Đồng đều', r_smooth: 'Phẳng', r_energy: 'Trật tự',
      radar_title: 'Hồ sơ chất lượng bề mặt (0-100)',
      lab_title: '🧪 Giá trị màu CIELAB',

      die_auto: '🤖 Tự động (từ Ø đo được)',
      spec_auto: 'Chọn tự động theo Ø trung bình',
      st_area: 'Tiết diện TB (mm²)', st_cv: 'CV chiều dài (%)',
      trend_title: '📈 Xu hướng chất lượng',
      trend_len: 'Dài TB (mm)', trend_insize: 'Insize %',
      net_on: 'Đã kết nối cơ sở dữ liệu', net_off: 'Không kết nối được cơ sở dữ liệu',
      share_text: 'Báo cáo đo viên thức ăn {name} — {n} viên, dài TB {len} mm',
    },

    en: {
      app_title: 'AICAM — Pellet Size Analyzer',
      nav_measure: 'Measure', nav_reports: 'Reports', nav_settings: 'Settings',

      lock_title: 'AICAM Pellet Analyzer',
      lock_sub: 'Enter access code to continue',
      lock_placeholder: 'Access code',
      lock_btn: 'Unlock',
      lock_wrong: 'Incorrect code',
      lock_remember: 'Remember this device for 7 days',
      lock_default_hint: 'Default code is 1234 — change it in Settings',

      cap_title: '1. Photograph the pellets',
      cap_hint: 'Place pellets on a dark background, not touching, with a reference object of known size (ruler/coin)',
      cap_camera: '📷 Take photo', cap_file: '🖼 Choose from device',

      cal_title: '2. Calibrate & select size',
      cal_none: 'Not calibrated',
      cal_scale: 'Scale', cal_unit: 'mm/pixel',
      cal_btn: '📏 Calibrate', cal_cancel: '✕ Cancel',
      cal_hint: 'Tap 2 points on the image at both ends of a reference object of known length',
      cal_prompt: 'Actual length between the 2 points (mm)',
      cal_alert: 'Please calibrate first (tap 📏 Calibrate, then tap 2 points on an object of known length)',
      die_label: 'Feed size (Die)', die_none: '— None —',
      analyze_btn: '🔬 Analyze image', analyzing: 'Analyzing…',
      analyze_fail: 'Analysis failed',

      res_title: '3. Results',
      st_count: 'Pellet count', st_avg_len: 'Avg length (mm)', st_avg_dia: 'Avg Ø (mm)',
      st_sd: 'Length SD', st_min: 'Min (mm)', st_max: 'Max (mm)',
      rejected_note: '{n} blob(s) not counted (oversized/touching image edge) — shown as faint white boxes',
      split_note: 'Automatically separated {n} touching pellet(s)',

      spec_title: 'Size target check',
      spec_under: 'Under', spec_insize: 'Insize', spec_over: 'Over',
      spec_target: 'Target: Insize ≥ {t}%',
      spec_range: 'Range {min}–{max} mm',
      spec_pass: '✓ PASS', spec_fail: '✗ FAIL',
      spec_die_dia: 'Die Ø {d} mm',

      chart_len: 'Length distribution (mm)',
      chart_len_title: 'Pellet count by length range (mm)',
      chart_dia: 'Diameter distribution (mm)',
      chart_dia_title: 'Pellet count by Ø range (mm)',
      chart_total: 'Total {n} pellets',
      dist_title: 'Distribution table',
      th_range_cm: 'Range (mm)', th_count: 'Count', th_pct: '%',

      color_title: 'Average pellet color',
      color_sample: 'Sample', color_ref: 'Reference',
      color_pass: '✓ Color PASS', color_fail: '✗ Color FAIL',

      pellet_details: 'Per-pellet data',
      th_no: '#', th_len: 'Length (mm)', th_dia: 'Ø (mm)', th_color: 'Color',

      save_title: 'Save results',
      f_sample: 'Sample / Lot name', f_sample_ph: 'e.g. Lot A-2026-06-12',
      f_operator: 'Inspector', f_operator_ph: 'Inspector name',
      f_notes: 'Notes', f_notes_ph: 'Additional notes',
      save_btn: '💾 Save online', csv_btn: '⬇️ CSV', share_btn: '🔗 Share',
      saving: '⏳ Saving…',
      save_ok: '✓ Saved — view in the "Reports" tab',
      save_err: '✗ Save failed',
      share_first: 'Please save online before sharing',
      link_copied: '✓ Link copied',

      rep_title: '📊 Measurement reports',
      rep_hint: 'All data is stored online — view from any device',
      rep_refresh: '🔄 Refresh', rep_export: '⬇️ Summary CSV',
      rep_loading: 'Loading…',
      rep_empty: 'No data yet — measure and save from the "Measure" tab',
      rep_load_fail: 'Failed to load',
      rep_noname: 'Unnamed sample',
      rep_items: 'pellets', rep_avg: 'avg length',
      rep_delete: '🗑 Delete this report', rep_delete_confirm: 'Permanently delete this report?',
      rep_inspector: 'Inspector', rep_note: 'Notes',
      export_fail: 'Export failed',

      set_title: '⚙️ Settings',
      s_mmpp: 'Scale (mm/pixel)', s_mmpp_ph: 'Calibrate from image or enter manually',
      s_operator: 'Inspector (default)',
      s_bins: 'Length bin edges (mm, comma-separated)',
      s_polarity: 'Image background',
      s_pol_auto: 'Auto detect', s_pol_dark: 'Dark bg, light pellets', s_pol_light: 'Light bg, dark pellets',
      s_minlen: 'Min size counted (mm)', s_maxlen: 'Max size counted (mm)',
      s_split: 'Auto-split touching pellets',
      s_refcolor: 'Reference color', s_userefcolor: 'Compare color to reference',
      s_demax: 'Color pass threshold (ΔE00 ≤)',
      s_pin: 'Access code (4-8 digits)',
      s_spec_title: 'Feed size target table',
      s_spec_hint: 'Define size range and minimum Insize % for each die',
      th_die: 'Die (mm)', th_min: 'Min (mm)', th_max: 'Max (mm)', th_target: 'Insize ≥ %',
      s_spec_add: '+ Add size',
      s_save: 'Save settings', s_saved: '✓ Settings saved',

      csv_report_title: 'Pellet Size Measurement Report',
      csv_date: 'Date', csv_sample: 'Sample', csv_operator: 'Inspector', csv_notes: 'Notes',
      csv_count: 'Pellet count', csv_avg_len: 'Avg length (mm)', csv_sd: 'Length SD',
      csv_min: 'Min (mm)', csv_max: 'Max (mm)', csv_avg_dia: 'Avg diameter (mm)',
      csv_die: 'Die size', csv_under: 'Under %', csv_insize: 'Insize %', csv_over: 'Over %',
      csv_result: 'Result', csv_pass: 'PASS', csv_fail: 'FAIL',


      tex_title: 'Pellet surface quality (Texture)',
      tex_hint: 'Academic analysis: GLCM (Haralick, 1973) + Laplacian variance + surface roughness Ra% — tap 💬 to ask the bot for details',
      tex_fineness: 'Fineness (FI)', tex_rough: 'Roughness (Ra%)',
      tex_homog: 'Homogeneity (GLCM)', tex_contrast: 'Contrast (GLCM)',
      tex_entropy: 'Entropy (GLCM)', tex_uniform: 'Uniformity',
      tex_smooth: 'Smoothness', tex_score_label: 'Score',
      r_fine: 'Fine', r_homog: 'Homogeneous', r_uniform: 'Uniform', r_smooth: 'Smooth', r_energy: 'Ordered',
      radar_title: 'Surface quality profile (0-100)',
      lab_title: '🧪 CIELAB color values',

      die_auto: '🤖 Auto (from measured Ø)',
      spec_auto: 'Auto-selected from avg Ø',
      st_area: 'Avg cross-section (mm²)', st_cv: 'Length CV (%)',
      trend_title: '📈 Quality trend',
      trend_len: 'Avg length (mm)', trend_insize: 'Insize %',
      net_on: 'Connected to online database', net_off: 'Cannot reach database',
      share_text: 'Pellet report {name} — {n} pellets, avg length {len} mm',
    },
  };

  let lang = localStorage.getItem('aicam-lang') || 'th';

  function t(key, vars) {
    let s = (dict[lang] && dict[lang][key]) || dict.th[key] || key;
    if (vars) for (const k in vars) s = s.replaceAll('{' + k + '}', vars[k]);
    return s;
  }

  function setLang(l) {
    if (!dict[l]) return;
    lang = l;
    localStorage.setItem('aicam-lang', l);
    apply();
    document.dispatchEvent(new CustomEvent('langchange'));
  }

  /** ใส่ข้อความตาม data-i18n / data-i18n-ph (placeholder) ทุกจุดในหน้า */
  function apply() {
    document.documentElement.lang = lang;
    document.title = t('app_title');
    document.querySelectorAll('[data-i18n]').forEach(el => {
      el.innerHTML = t(el.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(el => {
      el.placeholder = t(el.dataset.i18nPh);
    });
  }

  return { t, setLang, apply, get lang() { return lang; } };
})();
