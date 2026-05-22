package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/quizgen/quizgen/internal/config"
	"github.com/quizgen/quizgen/internal/db"
	"github.com/quizgen/quizgen/internal/handlers"
	"github.com/quizgen/quizgen/internal/middleware"
	"github.com/quizgen/quizgen/internal/repository"
	"github.com/quizgen/quizgen/internal/service"
)

func main() {
	// ── Config ────────────────────────────────────────────────────────────────
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	if cfg.App.Env == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	// ── Database ──────────────────────────────────────────────────────────────
	database, err := db.Connect(cfg.DB)
	if err != nil {
		log.Fatalf("db connect: %v", err)
	}
	defer database.Close()

	if err := db.Migrate(database); err != nil {
		log.Fatalf("migrations: %v", err)
	}

	// ── Repositories ──────────────────────────────────────────────────────────
	userRepo := repository.NewUserRepository(database)
	quizRepo := repository.NewQuizRepository(database)

	// ── Services ──────────────────────────────────────────────────────────────
	llmSvc := service.NewLLMService(cfg.LLM)
	authSvc := service.NewAuthService(userRepo, cfg.App.SecretKey, cfg.Session.TTL)
	quizSvc := service.NewQuizService(quizRepo, llmSvc, cfg)

	// ── Handlers ──────────────────────────────────────────────────────────────
	authHandler := handlers.NewAuthHandler(authSvc)
	quizHandler := handlers.NewQuizHandler(quizSvc, quizRepo, cfg)

	// ── Router ────────────────────────────────────────────────────────────────
	r := gin.New()
	r.Use(gin.Logger(), gin.Recovery())

	// Static files & SPA
	// Vite кладёт ассеты в /assets/* (новый билд) и оставляет /static-совместимым (старая статика).
	r.Static("/assets", "./static/assets")
	r.Static("/static", "./static")
	r.StaticFile("/favicon.ico", "./static/favicon.ico")

	r.GET("/", func(c *gin.Context) {
		c.File("./static/index.html")
	})

	// Health check
	r.GET("/health", func(c *gin.Context) {
		if err := database.PingContext(c.Request.Context()); err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"status": "unhealthy", "db": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	// SPA fallback: всё, что не /api и не /assets, отдаёт index.html.
	r.NoRoute(func(c *gin.Context) {
		p := c.Request.URL.Path
		if strings.HasPrefix(p, "/api/") || strings.HasPrefix(p, "/assets/") || strings.HasPrefix(p, "/static/") {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
			return
		}
		c.File("./static/index.html")
	})

	// ── API routes ────────────────────────────────────────────────────────────
	api := r.Group("/api")

	// Auth (public)
	auth := api.Group("/auth")
	{
		auth.POST("/register", authHandler.Register)
		auth.POST("/login", authHandler.Login)
	}

	// Public quiz play (student, no auth needed)
	api.GET("/sessions/:token", quizHandler.GetSession)
	api.POST("/sessions/:token/identify", quizHandler.IdentifySession)
	api.POST("/sessions/:token/answers", quizHandler.SubmitAnswer)
	api.POST("/sessions/:token/finish", quizHandler.FinishSession)

	// Protected (teacher)
	protected := api.Group("/")
	protected.Use(middleware.Auth(authSvc, userRepo))
	{
		// Quiz CRUD
		protected.GET("/quizzes", quizHandler.List)
		protected.GET("/quizzes/:id", quizHandler.Get)
		protected.PUT("/quizzes/:id", quizHandler.Update)
		protected.DELETE("/quizzes/:id", quizHandler.Delete)
		protected.POST("/quizzes/:id/publish", quizHandler.Publish)
		protected.GET("/quizzes/:id/stats", quizHandler.Stats)
		protected.GET("/quizzes/:id/stats.csv", quizHandler.StatsCSV)
		protected.GET("/quizzes/:id/sessions/:sessionId", quizHandler.SessionDetails)
		protected.POST("/quizzes/:id/questions/:qid/regenerate", quizHandler.RegenerateQuestion)

		// Session (personal link) creation — teacher only
		protected.POST("/quizzes/:id/sessions", quizHandler.CreateSession)

		// Generate (rate-limited)
		genGroup := protected.Group("/quizzes")
		genGroup.Use(middleware.RateLimit(userRepo, cfg.RateLimit))
		genGroup.POST("/generate", quizHandler.Generate)
	}

	// ── Server ────────────────────────────────────────────────────────────────
	srv := &http.Server{
		Addr:         ":" + cfg.App.Port,
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 120 * time.Second, // generous for LLM calls
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		log.Printf("🚀 QuizGen listening on :%s (env=%s)", cfg.App.Port, cfg.App.Env)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("server: %v", err)
		}
	}()

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down gracefully…")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("forced shutdown: %v", err)
	}
	log.Println("Server stopped.")
}
