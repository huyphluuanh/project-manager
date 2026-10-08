-- =====================================================================
-- Project Manager – initial schema
--
-- Quy ước cho mọi bảng đồng bộ (sync):
--   updated_at  : server tự set mỗi lần ghi  -> client pull "updated_at > cursor"
--   deleted_at  : soft delete (tombstone)    -> thiết bị khác biết dòng đã bị xóa
--   version     : server tự tăng mỗi lần sửa -> client update kèm
--                 "where version = <base_version>"; 0 dòng bị ảnh hưởng = conflict
-- =====================================================================

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------

create or replace function public.set_row_meta()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, now());
    new.updated_at := now();
    new.version := 1;
  else
    new.created_at := old.created_at;
    new.updated_at := now();
    new.version := old.version + 1;
  end if;
  return new;
end
$$;

-- ---------------------------------------------------------------------
-- Users
-- ---------------------------------------------------------------------

create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null default '',
  full_name   text not null default '',
  avatar_url  text,
  timezone    text not null default 'Asia/Ho_Chi_Minh',
  locale      text not null default 'vi',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  version     integer not null default 1
);

create table public.user_settings (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  theme       text not null default 'system' check (theme in ('light', 'dark', 'system')),
  settings    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  version     integer not null default 1
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1))
  );
  insert into public.user_settings (user_id) values (new.id);
  return new;
end
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Projects & membership
-- ---------------------------------------------------------------------

create table public.projects (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name             text not null check (char_length(name) between 1 and 200),
  description      text not null default '',
  status           text not null default 'planning'
                   check (status in ('planning', 'in_progress', 'on_hold', 'completed', 'cancelled')),
  priority         text not null default 'medium'
                   check (priority in ('critical', 'high', 'medium', 'low')),
  start_date       date,
  deadline         date,
  progress_mode    text not null default 'auto' check (progress_mode in ('auto', 'manual')),
  manual_progress  smallint check (manual_progress between 0 and 100),
  color            text,
  is_favorite      boolean not null default false,
  sort_order       double precision not null default 0,
  archived_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  version          integer not null default 1,
  check (deadline is null or start_date is null or deadline >= start_date)
);

create index projects_owner_idx   on public.projects (owner_id);
create index projects_updated_idx on public.projects (updated_at);

create table public.project_members (
  project_id  uuid not null references public.projects (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  role        text not null default 'editor' check (role in ('owner', 'admin', 'editor', 'viewer')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  version     integer not null default 1,
  primary key (project_id, user_id)
);

create index project_members_user_idx on public.project_members (user_id);

create or replace function public.add_project_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.project_members (project_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (project_id, user_id) do update set role = 'owner';
  return new;
end
$$;

create trigger projects_add_owner
  after insert on public.projects
  for each row execute function public.add_project_owner();

-- Access helpers (security definer để tránh đệ quy RLS)

create or replace function public.project_role(p_project_id uuid)
returns text
language sql stable
security definer
set search_path = ''
as $$
  select role from public.project_members
  where project_id = p_project_id and user_id = auth.uid()
$$;

create or replace function public.can_read_project(p_project_id uuid)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.project_members
    where project_id = p_project_id and user_id = auth.uid()
  )
$$;

create or replace function public.can_write_project(p_project_id uuid)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select coalesce(public.project_role(p_project_id) in ('owner', 'admin', 'editor'), false)
$$;

create or replace function public.is_project_admin(p_project_id uuid)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select coalesce(public.project_role(p_project_id) in ('owner', 'admin'), false)
$$;

create or replace function public.shares_project_with(p_user_id uuid)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.project_members a
    join public.project_members b on b.project_id = a.project_id
    where a.user_id = auth.uid() and b.user_id = p_user_id
  )
$$;

create or replace function public.guard_project_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.owner_id is distinct from old.owner_id
     and coalesce(public.project_role(old.id), '') <> 'owner' then
    raise exception 'Only the project owner can transfer ownership' using errcode = '42501';
  end if;
  return new;
end
$$;

create trigger projects_guard_owner
  before update on public.projects
  for each row execute function public.guard_project_owner();

-- ---------------------------------------------------------------------
-- Tasks
-- ---------------------------------------------------------------------

create table public.tasks (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid not null references public.projects (id) on delete cascade,
  created_by        uuid default auth.uid() references public.profiles (id) on delete set null,
  assignee_id       uuid references public.profiles (id) on delete set null,
  title             text not null check (char_length(title) between 1 and 500),
  description       text not null default '',
  status            text not null default 'todo'
                    check (status in ('todo', 'in_progress', 'review', 'blocked', 'done')),
  priority          text not null default 'medium'
                    check (priority in ('critical', 'high', 'medium', 'low')),
  start_date        date,
  due_date          date,
  due_time          time,
  progress_mode     text not null default 'auto' check (progress_mode in ('auto', 'manual')),
  manual_progress   smallint check (manual_progress between 0 and 100),
  estimate_minutes  integer check (estimate_minutes >= 0),
  is_pinned         boolean not null default false,
  my_day_date       date,
  snoozed_until     timestamptz,
  sort_order        double precision not null default 0,
  completed_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  version           integer not null default 1,
  check (due_date is null or start_date is null or due_date >= start_date)
);

create index tasks_project_idx  on public.tasks (project_id) where deleted_at is null;
create index tasks_assignee_idx on public.tasks (assignee_id) where deleted_at is null;
create index tasks_due_idx      on public.tasks (due_date) where deleted_at is null and status <> 'done';
create index tasks_my_day_idx   on public.tasks (my_day_date) where my_day_date is not null;
create index tasks_updated_idx  on public.tasks (updated_at);
create index tasks_title_trgm   on public.tasks using gin (title extensions.gin_trgm_ops);

create or replace function public.task_project_id(p_task_id uuid)
returns uuid
language sql stable
security definer
set search_path = ''
as $$
  select project_id from public.tasks where id = p_task_id
$$;

create or replace function public.tasks_set_completed_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'done' then
    if tg_op = 'INSERT' or old.status is distinct from 'done' then
      new.completed_at := coalesce(new.completed_at, now());
    end if;
  else
    new.completed_at := null;
  end if;
  return new;
end
$$;

create trigger tasks_completed_at
  before insert or update on public.tasks
  for each row execute function public.tasks_set_completed_at();

create table public.subtasks (
  id            uuid primary key default gen_random_uuid(),
  task_id       uuid not null references public.tasks (id) on delete cascade,
  title         text not null check (char_length(title) between 1 and 500),
  is_done       boolean not null default false,
  sort_order    double precision not null default 0,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  version       integer not null default 1
);

create index subtasks_task_idx    on public.subtasks (task_id);
create index subtasks_updated_idx on public.subtasks (updated_at);

create table public.task_dependencies (
  id                  uuid primary key default gen_random_uuid(),
  task_id             uuid not null references public.tasks (id) on delete cascade,
  depends_on_task_id  uuid not null references public.tasks (id) on delete cascade,
  type                text not null default 'blocked_by' check (type in ('blocked_by', 'related_to')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  version             integer not null default 1,
  check (task_id <> depends_on_task_id)
);

create unique index task_dependencies_unique
  on public.task_dependencies (task_id, depends_on_task_id, type) where deleted_at is null;
create index task_dependencies_depends_idx on public.task_dependencies (depends_on_task_id);
create index task_dependencies_updated_idx on public.task_dependencies (updated_at);

create or replace function public.prevent_dependency_cycle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.type = 'blocked_by' and new.deleted_at is null and exists (
    with recursive chain (id) as (
      select d.depends_on_task_id
      from public.task_dependencies d
      where d.task_id = new.depends_on_task_id and d.type = 'blocked_by' and d.deleted_at is null
      union
      select d.depends_on_task_id
      from public.task_dependencies d
      join chain c on d.task_id = c.id
      where d.type = 'blocked_by' and d.deleted_at is null
    )
    select 1 from chain where id = new.task_id
  ) then
    raise exception 'Dependency cycle detected' using errcode = '23514';
  end if;
  return new;
end
$$;

create trigger task_dependencies_no_cycle
  before insert or update on public.task_dependencies
  for each row execute function public.prevent_dependency_cycle();

-- ---------------------------------------------------------------------
-- Tags
-- ---------------------------------------------------------------------

create table public.tags (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 50),
  color       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  version     integer not null default 1
);

create unique index tags_owner_name_unique on public.tags (owner_id, lower(name)) where deleted_at is null;

create table public.task_tags (
  task_id     uuid not null references public.tasks (id) on delete cascade,
  tag_id      uuid not null references public.tags (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  version     integer not null default 1,
  primary key (task_id, tag_id)
);

create index task_tags_tag_idx     on public.task_tags (tag_id);
create index task_tags_updated_idx on public.task_tags (updated_at);

create table public.project_tags (
  project_id  uuid not null references public.projects (id) on delete cascade,
  tag_id      uuid not null references public.tags (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  version     integer not null default 1,
  primary key (project_id, tag_id)
);

create index project_tags_tag_idx on public.project_tags (tag_id);

-- ---------------------------------------------------------------------
-- Milestones, reminders, time tracking
-- ---------------------------------------------------------------------

create table public.milestones (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  title         text not null check (char_length(title) between 1 and 200),
  due_date      date,
  is_done       boolean not null default false,
  completed_at  timestamptz,
  sort_order    double precision not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  version       integer not null default 1
);

create index milestones_project_idx on public.milestones (project_id);
create index milestones_updated_idx on public.milestones (updated_at);

create table public.reminders (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  task_id         uuid references public.tasks (id) on delete cascade,
  project_id      uuid references public.projects (id) on delete cascade,
  milestone_id    uuid references public.milestones (id) on delete cascade,
  title           text not null default '',
  remind_at       timestamptz not null,
  offset_minutes  integer,
  status          text not null default 'pending'
                  check (status in ('pending', 'fired', 'snoozed', 'dismissed', 'done')),
  snoozed_until   timestamptz,
  fired_at        timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  version         integer not null default 1
);

create index reminders_due_idx
  on public.reminders (user_id, remind_at) where status in ('pending', 'snoozed') and deleted_at is null;
create index reminders_task_idx    on public.reminders (task_id);
create index reminders_updated_idx on public.reminders (updated_at);

create table public.time_entries (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  task_id           uuid references public.tasks (id) on delete cascade,
  project_id        uuid not null references public.projects (id) on delete cascade,
  started_at        timestamptz not null,
  ended_at          timestamptz,
  duration_seconds  integer generated always as (
                      case when ended_at is null then null
                           else floor(extract(epoch from (ended_at - started_at)))::integer end
                    ) stored,
  note              text not null default '',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  version           integer not null default 1,
  check (ended_at is null or ended_at >= started_at)
);

-- Mỗi user chỉ có tối đa 1 timer đang chạy
create unique index time_entries_one_running
  on public.time_entries (user_id) where ended_at is null and deleted_at is null;
create index time_entries_user_started_idx on public.time_entries (user_id, started_at);
create index time_entries_task_idx         on public.time_entries (task_id);
create index time_entries_project_idx      on public.time_entries (project_id);
create index time_entries_updated_idx      on public.time_entries (updated_at);

create or replace function public.time_entries_fill_project()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.task_id is not null then
    new.project_id := public.task_project_id(new.task_id);
  end if;
  return new;
end
$$;

create trigger time_entries_fill_project
  before insert or update on public.time_entries
  for each row execute function public.time_entries_fill_project();

-- ---------------------------------------------------------------------
-- Notes & attachments
-- ---------------------------------------------------------------------

create table public.notes (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid references public.projects (id) on delete cascade,
  task_id     uuid references public.tasks (id) on delete cascade,
  content_md  text not null default '',
  created_by  uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  version     integer not null default 1,
  check (num_nonnulls(project_id, task_id) = 1)
);

create index notes_project_idx on public.notes (project_id);
create index notes_task_idx    on public.notes (task_id);
create index notes_updated_idx on public.notes (updated_at);

create table public.attachments (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects (id) on delete cascade,
  task_id       uuid references public.tasks (id) on delete cascade,
  uploaded_by   uuid default auth.uid() references public.profiles (id) on delete set null,
  file_name     text not null check (char_length(file_name) between 1 and 255),
  mime_type     text not null,
  size_bytes    bigint not null check (size_bytes between 0 and 20971520),
  storage_path  text not null unique,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  version       integer not null default 1
);

create index attachments_project_idx on public.attachments (project_id);
create index attachments_task_idx    on public.attachments (task_id);

-- ---------------------------------------------------------------------
-- Notifications, activity log
-- ---------------------------------------------------------------------

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  type        text not null check (type in (
                'task_due', 'task_overdue', 'project_deadline', 'assignment',
                'mention', 'dependency_blocked', 'sync_error', 'reminder', 'system')),
  title       text not null,
  body        text not null default '',
  project_id  uuid references public.projects (id) on delete cascade,
  task_id     uuid references public.tasks (id) on delete cascade,
  read_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  version     integer not null default 1
);

create index notifications_user_idx
  on public.notifications (user_id, created_at desc) where deleted_at is null;
create index notifications_updated_idx on public.notifications (updated_at);

create table public.activity_logs (
  id           bigint generated always as identity primary key,
  project_id   uuid references public.projects (id) on delete cascade,
  task_id      uuid references public.tasks (id) on delete cascade,
  actor_id     uuid references public.profiles (id) on delete set null,
  entity_type  text not null check (entity_type in ('project', 'task')),
  entity_id    uuid not null,
  action       text not null,
  field        text,
  old_value    text,
  new_value    text,
  created_at   timestamptz not null default now()
);

create index activity_logs_project_idx on public.activity_logs (project_id, created_at desc);
create index activity_logs_task_idx    on public.activity_logs (task_id, created_at desc);

create or replace function public.log_task_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    insert into public.activity_logs (project_id, task_id, actor_id, entity_type, entity_id, action)
    values (new.project_id, new.id, v_actor, 'task', new.id, 'created');
  else
    if new.deleted_at is not null and old.deleted_at is null then
      insert into public.activity_logs (project_id, task_id, actor_id, entity_type, entity_id, action)
      values (new.project_id, new.id, v_actor, 'task', new.id, 'deleted');
      return new;
    elsif new.deleted_at is null and old.deleted_at is not null then
      insert into public.activity_logs (project_id, task_id, actor_id, entity_type, entity_id, action)
      values (new.project_id, new.id, v_actor, 'task', new.id, 'restored');
    end if;

    insert into public.activity_logs
      (project_id, task_id, actor_id, entity_type, entity_id, action, field, old_value, new_value)
    select new.project_id, new.id, v_actor, 'task', new.id, c.action, c.field, c.old_value, c.new_value
    from (values
      (case when new.status = 'done' then 'completed'
            when old.status = 'done' then 'reopened'
            else 'status_changed' end,
       'status', old.status, new.status),
      ('priority_changed',   'priority',    old.priority,           new.priority),
      ('deadline_changed',   'due_date',    old.due_date::text,     new.due_date::text),
      ('assignment_changed', 'assignee_id', old.assignee_id::text,  new.assignee_id::text),
      ('moved',              'project_id',  old.project_id::text,   new.project_id::text),
      ('renamed',            'title',       old.title,              new.title)
    ) as c (action, field, old_value, new_value)
    where c.old_value is distinct from c.new_value;
  end if;

  -- Thông báo cho người được giao việc (trừ khi tự giao cho mình)
  if new.assignee_id is not null
     and new.assignee_id is distinct from v_actor
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id) then
    insert into public.notifications (user_id, type, title, project_id, task_id)
    values (new.assignee_id, 'assignment', 'Bạn được giao: ' || new.title, new.project_id, new.id);
  end if;

  return new;
end
$$;

create trigger tasks_activity
  after insert or update on public.tasks
  for each row execute function public.log_task_activity();

create or replace function public.log_project_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    insert into public.activity_logs (project_id, actor_id, entity_type, entity_id, action)
    values (new.id, v_actor, 'project', new.id, 'created');
    return new;
  end if;

  insert into public.activity_logs
    (project_id, actor_id, entity_type, entity_id, action, field, old_value, new_value)
  select new.id, v_actor, 'project', new.id, c.action, c.field, c.old_value, c.new_value
  from (values
    ('status_changed',   'status',      old.status,                new.status),
    ('priority_changed', 'priority',    old.priority,              new.priority),
    ('deadline_changed', 'deadline',    old.deadline::text,        new.deadline::text),
    (case when new.archived_at is null then 'unarchived' else 'archived' end,
                         'archived_at', old.archived_at::text,     new.archived_at::text),
    (case when new.deleted_at is null then 'restored' else 'deleted' end,
                         'deleted_at',  old.deleted_at::text,      new.deleted_at::text),
    ('renamed',          'name',        old.name,                  new.name)
  ) as c (action, field, old_value, new_value)
  where c.old_value is distinct from c.new_value;

  return new;
end
$$;

create trigger projects_activity
  after insert or update on public.projects
  for each row execute function public.log_project_activity();

-- ---------------------------------------------------------------------
-- Saved views, sync log
-- ---------------------------------------------------------------------

create table public.saved_views (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 100),
  view_type   text not null default 'list' check (view_type in ('list', 'kanban', 'calendar', 'timeline')),
  filters     jsonb not null default '{}'::jsonb,
  sort        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  version     integer not null default 1
);

create index saved_views_user_idx on public.saved_views (user_id);

-- id = mutation id do client sinh ra -> replay offline queue không bị ghi 2 lần
create table public.sync_events (
  id            uuid primary key,
  user_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  device_id     text not null,
  entity_type   text not null,
  entity_id     uuid not null,
  op            text not null check (op in ('insert', 'update', 'delete')),
  payload       jsonb not null default '{}'::jsonb,
  base_version  integer,
  status        text not null check (status in ('applied', 'conflict', 'rejected', 'resolved')),
  error         text,
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz
);

create index sync_events_user_idx on public.sync_events (user_id, created_at desc);

-- ---------------------------------------------------------------------
-- Computed views (RLS của bảng gốc được áp dụng nhờ security_invoker)
-- ---------------------------------------------------------------------

create view public.task_progress with (security_invoker = true) as
select
  t.id as task_id,
  count(s.id)::integer                          as subtasks_total,
  (count(s.id) filter (where s.is_done))::integer as subtasks_done,
  case
    when t.progress_mode = 'manual' then coalesce(t.manual_progress, 0)
    when t.status = 'done' then 100
    when count(s.id) = 0 then 0
    else round(100.0 * count(s.id) filter (where s.is_done) / count(s.id))::integer
  end as progress
from public.tasks t
left join public.subtasks s on s.task_id = t.id and s.deleted_at is null
group by t.id;

create view public.project_stats with (security_invoker = true) as
select
  p.id as project_id,
  count(t.id)::integer                                                          as tasks_total,
  (count(t.id) filter (where t.status = 'done'))::integer                       as tasks_done,
  (count(t.id) filter (where t.status = 'blocked'))::integer                    as tasks_blocked,
  (count(t.id) filter (where t.status <> 'done' and t.priority = 'critical'))::integer as tasks_critical_open,
  case when count(t.id) = 0 then 0
       else round(100.0 * count(t.id) filter (where t.status = 'done') / count(t.id))::integer
  end as auto_progress,
  case
    when p.progress_mode = 'manual' then coalesce(p.manual_progress, 0)
    when count(t.id) = 0 then 0
    else round(100.0 * count(t.id) filter (where t.status = 'done') / count(t.id))::integer
  end as progress
from public.projects p
left join public.tasks t on t.project_id = p.id and t.deleted_at is null
group by p.id;

-- ---------------------------------------------------------------------
-- row meta triggers + RLS on for every table
-- ---------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'user_settings', 'projects', 'project_members', 'tasks', 'subtasks',
    'task_dependencies', 'tags', 'task_tags', 'project_tags', 'milestones', 'reminders',
    'time_entries', 'notes', 'attachments', 'notifications', 'saved_views'
  ] loop
    execute format(
      'create trigger %I before insert or update on public.%I
         for each row execute function public.set_row_meta()',
      t || '_row_meta', t);
  end loop;

  foreach t in array array[
    'profiles', 'user_settings', 'projects', 'project_members', 'tasks', 'subtasks',
    'task_dependencies', 'tags', 'task_tags', 'project_tags', 'milestones', 'reminders',
    'time_entries', 'notes', 'attachments', 'notifications', 'activity_logs',
    'saved_views', 'sync_events'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end
$$;

-- ---------------------------------------------------------------------
-- RLS policies
-- ---------------------------------------------------------------------

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_project_with(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- projects
create policy projects_select on public.projects for select to authenticated
  using (owner_id = (select auth.uid()) or public.can_read_project(id));
create policy projects_insert on public.projects for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy projects_update on public.projects for update to authenticated
  using (public.can_write_project(id)) with check (public.can_write_project(id));
create policy projects_delete on public.projects for delete to authenticated
  using (public.project_role(id) = 'owner');

-- project_members
create policy project_members_select on public.project_members for select to authenticated
  using (public.can_read_project(project_id));
create policy project_members_insert on public.project_members for insert to authenticated
  with check (public.is_project_admin(project_id));
create policy project_members_update on public.project_members for update to authenticated
  using (public.is_project_admin(project_id)) with check (public.is_project_admin(project_id));
create policy project_members_delete on public.project_members for delete to authenticated
  using (public.is_project_admin(project_id));

-- Bảng thuộc project: đọc nếu là member, ghi nếu là editor trở lên
do $$
declare
  t   text;
  key text;
begin
  for t, key in values
    ('tasks',        'project_id'),
    ('milestones',   'project_id'),
    ('attachments',  'project_id'),
    ('project_tags', 'project_id'),
    ('subtasks',     'public.task_project_id(task_id)'),
    ('task_tags',    'public.task_project_id(task_id)'),
    ('notes',        'coalesce(project_id, public.task_project_id(task_id))')
  loop
    execute format('create policy %I on public.%I for select to authenticated using (public.can_read_project(%s))',
                   t || '_select', t, key);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.can_write_project(%s))',
                   t || '_insert', t, key);
    execute format('create policy %I on public.%I for update to authenticated using (public.can_write_project(%s)) with check (public.can_write_project(%s))',
                   t || '_update', t, key, key);
    execute format('create policy %I on public.%I for delete to authenticated using (public.can_write_project(%s))',
                   t || '_delete', t, key);
  end loop;
end
$$;

-- task_dependencies: ghi được task phụ thuộc, đọc được task bị phụ thuộc
create policy task_dependencies_select on public.task_dependencies for select to authenticated
  using (public.can_read_project(public.task_project_id(task_id)));
create policy task_dependencies_insert on public.task_dependencies for insert to authenticated
  with check (public.can_write_project(public.task_project_id(task_id))
              and public.can_read_project(public.task_project_id(depends_on_task_id)));
create policy task_dependencies_update on public.task_dependencies for update to authenticated
  using (public.can_write_project(public.task_project_id(task_id)))
  with check (public.can_write_project(public.task_project_id(task_id))
              and public.can_read_project(public.task_project_id(depends_on_task_id)));
create policy task_dependencies_delete on public.task_dependencies for delete to authenticated
  using (public.can_write_project(public.task_project_id(task_id)));

-- activity_logs: chỉ đọc (ghi qua trigger)
create policy activity_logs_select on public.activity_logs for select to authenticated
  using (public.can_read_project(project_id));

-- Bảng của riêng từng user
create policy tags_all on public.tags for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy user_settings_all on public.user_settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy saved_views_all on public.saved_views for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notifications_all on public.notifications for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy sync_events_all on public.sync_events for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy reminders_all on public.reminders for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())
              and (task_id is null or public.can_read_project(public.task_project_id(task_id)))
              and (project_id is null or public.can_read_project(project_id)));
create policy time_entries_all on public.time_entries for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.can_read_project(project_id));

-- ---------------------------------------------------------------------
-- Grants: chỉ user đã đăng nhập mới truy cập dữ liệu
-- ---------------------------------------------------------------------

revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke insert, update, delete on public.activity_logs from authenticated;

-- ---------------------------------------------------------------------
-- Realtime (đồng bộ tức thời giữa các thiết bị)
-- ---------------------------------------------------------------------

alter publication supabase_realtime add table
  public.projects, public.project_members, public.tasks, public.subtasks,
  public.task_dependencies, public.tags, public.task_tags, public.project_tags,
  public.milestones, public.reminders, public.time_entries, public.notes,
  public.attachments, public.notifications, public.user_settings;

-- ---------------------------------------------------------------------
-- Storage: file đính kèm, đường dẫn "<project_id>/<uuid>-<file_name>"
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'attachments', 'attachments', false, 20971520,
  array[
    'image/png', 'image/jpeg', 'image/gif', 'image/webp',
    'application/pdf', 'text/plain', 'text/csv', 'text/markdown', 'application/zip',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
on conflict (id) do nothing;

create or replace function public.storage_project_id(p_object_name text)
returns uuid
language sql immutable
set search_path = ''
as $$
  select case
    when split_part(p_object_name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then split_part(p_object_name, '/', 1)::uuid
  end
$$;

create policy attachments_storage_select on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and public.can_read_project(public.storage_project_id(name)));
create policy attachments_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and public.can_write_project(public.storage_project_id(name)));
create policy attachments_storage_delete on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and public.can_write_project(public.storage_project_id(name)));
