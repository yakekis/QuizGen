-- URL картинки-иллюстрации к вопросу (необязательно). Пустая строка — без картинки.
ALTER TABLE questions
ADD COLUMN IF NOT EXISTS image_url TEXT NOT NULL DEFAULT '';
