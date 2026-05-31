package repository

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"

	"github.com/quizgen/quizgen/internal/models"
)

type QuizRepository struct {
	db *sql.DB
}

func NewQuizRepository(db *sql.DB) *QuizRepository {
	return &QuizRepository{db: db}
}

// ── Quiz CRUD ─────────────────────────────────────────────────────────────────
func (r *QuizRepository) Create(ctx context.Context, q *models.Quiz) error {
	query := `
		INSERT INTO quizzes
			(id, user_id, title, subject, grade, topic, description,
			 source_text, source_filename,
			 time_limit_secs, attempt_limit, shuffle_questions, shuffle_answers, status)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
		RETURNING created_at, updated_at`

	if q.ID == uuid.Nil {
		q.ID = uuid.New()
	}

	return r.db.QueryRowContext(ctx, query,
		q.ID, q.UserID, q.Title, q.Subject, q.Grade, q.Topic, q.Description,
		q.SourceText, q.SourceFilename,
		q.TimeLimitSecs, q.AttemptLimit, q.ShuffleQuestions, q.ShuffleAnswers, q.Status,
	).Scan(&q.CreatedAt, &q.UpdatedAt)
}

func (r *QuizRepository) GetByID(ctx context.Context, id uuid.UUID) (*models.Quiz, error) {
	q := &models.Quiz{}
	err := r.db.QueryRowContext(ctx, `
		SELECT id, user_id, title, subject, grade, topic, description,
		       source_text, source_filename, time_limit_secs, attempt_limit,
		       shuffle_questions, shuffle_answers, status, created_at, updated_at
		FROM quizzes WHERE id = $1`, id,
	).Scan(
		&q.ID, &q.UserID, &q.Title, &q.Subject, &q.Grade, &q.Topic, &q.Description,
		&q.SourceText, &q.SourceFilename, &q.TimeLimitSecs, &q.AttemptLimit,
		&q.ShuffleQuestions, &q.ShuffleAnswers, &q.Status, &q.CreatedAt, &q.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return q, err
}

func (r *QuizRepository) ListByUser(ctx context.Context, userID uuid.UUID) ([]models.Quiz, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, user_id, title, subject, grade, topic, description,
		       source_filename, time_limit_secs, attempt_limit,
		       shuffle_questions, shuffle_answers, status, created_at, updated_at
		FROM quizzes WHERE user_id = $1 ORDER BY created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var quizzes []models.Quiz
	for rows.Next() {
		var q models.Quiz
		if err := rows.Scan(
			&q.ID, &q.UserID, &q.Title, &q.Subject, &q.Grade, &q.Topic, &q.Description,
			&q.SourceFilename, &q.TimeLimitSecs, &q.AttemptLimit,
			&q.ShuffleQuestions, &q.ShuffleAnswers, &q.Status, &q.CreatedAt, &q.UpdatedAt,
		); err != nil {
			return nil, err
		}
		quizzes = append(quizzes, q)
	}
	return quizzes, rows.Err()
}

func (r *QuizRepository) Update(ctx context.Context, q *models.Quiz) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE quizzes SET
			title=$1, subject=$2, grade=$3, topic=$4, description=$5,
			time_limit_secs=$6, attempt_limit=$7,
			shuffle_questions=$8, shuffle_answers=$9, status=$10
		WHERE id=$11 AND user_id=$12`,
		q.Title, q.Subject, q.Grade, q.Topic, q.Description,
		q.TimeLimitSecs, q.AttemptLimit,
		q.ShuffleQuestions, q.ShuffleAnswers, q.Status,
		q.ID, q.UserID,
	)
	return err
}

func (r *QuizRepository) Delete(ctx context.Context, id, userID uuid.UUID) error {
	// session_answers.question_id ссылается на questions(id) без ON DELETE CASCADE,
	// поэтому каскадное удаление квиза (quizzes → questions) упирается в этот FK,
	// если у квиза есть пройденные сессии с ответами. Удаляем ответы сессий явно
	// в транзакции, остальное (questions, answers, quiz_sessions, group_*) убирают
	// существующие каскады от quizzes.
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Проверяем владельца, чтобы не удалить чужой квиз.
	var owner uuid.UUID
	if err := tx.QueryRowContext(ctx, `SELECT user_id FROM quizzes WHERE id=$1`, id).Scan(&owner); err != nil {
		if err == sql.ErrNoRows {
			return nil
		}
		return err
	}
	if owner != userID {
		return fmt.Errorf("access denied")
	}

	if _, err := tx.ExecContext(ctx, `
		DELETE FROM session_answers
		WHERE session_id IN (SELECT id FROM quiz_sessions WHERE quiz_id=$1)`, id); err != nil {
		return err
	}

	if _, err := tx.ExecContext(ctx, `DELETE FROM quizzes WHERE id=$1 AND user_id=$2`, id, userID); err != nil {
		return err
	}

	return tx.Commit()
}

// ── Questions ─────────────────────────────────────────────────────────────────
func (r *QuizRepository) SaveQuestions(ctx context.Context, quizID uuid.UUID, questions []models.Question) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Сохраняем вопросы как diff, а НЕ полным пересозданием. Раньше функция
	// удаляла session_answers и все вопросы, заново вставляя вопросы с новыми
	// id — из-за этого любое сохранение квиза в редакторе стирало ответы
	// учеников и всю статистику прохождений. Теперь:
	//   • существующие вопросы (пришли с id) — UPDATE на месте, id сохраняется,
	//     поэтому связанные session_answers остаются валидными;
	//   • новые вопросы (без id) — INSERT;
	//   • вопросы, которых больше нет в payload, — DELETE (ON DELETE CASCADE
	//     уберёт их session_answers).

	keepIDs := make([]uuid.UUID, 0, len(questions))
	for i := range questions {
		if questions[i].ID != uuid.Nil {
			keepIDs = append(keepIDs, questions[i].ID)
		}
	}
	if len(keepIDs) > 0 {
		if _, err := tx.ExecContext(ctx,
			`DELETE FROM questions WHERE quiz_id=$1 AND NOT (id = ANY($2::uuid[]))`,
			quizID, pq.Array(keepIDs)); err != nil {
			return fmt.Errorf("prune questions: %w", err)
		}
	} else if _, err := tx.ExecContext(ctx, `DELETE FROM questions WHERE quiz_id=$1`, quizID); err != nil {
		return fmt.Errorf("clear questions: %w", err)
	}

	for i := range questions {
		q := &questions[i]
		q.QuizID = quizID
		q.Position = i

		if q.ID == uuid.Nil {
			q.ID = uuid.New()
			if err := tx.QueryRowContext(ctx, `
				INSERT INTO questions (id, quiz_id, position, type, text, explanation, image_url, time_limit_secs)
				VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
				RETURNING created_at, updated_at`,
				q.ID, quizID, q.Position, q.Type, q.Text, q.Explanation, q.ImageURL, q.TimeLimitSecs,
			).Scan(&q.CreatedAt, &q.UpdatedAt); err != nil {
				return fmt.Errorf("insert question %d: %w", i, err)
			}
		} else {
			res, err := tx.ExecContext(ctx, `
				UPDATE questions
				SET position=$2, type=$3, text=$4, explanation=$5, image_url=$6, time_limit_secs=$7, updated_at=NOW()
				WHERE id=$1 AND quiz_id=$8`,
				q.ID, q.Position, q.Type, q.Text, q.Explanation, q.ImageURL, q.TimeLimitSecs, quizID)
			if err != nil {
				return fmt.Errorf("update question %d: %w", i, err)
			}
			// id пришёл, но такого вопроса нет (рассинхрон клиента) — создаём.
			if n, _ := res.RowsAffected(); n == 0 {
				if err := tx.QueryRowContext(ctx, `
					INSERT INTO questions (id, quiz_id, position, type, text, explanation, image_url, time_limit_secs)
					VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
					RETURNING created_at, updated_at`,
					q.ID, quizID, q.Position, q.Type, q.Text, q.Explanation, q.ImageURL, q.TimeLimitSecs,
				).Scan(&q.CreatedAt, &q.UpdatedAt); err != nil {
					return fmt.Errorf("insert question %d: %w", i, err)
				}
			}
		}

		// Варианты ответа пересоздаём для вопроса целиком: их немного, и они не
		// связаны внешним ключом с session_answers (там selected_answer_ids —
		// обычный массив uuid, без FK). id сохраняем, если он пришёл.
		if _, err := tx.ExecContext(ctx, `DELETE FROM answers WHERE question_id=$1`, q.ID); err != nil {
			return fmt.Errorf("clear answers for question %d: %w", i, err)
		}
		for j := range q.Answers {
			a := &q.Answers[j]
			if a.ID == uuid.Nil {
				a.ID = uuid.New()
			}
			a.QuestionID = q.ID
			a.Position = j
			if err := tx.QueryRowContext(ctx, `
				INSERT INTO answers (id, question_id, position, text, is_correct)
				VALUES ($1,$2,$3,$4,$5)
				RETURNING created_at`,
				a.ID, q.ID, a.Position, a.Text, a.IsCorrect,
			).Scan(&a.CreatedAt); err != nil {
				return fmt.Errorf("insert answer %d.%d: %w", i, j, err)
			}
		}
	}

	return tx.Commit()
}

func (r *QuizRepository) GetQuestions(ctx context.Context, quizID uuid.UUID) ([]models.Question, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, quiz_id, position, type, text, explanation, image_url, time_limit_secs, created_at, updated_at
		FROM questions WHERE quiz_id=$1 ORDER BY position`, quizID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var questions []models.Question
	for rows.Next() {
		var q models.Question
		if err := rows.Scan(
			&q.ID, &q.QuizID, &q.Position, &q.Type, &q.Text,
			&q.Explanation, &q.ImageURL, &q.TimeLimitSecs, &q.CreatedAt, &q.UpdatedAt,
		); err != nil {
			return nil, err
		}
		questions = append(questions, q)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	for i := range questions {
		aRows, err := r.db.QueryContext(ctx, `
			SELECT id, question_id, position, text, is_correct, created_at
			FROM answers WHERE question_id=$1 ORDER BY position`, questions[i].ID)
		if err != nil {
			return nil, err
		}
		for aRows.Next() {
			var a models.Answer
			if err := aRows.Scan(&a.ID, &a.QuestionID, &a.Position, &a.Text, &a.IsCorrect, &a.CreatedAt); err != nil {
				aRows.Close()
				return nil, err
			}
			questions[i].Answers = append(questions[i].Answers, a)
		}
		aRows.Close()
	}

	return questions, nil
}

// ── Sessions ──────────────────────────────────────────────────────────────────
func (r *QuizRepository) CreateSession(ctx context.Context, s *models.QuizSession) error {
	if s.ID == uuid.Nil {
		s.ID = uuid.New()
	}
	if s.Token == "" {
		s.Token = generateToken(16)
	}
	return r.db.QueryRowContext(ctx, `
		INSERT INTO quiz_sessions (id, quiz_id, token, mode, group_session_id, student_name, attempt_num)
		VALUES ($1,$2,$3,$4,$5,$6,$7)
		RETURNING created_at`,
		s.ID, s.QuizID, s.Token, s.Mode, s.GroupSessionID, s.StudentName, s.AttemptNum,
	).Scan(&s.CreatedAt)
}

func (r *QuizRepository) GetSessionByToken(ctx context.Context, token string) (*models.QuizSession, error) {
	s := &models.QuizSession{}
	err := r.db.QueryRowContext(ctx, `
		SELECT id, quiz_id, token, mode, group_session_id, student_name, started_at, finished_at, score, attempt_num, tab_switches, created_at
		FROM quiz_sessions WHERE token=$1`, token,
	).Scan(&s.ID, &s.QuizID, &s.Token, &s.Mode, &s.GroupSessionID, &s.StudentName,
		&s.StartedAt, &s.FinishedAt, &s.Score, &s.AttemptNum, &s.TabSwitches, &s.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return s, err
}

// IncrementTabSwitches увеличивает счётчик переключений вкладки на 1.
// Работает только для незавершённых сессий, чтобы нельзя было «накрутить»
// счётчик после сдачи квиза.
func (r *QuizRepository) IncrementTabSwitches(ctx context.Context, token string) (int, error) {
	var count int
	err := r.db.QueryRowContext(ctx, `
		UPDATE quiz_sessions
		SET tab_switches = tab_switches + 1
		WHERE token=$1 AND finished_at IS NULL
		RETURNING tab_switches`, token).Scan(&count)
	if err == sql.ErrNoRows {
		return 0, nil
	}
	return count, err
}

func (r *QuizRepository) FinishSession(ctx context.Context, sessionID uuid.UUID, score float64) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE quiz_sessions SET finished_at=NOW(), score=$1 WHERE id=$2`,
		score, sessionID)
	return err
}

func (r *QuizRepository) StartSession(ctx context.Context, sessionID uuid.UUID) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE quiz_sessions SET started_at=NOW() WHERE id=$1 AND started_at IS NULL`,
		sessionID)
	return err
}

func (r *QuizRepository) SaveSessionAnswer(ctx context.Context, a *models.SessionAnswer) error {
	if a.ID == uuid.Nil {
		a.ID = uuid.New()
	}
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO session_answers (id, session_id, question_id, selected_answer_ids, is_correct, time_spent_ms)
		VALUES ($1,$2,$3,$4,$5,$6)`,
		a.ID, a.SessionID, a.QuestionID,
		pq.Array(a.SelectedAnswerIDs), a.IsCorrect, a.TimeSpentMs,
	)
	return err
}

func (r *QuizRepository) CountCorrectAnswers(ctx context.Context, sessionID uuid.UUID) (int, error) {
	var n int
	err := r.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM session_answers
		WHERE session_id=$1 AND is_correct = true`, sessionID).Scan(&n)
	return n, err
}

func (r *QuizRepository) GetSessionByID(ctx context.Context, id uuid.UUID) (*models.QuizSession, error) {
	s := &models.QuizSession{}
	err := r.db.QueryRowContext(ctx, `
		SELECT id, quiz_id, token, mode, group_session_id, student_name, started_at, finished_at, score, attempt_num, tab_switches, created_at
		FROM quiz_sessions WHERE id=$1`, id,
	).Scan(&s.ID, &s.QuizID, &s.Token, &s.Mode, &s.GroupSessionID, &s.StudentName,
		&s.StartedAt, &s.FinishedAt, &s.Score, &s.AttemptNum, &s.TabSwitches, &s.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return s, err
}

func (r *QuizRepository) GetSessionAnswers(ctx context.Context, sessionID uuid.UUID) ([]models.SessionAnswer, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, session_id, question_id, selected_answer_ids, is_correct, time_spent_ms, answered_at
		FROM session_answers WHERE session_id=$1 ORDER BY answered_at`, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []models.SessionAnswer
	for rows.Next() {
		var a models.SessionAnswer
		var ids pq.StringArray
		if err := rows.Scan(&a.ID, &a.SessionID, &a.QuestionID, &ids, &a.IsCorrect, &a.TimeSpentMs, &a.AnsweredAt); err != nil {
			return nil, err
		}
		a.SelectedAnswerIDs = make([]uuid.UUID, 0, len(ids))
		for _, s := range ids {
			if id, err := uuid.Parse(s); err == nil {
				a.SelectedAnswerIDs = append(a.SelectedAnswerIDs, id)
			}
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

func (r *QuizRepository) GetStats(ctx context.Context, quizID, userID uuid.UUID) (*models.QuizStats, error) {
	quiz, err := r.GetByID(ctx, quizID)
	if err != nil || quiz == nil || quiz.UserID != userID {
		return nil, fmt.Errorf("quiz not found or access denied")
	}

	stats := &models.QuizStats{QuizID: quizID, Title: quiz.Title}

	row := r.db.QueryRowContext(ctx, `
		SELECT COUNT(*), COUNT(finished_at), COALESCE(AVG(score),0)
		FROM quiz_sessions WHERE quiz_id=$1`, quizID)
	if err := row.Scan(&stats.TotalSessions, &stats.Completed, &stats.AvgScore); err != nil {
		return nil, err
	}

	qRows, err := r.db.QueryContext(ctx, `
		SELECT q.id, q.text, q.type, q.position,
		       COALESCE(SUM(CASE WHEN sa.is_correct THEN 1 ELSE 0 END), 0),
		       COUNT(sa.id),
		       COALESCE(AVG(NULLIF(sa.time_spent_ms, 0)), 0)
		FROM questions q
		LEFT JOIN session_answers sa ON sa.question_id = q.id
		WHERE q.quiz_id=$1
		GROUP BY q.id, q.text, q.type, q.position
		ORDER BY q.position`, quizID)
	if err != nil {
		return nil, err
	}
	defer qRows.Close()

	// qIndex: question_id → индекс в stats.Questions, чтобы подвесить варианты.
	qIndex := map[uuid.UUID]int{}
	for qRows.Next() {
		var qs models.QuestionStat
		var avgMs float64
		if err := qRows.Scan(&qs.QuestionID, &qs.Text, &qs.Type, &qs.Position, &qs.CorrectCount, &qs.TotalCount, &avgMs); err != nil {
			return nil, err
		}
		qs.AvgTimeSec = avgMs / 1000.0
		qs.Options = []models.OptionStat{}
		qIndex[qs.QuestionID] = len(stats.Questions)
		stats.Questions = append(stats.Questions, qs)
	}
	if err := qRows.Err(); err != nil {
		return nil, err
	}

	// Разбивка по вариантам ответа: сколько учеников выбрало каждый вариант.
	oRows, err := r.db.QueryContext(ctx, `
		SELECT a.question_id, a.id, a.text, a.is_correct,
		       COUNT(sa.id) FILTER (WHERE sa.selected_answer_ids @> ARRAY[a.id])
		FROM answers a
		JOIN questions q ON q.id = a.question_id
		LEFT JOIN session_answers sa ON sa.question_id = a.question_id
		WHERE q.quiz_id=$1
		GROUP BY a.question_id, a.id, a.text, a.is_correct, a.position
		ORDER BY a.question_id, a.position`, quizID)
	if err != nil {
		return nil, err
	}
	defer oRows.Close()

	for oRows.Next() {
		var qid uuid.UUID
		var os models.OptionStat
		if err := oRows.Scan(&qid, &os.AnswerID, &os.Text, &os.IsCorrect, &os.SelectedCount); err != nil {
			return nil, err
		}
		if idx, ok := qIndex[qid]; ok {
			stats.Questions[idx].Options = append(stats.Questions[idx].Options, os)
		}
	}
	if err := oRows.Err(); err != nil {
		return nil, err
	}

	sRows, err := r.db.QueryContext(ctx, `
		SELECT s.id, COALESCE(s.student_name, ''), s.score, s.started_at, s.finished_at,
		       s.attempt_num, s.tab_switches,
		       COALESCE(SUM(CASE WHEN sa.is_correct THEN 1 ELSE 0 END), 0) AS correct_count,
		       COUNT(sa.id) AS answered_count,
		       COALESCE(SUM(sa.time_spent_ms), 0) AS total_time_ms
		FROM quiz_sessions s
		LEFT JOIN session_answers sa ON sa.session_id = s.id
		WHERE s.quiz_id=$1
		GROUP BY s.id, s.student_name, s.score, s.started_at, s.finished_at,
		         s.attempt_num, s.tab_switches, s.created_at
		ORDER BY COALESCE(s.finished_at, s.started_at, s.created_at) DESC`, quizID)
	if err != nil {
		return nil, err
	}
	defer sRows.Close()

	// sIndex: session_id → индекс, чтобы подвесить поответную матрицу.
	sIndex := map[uuid.UUID]int{}
	for sRows.Next() {
		var ss models.SessionStat
		if err := sRows.Scan(&ss.SessionID, &ss.StudentName, &ss.Score, &ss.StartedAt, &ss.FinishedAt, &ss.AttemptNum, &ss.TabSwitches, &ss.CorrectCount, &ss.AnsweredCount, &ss.TotalTimeMs); err != nil {
			return nil, err
		}
		ss.Answers = []models.SessionAnswerBrief{}
		sIndex[ss.SessionID] = len(stats.Sessions)
		stats.Sessions = append(stats.Sessions, ss)
	}
	if err := sRows.Err(); err != nil {
		return nil, err
	}

	// Матрица «участник × вопрос»: правильность каждого ответа каждой сессии.
	mRows, err := r.db.QueryContext(ctx, `
		SELECT sa.session_id, sa.question_id, sa.is_correct
		FROM session_answers sa
		JOIN quiz_sessions s ON s.id = sa.session_id
		WHERE s.quiz_id=$1`, quizID)
	if err != nil {
		return nil, err
	}
	defer mRows.Close()

	for mRows.Next() {
		var sid uuid.UUID
		var brief models.SessionAnswerBrief
		if err := mRows.Scan(&sid, &brief.QuestionID, &brief.IsCorrect); err != nil {
			return nil, err
		}
		if idx, ok := sIndex[sid]; ok {
			stats.Sessions[idx].Answers = append(stats.Sessions[idx].Answers, brief)
		}
	}
	return stats, mRows.Err()
}

func (r *QuizRepository) IdentifySession(ctx context.Context, token, name string) (*models.QuizSession, error) {
	res, err := r.db.ExecContext(ctx, `
		UPDATE quiz_sessions
		SET student_name = $1
		WHERE token = $2 AND (student_name IS NULL OR student_name = '')`,
		name, token)
	if err != nil {
		return nil, err
	}
	_ = res
	return r.GetSessionByToken(ctx, token)
}

func (r *QuizRepository) CountAttempts(ctx context.Context, quizID uuid.UUID, studentName string) (int, error) {
	var count int
	err := r.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM quiz_sessions
		WHERE quiz_id=$1 AND student_name=$2 AND finished_at IS NOT NULL`,
		quizID, studentName,
	).Scan(&count)
	return count, err
}

// ── Group Session Methods ─────────────────────────────────────────────────────

func (r *QuizRepository) CreateGroupSession(ctx context.Context, gs *models.GroupQuizSession) error {
	if gs.ID == uuid.Nil {
		gs.ID = uuid.New()
	}
	return r.db.QueryRowContext(ctx, `
		INSERT INTO group_quiz_sessions 
			(id, quiz_id, created_by, access_code, max_participants, start_time, end_time, is_active, show_leaderboard)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
		RETURNING created_at, updated_at`,
		gs.ID, gs.QuizID, gs.CreatedBy, gs.AccessCode, gs.MaxParticipants,
		gs.StartTime, gs.EndTime, gs.IsActive, gs.ShowLeaderboard,
	).Scan(&gs.CreatedAt, &gs.UpdatedAt)
}

func (r *QuizRepository) GetGroupSessionByCode(ctx context.Context, code string) (*models.GroupQuizSession, error) {
	gs := &models.GroupQuizSession{}
	err := r.db.QueryRowContext(ctx, `
		SELECT id, quiz_id, created_by, access_code, max_participants, start_time, end_time, 
		       is_active, show_leaderboard, created_at, updated_at
		FROM group_quiz_sessions WHERE access_code = $1`, code,
	).Scan(&gs.ID, &gs.QuizID, &gs.CreatedBy, &gs.AccessCode, &gs.MaxParticipants,
		&gs.StartTime, &gs.EndTime, &gs.IsActive, &gs.ShowLeaderboard, &gs.CreatedAt, &gs.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return gs, err
}

func (r *QuizRepository) CloseGroupSession(ctx context.Context, id uuid.UUID) error {
	_, err := r.db.ExecContext(ctx, `UPDATE group_quiz_sessions SET is_active = false WHERE id = $1`, id)
	return err
}

func (r *QuizRepository) InitGroupResult(ctx context.Context, groupSessionID uuid.UUID, studentName string) error {
	_, err := r.db.ExecContext(ctx, `
		INSERT INTO group_quiz_results (group_session_id, student_name, score, total_questions)
		VALUES ($1, $2, 0, 0)
		ON CONFLICT (group_session_id, student_name) DO NOTHING`,
		groupSessionID, studentName)
	return err
}

func (r *QuizRepository) UpdateGroupResult(ctx context.Context, groupSessionID uuid.UUID, studentName string, correctAnswers, totalQuestions int) error {
	score := 0.0
	if totalQuestions > 0 {
		score = float64(correctAnswers) / float64(totalQuestions)
	}
	_, err := r.db.ExecContext(ctx, `
		UPDATE group_quiz_results 
		SET score = $1, total_questions = $2
		WHERE group_session_id = $3 AND student_name = $4`,
		score, totalQuestions, groupSessionID, studentName)
	return err
}

func (r *QuizRepository) FinalizeGroupResult(ctx context.Context, groupSessionID uuid.UUID, studentName string, score float64, totalQuestions int) error {
	_, err := r.db.ExecContext(ctx, `
		UPDATE group_quiz_results 
		SET score = $1, total_questions = $2, completed_at = NOW()
		WHERE group_session_id = $3 AND student_name = $4`,
		score, totalQuestions, groupSessionID, studentName)
	return err
}

func (r *QuizRepository) GetGroupLeaderboard(ctx context.Context, accessCode string) ([]models.LeaderboardEntry, error) {
	rows, err := r.db.QueryContext(ctx, `
		SELECT 
			gr.student_name,
			gr.score,
			gr.total_questions,
			gr.completed_at,
			RANK() OVER (ORDER BY gr.score DESC, gr.completed_at ASC) as rank
		FROM group_quiz_results gr
		JOIN group_quiz_sessions gs ON gr.group_session_id = gs.id
		WHERE gs.access_code = $1 AND gs.is_active = true AND gr.total_questions > 0
		ORDER BY gr.score DESC, gr.completed_at ASC
		LIMIT 50`, accessCode)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []models.LeaderboardEntry
	for rows.Next() {
		var e models.LeaderboardEntry
		if err := rows.Scan(&e.StudentName, &e.Score, &e.TotalQuestions, &e.CompletedAt, &e.Rank); err != nil {
			return nil, err
		}
		entries = append(entries, e)
	}
	return entries, rows.Err()
}

// ── Helpers ───────────────────────────────────────────────────────────────────
func generateToken(n int) string {
	const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, n)
	for i := range b {
		b[i] = chars[time.Now().UnixNano()%int64(len(chars))]
	}
	return string(b)
}
