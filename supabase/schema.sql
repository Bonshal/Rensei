-- Rensei: Supabase Schema Migration
-- Run this SQL in the Supabase SQL Editor to create all tables

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Subjects
create table if not exists subjects (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  color text not null default '#6366f1',
  created_at timestamptz not null default now()
);

-- Chapters
create table if not exists chapters (
  id uuid primary key default uuid_generate_v4(),
  subject_id uuid not null references subjects(id) on delete cascade,
  name text not null,
  position integer not null default 0,
  importance float not null default 0.5
);

-- Topics
create table if not exists topics (
  id uuid primary key default uuid_generate_v4(),
  chapter_id uuid not null references chapters(id) on delete cascade,
  name text not null,
  summary text,
  position integer not null default 0,
  importance float not null default 0.5,
  estimated_duration_min integer,
  sm2_easiness_factor float not null default 2.5,
  sm2_interval float not null default 0,
  sm2_repetition_count integer not null default 0,
  sm2_next_review date not null default current_date,
  confidence float not null default 0
);

-- Notes
create table if not exists notes (
  id uuid primary key default uuid_generate_v4(),
  topic_id uuid not null references topics(id) on delete cascade,
  content text not null default '',
  is_ai_generated boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Exams
create table if not exists exams (
  id uuid primary key default uuid_generate_v4(),
  subject_id uuid not null references subjects(id) on delete cascade,
  name text not null,
  date date not null,
  created_at timestamptz not null default now()
);

-- Study Sessions
create type session_status as enum ('pending', 'completed', 'missed', 'skipped', 'aborted');
create type session_source as enum ('initial', 'revision', 'replan', 'exam_compression');

create table if not exists study_sessions (
  id uuid primary key default uuid_generate_v4(),
  topic_id uuid not null references topics(id) on delete cascade,
  scheduled_at timestamptz not null,
  started_at timestamptz,
  completed_at timestamptz,
  status session_status not null default 'pending',
  duration_sec integer,
  quality_score integer check (quality_score >= 0 and quality_score <= 5),
  source session_source not null default 'initial'
);

-- Quiz Results
create type quiz_type as enum ('quick', 'comprehensive');

create table if not exists quiz_results (
  id uuid primary key default uuid_generate_v4(),
  topic_id uuid not null references topics(id) on delete cascade,
  session_id uuid references study_sessions(id) on delete set null,
  quiz_type quiz_type not null,
  total_questions integer not null,
  correct_answers integer not null,
  quality_score integer not null check (quality_score >= 0 and quality_score <= 5),
  taken_at timestamptz not null default now()
);

-- Quiz Questions (cached)
create type question_type as enum ('mcq', 'flashcard', 'short_answer');

create table if not exists quiz_questions (
  id uuid primary key default uuid_generate_v4(),
  topic_id uuid not null references topics(id) on delete cascade,
  question text not null,
  answer text not null,
  type question_type not null,
  options jsonb,
  generated_at timestamptz not null default now()
);

-- Planner Logs
create type planner_event_type as enum ('replan', 'exam_added', 'session_missed', 'interval_update', 'exam_deleted');

create table if not exists planner_logs (
  id uuid primary key default uuid_generate_v4(),
  topic_id uuid not null references topics(id) on delete cascade,
  event_type planner_event_type not null,
  reason text not null,
  old_next_review date,
  new_next_review date,
  created_at timestamptz not null default now()
);

-- Indexes for performance
create index if not exists idx_chapters_subject on chapters(subject_id);
create index if not exists idx_topics_chapter on topics(chapter_id);
create index if not exists idx_topics_next_review on topics(sm2_next_review);
create index if not exists idx_notes_topic on notes(topic_id);
create index if not exists idx_exams_subject on exams(subject_id);
create index if not exists idx_exams_date on exams(date);
create index if not exists idx_sessions_topic on study_sessions(topic_id);
create index if not exists idx_sessions_status on study_sessions(status);
create index if not exists idx_sessions_scheduled on study_sessions(scheduled_at);
create index if not exists idx_quiz_results_topic on quiz_results(topic_id);
create index if not exists idx_quiz_questions_topic on quiz_questions(topic_id);
create index if not exists idx_planner_logs_topic on planner_logs(topic_id);

-- Row Level Security (permissive for prototype — no auth)
alter table subjects enable row level security;
alter table chapters enable row level security;
alter table topics enable row level security;
alter table notes enable row level security;
alter table exams enable row level security;
alter table study_sessions enable row level security;
alter table quiz_results enable row level security;
alter table quiz_questions enable row level security;
alter table planner_logs enable row level security;

-- Allow all operations for anon (prototype only)
create policy "Allow all for anon" on subjects for all using (true) with check (true);
create policy "Allow all for anon" on chapters for all using (true) with check (true);
create policy "Allow all for anon" on topics for all using (true) with check (true);
create policy "Allow all for anon" on notes for all using (true) with check (true);
create policy "Allow all for anon" on exams for all using (true) with check (true);
create policy "Allow all for anon" on study_sessions for all using (true) with check (true);
create policy "Allow all for anon" on quiz_results for all using (true) with check (true);
create policy "Allow all for anon" on quiz_questions for all using (true) with check (true);
create policy "Allow all for anon" on planner_logs for all using (true) with check (true);
