-- Business Barber V2: persistência segura da API no Supabase.
-- A tabela não deve ser acessada diretamente pelo navegador.
create table if not exists public.bb_app_state (
  id text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.bb_app_state enable row level security;

-- Intencionalmente sem políticas para anon/authenticated.
-- A API do Render usa somente a secret key armazenada em variável de ambiente.
revoke all on public.bb_app_state from anon, authenticated;

create or replace function public.bb_app_state_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists bb_app_state_updated_at on public.bb_app_state;
create trigger bb_app_state_updated_at
before update on public.bb_app_state
for each row execute function public.bb_app_state_set_updated_at();
