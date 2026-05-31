-- Счётчик переключений вкладки/потери фокуса во время прохождения теста.
-- Используется «режимом честности»: учитель видит, сколько раз ученик
-- переключался с вкладки квиза.
ALTER TABLE quiz_sessions
ADD COLUMN IF NOT EXISTS tab_switches INT NOT NULL DEFAULT 0;
