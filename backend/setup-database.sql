-- BookNest Phase 1 schema
-- Phase 1 scope:
-- 1. Authentication and user accounts
-- 2. Reader, author, publisher, admin user model
-- 3. Categories and books
-- 4. Book file metadata only
--
-- Important:
-- Large files stay in Supabase Storage.
-- PostgreSQL stores only metadata such as storage paths and optional URLs.

begin;

create extension if not exists pgcrypto;
create extension if not exists citext;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role' and typnamespace = 'public'::regnamespace) then
    create type public.user_role as enum ('reader', 'author', 'publisher', 'admin');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'account_status' and typnamespace = 'public'::regnamespace) then
    create type public.account_status as enum ('active', 'suspended', 'disabled');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'book_status' and typnamespace = 'public'::regnamespace) then
    create type public.book_status as enum ('draft', 'pending_review', 'approved', 'rejected', 'archived');
  end if;
end
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'format_type' and typnamespace = 'public'::regnamespace) then
    create type public.format_type as enum ('PDF', 'Audio');
  end if;
end
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email citext not null unique,
  role public.user_role not null default 'reader',
  account_status public.account_status not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.is_admin(check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.id = check_user_id
      and u.role = 'admin'
      and u.account_status = 'active'
  );
$$;

create table public.reader_profiles (
  user_id uuid primary key references public.users (id) on delete cascade,
  display_name varchar(80) not null,
  avatar_url text,
  bio text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint reader_profiles_display_name_trimmed
    check (length(btrim(display_name)) between 2 and 80)
);

create unique index reader_profiles_display_name_key
  on public.reader_profiles (lower(display_name));

create table public.author_profiles (
  user_id uuid primary key references public.users (id) on delete cascade,
  pen_name varchar(120) not null,
  full_name varchar(160),
  avatar_url text,
  bio text,
  website_url text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint author_profiles_pen_name_trimmed
    check (length(btrim(pen_name)) between 2 and 120)
);

create unique index author_profiles_pen_name_key
  on public.author_profiles (lower(pen_name));

create table public.publisher_profiles (
  user_id uuid primary key references public.users (id) on delete cascade,
  company_name varchar(160) not null,
  avatar_url text,
  bio text,
  website_url text,
  support_email citext,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint publisher_profiles_company_name_trimmed
    check (length(btrim(company_name)) between 2 and 160)
);

create unique index publisher_profiles_company_name_key
  on public.publisher_profiles (lower(company_name));

create table public.admin_profiles (
  user_id uuid primary key references public.users (id) on delete cascade,
  display_name varchar(80) not null,
  avatar_url text, 
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint admin_profiles_display_name_trimmed
    check (length(btrim(display_name)) between 2 and 80)
);

create table public.genres (
  id uuid primary key default gen_random_uuid(),
  slug varchar(80) not null unique,
  name varchar(120) not null unique,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.books (
  id uuid primary key default gen_random_uuid(),
  isbn varchar(20) unique,
  title varchar(200) not null,
  subtitle varchar(200),
  description text,
  genre_id uuid not null references public.genres (id) on delete restrict,
  author_name varchar(160) not null,
  author_user_id uuid references public.users (id) on delete set null,
  publisher_name varchar(160),
  publisher_user_id uuid references public.users (id) on delete set null,
  language varchar(40) not null,
  publication_date date,
  cover_image_path text not null,
  cover_image_url text,
  status public.book_status not null default 'draft',
  uploaded_by uuid not null references public.users (id) on delete restrict,
  reviewed_by_admin_id uuid references public.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint books_title_trimmed
    check (length(btrim(title)) between 1 and 200),
  constraint books_author_name_trimmed
    check (length(btrim(author_name)) between 2 and 160),
  constraint books_publisher_name_trimmed
    check (publisher_name is null or length(btrim(publisher_name)) between 2 and 160),
  constraint books_language_trimmed
    check (length(btrim(language)) between 2 and 40)
);

create index books_genre_idx on public.books (genre_id);
create index books_author_user_idx on public.books (author_user_id);
create index books_publisher_user_idx on public.books (publisher_user_id);
create index books_uploaded_by_idx on public.books (uploaded_by);
create index books_status_idx on public.books (status, created_at desc);
create index books_title_idx on public.books (lower(title));

create table public.reader_favorite_genres (
  reader_user_id uuid not null references public.reader_profiles (user_id) on delete cascade,
  genre_id uuid not null references public.genres (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (reader_user_id, genre_id)
);

create table public.book_formats (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id) on delete cascade,
  format_type public.format_type not null,
  price numeric(12,2) not null,
  currency char(3) not null default 'ETB',
  storage_path text not null,
  file_url text,
  mime_type text,
  file_size_bytes bigint,
  page_count integer,
  duration_sec integer,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint book_formats_unique unique (book_id, format_type),
  constraint book_formats_price_non_negative
    check (price >= 0),
  constraint book_formats_file_size_positive
    check (file_size_bytes is null or file_size_bytes > 0),
  constraint book_formats_shape
    check (
      (format_type = 'PDF' and page_count is not null and page_count > 0 and duration_sec is null)
      or
      (format_type = 'Audio' and duration_sec is not null and duration_sec > 0 and page_count is null)
    )
);

create index book_formats_book_idx on public.book_formats (book_id);

create or replace function public.handle_auth_user_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (
    id,
    email,
    role,
    account_status,
    created_at,
    updated_at
  )
  values (
    new.id,
    new.email,
    'reader',
    'active',
    coalesce(new.created_at, timezone('utc', now())),
    timezone('utc', now())
  )
  on conflict (id) do update
    set email = excluded.email,
        updated_at = timezone('utc', now());

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_or_updated on auth.users;
create trigger on_auth_user_created_or_updated
after insert or update on auth.users
for each row execute function public.handle_auth_user_sync();

create or replace function public.ensure_profile_role_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_role public.user_role;
begin
  select role into current_role
  from public.users
  where id = new.user_id;

  if tg_table_name = 'author_profiles' and current_role not in ('author', 'admin') then
    raise exception 'User % must have author or admin role before creating author profile', new.user_id;
  end if;

  if tg_table_name = 'publisher_profiles' and current_role not in ('publisher', 'admin') then
    raise exception 'User % must have publisher or admin role before creating publisher profile', new.user_id;
  end if;

  if tg_table_name = 'admin_profiles' and current_role <> 'admin' then
    raise exception 'User % must have admin role before creating admin profile', new.user_id;
  end if;

  return new;
end;
$$;

create trigger author_profiles_role_guard
before insert or update on public.author_profiles
for each row execute function public.ensure_profile_role_match();

create trigger publisher_profiles_role_guard
before insert or update on public.publisher_profiles
for each row execute function public.ensure_profile_role_match();

create trigger admin_profiles_role_guard
before insert or update on public.admin_profiles
for each row execute function public.ensure_profile_role_match();

create trigger users_set_updated_at
before update on public.users
for each row execute function public.set_updated_at();

create trigger reader_profiles_set_updated_at
before update on public.reader_profiles
for each row execute function public.set_updated_at();

create trigger author_profiles_set_updated_at
before update on public.author_profiles
for each row execute function public.set_updated_at();

create trigger publisher_profiles_set_updated_at
before update on public.publisher_profiles
for each row execute function public.set_updated_at();

create trigger admin_profiles_set_updated_at
before update on public.admin_profiles
for each row execute function public.set_updated_at();

create trigger genres_set_updated_at
before update on public.genres
for each row execute function public.set_updated_at();

create trigger books_set_updated_at
before update on public.books
for each row execute function public.set_updated_at();

create trigger book_formats_set_updated_at
before update on public.book_formats
for each row execute function public.set_updated_at();

alter table public.users enable row level security;
alter table public.reader_profiles enable row level security;
alter table public.author_profiles enable row level security;
alter table public.publisher_profiles enable row level security;
alter table public.admin_profiles enable row level security;
alter table public.genres enable row level security;
alter table public.books enable row level security;
alter table public.book_formats enable row level security;
alter table public.reader_favorite_genres enable row level security;

create policy users_select_self_or_admin
on public.users
for select
using (id = auth.uid() or public.is_admin());

create policy users_update_self_or_admin
on public.users
for update
using (id = auth.uid() or public.is_admin())
with check (id = auth.uid() or public.is_admin());

create policy reader_profiles_read_public
on public.reader_profiles
for select
using (true);

create policy reader_profiles_update_self_or_admin
on public.reader_profiles
for update
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

create policy author_profiles_read_public
on public.author_profiles
for select
using (true);

create policy author_profiles_manage_self_or_admin
on public.author_profiles
for all
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

create policy publisher_profiles_read_public
on public.publisher_profiles
for select
using (true);

create policy publisher_profiles_manage_self_or_admin
on public.publisher_profiles
for all
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

create policy admin_profiles_read_admin_only
on public.admin_profiles
for select
using (user_id = auth.uid() or public.is_admin());

create policy admin_profiles_manage_admin_only
on public.admin_profiles
for all
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

create policy genres_read_public
on public.genres
for select
using (is_active = true or public.is_admin());

create policy genres_admin_manage
on public.genres
for all
using (public.is_admin())
with check (public.is_admin());

create policy books_read_public_or_owner
on public.books
for select
using (
  status = 'approved'
  or uploaded_by = auth.uid()
  or author_user_id = auth.uid()
  or publisher_user_id = auth.uid()
  or public.is_admin()
);

create policy books_insert_contributor_or_admin
on public.books
for insert
with check (
  (
    uploaded_by = auth.uid()
    and exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.role in ('author', 'publisher')
        and u.account_status = 'active'
    )
  )
);

create policy books_update_owner_or_admin
on public.books
for update
using (
  uploaded_by = auth.uid()
  or author_user_id = auth.uid()
  or publisher_user_id = auth.uid()
  or public.is_admin()
)
with check (
  uploaded_by = auth.uid()
  or author_user_id = auth.uid()
  or publisher_user_id = auth.uid()
  or public.is_admin()
);

create policy book_formats_read_public_when_book_visible
on public.book_formats
for select
using (
  exists (
    select 1
    from public.books b
    where b.id = book_formats.book_id
      and (
        b.status = 'approved'
        or b.uploaded_by = auth.uid()
        or b.author_user_id = auth.uid()
        or b.publisher_user_id = auth.uid()
        or public.is_admin()
      )
  )
);

create policy book_formats_manage_owner_or_admin
on public.book_formats
for all
using (
  public.is_admin()
  or exists (
    select 1
    from public.books b
    where b.id = book_formats.book_id
      and (
        b.uploaded_by = auth.uid()
        or b.author_user_id = auth.uid()
        or b.publisher_user_id = auth.uid()
      )
  )
)
with check (
  public.is_admin()
  or exists (
    select 1
    from public.books b
    where b.id = book_formats.book_id
      and (
        b.uploaded_by = auth.uid()
        or b.author_user_id = auth.uid()
        or b.publisher_user_id = auth.uid()
      )
  )
);

create policy reader_favorite_genres_read_self_or_admin
on public.reader_favorite_genres
for select
using (reader_user_id = auth.uid() or public.is_admin());

create policy reader_favorite_genres_insert_self_or_admin
on public.reader_favorite_genres
for insert
with check (reader_user_id = auth.uid() or public.is_admin());

create policy reader_favorite_genres_delete_self_or_admin
on public.reader_favorite_genres
for delete
using (reader_user_id = auth.uid() or public.is_admin());

create policy reader_favorite_genres_update_self_or_admin
on public.reader_favorite_genres
for update
using (reader_user_id = auth.uid() or public.is_admin())
with check (reader_user_id = auth.uid() or public.is_admin());

insert into storage.buckets (id, name, public)
values ('booknest', 'booknest', false)
on conflict (id) do nothing;

drop policy if exists "booknest public cover read" on storage.objects;
create policy "booknest public cover read"
on storage.objects
for select
using (
  bucket_id = 'booknest'
  and name like 'book-covers/%'
);

drop policy if exists "booknest authenticated upload" on storage.objects;
create policy "booknest authenticated upload"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'booknest'
  and owner = auth.uid()
  and (
    name like 'book-covers/%'
    or name like 'book-files/%'
  )
);

drop policy if exists "booknest owner update" on storage.objects;
create policy "booknest owner update"
on storage.objects
for update
to authenticated
using (bucket_id = 'booknest' and owner = auth.uid())
with check (bucket_id = 'booknest' and owner = auth.uid());

drop policy if exists "booknest owner delete" on storage.objects;
create policy "booknest owner delete"
on storage.objects
for delete
to authenticated
using (bucket_id = 'booknest' and (owner = auth.uid() or public.is_admin()));

insert into public.genres (slug, name, description)
values
  ('fiction', 'Fiction', 'Novels and literary storytelling'),
  ('non-fiction', 'Non-Fiction', 'Essays, memoirs, and factual writing')
on conflict (slug) do nothing;

commit;
