-- Sesiona · Esquema en la nube con cuentas (Supabase Auth + RLS por usuario)
-- Aplicar en el PROYECTO DEDICADO de Sesiona (vacío). Cada fila pertenece a un
-- usuario (auth.users); las políticas RLS garantizan que cada profesional solo
-- ve y modifica SUS datos. El bot usa la service_role key (omite RLS) y filtra
-- por user_id.
--
-- Tablas: settings (1 por usuario), clients, sessions, invoices, payments, expenses.
-- Los ids de negocio son TEXT (los genera la app, p.ej. "c1718...") con PK
-- compuesta (user_id, id) para evitar colisiones entre usuarios.

-- ── settings: configuración del emisor (un registro por usuario) ──────────────
create table if not exists public.sesiona_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ── clients ──────────────────────────────────────────────────────────────────
create table if not exists public.sesiona_clients (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  name text, sur text, nif text, phone text,
  price numeric default 0, irpf numeric default 0,
  type text, igic_reg text default 'exento',
  amigo boolean default false, notes text,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- ── sessions (citas) ─────────────────────────────────────────────────────────
create table if not exists public.sesiona_sessions (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  client_id text,
  start_at timestamptz not null,
  price numeric default 0,
  st text default 'programada',
  notes text,
  inv text default '',
  rem boolean default false,
  no_bill boolean default false,
  reminder_sent_at timestamptz,
  confirm_status text default 'none', -- none | pending | confirmed | cancelled
  confirm_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists sesiona_sessions_user_start_idx on public.sesiona_sessions (user_id, start_at);
create index if not exists sesiona_sessions_confirm_idx on public.sesiona_sessions (confirm_status);

-- ── invoices ─────────────────────────────────────────────────────────────────
create table if not exists public.sesiona_invoices (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  client_id text,
  num text,
  date date,
  due date,
  concept text,
  base numeric default 0, igic numeric default 0, irpf numeric default 0, total numeric default 0,
  st text default 'emitida',
  reg text,
  sent boolean default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- ── payments (cobros) ────────────────────────────────────────────────────────
create table if not exists public.sesiona_payments (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  inv text,
  date date,
  amount numeric default 0,
  method text,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- ── expenses (gastos) ────────────────────────────────────────────────────────
create table if not exists public.sesiona_expenses (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  prov text,
  date date,
  total numeric default 0, igic numeric default 0,
  cat text, ded text, doc boolean default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- ── RLS: cada usuario solo accede a sus filas ────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'sesiona_settings','sesiona_clients','sesiona_sessions',
    'sesiona_invoices','sesiona_payments','sesiona_expenses'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists %I on public.%I;', t||'_owner', t);
    execute format($p$
      create policy %I on public.%I
        for all
        to authenticated
        using (user_id = auth.uid())
        with check (user_id = auth.uid());
    $p$, t||'_owner', t);
  end loop;
end $$;
