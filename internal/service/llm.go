package service

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/tls"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/quizgen/quizgen/internal/config"
	"github.com/quizgen/quizgen/internal/models"
)

// LLMService wraps the LLM API for quiz generation.
type LLMService struct {
	cfg    config.LLMConfig
	client *http.Client

	gigaMu      sync.Mutex
	gigaToken   string
	gigaExpires time.Time
}

func NewLLMService(cfg config.LLMConfig) *LLMService {
	transport := &http.Transport{
		TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
	}
	return &LLMService{
		cfg: cfg,
		client: &http.Client{
			Timeout:   90 * time.Second,
			Transport: transport,
		},
	}
}

// RegenerateQuestion asks the LLM to produce a fresh question on the same topic,
// matching the same type and quiz context.
func (s *LLMService) RegenerateQuestion(ctx context.Context, quizCtx, oldQuestion string, qType models.QuestionType) (*models.GeneratedQuestion, error) {
	prompt := fmt.Sprintf(`You are an expert teacher. Generate ONE replacement quiz question.
Language: Russian. Type: %s.

Quiz context:
%s

You must AVOID this previous question (write a different one on the same topic):
%s

Rules:
- For "single" type: exactly 1 correct answer, 3 plausible distractors.
- For "multiple" type: 2-3 correct answers, 2-3 wrong ones.
- For "true_false" type: exactly 2 answers: "True" and "False".

RESPOND ONLY WITH VALID JSON (no markdown, no preamble):
{
  "text": "...",
  "type": "%s",
  "explanation": "...",
  "answers": [{"text":"...","is_correct":true}, ...]
}
`, qType, quizCtx, oldQuestion, qType)

	body, err := s.callAPI(ctx, prompt, 1500)
	if err != nil {
		return nil, err
	}
	body = sanitizeUTF8(body)
	body = strings.TrimSpace(body)
	body = stripCodeFences(body)
	body = extractJSONObject(body)
	body = stripTrailingCommas(body)

	var gq models.GeneratedQuestion
	if err := json.Unmarshal([]byte(body), &gq); err != nil {
		return nil, fmt.Errorf("parse regenerated question: %w; raw: %s", err, body)
	}
	if len(gq.Answers) == 0 {
		return nil, fmt.Errorf("regenerated question has no answers")
	}
	return &gq, nil
}

// GenerateQuiz calls the LLM and returns a structured quiz.
func (s *LLMService) GenerateQuiz(ctx context.Context, req *models.GenerateQuizRequest) (*models.GeneratedQuiz, error) {
	prompt := s.buildPrompt(req)

	// Масштабируем лимит токенов под число вопросов, иначе ответ обрезается
	// на середине JSON и парсинг падает (особенно при >10 вопросах).
	maxTokens := 2000 + req.QuestionCount*500

	body, err := s.callAPI(ctx, prompt, maxTokens)
	if err != nil {
		return nil, fmt.Errorf("llm call: %w", err)
	}

	quiz, err := parseGeneratedQuiz(body)
	if err != nil {
		return nil, fmt.Errorf("parse llm response: %w\nraw: %s", err, body)
	}
	return quiz, nil
}

// ── Prompt construction ───────────────────────────────────────────────────────

func (s *LLMService) buildPrompt(req *models.GenerateQuizRequest) string {
	types := req.QuestionTypes
	if len(types) == 0 {
		types = []models.QuestionType{models.QuestionTypeSingle, models.QuestionTypeMultiple}
	}
	typeStr := make([]string, len(types))
	for i, t := range types {
		typeStr[i] = string(t)
	}

	lang := req.Language
	if lang == "" {
		lang = "ru"
	}
	difficulty := req.Difficulty
	if difficulty == "" {
		difficulty = "mixed"
	}
	tone := req.Tone
	if tone == "" {
		tone = "neutral"
	}
	blooms := req.BloomsLevel
	if blooms == "" {
		blooms = "mixed"
	}

	hasSource := strings.TrimSpace(req.SourceText) != ""

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf(`You are an expert teacher creating a quiz for school students.
Write ALL content (title, questions, answers, explanations) STRICTLY in language: %s.

TASK: Generate a quiz with EXACTLY %d questions.

CONTEXT:
- Subject: %s
- Grade/Level: %s
- Topic: %s
- Question types to use: %s
- Difficulty: %s
- Tone of voice: %s
- Cognitive level (Bloom's taxonomy): %s

`, lang, req.QuestionCount, req.Subject, req.Grade, req.Topic, strings.Join(typeStr, ", "), difficulty, tone, blooms))

	if hasSource {
		text := req.SourceText
		if len(text) > 12000 {
			text = text[:12000] + "\n...[truncated]"
		}
		sb.WriteString(fmt.Sprintf(`SOURCE MATERIAL — THIS IS THE PRIMARY BASIS FOR THE QUIZ.
The teacher uploaded the document below. EVERY question, answer and distractor MUST be
derived from the facts, concepts and wording found in this material. Treat the Subject,
Grade and Topic above only as framing — the actual content comes from this document.
Do NOT invent facts that are absent from it; do NOT pull in outside knowledge that
contradicts or is unrelated to it. If the material is shorter than needed, stay within
its scope and rephrase rather than fabricate.
---
%s
---

`, text))
	}

	sb.WriteString(`INSTRUCTIONS:
1. Create pedagogically sound questions that test key facts, concepts, and reasoning.
2. For "single" type: exactly 1 correct answer, 3 plausible distractors based on COMMON STUDENT MISTAKES.
3. For "multiple" type: 2-3 correct answers, 2-3 wrong distractors.
4. For "true_false" type: exactly 2 answers: "True" and "False".
5. Distractors must be believable — typical errors, misconceptions, or close-but-wrong facts.
6. Add a brief explanation (1-2 sentences) for why the correct answer is right.
7. Respect requested difficulty (easy/medium/hard/mixed) and Bloom's cognitive level.
8. Respect tone of voice: "formal" — academic, "playful" — friendly, "neutral" — balanced.`)

	if hasSource {
		sb.WriteString("\n9. CRITICAL: base every question strictly on the SOURCE MATERIAL above. " +
			"Questions must be answerable from that document alone; distractors should reflect " +
			"misreadings of it, not unrelated trivia.")
	}

	sb.WriteString(`

RESPOND ONLY WITH VALID JSON in this exact schema — no markdown, no preamble:
{
  "title": "Quiz title here",
  "questions": [
    {
      "text": "Question text",
      "type": "single",
      "explanation": "Why correct answer is right",
      "answers": [
        {"text": "Correct answer", "is_correct": true},
        {"text": "Wrong answer 1", "is_correct": false},
        {"text": "Wrong answer 2", "is_correct": false},
        {"text": "Wrong answer 3", "is_correct": false}
      ]
    }
  ]
}`)

	return sb.String()
}

// ── API call structures ───────────────────────────────────────────────────────

type anthropicRequest struct {
	Model     string             `json:"model"`
	MaxTokens int                `json:"max_tokens"`
	Messages  []anthropicMessage `json:"messages"`
}

type anthropicMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type anthropicResponse struct {
	Content []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	} `json:"content"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}

type openAIRequest struct {
	Model       string          `json:"model"`
	Messages    []openAIMessage `json:"messages"`
	MaxTokens   int             `json:"max_tokens,omitempty"`
	Temperature float64         `json:"temperature,omitempty"`
}

type openAIMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type openAIResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}

func (s *LLMService) callAPI(ctx context.Context, prompt string, maxTokens int) (string, error) {
	provider := strings.ToLower(s.cfg.Provider)

	if maxTokens < 1024 {
		maxTokens = 1024
	}

	if provider == "gigachat" {
		return s.callGigaChat(ctx, prompt, clampTokens(maxTokens, 16384))
	}

	// Если выбран OpenAI/DeepSeek провайдер
	if provider == "openai" {
		reqBody := openAIRequest{
			Model:     s.cfg.Model,
			Messages:  []openAIMessage{{Role: "user", Content: prompt}},
			MaxTokens: clampTokens(maxTokens, 16384),
		}
		data, err := json.Marshal(reqBody)
		if err != nil {
			return "", err
		}

		url := strings.TrimRight(s.cfg.BaseURL, "/") + "/chat/completions"
		httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(data))
		if err != nil {
			return "", err
		}

		httpReq.Header.Set("Content-Type", "application/json")
		httpReq.Header.Set("Authorization", "Bearer "+s.cfg.APIKey)

		resp, err := s.client.Do(httpReq)
		if err != nil {
			return "", fmt.Errorf("http: %w", err)
		}
		defer resp.Body.Close()

		rawBody, err := io.ReadAll(resp.Body)
		if err != nil {
			return "", err
		}

		if resp.StatusCode != http.StatusOK {
			return "", fmt.Errorf("llm api status %d: %s", resp.StatusCode, string(rawBody))
		}

		var oar openAIResponse
		if err := json.Unmarshal(rawBody, &oar); err != nil {
			return "", fmt.Errorf("unmarshal api response: %w", err)
		}
		if oar.Error != nil {
			return "", fmt.Errorf("api error: %s", oar.Error.Message)
		}
		if len(oar.Choices) == 0 {
			return "", fmt.Errorf("empty choices in api response")
		}
		return oar.Choices[0].Message.Content, nil
	}

	// Дефолтная логика Anthropic Claude
	reqBody := anthropicRequest{
		Model:     s.cfg.Model,
		MaxTokens: clampTokens(maxTokens, 8192),
		Messages:  []anthropicMessage{{Role: "user", Content: prompt}},
	}

	data, err := json.Marshal(reqBody)
	if err != nil {
		return "", err
	}

	url := strings.TrimRight(s.cfg.BaseURL, "/") + "/v1/messages"
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(data))
	if err != nil {
		return "", err
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-api-key", s.cfg.APIKey)
	httpReq.Header.Set("anthropic-version", "2023-06-01")

	resp, err := s.client.Do(httpReq)
	if err != nil {
		return "", fmt.Errorf("http: %w", err)
	}
	defer resp.Body.Close()

	rawBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("llm api status %d: %s", resp.StatusCode, string(rawBody))
	}

	var ar anthropicResponse
	if err := json.Unmarshal(rawBody, &ar); err != nil {
		return "", fmt.Errorf("unmarshal api response: %w", err)
	}
	if ar.Error != nil {
		return "", fmt.Errorf("api error: %s", ar.Error.Message)
	}
	if len(ar.Content) == 0 {
		return "", fmt.Errorf("empty content in api response")
	}

	return ar.Content[0].Text, nil
}

// ── GigaChat ──────────────────────────────────────────────────────────────────

type gigaTokenResponse struct {
	AccessToken string `json:"access_token"`
	ExpiresAt   int64  `json:"expires_at"`
}

type gigaChatResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
}

func (s *LLMService) gigaScope() string {
	scope := strings.TrimSpace(s.cfg.Scope)
	if scope == "" {
		return "GIGACHAT_API_PERS"
	}
	return scope
}

func (s *LLMService) gigaModel() string {
	if s.cfg.Model == "" {
		return "GigaChat"
	}
	return s.cfg.Model
}

func (s *LLMService) gigaAuthURL() string {
	if s.cfg.BaseURL != "" && strings.Contains(s.cfg.BaseURL, "ngw.devices.sberbank.ru") {
		return strings.TrimRight(s.cfg.BaseURL, "/") + "/api/v2/oauth"
	}
	return "https://ngw.devices.sberbank.ru:9443/api/v2/oauth"
}

func (s *LLMService) gigaChatURL() string {
	if s.cfg.ChatURL != "" {
		return strings.TrimRight(s.cfg.ChatURL, "/") + "/chat/completions"
	}
	return "https://gigachat.devices.sberbank.ru/api/v1/chat/completions"
}

func newRqUID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	h := hex.EncodeToString(b)
	return fmt.Sprintf("%s-%s-%s-%s-%s", h[0:8], h[8:12], h[12:16], h[16:20], h[20:32])
}

func (s *LLMService) gigaToken_(ctx context.Context) (string, error) {
	s.gigaMu.Lock()
	defer s.gigaMu.Unlock()

	if s.gigaToken != "" && time.Now().Before(s.gigaExpires.Add(-30*time.Second)) {
		return s.gigaToken, nil
	}

	form := url.Values{}
	form.Set("scope", s.gigaScope())

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.gigaAuthURL(), strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("RqUID", newRqUID())
	req.Header.Set("Authorization", "Basic "+s.cfg.APIKey)

	resp, err := s.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("gigachat oauth: %w", err)
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("gigachat oauth status %d: %s", resp.StatusCode, string(raw))
	}

	var tr gigaTokenResponse
	if err := json.Unmarshal(raw, &tr); err != nil {
		return "", fmt.Errorf("gigachat oauth parse: %w", err)
	}
	if tr.AccessToken == "" {
		return "", fmt.Errorf("gigachat oauth: empty access_token")
	}

	s.gigaToken = tr.AccessToken
	// expires_at приходит в миллисекундах Unix
	if tr.ExpiresAt > 0 {
		s.gigaExpires = time.UnixMilli(tr.ExpiresAt)
	} else {
		s.gigaExpires = time.Now().Add(25 * time.Minute)
	}
	return s.gigaToken, nil
}

func (s *LLMService) callGigaChat(ctx context.Context, prompt string, maxTokens int) (string, error) {
	token, err := s.gigaToken_(ctx)
	if err != nil {
		return "", err
	}

	reqBody := openAIRequest{
		Model:       s.gigaModel(),
		Messages:    []openAIMessage{{Role: "user", Content: prompt}},
		MaxTokens:   maxTokens,
		Temperature: 0.3,
	}
	data, err := json.Marshal(reqBody)
	if err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.gigaChatURL(), bytes.NewReader(data))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := s.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("gigachat http: %w", err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	if resp.StatusCode == http.StatusUnauthorized {
		// Токен мог протухнуть — сбрасываем и пробуем еще раз.
		s.gigaMu.Lock()
		s.gigaToken = ""
		s.gigaExpires = time.Time{}
		s.gigaMu.Unlock()
	}
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("llm api status %d: %s", resp.StatusCode, string(raw))
	}

	var r gigaChatResponse
	if err := json.Unmarshal(raw, &r); err != nil {
		return "", fmt.Errorf("gigachat parse: %w", err)
	}
	if len(r.Choices) == 0 {
		return "", fmt.Errorf("gigachat empty choices")
	}
	return r.Choices[0].Message.Content, nil
}

// ── Response parsing ──────────────────────────────────────────────────────────

func parseGeneratedQuiz(raw string) (*models.GeneratedQuiz, error) {
	// LLM иногда отдаёт байты из Windows-1252 (0x97 = em-dash и т.п.),
	// которые Postgres отвергает как невалидный UTF-8. Чистим перед парсингом.
	raw = sanitizeUTF8(raw)
	raw = strings.TrimSpace(raw)
	raw = stripCodeFences(raw)
	// Отрезаем любую преамбулу/мусор до первой `{` и (по возможности)
	// после соответствующей `}` — это устраняет ошибки вида
	// «invalid character '/' looking for beginning of value».
	raw = extractJSONObject(raw)
	cleaned := stripTrailingCommas(raw)

	var quiz models.GeneratedQuiz
	if err := json.Unmarshal([]byte(cleaned), &quiz); err == nil && len(quiz.Questions) > 0 {
		return &quiz, nil
	}

	// Ответ мог быть обрезан по лимиту токенов (частый случай при большом
	// числе вопросов) — JSON невалиден целиком, но отдельные вопросы внутри
	// массива завершены. Спасаем все полностью разобранные вопросы.
	if salvaged := salvageQuiz(cleaned); salvaged != nil && len(salvaged.Questions) > 0 {
		return salvaged, nil
	}

	// Возвращаем осмысленную ошибку из обычного парсинга.
	if err := json.Unmarshal([]byte(cleaned), &quiz); err != nil {
		return nil, err
	}
	return nil, fmt.Errorf("no questions in generated quiz")
}

// salvageQuiz вытаскивает заголовок и все полностью завершённые объекты-вопросы
// из (возможно) усечённого JSON-ответа модели.
func salvageQuiz(raw string) *models.GeneratedQuiz {
	qi := strings.Index(raw, `"questions"`)
	if qi < 0 {
		return nil
	}
	br := strings.IndexByte(raw[qi:], '[')
	if br < 0 {
		return nil
	}
	objs := extractObjects(raw[qi+br+1:])

	quiz := &models.GeneratedQuiz{Title: extractStringField(raw, "title")}
	for _, o := range objs {
		var gq models.GeneratedQuestion
		if err := json.Unmarshal([]byte(stripTrailingCommas(o)), &gq); err == nil {
			if strings.TrimSpace(gq.Text) != "" && len(gq.Answers) > 0 {
				quiz.Questions = append(quiz.Questions, gq)
			}
		}
	}
	if len(quiz.Questions) == 0 {
		return nil
	}
	return quiz
}

// extractObjects собирает все верхнеуровневые объекты `{...}` из тела массива,
// корректно пропуская строки. Незакрытый (усечённый) последний объект отбрасывается.
func extractObjects(s string) []string {
	var objs []string
	depth, objStart := 0, -1
	inString, escape := false, false
	for i := 0; i < len(s); i++ {
		c := s[i]
		if inString {
			switch {
			case escape:
				escape = false
			case c == '\\':
				escape = true
			case c == '"':
				inString = false
			}
			continue
		}
		switch c {
		case '"':
			inString = true
		case '{':
			if depth == 0 {
				objStart = i
			}
			depth++
		case '}':
			depth--
			if depth == 0 && objStart >= 0 {
				objs = append(objs, s[objStart:i+1])
				objStart = -1
			}
		case ']':
			if depth == 0 {
				return objs // конец массива questions
			}
		}
	}
	return objs
}

// extractJSONObject обрезает строку до первой `{` и, если найден баланс скобок,
// до соответствующей закрывающей `}`. При усечении возвращает хвост от первой `{`.
func extractJSONObject(s string) string {
	start := strings.IndexByte(s, '{')
	if start < 0 {
		return s
	}
	depth := 0
	inString, escape := false, false
	for i := start; i < len(s); i++ {
		c := s[i]
		if inString {
			switch {
			case escape:
				escape = false
			case c == '\\':
				escape = true
			case c == '"':
				inString = false
			}
			continue
		}
		switch c {
		case '"':
			inString = true
		case '{':
			depth++
		case '}':
			depth--
			if depth == 0 {
				return s[start : i+1]
			}
		}
	}
	return s[start:]
}

// extractStringField извлекает значение строкового поля верхнего уровня (best-effort).
func extractStringField(s, key string) string {
	idx := strings.Index(s, `"`+key+`"`)
	if idx < 0 {
		return ""
	}
	rest := s[idx+len(key)+2:]
	if c := strings.IndexByte(rest, ':'); c >= 0 {
		rest = rest[c+1:]
	} else {
		return ""
	}
	q := strings.IndexByte(rest, '"')
	if q < 0 {
		return ""
	}
	rest = rest[q+1:]
	var b strings.Builder
	escape := false
	for i := 0; i < len(rest); i++ {
		ch := rest[i]
		if escape {
			b.WriteByte(ch)
			escape = false
			continue
		}
		if ch == '\\' {
			b.WriteByte(ch)
			escape = true
			continue
		}
		if ch == '"' {
			break
		}
		b.WriteByte(ch)
	}
	var out string
	if err := json.Unmarshal([]byte(`"`+b.String()+`"`), &out); err == nil {
		return out
	}
	return b.String()
}

// stripCodeFences снимает markdown-обёртку ```json ... ``` вокруг ответа.
func stripCodeFences(s string) string {
	s = strings.TrimSpace(s)
	s = strings.TrimPrefix(s, "```json")
	s = strings.TrimPrefix(s, "```JSON")
	s = strings.TrimPrefix(s, "```")
	s = strings.TrimSuffix(s, "```")
	return strings.TrimSpace(s)
}

// clampTokens ограничивает запрошенный лимит токенов сверху значением max.
func clampTokens(n, max int) int {
	if n > max {
		return max
	}
	return n
}

// stripTrailingCommas удаляет лишние запятые перед `}` или `]`,
// которые LLM часто оставляют в JSON. Запятые внутри строк не трогаются.
func stripTrailingCommas(s string) string {
	var b strings.Builder
	b.Grow(len(s))
	inString := false
	escape := false
	for i := 0; i < len(s); i++ {
		c := s[i]
		if inString {
			b.WriteByte(c)
			if escape {
				escape = false
			} else if c == '\\' {
				escape = true
			} else if c == '"' {
				inString = false
			}
			continue
		}
		if c == '"' {
			inString = true
			b.WriteByte(c)
			continue
		}
		if c == ',' {
			j := i + 1
			for j < len(s) && (s[j] == ' ' || s[j] == '\t' || s[j] == '\n' || s[j] == '\r') {
				j++
			}
			if j < len(s) && (s[j] == '}' || s[j] == ']') {
				continue // запятая лишняя — пропускаем
			}
		}
		b.WriteByte(c)
	}
	return b.String()
}

// sanitizeUTF8 переводит строку в валидный UTF-8 и пригодный для Postgres-полей вид:
// - байты Windows-1252 (0x80–0x9F) маппятся в Unicode-эквиваленты;
// - прочие невалидные байты отбрасываются;
// - NUL-байты (0x00) удаляются — Postgres не принимает их в text/varchar даже как валидный UTF-8.
func sanitizeUTF8(s string) string {
	if utf8.ValidString(s) && !strings.ContainsRune(s, 0) {
		return s
	}
	var b strings.Builder
	b.Grow(len(s))
	for i := 0; i < len(s); {
		if s[i] == 0 {
			i++
			continue
		}
		r, size := utf8.DecodeRuneInString(s[i:])
		if r == utf8.RuneError && size == 1 {
			if mapped, ok := windows1252Map[s[i]]; ok {
				b.WriteRune(mapped)
			}
			i++
			continue
		}
		b.WriteRune(r)
		i += size
	}
	return b.String()
}

// windows1252Map покрывает позиции 0x80–0x9F, где UTF-8 и Windows-1252 расходятся.
var windows1252Map = map[byte]rune{
	0x80: '€', 0x82: '‚', 0x83: 'ƒ', 0x84: '„',
	0x85: '…', 0x86: '†', 0x87: '‡', 0x88: 'ˆ',
	0x89: '‰', 0x8A: 'Š', 0x8B: '‹', 0x8C: 'Œ',
	0x8E: 'Ž', 0x91: '‘', 0x92: '’', 0x93: '“',
	0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—',
	0x98: '˜', 0x99: '™', 0x9A: 'š', 0x9B: '›',
	0x9C: 'œ', 0x9E: 'ž', 0x9F: 'Ÿ',
}
