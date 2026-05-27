create table barbershops (
  id text primary key,
  name text not null,
  slug text not null unique,
  city text,
  plan text not null default 'Profissional',
  monthly_price numeric(10, 2) not null default 197,
  setup_price numeric(10, 2) not null default 497,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table users (
  id text primary key,
  barbershop_id text not null references barbershops(id),
  name text not null,
  email text not null unique,
  password_hash text not null,
  role text not null check (role in ('owner', 'manager', 'barber')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table clients (
  id text primary key,
  barbershop_id text not null references barbershops(id),
  name text not null,
  phone text,
  last_visit date,
  favorite_service text,
  preferred_period text,
  ticket numeric(10, 2) not null default 0,
  professional text,
  status text not null default 'Ativo',
  consent_whatsapp boolean not null default true,
  created_at timestamptz not null default now()
);

create table services (
  id text primary key,
  barbershop_id text not null references barbershops(id),
  name text not null,
  price numeric(10, 2) not null default 0,
  duration_minutes integer not null default 30,
  active boolean not null default true
);

create table professionals (
  id text primary key,
  barbershop_id text not null references barbershops(id),
  name text not null,
  commission numeric(5, 2) not null default 0,
  active boolean not null default true
);

create table appointments (
  id text primary key,
  barbershop_id text not null references barbershops(id),
  client_id text references clients(id),
  client_name text not null,
  professional_name text not null,
  service_name text not null,
  appointment_date date,
  appointment_time time not null,
  status text not null default 'Confirmado',
  source text not null default 'dashboard',
  recovered boolean not null default false,
  open_slot boolean not null default false,
  created_at timestamptz not null default now()
);

create table campaigns (
  id text primary key,
  barbershop_id text not null references barbershops(id),
  name text not null,
  segment text not null,
  status text not null default 'Rascunho',
  sent integer not null default 0,
  responses integer not null default 0,
  bookings integer not null default 0,
  revenue numeric(10, 2) not null default 0,
  created_at timestamptz not null default now()
);

create table campaign_recipients (
  campaign_id text not null references campaigns(id) on delete cascade,
  client_id text references clients(id),
  client_name text not null,
  status text not null default 'enviado',
  primary key (campaign_id, client_name)
);

create table integrations (
  id text primary key,
  barbershop_id text not null references barbershops(id),
  provider text not null,
  kind text not null check (kind in ('whatsapp', 'pix')),
  mode text not null default 'sandbox',
  config jsonb not null default '{}'::jsonb,
  status text not null default 'simulado',
  last_test_at timestamptz
);

create table audit_logs (
  id text primary key,
  barbershop_id text references barbershops(id),
  actor text not null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index clients_barbershop_status_idx on clients(barbershop_id, status);
create index appointments_barbershop_date_idx on appointments(barbershop_id, appointment_date, appointment_time);
create index campaigns_barbershop_created_idx on campaigns(barbershop_id, created_at desc);
create index audit_barbershop_created_idx on audit_logs(barbershop_id, created_at desc);
