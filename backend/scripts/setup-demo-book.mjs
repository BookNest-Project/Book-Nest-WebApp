/**
 * Creates demo author (Isolene Dawit), a 12-page book, an approved snapshot,
 * then a one-page metadata change pending review. Optionally rejects and emails.
 *
 * Usage:
 *   node scripts/setup-demo-book.mjs <your-password> [--reject]
 *
 * Requires backend/.env with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 * For rejection email: SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM in .env
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildBookSnapshot } from '../utils/bookSnapshot.js';
import { adminApprovalRepository } from '../repositories/adminApprovalRepository.js';
import { adminApprovalService } from '../services/adminApprovalService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const AUTHOR_EMAIL = 'solenedawit7@gmail.com';
const AUTHOR_PASSWORD = process.argv[2];
const PEN_NAME = 'Isolene Dawit';
const FULL_NAME = 'Isolene Dawit';
const DEMO_TITLE = 'The River Between Pages — Demo Edition';
const SHOULD_REJECT = process.argv.includes('--reject');

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in backend/.env');
  process.exit(1);
}

if (!AUTHOR_PASSWORD || AUTHOR_PASSWORD.startsWith('--')) {
  console.error(`
Usage: node scripts/setup-demo-book.mjs <your-password> [--reject]

Example:
  node scripts/setup-demo-book.mjs "YourSecurePassword123" --reject
`);
  process.exit(1);
}

if (AUTHOR_PASSWORD.length < 6) {
  console.error('Password must be at least 6 characters.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function buildTwelvePageDescription(pageOverrides = {}) {
  const pages = [];
  for (let i = 1; i <= 12; i++) {
    const defaultBody = [
      `This is the body of page ${i} in our BookNest demo manuscript.`,
      `It contains enough text for the reader view and admin moderation tools to treat it as a real section.`,
      `The garden of embers glowed softly as the narrator continued the journey through chapter ${i}.`,
    ].join(' ');
    pages.push(`Page ${i}\n\n${pageOverrides[i] || defaultBody}`);
  }
  return pages.join('\n\n');
}

async function findOrCreateAuthor() {
  const { data: existingUsers } = await supabase
    .from('users')
    .select('id, email, role')
    .eq('email', AUTHOR_EMAIL)
    .limit(1);

  if (existingUsers?.length) {
    const userId = existingUsers[0].id;
    await supabase.auth.admin.updateUserById(userId, {
      password: AUTHOR_PASSWORD,
      email_confirm: true,
    });
    await supabase
      .from('users')
      .update({ role: 'author', updated_at: new Date().toISOString() })
      .eq('id', userId);

    const { data: profile } = await supabase
      .from('author_profiles')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (!profile) {
      await supabase.from('author_profiles').insert({
        user_id: userId,
        pen_name: PEN_NAME,
        full_name: FULL_NAME,
        bio: 'Demo author for BookNest approval workflow.',
      });
    } else {
      await supabase
        .from('author_profiles')
        .update({ pen_name: PEN_NAME, full_name: FULL_NAME })
        .eq('user_id', userId);
    }

    console.log('✅ Author updated:', AUTHOR_EMAIL, userId);
    return userId;
  }

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: AUTHOR_EMAIL,
    password: AUTHOR_PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: PEN_NAME },
  });

  if (authError) throw new Error(`Auth: ${authError.message}`);

  const userId = authData.user.id;
  await supabase.from('users').update({ role: 'author' }).eq('id', userId);
  await supabase.from('author_profiles').insert({
    user_id: userId,
    pen_name: PEN_NAME,
    full_name: FULL_NAME,
    bio: 'Demo author for BookNest approval workflow.',
  });

  console.log('✅ Author created:', AUTHOR_EMAIL, userId);
  return userId;
}

async function getGenreId() {
  const { data, error } = await supabase.from('genres').select('id, name').limit(1);
  if (error || !data?.length) throw new Error('No genres in database. Seed genres first.');
  return data[0];
}

async function findAdminId() {
  const { data } = await supabase.from('users').select('id, email').eq('role', 'admin').limit(1);
  if (!data?.length) throw new Error('No admin user. Create an admin account first.');
  return data[0];
}

async function removeOldDemo() {
  const { data: books } = await supabase
    .from('books')
    .select('id')
    .eq('title', DEMO_TITLE);

  for (const b of books ?? []) {
    await supabase.from('book_formats').delete().eq('book_id', b.id);
    await supabase.from('books').delete().eq('id', b.id);
  }
}

async function main() {
  console.log('📚 BookNest demo setup\n');

  const authorId = await findOrCreateAuthor();
  const genre = await getGenreId();
  const admin = await findAdminId();

  await removeOldDemo();

  const approvedDescription = buildTwelvePageDescription();
  const coverPath = 'demo/river-between-pages/cover.jpg';
  const coverUrl = 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=400';

  const { data: book, error: bookError } = await supabase
    .from('books')
    .insert({
      title: DEMO_TITLE,
      subtitle: 'A demonstration manuscript for admin review',
      description: approvedDescription,
      genre_id: genre.id,
      author_name: PEN_NAME,
      author_user_id: authorId,
      language: 'English',
      cover_image_path: coverPath,
      cover_image_url: coverUrl,
      status: 'pending_review',
      uploaded_by: authorId,
      is_active: true,
    })
    .select('id')
    .single();

  if (bookError) throw new Error(`Book insert: ${bookError.message}`);

  const bookId = book.id;

  await supabase.from('book_formats').insert({
    book_id: bookId,
    format_type: 'PDF',
    price: 199,
    currency: 'ETB',
    storage_path: 'demo/river-between-pages/manuscript.pdf',
    page_count: 12,
    file_size_bytes: 1024000,
  });

  console.log('✅ Demo book created:', bookId);

  await adminApprovalService.approveBook(bookId, admin.id);
  console.log('✅ Book approved (baseline snapshot saved)');

  const changedPage5 = [
    'This is the REVISED body of page 5 — the author changed this section before resubmitting.',
    'The moderation panel should highlight this page as changed compared to the approved version.',
    'Additional detail was added to meet editorial standards for the ember garden sequence.',
  ].join(' ');

  const updatedDescription = buildTwelvePageDescription({ 5: changedPage5 });

  const approvedBook = await adminApprovalRepository.findBookById(bookId);
  const snapshot = buildBookSnapshot(approvedBook, genre.name);
  await adminApprovalRepository.saveApprovedSnapshot(bookId, snapshot);
  await adminApprovalRepository.setSubmissionPrevious(bookId, snapshot);

  let { error: updateError } = await supabase
    .from('books')
    .update({
      description: updatedDescription,
      status: 'pending_review',
      review_metadata: {
        updateNote:
          'Updated page 5 only — clarified the ember garden scene per beta reader feedback.',
        submittedAt: new Date().toISOString(),
        submissionKind: 'metadata_update',
      },
    })
    .eq('id', bookId);

  if (updateError) {
    ({ error: updateError } = await supabase
      .from('books')
      .update({ description: updatedDescription, status: 'pending_review' })
      .eq('id', bookId));
  }

  if (updateError) {
    throw new Error(`Could not set pending_review: ${updateError.message}`);
  }

  const { data: check } = await supabase.from('books').select('status').eq('id', bookId).single();
  if (check?.status !== 'pending_review') {
    throw new Error(`Book status is "${check?.status}" — expected pending_review`);
  }

  console.log('✅ Page 5 changed; book back in pending_review with snapshot diff');

  console.log('\n📋 Login credentials (author / main app):');
  console.log('   Email:   ', AUTHOR_EMAIL);
  console.log('   Password:', '(the password you passed to this script)');
  console.log('   Name:    ', PEN_NAME);
  console.log('\n📋 Admin: reject this book in the dashboard:');
  console.log('   Book ID: ', bookId);
  console.log('   Title:   ', DEMO_TITLE);

  console.log(
    '\n⚠️  Run scripts/admin-approval-extensions.sql in Supabase SQL Editor for inbox + change snapshots.',
  );
  console.log('⚠️  Add SMTP_* vars to backend/.env (see .env.smtp.example) to receive rejection emails.\n');

  if (SHOULD_REJECT) {
    const reason =
      'Page 5 revision does not meet our quality guidelines — the scene needs clearer structure and consistent tone with earlier chapters.';
    const result = await adminApprovalService.rejectBook(bookId, admin.id, {
      reason,
      adminNotes:
        'Please expand the transition into the ember garden and align vocabulary with pages 1–4.',
      suggestedFixes:
        'Resubmit after editing page 5 only; keep pages 1–4 and 6–12 unchanged unless necessary.',
      severity: 'medium',
    });

    console.log('\n📧 Rejection result:');
    console.log('   Notified:', result.authorNotification?.notified);
    console.log('   Email sent:', result.authorNotification?.email);
    if (!result.authorNotification?.email) {
      console.log('   Email note:', result.authorNotification?.emailReason || 'Configure SMTP in .env');
    }
    console.log('   In-app:', result.authorNotification?.inApp);
  } else {
    console.log('\n💡 To send the rejection email automatically, re-run with --reject');
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
