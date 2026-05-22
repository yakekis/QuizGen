
-- ============================================================
-- Migration: 001_init DOWN
-- ============================================================

DROP TRIGGER IF EXISTS trg_questions_updated_at ON questions;
DROP TRIGGER IF EXISTS trg_quizzes_updated_at   ON quizzes;
DROP TRIGGER IF EXISTS trg_users_updated_at     ON users;
DROP FUNCTION IF EXISTS set_updated_at();

DROP TABLE IF EXISTS session_answers;
DROP TABLE IF EXISTS quiz_sessions;
DROP TABLE IF EXISTS answers;
DROP TABLE IF EXISTS questions;
DROP TABLE IF EXISTS quizzes;
DROP TABLE IF EXISTS rate_limits;
DROP TABLE IF EXISTS users;

DROP EXTENSION IF EXISTS "uuid-ossp";
