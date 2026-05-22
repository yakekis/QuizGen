package handlers

import (
	"encoding/csv"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/quizgen/quizgen/internal/config"
	"github.com/quizgen/quizgen/internal/models"
	"github.com/quizgen/quizgen/internal/parser"
	"github.com/quizgen/quizgen/internal/repository"
	"github.com/quizgen/quizgen/internal/service"
)

type QuizHandler struct {
	quizSvc  *service.QuizService
	quizRepo *repository.QuizRepository
	cfg      *config.Config
}

func NewQuizHandler(quizSvc *service.QuizService, quizRepo *repository.QuizRepository, cfg *config.Config) *QuizHandler {
	return &QuizHandler{quizSvc: quizSvc, quizRepo: quizRepo, cfg: cfg}
}

// ── POST /api/quizzes/generate ────────────────────────────────────────────────

func (h *QuizHandler) Generate(c *gin.Context) {
	userID := mustUserID(c)

	// Parse multipart form (optional file upload + JSON fields)
	maxBytes := int64(h.cfg.Upload.MaxSizeMB) << 20
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxBytes)

	if err := c.Request.ParseMultipartForm(maxBytes); err != nil {
		// Might be plain JSON — try that
	}

	req := &models.GenerateQuizRequest{
		Subject:      c.PostForm("subject"),
		Grade:        c.PostForm("grade"),
		Topic:        c.PostForm("topic"),
		AttemptLimit: atoi(c.PostForm("attempt_limit"), 1),
		Difficulty:   c.PostForm("difficulty"),
		Tone:         c.PostForm("tone"),
		Language:     c.PostForm("language"),
		BloomsLevel:  c.PostForm("blooms_level"),
	}

	if cnt := c.PostForm("question_count"); cnt != "" {
		req.QuestionCount = atoi(cnt, 10)
	} else {
		req.QuestionCount = 10
	}

	if tl := c.PostForm("time_limit_secs"); tl != "" {
		v := atoi(tl, 0)
		req.TimeLimitSecs = &v
	}

	// Parse question types
	for _, t := range c.PostFormArray("question_types") {
		req.QuestionTypes = append(req.QuestionTypes, models.QuestionType(t))
	}

	// Handle optional file upload
	file, header, err := c.Request.FormFile("file")
	if err == nil {
		defer file.Close()
		data, err := io.ReadAll(file)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "failed to read file"})
			return
		}
		text, err := parser.ExtractText(header.Filename, data)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("file parsing: %v", err)})
			return
		}
		req.SourceText = text
	}

	// Fallback: plain JSON body (no file)
	if req.Subject == "" {
		var jsonReq models.GenerateQuizRequest
		if err := c.ShouldBindJSON(&jsonReq); err == nil {
			req = &jsonReq
		}
	}

	if req.Subject == "" || req.Grade == "" || req.Topic == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "subject, grade and topic are required"})
		return
	}

	quiz, err := h.quizSvc.Generate(c.Request.Context(), userID, req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, quiz)
}

// ── GET /api/quizzes ──────────────────────────────────────────────────────────

func (h *QuizHandler) List(c *gin.Context) {
	userID := mustUserID(c)
	quizzes, err := h.quizRepo.ListByUser(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"quizzes": quizzes})
}

// ── GET /api/quizzes/:id ──────────────────────────────────────────────────────

func (h *QuizHandler) Get(c *gin.Context) {
	userID := mustUserID(c)
	quizID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid quiz id"})
		return
	}

	quiz, err := h.quizSvc.GetFull(c.Request.Context(), quizID, userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, quiz)
}

// ── PUT /api/quizzes/:id ──────────────────────────────────────────────────────

func (h *QuizHandler) Update(c *gin.Context) {
	userID := mustUserID(c)
	quizID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid quiz id"})
		return
	}

	var body models.Quiz
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	body.ID = quizID
	body.UserID = userID

	if err := h.quizRepo.Update(c.Request.Context(), &body); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Save questions if provided
	if len(body.Questions) > 0 {
		if err := h.quizRepo.SaveQuestions(c.Request.Context(), quizID, body.Questions); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "updated"})
}

// ── DELETE /api/quizzes/:id ───────────────────────────────────────────────────

func (h *QuizHandler) Delete(c *gin.Context) {
	userID := mustUserID(c)
	quizID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid quiz id"})
		return
	}
	if err := h.quizRepo.Delete(c.Request.Context(), quizID, userID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}

// ── POST /api/quizzes/:id/publish ────────────────────────────────────────────

func (h *QuizHandler) Publish(c *gin.Context) {
	userID := mustUserID(c)
	quizID, _ := uuid.Parse(c.Param("id"))

	quiz, err := h.quizRepo.GetByID(c.Request.Context(), quizID)
	if err != nil || quiz == nil || quiz.UserID != userID {
		c.JSON(http.StatusNotFound, gin.H{"error": "quiz not found"})
		return
	}
	quiz.Status = models.QuizStatusPublished
	if err := h.quizRepo.Update(c.Request.Context(), quiz); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "published"})
}

// ── POST /api/quizzes/:id/sessions ───────────────────────────────────────────

func (h *QuizHandler) CreateSession(c *gin.Context) {
	quizID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid quiz id"})
		return
	}

	var body struct {
		StudentName string `json:"student_name"`
	}
	_ = c.ShouldBindJSON(&body)

	session, err := h.quizSvc.CreatePersonalLink(c.Request.Context(), quizID, body.StudentName)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{
		"session": session,
		"link":    fmt.Sprintf("/play/%s", session.Token),
	})
}

// ── GET /api/sessions/:token ──────────────────────────────────────────────────

func (h *QuizHandler) GetSession(c *gin.Context) {
	token := c.Param("token")
	session, err := h.quizRepo.GetSessionByToken(c.Request.Context(), token)
	if err != nil || session == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "session not found"})
		return
	}

	questions, err := h.quizRepo.GetQuestions(c.Request.Context(), session.QuizID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Hide is_correct from student view
	for i := range questions {
		for j := range questions[i].Answers {
			questions[i].Answers[j].IsCorrect = false
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"session":   session,
		"questions": questions,
	})
}

// ── POST /api/quizzes/:id/questions/:qid/regenerate ──────────────────────────

func (h *QuizHandler) RegenerateQuestion(c *gin.Context) {
	userID := mustUserID(c)
	quizID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid quiz id"})
		return
	}
	qID, err := uuid.Parse(c.Param("qid"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid question id"})
		return
	}
	newQ, err := h.quizSvc.RegenerateQuestion(c.Request.Context(), quizID, qID, userID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, newQ)
}

// ── POST /api/sessions/:token/identify ───────────────────────────────────────

func (h *QuizHandler) IdentifySession(c *gin.Context) {
	token := c.Param("token")

	var body struct {
		Name string `json:"name" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name is required"})
		return
	}
	name := strings.TrimSpace(body.Name)
	if name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name is required"})
		return
	}

	session, err := h.quizRepo.IdentifySession(c.Request.Context(), token, name)
	if err != nil || session == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "session not found"})
		return
	}
	c.JSON(http.StatusOK, session)
}

// ── POST /api/sessions/:token/answers ────────────────────────────────────────

func (h *QuizHandler) SubmitAnswer(c *gin.Context) {
	token := c.Param("token")

	var body struct {
		QuestionID  string   `json:"question_id" binding:"required"`
		SelectedIDs []string `json:"selected_answer_ids" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	qID, err := uuid.Parse(body.QuestionID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid question_id"})
		return
	}

	selectedIDs := make([]uuid.UUID, 0, len(body.SelectedIDs))
	for _, s := range body.SelectedIDs {
		id, err := uuid.Parse(s)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid answer id: " + s})
			return
		}
		selectedIDs = append(selectedIDs, id)
	}

	if err := h.quizSvc.SubmitAnswer(c.Request.Context(), token, qID, selectedIDs); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ── POST /api/sessions/:token/finish ─────────────────────────────────────────

func (h *QuizHandler) FinishSession(c *gin.Context) {
	token := c.Param("token")
	session, err := h.quizSvc.FinishSession(c.Request.Context(), token)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, session)
}

// ── GET /api/quizzes/:id/sessions/:sessionId ─────────────────────────────────

func (h *QuizHandler) SessionDetails(c *gin.Context) {
	userID := mustUserID(c)
	quizID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid quiz id"})
		return
	}
	sessionID, err := uuid.Parse(c.Param("sessionId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid session id"})
		return
	}

	quiz, err := h.quizRepo.GetByID(c.Request.Context(), quizID)
	if err != nil || quiz == nil || quiz.UserID != userID {
		c.JSON(http.StatusNotFound, gin.H{"error": "quiz not found"})
		return
	}

	session, err := h.quizRepo.GetSessionByID(c.Request.Context(), sessionID)
	if err != nil || session == nil || session.QuizID != quizID {
		c.JSON(http.StatusNotFound, gin.H{"error": "session not found"})
		return
	}

	questions, err := h.quizRepo.GetQuestions(c.Request.Context(), quizID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	answers, err := h.quizRepo.GetSessionAnswers(c.Request.Context(), sessionID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"session":   session,
		"questions": questions,
		"answers":   answers,
	})
}

// ── GET /api/quizzes/:id/stats.csv ───────────────────────────────────────────

func (h *QuizHandler) StatsCSV(c *gin.Context) {
	userID := mustUserID(c)
	quizID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid quiz id"})
		return
	}
	stats, err := h.quizRepo.GetStats(c.Request.Context(), quizID, userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", `attachment; filename="quiz-stats.csv"`)
	// UTF-8 BOM for Excel
	c.Writer.Write([]byte{0xEF, 0xBB, 0xBF})
	w := csv.NewWriter(c.Writer)
	defer w.Flush()

	w.Write([]string{"Ученик", "Балл, %", "Попытка", "Начато", "Завершено"})
	for _, s := range stats.Sessions {
		score := ""
		if s.Score != nil {
			score = fmt.Sprintf("%.0f", *s.Score*100)
		}
		started := ""
		if s.StartedAt != nil {
			started = s.StartedAt.Format("2006-01-02 15:04:05")
		}
		finished := ""
		if s.FinishedAt != nil {
			finished = s.FinishedAt.Format("2006-01-02 15:04:05")
		}
		w.Write([]string{s.StudentName, score, strconv.Itoa(s.AttemptNum), started, finished})
	}
}

// ── GET /api/quizzes/:id/stats ────────────────────────────────────────────────

func (h *QuizHandler) Stats(c *gin.Context) {
	userID := mustUserID(c)
	quizID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid quiz id"})
		return
	}

	stats, err := h.quizRepo.GetStats(c.Request.Context(), quizID, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, stats)
}

// ── helpers ───────────────────────────────────────────────────────────────────

func mustUserID(c *gin.Context) uuid.UUID {
	return c.MustGet("user_id").(uuid.UUID)
}

func atoi(s string, def int) int {
	if v, err := strconv.Atoi(s); err == nil {
		return v
	}
	return def
}
