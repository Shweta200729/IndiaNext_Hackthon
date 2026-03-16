-- ============================================================
-- Full Backend Supabase Database Schema
-- Federated Learning Dashboard + Auth
-- ============================================================

-- UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────────────────────
-- A. User Authentication
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(100)        NOT NULL,
    email       VARCHAR(255)        NOT NULL UNIQUE,
    phone       VARCHAR(15)         NOT NULL,
    password_hash VARCHAR(255)      NOT NULL,
    created_at  TIMESTAMPTZ         DEFAULT NOW(),
    updated_at  TIMESTAMPTZ         DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- B. Federated Learning Actors
-- ─────────────────────────────────────────────────────────────

-- Clients (edge nodes)
CREATE TABLE IF NOT EXISTS clients (
    id          TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::TEXT,
    client_name TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Collaboration sessions between users
CREATE TABLE IF NOT EXISTS collab_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    requester_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'rejected', 'completed', 'cancelled')),
    shared_version_id INT REFERENCES model_versions(id) ON DELETE SET NULL,
    round_submitted JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Global model checkpoints
-- file_path is nullable: version 0 seed row has no file yet
CREATE TABLE IF NOT EXISTS model_versions (
    id          SERIAL PRIMARY KEY,
    version_num INT     UNIQUE NOT NULL,
    file_path   TEXT,                              -- nullable → no file for seed row
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- C. Federated Learning Logs
-- ─────────────────────────────────────────────────────────────

-- Per-client update attempts
CREATE TABLE IF NOT EXISTS client_updates (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    version_id     INT  REFERENCES model_versions(id) ON DELETE CASCADE,
    client_id      TEXT REFERENCES clients(id)        ON DELETE CASCADE,
    status         TEXT NOT NULL CHECK (status IN ('ACCEPT', 'REJECT')),
    norm_value     NUMERIC,
    distance_value NUMERIC,
    reason         TEXT,
    created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Evaluation metrics after each aggregation round
-- loss / accuracy are NULLABLE so the server can store partial results
-- when evaluation is skipped (val_loader not yet available).
CREATE TABLE IF NOT EXISTS evaluation_metrics (
    id          SERIAL  PRIMARY KEY,
    version_id  INT     REFERENCES model_versions(id) ON DELETE CASCADE,
    loss        NUMERIC,                           -- nullable (may be NaN → stored as NULL)
    accuracy    NUMERIC,                           -- nullable
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Aggregation round summaries
CREATE TABLE IF NOT EXISTS aggregation_logs (
    id              SERIAL  PRIMARY KEY,
    version_id      INT     REFERENCES model_versions(id) ON DELETE CASCADE,
    total_accepted  INT,
    total_rejected  INT,
    method          TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Per-epoch training metrics (persisted for Evaluation page Training section)
CREATE TABLE IF NOT EXISTS train_history (
    id          SERIAL      PRIMARY KEY,
    client_id   TEXT        NOT NULL,
    round       INT         NOT NULL,
    epoch       INT         NOT NULL,
    loss        NUMERIC,
    accuracy    NUMERIC,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- D. Indexes for dashboard query performance
-- ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_eval_version   ON evaluation_metrics (version_id DESC);
CREATE INDEX IF NOT EXISTS idx_agg_version    ON aggregation_logs   (version_id DESC);
CREATE INDEX IF NOT EXISTS idx_cu_version     ON client_updates     (version_id DESC);
CREATE INDEX IF NOT EXISTS idx_cu_created     ON client_updates     (created_at  DESC);
CREATE INDEX IF NOT EXISTS idx_th_round       ON train_history      (round DESC);


-- ─────────────────────────────────────────────────────────────
-- E. Seed: baseline model version so Round 0 exists
-- ─────────────────────────────────────────────────────────────
INSERT INTO model_versions (version_num, file_path)
VALUES (0, NULL)
ON CONFLICT (version_num) DO NOTHING;
