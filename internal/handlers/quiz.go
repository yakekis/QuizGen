package handlers

import (
	"encoding/csv"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

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

	maxBytes := int64(h.cfg.Upload.MaxSizeMB) << 20
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxBytes)

	if err := c.Request.ParseMultipartForm(maxBytes); err != nil {
		// Might be plain JSON
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

	for _, t := range c.PostFormArray("question_types") {
		req.QuestionTypes = append(req.QuestionTypes, models.QuestionType(t))
	}

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

	// body.Questions == nil — поле не прислали, вопросы не трогаем.
	// Пустой (но не nil) срез — редактор намеренно очистил все вопросы.
	if body.Questions != nil {
		if err := h.quizRepo.SaveQuestions(c.Request.Context(), quizID, body.Questions); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "updated"})
}

// ── POST /api/uploads/image ───────────────────────────────────────────────────
// Принимает картинку (multipart, поле "file") и возвращает её публичный URL.
// Файлы сохраняются в ./static/uploads и раздаются как /static/uploads/*.
func (h *QuizHandler) UploadImage(c *gin.Context) {
	maxBytes := int64(h.cfg.Upload.MaxSizeMB) << 20
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxBytes)

	file, _, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file is required"})
		return
	}
	defer file.Close()

	data, err := io.ReadAll(file)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "failed to read file"})
		return
	}

	// Определяем тип по содержимому, а не по расширению, которое легко подделать.
	ext, ok := imageExt(http.DetectContentType(data))
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported image type (allowed: jpeg, png, gif, webp)"})
		return
	}

	const uploadDir = "./static/uploads"
	if err := os.MkdirAll(uploadDir, 0o755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to prepare upload dir"})
		return
	}

	name := uuid.New().String() + ext
	if err := os.WriteFile(filepath.Join(uploadDir, name), data, 0o644); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save file"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"url": "/static/uploads/" + name})
}

// imageExt сопоставляет MIME-тип расширению; пустой второй результат — тип не поддержан.
func imageExt(contentType string) (string, bool) {
	switch contentType {
	case "image/jpeg":
		return ".jpg", true
	case "image/png":
		return ".png", true
	case "image/gif":
		return ".gif", true
	case "image/webp":
		return ".webp", true
	default:
		return "", false
	}
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

// ── POST /api/quizzes/:id/group-sessions ─────────────────────────────────────
func (h *QuizHandler) CreateGroupSession(c *gin.Context) {
	userID := mustUserID(c)
	quizID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid quiz id"})
		return
	}

	var req models.CreateGroupSessionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Генерируем код доступа, если не передан
	accessCode := req.AccessCode
	if accessCode == "" {
		accessCode = generateRandomCode(6)
	}

	now := time.Now()
	groupSession := &models.GroupQuizSession{
		QuizID:          quizID,
		CreatedBy:       userID,
		AccessCode:      accessCode,
		MaxParticipants: req.MaxParticipants,
		IsActive:        true,
		ShowLeaderboard: req.ShowLeaderboard,
	}

	if req.StartInMinutes > 0 {
		start := now.Add(time.Duration(req.StartInMinutes) * time.Minute)
		groupSession.StartTime = &start
	}
	if req.DurationMinutes > 0 {
		end := now.Add(time.Duration(req.StartInMinutes+req.DurationMinutes) * time.Minute)
		groupSession.EndTime = &end
	}

	if err := h.quizRepo.CreateGroupSession(c.Request.Context(), groupSession); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create group session"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"session_id":       groupSession.ID,
		"access_code":      groupSession.AccessCode,
		"start_time":       groupSession.StartTime,
		"end_time":         groupSession.EndTime,
		"join_url":         fmt.Sprintf("/group/%s", groupSession.AccessCode),
		"show_leaderboard": groupSession.ShowLeaderboard,
	})
}

// ── POST /api/group/:access_code/join ────────────────────────────────────────
func (h *QuizHandler) JoinGroupSession(c *gin.Context) {
	accessCode := strings.ToUpper(c.Param("access_code"))

	var req models.JoinGroupSessionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "enter your name"})
		return
	}

	groupSession, err := h.quizRepo.GetGroupSessionByCode(c.Request.Context(), accessCode)
	if err != nil || groupSession == nil || !groupSession.IsActive {
		c.JSON(http.StatusNotFound, gin.H{"error": "session not found or closed"})
		return
	}

	// Проверка: не началось ли ещё?
	if groupSession.StartTime != nil && time.Now().Before(*groupSession.StartTime) {
		c.JSON(http.StatusOK, gin.H{
			"status":     "waiting",
			"starts_in":  groupSession.StartTime.Sub(time.Now()).Seconds(),
			"session_id": groupSession.ID,
			"quiz_id":    groupSession.QuizID,
		})
		return
	}

	// Создаём персональную сессию ученика
	studentSession := &models.QuizSession{
		QuizID:         groupSession.QuizID,
		Mode:           models.ModeGroup,
		GroupSessionID: &groupSession.ID,
		StudentName:    req.StudentName,
		StartedAt:      ptr(time.Now()),
	}
	if err := h.quizRepo.CreateSession(c.Request.Context(), studentSession); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to join"})
		return
	}

	// Инициализируем запись в результатах
	_ = h.quizRepo.InitGroupResult(c.Request.Context(), groupSession.ID, req.StudentName)

	var endsIn *float64
	if groupSession.EndTime != nil {
		seconds := groupSession.EndTime.Sub(time.Now()).Seconds()
		endsIn = &seconds
	}

	c.JSON(http.StatusOK, gin.H{
		"status":           "started",
		"session_token":    studentSession.Token,
		"quiz_id":          groupSession.QuizID,
		"ends_in":          endsIn,
		"show_leaderboard": groupSession.ShowLeaderboard,
	})
}

// ── GET /api/group/:access_code/info ─────────────────────────────────────────
func (h *QuizHandler) GetGroupSessionInfo(c *gin.Context) {
	accessCode := strings.ToUpper(c.Param("access_code"))

	groupSession, err := h.quizRepo.GetGroupSessionByCode(c.Request.Context(), accessCode)
	if err != nil || groupSession == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "session not found"})
		return
	}

	quiz, _ := h.quizRepo.GetByID(c.Request.Context(), groupSession.QuizID)

	response := gin.H{
		"access_code":      groupSession.AccessCode,
		"quiz_title":       quiz.Title,
		"is_active":        groupSession.IsActive,
		"show_leaderboard": groupSession.ShowLeaderboard,
		"max_participants": groupSession.MaxParticipants,
	}

	if groupSession.StartTime != nil {
		response["start_time"] = groupSession.StartTime
		response["starts_in"] = groupSession.StartTime.Sub(time.Now()).Seconds()
	}
	if groupSession.EndTime != nil {
		response["end_time"] = groupSession.EndTime
		response["ends_in"] = groupSession.EndTime.Sub(time.Now()).Seconds()
	}

	c.JSON(http.StatusOK, response)
}

// ── GET /api/group/:access_code/leaderboard ──────────────────────────────────
func (h *QuizHandler) GetLeaderboard(c *gin.Context) {
	accessCode := strings.ToUpper(c.Param("access_code"))

	entries, err := h.quizRepo.GetGroupLeaderboard(c.Request.Context(), accessCode)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch leaderboard"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"updated_at": time.Now(),
		"entries":    entries,
	})
}

// ── POST /api/group/:access_code/finish ──────────────────────────────────────
func (h *QuizHandler) FinishGroupSession(c *gin.Context) {
	userID := mustUserID(c)
	accessCode := strings.ToUpper(c.Param("access_code"))

	groupSession, err := h.quizRepo.GetGroupSessionByCode(c.Request.Context(), accessCode)
	if err != nil || groupSession == nil || groupSession.CreatedBy != userID {
		c.JSON(http.StatusNotFound, gin.H{"error": "session not found or access denied"})
		return
	}

	if err := h.quizRepo.CloseGroupSession(c.Request.Context(), groupSession.ID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to close session"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "closed"})
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

	// Параметры квиза (лимит времени и попыток) нужны плееру для таймера
	// и кнопки «Пройти ещё раз».
	var timeLimit *int
	attemptLimit := 1
	attemptsUsed := 0
	if quiz, _ := h.quizRepo.GetByID(c.Request.Context(), session.QuizID); quiz != nil {
		timeLimit = quiz.TimeLimitSecs
		attemptLimit = quiz.AttemptLimit
		attemptsUsed = h.quizSvc.AttemptsUsed(c.Request.Context(), session.QuizID, session.StudentName)
	}

	c.JSON(http.StatusOK, gin.H{
		"session":         session,
		"questions":       questions,
		"time_limit_secs": timeLimit,
		"attempt_limit":   attemptLimit,
		"attempts_used":   attemptsUsed,
	})
}

// ── POST /api/sessions/:token/retry ───────────────────────────────────────────
// Создаёт новую попытку для того же ученика, если лимит попыток не исчерпан.
func (h *QuizHandler) RetryAttempt(c *gin.Context) {
	token := c.Param("token")
	session, err := h.quizSvc.RetryAttempt(c.Request.Context(), token)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, session)
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
		TimeSpentMs int      `json:"time_spent_ms"`
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

	if err := h.quizSvc.SubmitAnswer(c.Request.Context(), token, qID, selectedIDs, body.TimeSpentMs); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Если это групповая сессия — обновляем результат в топе
	_ = h.quizSvc.UpdateGroupResult(c.Request.Context(), token)

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ── POST /api/sessions/:token/tab-switch ─────────────────────────────────────
// «Режим честности»: фронтенд сообщает о каждом уходе с вкладки квиза.
func (h *QuizHandler) ReportTabSwitch(c *gin.Context) {
	token := c.Param("token")
	count, err := h.quizSvc.RecordTabSwitch(c.Request.Context(), token)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"tab_switches": count})
}

// ── POST /api/sessions/:token/finish ─────────────────────────────────────────
func (h *QuizHandler) FinishSession(c *gin.Context) {
	token := c.Param("token")
	session, err := h.quizSvc.FinishSession(c.Request.Context(), token)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Если это групповая сессия — финализируем результат в топе
	_ = h.quizSvc.FinalizeGroupResult(c.Request.Context(), token)

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
	c.Writer.Write([]byte{0xEF, 0xBB, 0xBF})
	w := csv.NewWriter(c.Writer)
	defer w.Flush()

	w.Write([]string{"Ученик", "Точность, %", "Верно", "Неверно", "Попытка", "Переключений вкладки", "Начато", "Завершено"})
	for _, s := range stats.Sessions {
		score := ""
		if s.Score != nil {
			score = fmt.Sprintf("%.0f", *s.Score*100)
		}
		incorrect := s.AnsweredCount - s.CorrectCount
		if incorrect < 0 {
			incorrect = 0
		}
		started := ""
		if s.StartedAt != nil {
			started = s.StartedAt.Format("2006-01-02 15:04:05")
		}
		finished := ""
		if s.FinishedAt != nil {
			finished = s.FinishedAt.Format("2006-01-02 15:04:05")
		}
		w.Write([]string{s.StudentName, score, strconv.Itoa(s.CorrectCount), strconv.Itoa(incorrect), strconv.Itoa(s.AttemptNum), strconv.Itoa(s.TabSwitches), started, finished})
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

func generateRandomCode(n int) string {
	const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
	b := make([]byte, n)
	for i := range b {
		b[i] = chars[time.Now().UnixNano()%int64(len(chars))]
	}
	return string(b)
}

func ptr[T any](v T) *T { return &v }
