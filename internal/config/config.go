package config

import (
	"fmt"
	"os"
	"strconv"
	"time"

	"github.com/joho/godotenv"
)

// Config holds all application configuration loaded from environment.
type Config struct {
	App       AppConfig
	DB        DBConfig
	LLM       LLMConfig
	RateLimit RateLimitConfig
	Upload    UploadConfig
	Session   SessionConfig
}

type AppConfig struct {
	Env       string
	Port      string
	SecretKey string
}

type DBConfig struct {
	Host     string
	Port     string
	User     string
	Password string
	Name     string
	SSLMode  string
}

func (d DBConfig) DSN() string {
	return fmt.Sprintf(
		"postgres://%s:%s@%s:%s/%s?sslmode=%s",
		d.User, d.Password, d.Host, d.Port, d.Name, d.SSLMode,
	)
}

type LLMConfig struct {
	Provider string
	APIKey   string
	Model    string
	BaseURL  string
	// Scope используется только для GigaChat: GIGACHAT_API_PERS | GIGACHAT_API_B2B | GIGACHAT_API_CORP
	Scope string
	// ChatURL используется только для GigaChat — отдельный хост для /chat/completions.
	ChatURL string
}

type RateLimitConfig struct {
	Requests      int
	WindowSeconds int
	Window        time.Duration
}

type UploadConfig struct {
	MaxSizeMB int
	Dir       string
}

type SessionConfig struct {
	TTL time.Duration
}

// Load reads .env (if present) then environment variables.
func Load() (*Config, error) {
	// Best-effort: load .env file (ignored in production where env is set externally)
	_ = godotenv.Load()

	cfg := &Config{
		App: AppConfig{
			Env:       getEnv("APP_ENV", "development"),
			Port:      getEnv("APP_PORT", "8080"),
			SecretKey: getEnv("APP_SECRET_KEY", "change-me-please-32-characters!!"),
		},
		DB: DBConfig{
			Host:     getEnv("DB_HOST", "localhost"),
			Port:     getEnv("DB_PORT", "5432"),
			User:     getEnv("DB_USER", "quizgen"),
			Password: getEnv("DB_PASSWORD", "quizgen_secret"),
			Name:     getEnv("DB_NAME", "quizgen"),
			SSLMode:  getEnv("DB_SSLMODE", "disable"),
		},
		LLM: LLMConfig{
			Provider: getEnv("LLM_PROVIDER", "anthropic"),
			APIKey:   getEnv("LLM_API_KEY", ""),
			Model:    getEnv("LLM_MODEL", "claude-sonnet-4-20250514"),
			BaseURL:  getEnv("LLM_BASE_URL", "https://api.anthropic.com"),
			Scope:    getEnv("LLM_SCOPE", "GIGACHAT_API_PERS"),
			ChatURL:  getEnv("LLM_CHAT_URL", ""),
		},
		Upload: UploadConfig{
			MaxSizeMB: getEnvInt("MAX_UPLOAD_SIZE_MB", 10),
			Dir:       getEnv("UPLOAD_DIR", "/tmp/quizgen_uploads"),
		},
	}

	windowSecs := getEnvInt("RATE_LIMIT_WINDOW_SECONDS", 3600)
	cfg.RateLimit = RateLimitConfig{
		Requests:      getEnvInt("RATE_LIMIT_REQUESTS", 20),
		WindowSeconds: windowSecs,
		Window:        time.Duration(windowSecs) * time.Second,
	}

	sessionTTLHours := getEnvInt("SESSION_TTL_HOURS", 24)
	cfg.Session = SessionConfig{
		TTL: time.Duration(sessionTTLHours) * time.Hour,
	}

	return cfg, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if i, err := strconv.Atoi(v); err == nil {
			return i
		}
	}
	return fallback
}
