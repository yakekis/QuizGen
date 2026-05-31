package models

import (
	"time"

	"github.com/google/uuid"
)

// ── User ─────────────────────────────────────────────────────────────────────

type User struct {
	ID           uuid.UUID `json:"id" db:"id"`
	Email        string    `json:"email" db:"email"`
	Name         string    `json:"name" db:"name"`
	PasswordHash string    `json:"-" db:"password_hash"`
	CreatedAt    time.Time `json:"created_at" db:"created_at"`
	UpdatedAt    time.Time `json:"updated_at" db:"updated_at"`
}

// ── Quiz ─────────────────────────────────────────────────────────────────────

type QuizStatus string

const (
	QuizStatusDraft     QuizStatus = "draft"
	QuizStatusPublished QuizStatus = "published"
	QuizStatusArchived  QuizStatus = "archived"
)

type Quiz struct {
	ID               uuid.UUID  `json:"id" db:"id"`
	UserID           uuid.UUID  `json:"user_id" db:"user_id"`
	Title            string     `json:"title" db:"title"`
	Subject          string     `json:"subject" db:"subject"`
	Grade            string     `json:"grade" db:"grade"`
	Topic            string     `json:"topic" db:"topic"`
	Description      string     `json:"description" db:"description"`
	SourceText       string     `json:"-" db:"source_text"`
	SourceFilename   string     `json:"source_filename" db:"source_filename"`
	TimeLimitSecs    *int       `json:"time_limit_secs" db:"time_limit_secs"`
	AttemptLimit     int        `json:"attempt_limit" db:"attempt_limit"`
	ShuffleQuestions bool       `json:"shuffle_questions" db:"shuffle_questions"`
	ShuffleAnswers   bool       `json:"shuffle_answers" db:"shuffle_answers"`
	Status           QuizStatus `json:"status" db:"status"`
	Questions        []Question `json:"questions,omitempty" db:"-"`
	CreatedAt        time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt        time.Time  `json:"updated_at" db:"updated_at"`
}

// ── Question ─────────────────────────────────────────────────────────────────

type QuestionType string

const (
	QuestionTypeSingle    QuestionType = "single"
	QuestionTypeMultiple  QuestionType = "multiple"
	QuestionTypeTrueFalse QuestionType = "true_false"
)

type Question struct {
	ID            uuid.UUID    `json:"id" db:"id"`
	QuizID        uuid.UUID    `json:"quiz_id" db:"quiz_id"`
	Position      int          `json:"position" db:"position"`
	Type          QuestionType `json:"type" db:"type"`
	Text          string       `json:"text" db:"text"`
	Explanation   string       `json:"explanation" db:"explanation"`
	ImageURL      string       `json:"image_url" db:"image_url"`
	TimeLimitSecs *int         `json:"time_limit_secs" db:"time_limit_secs"`
	Answers       []Answer     `json:"answers,omitempty" db:"-"`
	CreatedAt     time.Time    `json:"created_at" db:"created_at"`
	UpdatedAt     time.Time    `json:"updated_at" db:"updated_at"`
}

// ── Answer ───────────────────────────────────────────────────────────────────

type Answer struct {
	ID         uuid.UUID `json:"id" db:"id"`
	QuestionID uuid.UUID `json:"question_id" db:"question_id"`
	Position   int       `json:"position" db:"position"`
	Text       string    `json:"text" db:"text"`
	IsCorrect  bool      `json:"is_correct" db:"is_correct"`
	CreatedAt  time.Time `json:"created_at" db:"created_at"`
}

// ── Quiz Session ──────────────────────────────────────────────────────────────

type QuizMode string

const (
	ModeSolo  QuizMode = "solo"
	ModeGroup QuizMode = "group"
)

type QuizSession struct {
	ID             uuid.UUID  `json:"id" db:"id"`
	QuizID         uuid.UUID  `json:"quiz_id" db:"quiz_id"`
	Token          string     `json:"token" db:"token"`
	Mode           QuizMode   `json:"mode" db:"mode"`
	GroupSessionID *uuid.UUID `json:"group_session_id,omitempty" db:"group_session_id"`
	StudentName    string     `json:"student_name" db:"student_name"`
	StartedAt      *time.Time `json:"started_at" db:"started_at"`
	FinishedAt     *time.Time `json:"finished_at" db:"finished_at"`
	Score          *float64   `json:"score" db:"score"`
	AttemptNum     int        `json:"attempt_num" db:"attempt_num"`
	TabSwitches    int        `json:"tab_switches" db:"tab_switches"`
	CreatedAt      time.Time  `json:"created_at" db:"created_at"`
}

// ── Session Answer ────────────────────────────────────────────────────────────

type SessionAnswer struct {
	ID                uuid.UUID   `json:"id" db:"id"`
	SessionID         uuid.UUID   `json:"session_id" db:"session_id"`
	QuestionID        uuid.UUID   `json:"question_id" db:"question_id"`
	SelectedAnswerIDs []uuid.UUID `json:"selected_answer_ids" db:"selected_answer_ids"`
	IsCorrect         *bool       `json:"is_correct" db:"is_correct"`
	TimeSpentMs       int         `json:"time_spent_ms" db:"time_spent_ms"`
	AnsweredAt        time.Time   `json:"answered_at" db:"answered_at"`
}

// ── Group Quiz Session ────────────────────────────────────────────────────────

type GroupQuizSession struct {
	ID              uuid.UUID  `json:"id" db:"id"`
	QuizID          uuid.UUID  `json:"quiz_id" db:"quiz_id"`
	CreatedBy       uuid.UUID  `json:"created_by" db:"created_by"`
	AccessCode      string     `json:"access_code" db:"access_code"`
	MaxParticipants int        `json:"max_participants" db:"max_participants"`
	StartTime       *time.Time `json:"start_time,omitempty" db:"start_time"`
	EndTime         *time.Time `json:"end_time,omitempty" db:"end_time"`
	IsActive        bool       `json:"is_active" db:"is_active"`
	ShowLeaderboard bool       `json:"show_leaderboard" db:"show_leaderboard"`
	CreatedAt       time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at" db:"updated_at"`
}

type GroupQuizResult struct {
	ID             uuid.UUID  `json:"id" db:"id"`
	GroupSessionID uuid.UUID  `json:"group_session_id" db:"group_session_id"`
	StudentName    string     `json:"student_name" db:"student_name"`
	Score          float64    `json:"score" db:"score"`
	TotalQuestions int        `json:"total_questions" db:"total_questions"`
	CompletedAt    *time.Time `json:"completed_at,omitempty" db:"completed_at"`
	Rank           int        `json:"rank,omitempty" db:"rank"`
}

// ── DTOs ─────────────────────────────────────────────────────────────────────

type GenerateQuizRequest struct {
	Subject       string         `json:"subject" binding:"required"`
	Grade         string         `json:"grade" binding:"required"`
	Topic         string         `json:"topic" binding:"required"`
	QuestionCount int            `json:"question_count" binding:"required,min=1,max=30"`
	QuestionTypes []QuestionType `json:"question_types"`
	TimeLimitSecs *int           `json:"time_limit_secs"`
	AttemptLimit  int            `json:"attempt_limit"`
	Difficulty    string         `json:"difficulty"`
	Tone          string         `json:"tone"`
	Language      string         `json:"language"`
	BloomsLevel   string         `json:"blooms_level"`
	SourceText    string         `json:"-"`
}

type GeneratedQuestion struct {
	Text        string `json:"text"`
	Type        string `json:"type"`
	Explanation string `json:"explanation"`
	Answers     []struct {
		Text      string `json:"text"`
		IsCorrect bool   `json:"is_correct"`
	} `json:"answers"`
}

type GeneratedQuiz struct {
	Title     string              `json:"title"`
	Questions []GeneratedQuestion `json:"questions"`
}

type QuizStats struct {
	QuizID        uuid.UUID      `json:"quiz_id"`
	Title         string         `json:"title"`
	TotalSessions int            `json:"total_sessions"`
	Completed     int            `json:"completed"`
	AvgScore      float64        `json:"avg_score"`
	Questions     []QuestionStat `json:"questions"`
	Sessions      []SessionStat  `json:"sessions"`
}

type SessionStat struct {
	SessionID     uuid.UUID            `json:"session_id"`
	StudentName   string               `json:"student_name"`
	Score         *float64             `json:"score"`
	StartedAt     *time.Time           `json:"started_at"`
	FinishedAt    *time.Time           `json:"finished_at"`
	AttemptNum    int                  `json:"attempt_num"`
	TabSwitches   int                  `json:"tab_switches"`
	CorrectCount  int                  `json:"correct_count"`  // верных ответов в попытке
	AnsweredCount int                  `json:"answered_count"` // всего отвеченных вопросов
	TotalTimeMs   int                  `json:"total_time_ms"`  // суммарное время на ответы
	Answers       []SessionAnswerBrief `json:"answers"`        // поответная правильность (матрица)
}

// SessionAnswerBrief — компактная правильность одного ответа ученика,
// чтобы фронт мог построить матрицу «участник × вопрос».
type SessionAnswerBrief struct {
	QuestionID uuid.UUID `json:"question_id"`
	IsCorrect  *bool     `json:"is_correct"`
}

type QuestionStat struct {
	QuestionID   uuid.UUID    `json:"question_id"`
	Text         string       `json:"text"`
	Type         string       `json:"type"`
	Position     int          `json:"position"`
	CorrectCount int          `json:"correct_count"`
	TotalCount   int          `json:"total_count"`
	AvgTimeSec   float64      `json:"avg_time_sec"`
	Options      []OptionStat `json:"options"`
}

// OptionStat — сколько раз вариант ответа был выбран учениками.
type OptionStat struct {
	AnswerID      uuid.UUID `json:"answer_id"`
	Text          string    `json:"text"`
	IsCorrect     bool      `json:"is_correct"`
	SelectedCount int       `json:"selected_count"`
}

type RegisterRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Name     string `json:"name" binding:"required"`
	Password string `json:"password" binding:"required,min=8"`
}

type LoginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required"`
}

type AuthResponse struct {
	Token string `json:"token"`
	User  User   `json:"user"`
}

// UpdateProfileRequest — редактирование профиля учителя.
// CurrentPassword обязателен только при смене пароля.
type UpdateProfileRequest struct {
	Name            string `json:"name" binding:"required,min=1"`
	Email           string `json:"email" binding:"required,email"`
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}

// ── Group Mode Requests ──────────────────────────────────────────────────────

type CreateGroupSessionRequest struct {
	MaxParticipants int    `json:"max_participants" binding:"min=1,max=100"`
	StartInMinutes  int    `json:"start_in_minutes" binding:"min=0"`
	DurationMinutes int    `json:"duration_minutes" binding:"min=1"`
	AccessCode      string `json:"access_code" binding:"omitempty,alphanum,len=6"`
	ShowLeaderboard bool   `json:"show_leaderboard"`
}

type JoinGroupSessionRequest struct {
	StudentName string `json:"student_name" binding:"required,min=2,max=50"`
}

type LeaderboardEntry struct {
	Rank           int        `json:"rank"`
	StudentName    string     `json:"student_name"`
	Score          float64    `json:"score"`
	TotalQuestions int        `json:"total_questions"`
	CompletedAt    *time.Time `json:"completed_at,omitempty"`
}
