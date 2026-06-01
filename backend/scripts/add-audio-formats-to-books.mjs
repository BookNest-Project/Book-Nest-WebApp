/**
 * Adds Audio format to books that only have PDF, and backfills file_url on formats.
 *
 * Usage: node scripts/add-audio-formats-to-books.mjs
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { publicUrlFromStoragePath } from '../utils/formatFileUrl.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** Royalty-free sample used when no audio file exists in storage */
const DEMO_AUDIO_URL =
  'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';
const DEMO_AUDIO_DURATION_SEC = 372;
const DEMO_AUDIO_SIZE = 5_500_000;

async function main() {
  const { data: books, error: booksErr } = await supabase.from('books').select('id, title');
  if (booksErr) throw booksErr;

  let audioAdded = 0;
  let urlsUpdated = 0;

  for (const book of books ?? []) {
    const { data: formats } = await supabase
      .from('book_formats')
      .select('*')
      .eq('book_id', book.id);

    const list = formats ?? [];
    const pdf = list.find((f) => f.format_type === 'PDF');
    const audio = list.find((f) => f.format_type === 'Audio');

    if (!audio) {
      const pdfPrice = pdf ? Number(pdf.price) : 99;
      const { error: insErr } = await supabase.from('book_formats').insert({
        book_id: book.id,
        format_type: 'Audio',
        price: Math.max(0, Math.round(pdfPrice * 0.75)),
        currency: pdf?.currency || 'ETB',
        storage_path: `demo/audio/${book.id}.mp3`,
        file_url: DEMO_AUDIO_URL,
        mime_type: 'audio/mpeg',
        file_size_bytes: DEMO_AUDIO_SIZE,
        duration_sec: DEMO_AUDIO_DURATION_SEC,
        page_count: null,
      });
      if (insErr) {
        console.warn(`Skip audio for ${book.title}:`, insErr.message);
      } else {
        audioAdded++;
        console.log(`+ Audio: ${book.title}`);
      }
    }

    const { data: refreshed } = await supabase
      .from('book_formats')
      .select('*')
      .eq('book_id', book.id);

    for (const row of refreshed ?? []) {
      if (row.file_url) continue;
      const url =
        row.format_type === 'Audio' && !row.storage_path?.includes('/')
          ? DEMO_AUDIO_URL
          : publicUrlFromStoragePath(row.storage_path);
      if (!url) continue;
      const { error: upErr } = await supabase
        .from('book_formats')
        .update({ file_url: url })
        .eq('id', row.id);
      if (!upErr) urlsUpdated++;
    }
  }

  console.log(`\nDone. Audio formats added: ${audioAdded}. file_url backfilled: ${urlsUpdated}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
