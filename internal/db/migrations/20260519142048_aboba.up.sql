-- ============================================================
-- Migration: 001_init
-- Creates core tables for QuizGen
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Users (teachers) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email       VARCHAR(255) NOT NULL UNIQUE,
    name        VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);

-- ── Rate limiting ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rate_limits (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    window_start TIMESTAMPTZ NOT NULL,
    request_count INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, window_start)
);

CREATE INDEX idx_rate_limits_user_window ON rate_limits(user_id, window_start);

-- ── Quizzes ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quizzes (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title           VARCHAR(500) NOT NULL,
    subject         VARCHAR(255),
    grade           VARCHAR(50),
    topic           VARCHAR(500),
    description     TEXT,
    source_text     TEXT,          -- extracted text from uploaded file (not public)
    source_filename VARCHAR(500),
    -- Settings
    time_limit_secs  INT,          -- NULL = unlimited
    attempt_limit    INT DEFAULT 1,
    shuffle_questions BOOLEAN DEFAULT FALSE,
    shuffle_answers   BOOLEAN DEFAULT FALSE,
    -- Status
    status          VARCHAR(50) NOT NULL DEFAULT 'draft',  -- draft | published | archived
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_quizzes_user_id ON quizzes(user_id);
CREATE INDEX idx_quizzes_status  ON quizzes(status);

-- ── Questions ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS questions (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quiz_id     UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    position    INT NOT NULL DEFAULT 0,
    type        VARCHAR(50) NOT NULL DEFAULT 'single',  -- single | multiple | true_false
    text        TEXT NOT NULL,
    explanation TEXT,                -- shown after answer
    time_limit_secs INT,             -- per-question override
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_questions_quiz_id ON questions(quiz_id);

-- ── Answers (options) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS answers (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    position    INT NOT NULL DEFAULT 0,
    text        TEXT NOT NULL,
    is_correct  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_answers_question_id ON answers(question_id);

-- ── Quiz Sessions (for personal links) ───────────────────────
CREATE TABLE IF NOT EXISTS quiz_sessions (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quiz_id     UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    token       VARCHAR(64) NOT NULL UNIQUE,  -- unique token for personal link
    student_name VARCHAR(255),
    started_at  TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    score       NUMERIC(5,2),                 -- percentage 0-100
    attempt_num INT NOT NULL DEFAULT 1,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sessions_quiz_id ON quiz_sessions(quiz_id);
CREATE INDEX idx_sessions_token   ON quiz_sessions(token);

-- ── Session Answers (student responses) ──────────────────────
CREATE TABLE IF NOT EXISTS session_answers (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id      UUID NOT NULL REFERENCES quiz_sessions(id) ON DELETE CASCADE,
    question_id     UUID NOT NULL REFERENCES questions(id),
    selected_answer_ids UUID[],     -- array of selected answer IDs
    is_correct      BOOLEAN,
    answered_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_session_answers_session_id ON session_answers(session_id);

-- ── Trigger: auto-update updated_at ─────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_quizzes_updated_at
    BEFORE UPDATE ON quizzes
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_questions_updated_at
    BEFORE UPDATE ON questions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
