-- session_answers.question_id ссылался на questions(id) без ON DELETE CASCADE,
-- из-за чего удаление квиза с пройденными сессиями падало по FK-нарушению.
-- Пересоздаём ограничение с каскадным удалением.
ALTER TABLE session_answers DROP CONSTRAINT IF EXISTS session_answers_question_id_fkey;
ALTER TABLE session_answers
    ADD CONSTRAINT session_answers_question_id_fkey
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE;
