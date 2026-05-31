ALTER TABLE session_answers DROP CONSTRAINT IF EXISTS session_answers_question_id_fkey;
ALTER TABLE session_answers
    ADD CONSTRAINT session_answers_question_id_fkey
    FOREIGN KEY (question_id) REFERENCES questions(id);
