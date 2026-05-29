-- Studio books CRUD: format-level status, uniqueness, is_active columns

-- Soft-delete status (run once on live DB if missing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'book_status' AND e.enumlabel = 'archived'
  ) THEN
    ALTER TYPE public.book_status ADD VALUE 'archived';
  END IF; 
END $$;

-- books.is_active (soft delete)
ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- book_formats.is_active (operational flag, not approval)
ALTER TABLE public.book_formats
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Per-format approval workflow
ALTER TABLE public.book_formats
  ADD COLUMN IF NOT EXISTS status public.book_status NOT NULL DEFAULT 'draft';

-- Backfill format status from parent book
UPDATE public.book_formats bf
SET status = b.status
FROM public.books b
WHERE bf.book_id = b.id
  AND bf.status = 'draft';

UPDATE public.book_formats bf
SET status = 'approved'
FROM public.books b
WHERE bf.book_id = b.id
  AND b.status = 'approved'
  AND bf.status <> 'approved';

CREATE UNIQUE INDEX IF NOT EXISTS books_title_language_active_unique
ON public.books (lower(btrim(title)), language)
WHERE status <> 'archived' AND is_active = true;

CREATE INDEX IF NOT EXISTS book_formats_status_idx
ON public.book_formats (book_id, status)
WHERE is_active = true;
