package service

import (
	"crypto/rand"
	"errors"
	"math/big"
	"sort"
	"sync"
	"time"

	"github.com/quizgen/quizgen/internal/models"
)

// ── Live (Kahoot-style) group quiz ────────────────────────────────────────────
//
// A LiveGame is a synchronous, host-driven session held entirely in memory:
// the host shows a PIN on a big screen, players join with a nickname, then the
// host walks everyone through the same question at the same time. Faster correct
// answers earn more points. State lives in memory because a game is ephemeral
// (it exists only while the class is playing) and the deployment is single-node.

type GamePhase string

const (
	PhaseLobby    GamePhase = "lobby"
	PhaseQuestion GamePhase = "question"
	PhaseReveal   GamePhase = "reveal"
	PhaseEnded    GamePhase = "ended"
)

const (
	defaultQuestionSecs = 20
	maxPointsPerQuestion = 1000
	minPointsForCorrect  = 500
)

// LiveEvent is one Server-Sent Event pushed to a subscriber.
type LiveEvent struct {
	Type string         `json:"-"`
	Data map[string]any `json:"data"`
}

type liveAnswer struct {
	ID        string
	Text      string
	IsCorrect bool
}

type liveQuestion struct {
	ID        string
	Text      string
	Type      string
	TimeLimit int // seconds
	Answers   []liveAnswer
}

type livePlayer struct {
	ID          string
	Name        string
	Score       int
	Streak      int
	answered    bool   // answered the current question?
	answeredID  string // which answer was selected for current question
	lastGain    int    // points earned on the last revealed question
	lastCorrect bool
	subs        map[chan LiveEvent]struct{}
}

// LiveGame holds the full state of one running game. All access goes through mu.
type LiveGame struct {
	mu sync.Mutex

	PIN       string
	HostToken string
	QuizID    string
	QuizTitle string
	Questions []liveQuestion

	phase    GamePhase
	qIndex   int
	askedAt  time.Time
	deadline time.Time
	timer    *time.Timer
	gen      int // generation counter, guards stale timer callbacks

	players map[string]*livePlayer
	order   []string // player IDs in join order (stable)

	hostSubs  map[chan LiveEvent]struct{}
	createdAt time.Time
	lastTouch time.Time
}

// LiveHub owns all running games and prunes stale ones.
type LiveHub struct {
	mu    sync.Mutex
	games map[string]*LiveGame
}

func NewLiveHub() *LiveHub {
	h := &LiveHub{games: make(map[string]*LiveGame)}
	go h.janitor()
	return h
}

// janitor drops games that have been idle for over 4 hours so memory does not
// grow without bound across many class sessions.
func (h *LiveHub) janitor() {
	ticker := time.NewTicker(30 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		cutoff := time.Now().Add(-4 * time.Hour)
		h.mu.Lock()
		for pin, g := range h.games {
			g.mu.Lock()
			idle := g.lastTouch.Before(cutoff)
			g.mu.Unlock()
			if idle {
				delete(h.games, pin)
			}
		}
		h.mu.Unlock()
	}
}

// CreateGame builds a new in-memory game from a quiz and its questions.
func (h *LiveHub) CreateGame(quiz *models.Quiz, questions []models.Question) (*LiveGame, error) {
	if len(questions) == 0 {
		return nil, errors.New("quiz has no questions")
	}

	lqs := make([]liveQuestion, 0, len(questions))
	for _, q := range questions {
		lq := liveQuestion{
			ID:        q.ID.String(),
			Text:      q.Text,
			Type:      string(q.Type),
			TimeLimit: defaultQuestionSecs,
		}
		if q.TimeLimitSecs != nil && *q.TimeLimitSecs > 0 {
			lq.TimeLimit = *q.TimeLimitSecs
		}
		for _, a := range q.Answers {
			lq.Answers = append(lq.Answers, liveAnswer{
				ID:        a.ID.String(),
				Text:      a.Text,
				IsCorrect: a.IsCorrect,
			})
		}
		lqs = append(lqs, lq)
	}

	now := time.Now()
	g := &LiveGame{
		PIN:       h.uniquePIN(),
		HostToken: randHex(16),
		QuizID:    quiz.ID.String(),
		QuizTitle: quiz.Title,
		Questions: lqs,
		phase:     PhaseLobby,
		players:   make(map[string]*livePlayer),
		hostSubs:  make(map[chan LiveEvent]struct{}),
		createdAt: now,
		lastTouch: now,
	}

	h.mu.Lock()
	h.games[g.PIN] = g
	h.mu.Unlock()
	return g, nil
}

func (h *LiveHub) Get(pin string) *LiveGame {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.games[pin]
}

func (h *LiveHub) uniquePIN() string {
	for {
		pin := randDigits(6)
		h.mu.Lock()
		_, exists := h.games[pin]
		h.mu.Unlock()
		if !exists {
			return pin
		}
	}
}

// ── Player lifecycle ──────────────────────────────────────────────────────────

// AddPlayer registers a nickname and returns the new player's id. Names must be
// unique within a game (case-insensitive) so the leaderboard is unambiguous.
func (g *LiveGame) AddPlayer(name string) (string, error) {
	g.mu.Lock()
	defer g.mu.Unlock()

	if g.phase == PhaseEnded {
		return "", errors.New("game already finished")
	}
	for _, p := range g.players {
		if equalFold(p.Name, name) {
			return "", errors.New("this name is already taken")
		}
	}

	id := randHex(8)
	g.players[id] = &livePlayer{ID: id, Name: name, subs: make(map[chan LiveEvent]struct{})}
	g.order = append(g.order, id)
	g.touch()
	g.broadcastLobbyLocked()
	return id, nil
}

func (g *LiveGame) HasPlayer(id string) bool {
	g.mu.Lock()
	defer g.mu.Unlock()
	_, ok := g.players[id]
	return ok
}

// SubscribePlayer attaches a fresh channel to a player and returns the current
// game snapshot so a late joiner (or a reconnect) immediately sees live state.
func (g *LiveGame) SubscribePlayer(id string) (chan LiveEvent, LiveEvent, bool) {
	g.mu.Lock()
	defer g.mu.Unlock()
	p, ok := g.players[id]
	if !ok {
		return nil, LiveEvent{}, false
	}
	ch := make(chan LiveEvent, 32)
	p.subs[ch] = struct{}{}
	g.touch()
	return ch, g.snapshotForPlayerLocked(p), true
}

func (g *LiveGame) UnsubscribePlayer(id string, ch chan LiveEvent) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if p, ok := g.players[id]; ok {
		delete(p.subs, ch)
	}
}

func (g *LiveGame) SubscribeHost() (chan LiveEvent, LiveEvent) {
	g.mu.Lock()
	defer g.mu.Unlock()
	ch := make(chan LiveEvent, 32)
	g.hostSubs[ch] = struct{}{}
	g.touch()
	return ch, g.snapshotForHostLocked()
}

func (g *LiveGame) UnsubscribeHost(ch chan LiveEvent) {
	g.mu.Lock()
	defer g.mu.Unlock()
	delete(g.hostSubs, ch)
}

// ── Host controls ──────────────────────────────────────────────────────────────

func (g *LiveGame) Start(hostToken string) error {
	g.mu.Lock()
	defer g.mu.Unlock()
	if hostToken != g.HostToken {
		return errors.New("not the host")
	}
	if g.phase != PhaseLobby {
		return errors.New("game already started")
	}
	if len(g.players) == 0 {
		return errors.New("no players have joined yet")
	}
	g.qIndex = 0
	g.askQuestionLocked()
	return nil
}

// Next is context-aware: during a question it forces the reveal early; during a
// reveal it advances to the next question (or ends the game). This mirrors the
// host pressing "Next" on the Kahoot host screen.
func (g *LiveGame) Next(hostToken string) error {
	g.mu.Lock()
	defer g.mu.Unlock()
	if hostToken != g.HostToken {
		return errors.New("not the host")
	}
	switch g.phase {
	case PhaseQuestion:
		g.revealLocked()
	case PhaseReveal:
		if g.qIndex+1 >= len(g.Questions) {
			g.finishLocked()
		} else {
			g.qIndex++
			g.askQuestionLocked()
		}
	default:
		return errors.New("nothing to advance")
	}
	return nil
}

func (g *LiveGame) End(hostToken string) error {
	g.mu.Lock()
	defer g.mu.Unlock()
	if hostToken != g.HostToken {
		return errors.New("not the host")
	}
	g.finishLocked()
	return nil
}

// SubmitAnswer records a player's choice for the current question and awards
// speed-scaled points for a correct tap. One answer per question, no changes.
func (g *LiveGame) SubmitAnswer(playerID, answerID string) error {
	g.mu.Lock()
	defer g.mu.Unlock()

	if g.phase != PhaseQuestion {
		return errors.New("not accepting answers right now")
	}
	p, ok := g.players[playerID]
	if !ok {
		return errors.New("player not in game")
	}
	if p.answered {
		return errors.New("already answered")
	}

	q := g.Questions[g.qIndex]
	var chosen *liveAnswer
	for i := range q.Answers {
		if q.Answers[i].ID == answerID {
			chosen = &q.Answers[i]
			break
		}
	}
	if chosen == nil {
		return errors.New("unknown answer")
	}

	now := time.Now()
	p.answered = true
	p.answeredID = answerID
	if chosen.IsCorrect {
		remaining := g.deadline.Sub(now).Seconds()
		limit := float64(q.TimeLimit)
		frac := 0.0
		if limit > 0 {
			frac = remaining / limit
		}
		if frac < 0 {
			frac = 0
		} else if frac > 1 {
			frac = 1
		}
		gain := minPointsForCorrect + int(float64(maxPointsPerQuestion-minPointsForCorrect)*frac)
		p.Score += gain
		p.lastGain = gain
		p.lastCorrect = true
		p.Streak++
	} else {
		p.lastGain = 0
		p.lastCorrect = false
		p.Streak = 0
	}
	g.touch()

	// Tell the host how many have answered.
	g.broadcastHostLocked(LiveEvent{Type: "answers", Data: map[string]any{
		"answered": g.answeredCountLocked(),
		"total":    len(g.players),
	}})

	// Ответили все — раскрываем правильный ответ; иначе показываем тем, кто уже
	// ответил, текущую таблицу лидеров, пока ждём остальных.
	if g.answeredCountLocked() >= len(g.players) {
		g.revealLocked()
	} else {
		g.broadcastWaitingLocked()
	}
	return nil
}

// ── Phase transitions (caller must hold g.mu) ───────────────────────────────────

func (g *LiveGame) askQuestionLocked() {
	q := g.Questions[g.qIndex]
	for _, p := range g.players {
		p.answered = false
		p.answeredID = ""
	}
	g.phase = PhaseQuestion
	g.askedAt = time.Now()
	g.deadline = g.askedAt.Add(time.Duration(q.TimeLimit) * time.Second)
	g.gen++
	gen := g.gen

	if g.timer != nil {
		g.timer.Stop()
	}
	g.timer = time.AfterFunc(time.Duration(q.TimeLimit)*time.Second, func() {
		g.mu.Lock()
		defer g.mu.Unlock()
		if g.gen == gen && g.phase == PhaseQuestion {
			g.revealLocked()
		}
	})

	payload := g.questionPayloadLocked(false)
	g.broadcastAllLocked(LiveEvent{Type: "question", Data: payload})
	// Host gets the same question plus the correct answer to display.
	g.broadcastHostLocked(LiveEvent{Type: "question", Data: g.questionPayloadLocked(true)})
}

func (g *LiveGame) revealLocked() {
	if g.timer != nil {
		g.timer.Stop()
	}
	g.gen++
	g.phase = PhaseReveal

	q := g.Questions[g.qIndex]
	correctIDs := []string{}
	dist := map[string]int{}
	for _, a := range q.Answers {
		dist[a.ID] = 0
		if a.IsCorrect {
			correctIDs = append(correctIDs, a.ID)
		}
	}
	for _, p := range g.players {
		if p.answeredID != "" {
			dist[p.answeredID]++
		}
	}

	options := make([]map[string]any, 0, len(q.Answers))
	for _, a := range q.Answers {
		options = append(options, map[string]any{
			"id": a.ID, "text": a.Text, "is_correct": a.IsCorrect, "count": dist[a.ID],
		})
	}
	leaderboard := g.leaderboardLocked(10)
	isLast := g.qIndex+1 >= len(g.Questions)

	base := map[string]any{
		"index":        g.qIndex,
		"total":        len(g.Questions),
		"correct_ids":  correctIDs,
		"options":      options,
		"leaderboard":  leaderboard,
		"is_last":      isLast,
	}

	// Host reveal: shared payload + answered count.
	hostData := cloneMap(base)
	hostData["answered"] = g.answeredCountLocked()
	g.broadcastHostLocked(LiveEvent{Type: "reveal", Data: hostData})

	// Each player gets the shared payload plus their personal result and rank.
	ranks := g.rankMapLocked()
	for _, p := range g.players {
		pd := cloneMap(base)
		pd["you"] = map[string]any{
			"correct":     p.lastCorrect,
			"points":      p.lastGain,
			"total_score": p.Score,
			"rank":        ranks[p.ID],
			"streak":      p.Streak,
		}
		g.sendToPlayerLocked(p, LiveEvent{Type: "reveal", Data: pd})
	}
	g.touch()
}

func (g *LiveGame) finishLocked() {
	if g.timer != nil {
		g.timer.Stop()
	}
	g.gen++
	g.phase = PhaseEnded

	podium := g.leaderboardLocked(50)
	g.broadcastHostLocked(LiveEvent{Type: "game_over", Data: map[string]any{"podium": podium}})

	ranks := g.rankMapLocked()
	for _, p := range g.players {
		pd := map[string]any{
			"podium": podium,
			"you": map[string]any{
				"rank":        ranks[p.ID],
				"total_score": p.Score,
				"name":        p.Name,
			},
		}
		g.sendToPlayerLocked(p, LiveEvent{Type: "game_over", Data: pd})
	}
	g.touch()
}

// ── Snapshots & payloads (caller must hold g.mu) ────────────────────────────────

func (g *LiveGame) snapshotForPlayerLocked(p *livePlayer) LiveEvent {
	switch g.phase {
	case PhaseQuestion:
		// Уже ответившему игроку при реконнекте показываем экран ожидания
		// с таблицей лидеров, остальным — сам вопрос.
		if p.answered {
			return LiveEvent{Type: "waiting", Data: g.waitingDataLocked(p)}
		}
		data := g.questionPayloadLocked(false)
		data["answered"] = p.answered
		return LiveEvent{Type: "question", Data: data}
	case PhaseReveal, PhaseEnded:
		// Re-emit the most recent meaningful state for reconnecting players.
		if g.phase == PhaseEnded {
			ranks := g.rankMapLocked()
			return LiveEvent{Type: "game_over", Data: map[string]any{
				"podium": g.leaderboardLocked(50),
				"you":    map[string]any{"rank": ranks[p.ID], "total_score": p.Score, "name": p.Name},
			}}
		}
		return LiveEvent{Type: "lobby", Data: g.lobbyDataLocked()}
	default:
		return LiveEvent{Type: "lobby", Data: g.lobbyDataLocked()}
	}
}

func (g *LiveGame) snapshotForHostLocked() LiveEvent {
	switch g.phase {
	case PhaseQuestion:
		data := g.questionPayloadLocked(true)
		data["answered"] = g.answeredCountLocked()
		return LiveEvent{Type: "question", Data: data}
	case PhaseEnded:
		return LiveEvent{Type: "game_over", Data: map[string]any{"podium": g.leaderboardLocked(50)}}
	default:
		return LiveEvent{Type: "lobby", Data: g.lobbyDataLocked()}
	}
}

func (g *LiveGame) lobbyDataLocked() map[string]any {
	names := make([]string, 0, len(g.order))
	for _, id := range g.order {
		if p, ok := g.players[id]; ok {
			names = append(names, p.Name)
		}
	}
	return map[string]any{
		"pin":        g.PIN,
		"quiz_title": g.QuizTitle,
		"players":    names,
		"count":      len(names),
		"total":      len(g.Questions),
	}
}

func (g *LiveGame) questionPayloadLocked(forHost bool) map[string]any {
	q := g.Questions[g.qIndex]
	options := make([]map[string]any, 0, len(q.Answers))
	for _, a := range q.Answers {
		opt := map[string]any{"id": a.ID, "text": a.Text}
		if forHost {
			opt["is_correct"] = a.IsCorrect
		}
		options = append(options, opt)
	}
	return map[string]any{
		"index":         g.qIndex,
		"total":         len(g.Questions),
		"text":          q.Text,
		"type":          q.Type,
		"time_limit":    q.TimeLimit,
		"deadline_unix": g.deadline.UnixMilli(),
		"options":       options,
	}
}

func (g *LiveGame) leaderboardLocked(limit int) []map[string]any {
	type row struct {
		name  string
		score int
	}
	rows := make([]row, 0, len(g.players))
	for _, p := range g.players {
		rows = append(rows, row{p.Name, p.Score})
	}
	sort.Slice(rows, func(i, j int) bool {
		if rows[i].score != rows[j].score {
			return rows[i].score > rows[j].score
		}
		return rows[i].name < rows[j].name
	})
	out := make([]map[string]any, 0, len(rows))
	for i, r := range rows {
		if i >= limit {
			break
		}
		out = append(out, map[string]any{"rank": i + 1, "name": r.name, "score": r.score})
	}
	return out
}

func (g *LiveGame) rankMapLocked() map[string]int {
	type row struct {
		id    string
		score int
		name  string
	}
	rows := make([]row, 0, len(g.players))
	for _, p := range g.players {
		rows = append(rows, row{p.ID, p.Score, p.Name})
	}
	sort.Slice(rows, func(i, j int) bool {
		if rows[i].score != rows[j].score {
			return rows[i].score > rows[j].score
		}
		return rows[i].name < rows[j].name
	})
	m := make(map[string]int, len(rows))
	for i, r := range rows {
		m[r.id] = i + 1
	}
	return m
}

func (g *LiveGame) answeredCountLocked() int {
	n := 0
	for _, p := range g.players {
		if p.answered {
			n++
		}
	}
	return n
}

// waitingDataLocked — данные экрана ожидания для уже ответившего игрока:
// текущая таблица лидеров и его место, пока остальные ещё отвечают.
func (g *LiveGame) waitingDataLocked(p *livePlayer) map[string]any {
	ranks := g.rankMapLocked()
	return map[string]any{
		"answered":    g.answeredCountLocked(),
		"total":       len(g.players),
		"leaderboard": g.leaderboardLocked(10),
		"you":         map[string]any{"rank": ranks[p.ID], "total_score": p.Score},
	}
}

// broadcastWaitingLocked рассылает обновлённую таблицу лидеров всем, кто уже
// ответил на текущий вопрос (счёт меняется по мере ответов остальных).
func (g *LiveGame) broadcastWaitingLocked() {
	for _, p := range g.players {
		if !p.answered {
			continue
		}
		g.sendToPlayerLocked(p, LiveEvent{Type: "waiting", Data: g.waitingDataLocked(p)})
	}
}

// ── Broadcasting (caller must hold g.mu) ────────────────────────────────────────

func (g *LiveGame) broadcastAllLocked(ev LiveEvent) {
	for _, p := range g.players {
		g.sendToPlayerLocked(p, ev)
	}
}

func (g *LiveGame) broadcastLobbyLocked() {
	ev := LiveEvent{Type: "lobby", Data: g.lobbyDataLocked()}
	g.broadcastAllLocked(ev)
	g.broadcastHostLocked(ev)
}

func (g *LiveGame) broadcastHostLocked(ev LiveEvent) {
	for ch := range g.hostSubs {
		trySend(ch, ev)
	}
}

func (g *LiveGame) sendToPlayerLocked(p *livePlayer, ev LiveEvent) {
	for ch := range p.subs {
		trySend(ch, ev)
	}
}

func (g *LiveGame) touch() { g.lastTouch = time.Now() }

// trySend never blocks the game loop: if a slow subscriber's buffer is full we
// drop the event rather than stall every other player.
func trySend(ch chan LiveEvent, ev LiveEvent) {
	select {
	case ch <- ev:
	default:
	}
}

// ── small helpers ───────────────────────────────────────────────────────────────

func cloneMap(m map[string]any) map[string]any {
	out := make(map[string]any, len(m)+2)
	for k, v := range m {
		out[k] = v
	}
	return out
}

// equalFold compares names case-insensitively for ASCII and Cyrillic.
func equalFold(a, b string) bool {
	ra, rb := []rune(a), []rune(b)
	if len(ra) != len(rb) {
		return false
	}
	for i := range ra {
		if toLowerRune(ra[i]) != toLowerRune(rb[i]) {
			return false
		}
	}
	return true
}

func toLowerRune(r rune) rune {
	switch {
	case r >= 'A' && r <= 'Z':
		return r + ('a' - 'A')
	case r >= 'А' && r <= 'Я':
		return r + ('а' - 'А')
	case r == 'Ё':
		return 'ё'
	}
	return r
}

func randDigits(n int) string {
	const digits = "0123456789"
	b := make([]byte, n)
	for i := range b {
		idx, err := rand.Int(rand.Reader, big.NewInt(int64(len(digits))))
		if err != nil {
			b[i] = digits[time.Now().UnixNano()%int64(len(digits))]
			continue
		}
		b[i] = digits[idx.Int64()]
	}
	return string(b)
}

func randHex(n int) string {
	const hexChars = "0123456789abcdef"
	b := make([]byte, n*2)
	for i := range b {
		idx, err := rand.Int(rand.Reader, big.NewInt(16))
		if err != nil {
			b[i] = hexChars[time.Now().UnixNano()%16]
			continue
		}
		b[i] = hexChars[idx.Int64()]
	}
	return string(b)
}
