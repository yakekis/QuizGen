-- Время, потраченное учеником на конкретный вопрос (в миллисекундах).
-- Используется в статистике: «среднее время на вопрос» и расчёт очков.
ALTER TABLE session_answers
ADD COLUMN IF NOT EXISTS time_spent_ms INT NOT NULL DEFAULT 0;
