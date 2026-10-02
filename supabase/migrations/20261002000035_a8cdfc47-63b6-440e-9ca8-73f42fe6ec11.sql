create type public.app_role as enum ('admin', 'user');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role public.app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create policy "Users read own roles" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

create table public.user_settings (
  user_id uuid primary key,
  comfy_url text not null default '',
  routing_mode text not null default 'auto',
  selected_gpu_id integer,
  saved_gpus jsonb not null default '[]'::jsonb,
  model_assignments jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.user_settings to authenticated;
grant all on public.user_settings to service_role;
alter table public.user_settings enable row level security;
create policy "Own settings" on public.user_settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create table public.batches (
  id bigserial primary key,
  owner_id uuid not null default auth.uid(),
  legacy_owner_id text,
  name text not null,
  batch_type text not null,
  status text not null default 'pending',
  total_jobs integer not null,
  completed_jobs integer not null default 0,
  failed_jobs integer not null default 0,
  cancelled_jobs integer not null default 0,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
grant select, insert, update, delete on public.batches to authenticated;
grant all on public.batches to service_role;
grant usage, select on sequence public.batches_id_seq to authenticated;
alter table public.batches enable row level security;
create policy "Own batches" on public.batches for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create table public.jobs (
  id bigserial primary key,
  owner_id uuid not null default auth.uid(),
  legacy_owner_id text,
  workflow_id text not null,
  workflow_name text not null,
  status text not null default 'pending',
  params jsonb not null default '{}'::jsonb,
  comfy_prompt_id text,
  worker_id integer,
  worker_label text,
  worker_url text,
  batch_id bigint references public.batches(id) on delete set null,
  batch_index integer,
  progress integer default 0,
  error_message text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);
create index jobs_owner_created_idx on public.jobs(owner_id, created_at desc);
grant select, insert, update, delete on public.jobs to authenticated;
grant all on public.jobs to service_role;
grant usage, select on sequence public.jobs_id_seq to authenticated;
alter table public.jobs enable row level security;
create policy "Own jobs" on public.jobs for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create table public.outputs (
  id bigserial primary key,
  owner_id uuid not null default auth.uid(),
  legacy_owner_id text,
  job_id bigint not null references public.jobs(id) on delete cascade,
  filename text not null,
  output_type text not null default 'image',
  subfolder text not null default '',
  created_at timestamptz not null default now()
);
create index outputs_owner_created_idx on public.outputs(owner_id, created_at desc);
grant select, insert, update, delete on public.outputs to authenticated;
grant all on public.outputs to service_role;
grant usage, select on sequence public.outputs_id_seq to authenticated;
alter table public.outputs enable row level security;
create policy "Own outputs" on public.outputs for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create table public.saved_workflows (
  id bigserial primary key,
  owner_id uuid not null default auth.uid(),
  legacy_owner_id text,
  name text not null,
  json text not null,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.saved_workflows to authenticated;
grant all on public.saved_workflows to service_role;
grant usage, select on sequence public.saved_workflows_id_seq to authenticated;
alter table public.saved_workflows enable row level security;
create policy "Own saved workflows" on public.saved_workflows for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());