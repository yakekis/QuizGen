-- Групповые сессии (общая комната для нескольких учеников)
CREATE TABLE IF NOT EXISTS group_quiz_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES users(id),
    access_code VARCHAR(6) UNIQUE NOT NULL,
    max_participants INT DEFAULT 50,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    show_leaderboard BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Индекс для быстрого поиска по коду
CREATE INDEX IF NOT EXISTS idx_group_sessions_code ON group_quiz_sessions(access_code);
CREATE INDEX IF NOT EXISTS idx_group_sessions_quiz ON group_quiz_sessions(quiz_id);

-- Результаты для живого топа
CREATE TABLE IF NOT EXISTS group_quiz_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_session_id UUID NOT NULL REFERENCES group_quiz_sessions(id) ON DELETE CASCADE,
    student_name VARCHAR(100) NOT NULL,
    score NUMERIC(5,4) DEFAULT 0,
    total_questions INT DEFAULT 0,
    completed_at TIMESTAMPTZ,
    UNIQUE(group_session_id, student_name)
);

CREATE INDEX IF NOT EXISTS idx_group_results_session ON group_quiz_results(group_session_id, score DESC);

-- Добавляем поля в quiz_sessions для привязки к групповой сессии
ALTER TABLE quiz_sessions 
ADD COLUMN IF NOT EXISTS mode VARCHAR(20) NOT NULL DEFAULT 'solo',
ADD COLUMN IF NOT EXISTS group_session_id UUID REFERENCES group_quiz_sessions(id) ON DELETE SET NULL;

-- Триггер для авто-обновления updated_at в group_quiz_sessions
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_group_sessions_updated_at ON group_quiz_sessions;
CREATE TRIGGER update_group_sessions_updated_at
    BEFORE UPDATE ON group_quiz_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();