
-- 1. EXTENSÕES
create extension if not exists "uuid-ossp";

-- 2. TABELA DE CATÁLOGO (Inventário Mestre)
-- Atualizada: Apenas Part Number, Part Name e Station
create table if not exists parts_catalog (
  part_number text primary key,
  part_name text not null,
  station text,
  updated_at timestamp with time zone default now()
);

-- 3. TABELA DE SESSÕES DE RECONHECIMENTO
create table if not exists recognition_sessions (
  id uuid primary key default uuid_generate_v4(),
  created_at timestamp with time zone default now(),
  summary text,
  total_matches integer default 0
);

-- 4. TABELA DE IMAGENS CAPTURADAS (Fotos do Scan)
create table if not exists captured_images (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid references recognition_sessions(id) on delete cascade,
  image_url text not null,
  angle_label text,
  created_at timestamp with time zone default now()
);

-- 5. TABELA DE RESULTADOS (Matches identificados pela IA)
create table if not exists recognition_matches (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid references recognition_sessions(id) on delete cascade,
  part_number text,
  part_name text,
  model text,
  station text,
  color text,
  match_percentage float,
  description text,
  category text,
  created_at timestamp with time zone default now()
);
