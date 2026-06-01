import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE_PATH = path.resolve(__dirname, '../data/book-review-state.json');

async function readStore() {
  try {
    const raw = await fs.readFile(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
}

async function writeStore(data) {
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
  await fs.writeFile(STORE_PATH, JSON.stringify(data, null, 2), 'utf8');
}

export const bookReviewStateFileRepository = {
  async get(bookId) {
    if (!bookId) return null;
    const store = await readStore();
    return store[bookId] ?? null;
  },

  async save(bookId, reviewState) {
    if (!bookId) return;
    const store = await readStore();
    store[bookId] = reviewState;
    await writeStore(store);
  },

  async remove(bookId) {
    if (!bookId) return;
    const store = await readStore();
    if (!store[bookId]) return;
    delete store[bookId];
    await writeStore(store);
  },
};
