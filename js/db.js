/* ===========================================================
 * db.js — เชื่อมต่อ Supabase เก็บ/อ่านผลการวัดออนไลน์
 * =========================================================== */

const DB = (() => {
  const SUPABASE_URL = 'https://hjkxnyhheylkiylchqfc.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_cIoQRgkTwVlT0DPCbyS9HQ_BaWV4MaG';
  const BUCKET = 'pellet-images';

  const client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  /** บันทึก session: อัปโหลดรูป annotated แล้ว insert แถวข้อมูล */
  async function saveSession(record, imageBlob) {
    let image_url = null;
    let image_path = null;
    if (imageBlob) {
      image_path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      const { error: upErr } = await client.storage.from(BUCKET)
        .upload(image_path, imageBlob, { contentType: 'image/jpeg' });
      if (upErr) throw upErr;
      image_url = client.storage.from(BUCKET).getPublicUrl(image_path).data.publicUrl;
    }
    const { data, error } = await client
      .from('measurement_sessions')
      .insert({ ...record, image_url })
      .select('id')
      .single();
    if (error) throw error;
    return { id: data.id, image_url };
  }

  async function listSessions(limit = 200) {
    const { data, error } = await client
      .from('measurement_sessions')
      .select('id, created_at, sample_name, operator, pellet_count, avg_length_mm, avg_diameter_mm, image_url')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data;
  }

  async function getSession(id) {
    const { data, error } = await client
      .from('measurement_sessions')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  }

  async function deleteSession(id, imageUrl) {
    if (imageUrl) {
      const path = imageUrl.split(`/${BUCKET}/`)[1];
      if (path) await client.storage.from(BUCKET).remove([decodeURIComponent(path)]);
    }
    const { error } = await client.from('measurement_sessions').delete().eq('id', id);
    if (error) throw error;
  }

  async function ping() {
    const { error } = await client.from('measurement_sessions').select('id').limit(1);
    return !error;
  }

  return { saveSession, listSessions, getSession, deleteSession, ping };
})();
