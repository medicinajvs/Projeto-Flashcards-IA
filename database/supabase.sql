create table if not exists public.evidence_analyses (
  id bigint primary key generated always as identity,
  created_at timestamptz not null default now(),
  study_run_id bigint not null references public.study_runs(id) on delete cascade,
  theme text,
  lesson text,
  analysis_goal text,
  topics_detected jsonb not null default '[]'::jsonb,
  search_queries jsonb not null default '[]'::jsonb,
  strengths jsonb not null default '[]'::jsonb,
  missing_topics jsonb not null default '[]'::jsonb,
  improvement_suggestions jsonb not null default '[]'::jsonb,
  mnemonics jsonb not null default '[]'::jsonb,
  recommended_flashcard_focus jsonb not null default '[]'::jsonb
);

create table if not exists public.evidence_sources (
  id bigint primary key generated always as identity,
  created_at timestamptz not null default now(),
  analysis_id bigint not null references public.evidence_analyses(id) on delete cascade,
  source_name text not null,
  source_type text not null,
  external_id text,
  title text not null,
  url text not null,
  snippet text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists evidence_analyses_study_run_id_idx
  on public.evidence_analyses (study_run_id);

create index if not exists evidence_sources_analysis_id_idx
  on public.evidence_sources (analysis_id);