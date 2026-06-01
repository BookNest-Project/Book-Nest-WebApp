import { supabaseAdmin } from '../config/supabase.js';

const BUCKET = 'booknest';

/** Public URL for a stored object when file_url is not persisted */
export function publicUrlFromStoragePath(storagePath) {
  if (!storagePath) return null;
  const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(storagePath);
  return data?.publicUrl || null;
}

export function resolveFormatFileUrl(row) {
  if (!row) return null;
  if (row.file_url) return row.file_url;
  return publicUrlFromStoragePath(row.storage_path);
}
