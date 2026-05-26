package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"

	"github.com/quizgen/quizgen/internal/config"
	"github.com/quizgen/quizgen/internal/models"
	"github.com/quizgen/quizgen/internal/repository"
)

type QuizService struct {
	quizRepo *repository.QuizRepository
	llm      *LLMService
	cfg      *config.Config
}

func NewQuizService(quizRepo *repository.QuizRepository, llm *LLMService, cfg *config.Config) *QuizService {
	return &QuizService{quizRepo: quizRepo, llm: llm, cfg: cfg}
}

func (s *QuizService) Generate(ctx context.Context, userID uuid.UUID, req *models.GenerateQuizRequest) (*models.Quiz, error) {
	generated, err := s.llm.GenerateQuiz(ctx, req)
	if err != nil {
		return nil, fmt.Errorf("generate quiz: %w", err)
	}

	quiz := &models.Quiz{
		UserID:        userID,
		Title:         sanitizeUTF8(generated.Title),
		Subject:       sanitizeUTF8(req.Subject),
		Grade:         sanitizeUTF8(req.Grade),
		Topic:         sanitizeUTF8(req.Topic),
		SourceText:    sanitizeUTF8(req.SourceText),
		TimeLimitSecs: req.TimeLimitSecs,
		AttemptLimit:  max(1, req.AttemptLimit),
		Status:        models.QuizStatusDraft,
	}

	if err := s.quizRepo.Create(ctx, quiz); err != nil {
		return nil, fmt.Errorf("persist quiz: %w", err)
	}

	questions := convertGeneratedQuestions(quiz.ID, generated.Questions)
	if err := s.quizRepo.SaveQuestions(ctx, quiz.ID, questions); err != nil {
		return nil, fmt.Errorf("persist questions: %w", err)
	}

	quiz.Questions = questions
	return quiz, nil
}

func (s *QuizService) GetFull(ctx context.Context, quizID, userID uuid.UUID) (*models.Quiz, error) {
	quiz, err := s.quizRepo.GetByID(ctx, quizID)
	if err != nil || quiz == nil {
		return nil, fmt.Errorf("quiz not found")
	}
	if quiz.UserID != userID {
		return nil, fmt.Errorf("access denied")
	}

	questions, err := s.quizRepo.GetQuestions(ctx, quizID)
	if err != nil {
		return nil, err
	}
	quiz.Questions = questions
	return quiz, nil
}

func (s *QuizService) CreatePersonalLink(ctx context.Context, quizID uuid.UUID, studentName string) (*models.QuizSession, error) {
	token, err := generateToken(16)
	if err != nil {
		return nil, err
	}

	quiz, err := s.quizRepo.GetByID(ctx, quizID)
	if err != nil || quiz == nil {
		return nil, fmt.Errorf("quiz not found")
	}

	if quiz.AttemptLimit > 0 && studentName != "" {
		count, err := s.quizRepo.CountAttempts(ctx, quizID, studentName)
		if err == nil && count >= quiz.AttemptLimit {
			return nil, fmt.Errorf("attempt limit reached")
		}
	}

	session := &models.QuizSession{
		QuizID:      quizID,
		Token:       token,
		Mode:        models.ModeSolo,
		StudentName: studentName,
		AttemptNum:  1,
	}
	if err := s.quizRepo.CreateSession(ctx, session); err != nil {
		return nil, err
	}
	return session, nil
}

func (s *QuizService) SubmitAnswer(ctx context.Context, sessionToken string, questionID uuid.UUID, selectedIDs []uuid.UUID) error {
	session, err := s.quizRepo.GetSessionByToken(ctx, sessionToken)
	if err != nil || session == nil {
		return fmt.Errorf("session not found")
	}
	if session.FinishedAt != nil {
		return fmt.Errorf("session already finished")
	}

	_ = s.quizRepo.StartSession(ctx, session.ID)

	questions, err := s.quizRepo.GetQuestions(ctx, session.QuizID)
	if err != nil {
		return err
	}

	var isCorrect *bool
	for _, q := range questions {
		if q.ID == questionID {
			correct := checkCorrectness(q, selectedIDs)
			isCorrect = &correct
			break
		}
	}

	ans := &models.SessionAnswer{
		SessionID:         session.ID,
		QuestionID:        questionID,
		SelectedAnswerIDs: selectedIDs,
		IsCorrect:         isCorrect,
		AnsweredAt:        time.Now(),
	}
	return s.quizRepo.SaveSessionAnswer(ctx, ans)
}

func (s *QuizService) FinishSession(ctx context.Context, token string) (*models.QuizSession, error) {
	session, err := s.quizRepo.GetSessionByToken(ctx, token)
	if err != nil || session == nil {
		return nil, fmt.Errorf("session not found")
	}

	questions, err := s.quizRepo.GetQuestions(ctx, session.QuizID)
	if err != nil {
		return nil, err
	}
	total := len(questions)
	if total == 0 {
		return session, nil
	}

	correct, err := s.quizRepo.CountCorrectAnswers(ctx, session.ID)
	if err != nil {
		return nil, err
	}

	score := float64(correct) / float64(total)
	if err := s.quizRepo.FinishSession(ctx, session.ID, score); err != nil {
		return nil, err
	}
	session.FinishedAt = ptr(time.Now())
	session.Score = &score
	return session, nil
}

func (s *QuizService) RegenerateQuestion(ctx context.Context, quizID, questionID, userID uuid.UUID) (*models.Question, error) {
	quiz, err := s.quizRepo.GetByID(ctx, quizID)
	if err != nil || quiz == nil || quiz.UserID != userID {
		return nil, fmt.Errorf("quiz not found")
	}
	questions, err := s.quizRepo.GetQuestions(ctx, quizID)
	if err != nil {
		return nil, err
	}
	var oldIdx = -1
	for i := range questions {
		if questions[i].ID == questionID {
			oldIdx = i
			break
		}
	}
	if oldIdx < 0 {
		return nil, fmt.Errorf("question not found")
	}
	old := questions[oldIdx]

	quizCtx := fmt.Sprintf("Subject: %s; Grade: %s; Topic: %s; Title: %s",
		quiz.Subject, quiz.Grade, quiz.Topic, quiz.Title)

	gen, err := s.llm.RegenerateQuestion(ctx, quizCtx, old.Text, old.Type)
	if err != nil {
		return nil, err
	}

	newQ := models.Question{
		ID:            uuid.New(),
		QuizID:        quizID,
		Position:      old.Position,
		Type:          old.Type,
		Text:          sanitizeUTF8(gen.Text),
		Explanation:   sanitizeUTF8(gen.Explanation),
		TimeLimitSecs: old.TimeLimitSecs,
	}
	for j, ga := range gen.Answers {
		newQ.Answers = append(newQ.Answers, models.Answer{
			ID:        uuid.New(),
			Position:  j,
			Text:      sanitizeUTF8(ga.Text),
			IsCorrect: ga.IsCorrect,
		})
	}
	questions[oldIdx] = newQ

	if err := s.quizRepo.SaveQuestions(ctx, quizID, questions); err != nil {
		return nil, err
	}
	return &newQ, nil
}

// ── Group Mode Methods ────────────────────────────────────────────────────────

func (s *QuizService) UpdateGroupResult(ctx context.Context, sessionToken string) error {
	session, err := s.quizRepo.GetSessionByToken(ctx, sessionToken)
	if err != nil || session == nil || session.GroupSessionID == nil {
		return nil // Not a group session
	}

	correct, err := s.quizRepo.CountCorrectAnswers(ctx, session.ID)
	if err != nil {
		return err
	}

	questions, err := s.quizRepo.GetQuestions(ctx, session.QuizID)
	if err != nil {
		return err
	}

	return s.quizRepo.UpdateGroupResult(ctx, *session.GroupSessionID, session.StudentName, correct, len(questions))
}

func (s *QuizService) FinalizeGroupResult(ctx context.Context, sessionToken string) error {
	session, err := s.quizRepo.GetSessionByToken(ctx, sessionToken)
	if err != nil || session == nil || session.GroupSessionID == nil {
		return nil
	}

	if session.Score == nil {
		return nil
	}

	return s.quizRepo.FinalizeGroupResult(ctx, *session.GroupSessionID, session.StudentName, *session.Score, 0)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func convertGeneratedQuestions(quizID uuid.UUID, gen []models.GeneratedQuestion) []models.Question {
	out := make([]models.Question, len(gen))
	for i, gq := range gen {
		out[i] = models.Question{
			QuizID:      quizID,
			Position:    i,
			Type:        models.QuestionType(gq.Type),
			Text:        sanitizeUTF8(gq.Text),
			Explanation: sanitizeUTF8(gq.Explanation),
		}
		for j, ga := range gq.Answers {
			out[i].Answers = append(out[i].Answers, models.Answer{
				Position:  j,
				Text:      sanitizeUTF8(ga.Text),
				IsCorrect: ga.IsCorrect,
			})
		}
	}
	return out
}

func checkCorrectness(q models.Question, selectedIDs []uuid.UUID) bool {
	selectedSet := make(map[uuid.UUID]bool, len(selectedIDs))
	for _, id := range selectedIDs {
		selectedSet[id] = true
	}

	for _, a := range q.Answers {
		if a.IsCorrect != selectedSet[a.ID] {
			return false
		}
	}
	return true
}

func generateToken(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func ptr[T any](v T) *T { return &v }

func HashPassword(password string) (string, error) {
	h, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(h), err
}

func CheckPassword(hash, password string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}
