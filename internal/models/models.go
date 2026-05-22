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
	SourceText       string     `json:"-" db:"source_text"` // never expose to public
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

type QuizSession struct {
	ID          uuid.UUID  `json:"id" db:"id"`
	QuizID      uuid.UUID  `json:"quiz_id" db:"quiz_id"`
	Token       string     `json:"token" db:"token"`
	StudentName string     `json:"student_name" db:"student_name"`
	StartedAt   *time.Time `json:"started_at" db:"started_at"`
	FinishedAt  *time.Time `json:"finished_at" db:"finished_at"`
	Score       *float64   `json:"score" db:"score"`
	AttemptNum  int        `json:"attempt_num" db:"attempt_num"`
	CreatedAt   time.Time  `json:"created_at" db:"created_at"`
}

// ── Session Answer ────────────────────────────────────────────────────────────

type SessionAnswer struct {
	ID                uuid.UUID   `json:"id" db:"id"`
	SessionID         uuid.UUID   `json:"session_id" db:"session_id"`
	QuestionID        uuid.UUID   `json:"question_id" db:"question_id"`
	SelectedAnswerIDs []uuid.UUID `json:"selected_answer_ids" db:"selected_answer_ids"`
	IsCorrect         *bool       `json:"is_correct" db:"is_correct"`
	AnsweredAt        time.Time   `json:"answered_at" db:"answered_at"`
}

// ── DTOs ─────────────────────────────────────────────────────────────────────

// GenerateQuizRequest is the payload sent by the teacher.
type GenerateQuizRequest struct {
	Subject       string         `json:"subject" binding:"required"`
	Grade         string         `json:"grade" binding:"required"`
	Topic         string         `json:"topic" binding:"required"`
	QuestionCount int            `json:"question_count" binding:"required,min=1,max=30"`
	QuestionTypes []QuestionType `json:"question_types"`
	TimeLimitSecs *int           `json:"time_limit_secs"`
	AttemptLimit  int            `json:"attempt_limit"`
	// New tuning parameters
	Difficulty  string `json:"difficulty"`   // easy | medium | hard | mixed
	Tone        string `json:"tone"`         // formal | playful | neutral
	Language    string `json:"language"`     // ru | en | ...
	BloomsLevel string `json:"blooms_level"` // remember | understand | apply | analyze | evaluate | create
	// SourceText is set internally after file parsing
	SourceText string `json:"-"`
}

// GeneratedQuiz is what the LLM returns (parsed JSON).
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

// QuizStats is returned to the teacher after the quiz runs.
type QuizStats struct {
	QuizID        uuid.UUID      `json:"quiz_id"`
	Title         string         `json:"title"`
	TotalSessions int            `json:"total_sessions"`
	Completed     int            `json:"completed"`
	AvgScore      float64        `json:"avg_score"`
	Questions     []QuestionStat `json:"questions"`
	Sessions      []SessionStat  `json:"sessions"`
}

// SessionStat — одна попытка ученика, отображаемая в статистике учителя.
type SessionStat struct {
	SessionID   uuid.UUID  `json:"session_id"`
	StudentName string     `json:"student_name"`
	Score       *float64   `json:"score"`
	StartedAt   *time.Time `json:"started_at"`
	FinishedAt  *time.Time `json:"finished_at"`
	AttemptNum  int        `json:"attempt_num"`
}

type QuestionStat struct {
	QuestionID   uuid.UUID `json:"question_id"`
	Text         string    `json:"text"`
	CorrectCount int       `json:"correct_count"`
	TotalCount   int       `json:"total_count"`
}

// RegisterRequest / LoginRequest
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
