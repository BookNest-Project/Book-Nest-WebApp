-- BookNest payments & revenue (safe to re-run)

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete restrict,
  amount numeric(12,2) not null check (amount >= 0),
  currency char(3) not null default 'ETB',
  tx_ref text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'success', 'failed', 'refunded')),
  payment_method text not null default 'chapa',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists payments_user_idx on public.payments (user_id, created_at desc);
create index if not exists payments_status_idx on public.payments (status, created_at desc);

create table if not exists public.payment_items (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments (id) on delete cascade,
  book_format_id uuid not null references public.book_formats (id) on delete restrict,
  price numeric(12,2) not null check (price >= 0),
  quantity integer not null default 1 check (quantity > 0),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists payment_items_payment_idx on public.payment_items (payment_id);

create table if not exists public.book_sales (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books (id) on delete restrict,
  book_format_id uuid not null references public.book_formats (id) on delete restrict,
  format_type text not null,
  buyer_id uuid not null references public.users (id) on delete restrict,
  seller_id uuid references public.users (id) on delete set null,
  sale_price numeric(12,2) not null check (sale_price >= 0),
  platform_commission numeric(12,2) not null default 0,
  seller_earnings numeric(12,2) not null default 0,
  commission_rate numeric(5,2) not null default 20,
  payment_id uuid references public.payments (id) on delete set null,
  quantity integer not null default 1 check (quantity > 0),
  sale_date timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists book_sales_sale_date_idx on public.book_sales (sale_date desc);
create index if not exists book_sales_book_idx on public.book_sales (book_id);
create index if not exists book_sales_seller_idx on public.book_sales (seller_id);
create index if not exists book_sales_buyer_idx on public.book_sales (buyer_id);

create table if not exists public.seller_financial_profiles (
  seller_id uuid primary key references public.users (id) on delete cascade,
  total_gross_earnings numeric(14,2) not null default 0,
  total_platform_commission numeric(14,2) not null default 0,
  total_net_earnings numeric(14,2) not null default 0,
  available_balance numeric(14,2) not null default 0,
  total_books_sold integer not null default 0,
  total_pdf_sold integer not null default 0,
  total_audio_sold integer not null default 0,
  last_sale_date timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.platform_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now()),
  updated_by_admin_id uuid references public.users (id) on delete set null
);

insert into public.platform_settings (key, value)
values ('revenue', jsonb_build_object('commission_percent', 20))
on conflict (key) do nothing;

insert into public.platform_settings (key, value)
values (
  'admin_console',
  jsonb_build_object(
    'revenue', jsonb_build_object('commission_percent', 20, 'currency', 'ETB'),
    'books', jsonb_build_object('require_revenue_agreement', true, 'dual_format_review_required', true),
    'notifications', jsonb_build_object('email_on_new_submission', true, 'email_on_sale', true, 'in_app_notifications', true),
    'reports', jsonb_build_object('default_range_days', 30, 'default_export_format', 'xlsx'),
    'platform', jsonb_build_object('maintenance_mode', false, 'marketplace_name', 'BookNest'),
    'invitations', jsonb_build_object('default_expiry_days', 14),
    'payments', jsonb_build_object('primary_gateway', 'chapa')
  )
)
on conflict (key) do nothing;
