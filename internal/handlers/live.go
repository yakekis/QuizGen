package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/quizgen/quizgen/internal/service"
)

// LiveHandler exposes the Kahoot-style synchronous group game. The host drives
// progression; players answer the same question at the same time. Real-time
// updates are delivered over Server-Sent Events (SSE).
type LiveHandler struct {
	hub     *service.LiveHub
	quizSvc *service.QuizService
}

func NewLiveHandler(hub *service.LiveHub, quizSvc *service.QuizService) *LiveHandler {
	return &LiveHandler{hub: hub, quizSvc: quizSvc}
}

// ── POST /api/quizzes/:id/live ── (teacher) create a live game from a quiz ──────
func (h *LiveHandler) CreateGame(c *gin.Context) {
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

	game, err := h.hub.CreateGame(quiz, quiz.Questions)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"pin":        game.PIN,
		"host_token": game.HostToken,
		"quiz_title": game.QuizTitle,
		"total":      len(game.Questions),
	})
}

// ── GET /api/live/:pin ── (public) lightweight info for the join screen ─────────
func (h *LiveHandler) Info(c *gin.Context) {
	game := h.hub.Get(c.Param("pin"))
	if game == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "game not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"pin":        game.PIN,
		"quiz_title": game.QuizTitle,
	})
}

// ── POST /api/live/:pin/join ── (public) player joins the lobby ─────────────────
func (h *LiveHandler) Join(c *gin.Context) {
	game := h.hub.Get(c.Param("pin"))
	if game == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "game not found"})
		return
	}

	var body struct {
		Name string `json:"name"`
	}
	_ = c.ShouldBindJSON(&body)
	name := strings.TrimSpace(body.Name)
	if n := len([]rune(name)); n < 2 || n > 20 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name must be 2–20 characters"})
		return
	}

	playerID, err := game.AddPlayer(name)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"player_id":  playerID,
		"pin":        game.PIN,
		"quiz_title": game.QuizTitle,
		"name":       name,
	})
}

// ── POST /api/live/:pin/answer ── (public) player submits one answer ────────────
func (h *LiveHandler) Answer(c *gin.Context) {
	game := h.hub.Get(c.Param("pin"))
	if game == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "game not found"})
		return
	}
	var body struct {
		PlayerID string `json:"player_id"`
		AnswerID string `json:"answer_id"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "bad request"})
		return
	}
	if err := game.SubmitAnswer(body.PlayerID, body.AnswerID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ── POST /api/live/:pin/{start,next,end} ── (host) ──────────────────────────────
func (h *LiveHandler) Start(c *gin.Context) { h.hostAction(c, "start") }
func (h *LiveHandler) Next(c *gin.Context)  { h.hostAction(c, "next") }
func (h *LiveHandler) End(c *gin.Context)   { h.hostAction(c, "end") }

func (h *LiveHandler) hostAction(c *gin.Context, action string) {
	game := h.hub.Get(c.Param("pin"))
	if game == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "game not found"})
		return
	}
	var body struct {
		HostToken string `json:"host_token"`
	}
	_ = c.ShouldBindJSON(&body)

	var err error
	switch action {
	case "start":
		err = game.Start(body.HostToken)
	case "next":
		err = game.Next(body.HostToken)
	case "end":
		err = game.End(body.HostToken)
	}
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ── GET /api/live/:pin/stream?player_id=… ── (public) player SSE feed ───────────
func (h *LiveHandler) PlayerStream(c *gin.Context) {
	game := h.hub.Get(c.Param("pin"))
	if game == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "game not found"})
		return
	}
	playerID := c.Query("player_id")
	ch, snapshot, ok := game.SubscribePlayer(playerID)
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "join the game first"})
		return
	}
	defer game.UnsubscribePlayer(playerID, ch)
	streamSSE(c, ch, snapshot)
}

// ── GET /api/live/:pin/host?host_token=… ── (host) SSE feed ─────────────────────
func (h *LiveHandler) HostStream(c *gin.Context) {
	game := h.hub.Get(c.Param("pin"))
	if game == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "game not found"})
		return
	}
	if c.Query("host_token") != game.HostToken {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not the host"})
		return
	}
	ch, snapshot := game.SubscribeHost()
	defer game.UnsubscribeHost(ch)
	streamSSE(c, ch, snapshot)
}

// streamSSE drives the long-lived SSE response: it sends an initial snapshot so
// (re)connecting clients sync immediately, then forwards events, with a periodic
// heartbeat comment to keep proxies from closing an idle connection.
func streamSSE(c *gin.Context, ch <-chan service.LiveEvent, snapshot service.LiveEvent) {
	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "streaming unsupported"})
		return
	}

	h := c.Writer.Header()
	h.Set("Content-Type", "text/event-stream")
	h.Set("Cache-Control", "no-cache")
	h.Set("Connection", "keep-alive")
	h.Set("X-Accel-Buffering", "no") // disable proxy buffering (nginx/cloudflared)
	c.Writer.WriteHeader(http.StatusOK)

	// Снимаем дедлайн записи именно для этого ответа: иначе server.WriteTimeout
	// (120 c) принудительно рвёт долгоживущий SSE-стрим, и игра «переподключается»
	// посреди раунда. Для обычных эндпоинтов таймаут остаётся в силе.
	rc := http.NewResponseController(c.Writer)
	_ = rc.SetWriteDeadline(time.Time{})

	writeEvent(c, flusher, snapshot)

	ctx := c.Request.Context()
	heartbeat := time.NewTicker(15 * time.Second)
	defer heartbeat.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case ev, open := <-ch:
			if !open {
				return
			}
			writeEvent(c, flusher, ev)
		case <-heartbeat.C:
			fmt.Fprint(c.Writer, ": ping\n\n")
			flusher.Flush()
		}
	}
}

func writeEvent(c *gin.Context, flusher http.Flusher, ev service.LiveEvent) {
	data, err := json.Marshal(ev.Data)
	if err != nil {
		return
	}
	fmt.Fprintf(c.Writer, "event: %s\ndata: %s\n\n", ev.Type, data)
	flusher.Flush()
}
