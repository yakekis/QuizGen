package middleware

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"

	"github.com/quizgen/quizgen/internal/config"
	"github.com/quizgen/quizgen/internal/repository"
)

// RateLimit limits LLM generation requests per authenticated user.
func RateLimit(userRepo *repository.UserRepository, cfg config.RateLimitConfig) gin.HandlerFunc {
	return func(c *gin.Context) {
		userIDRaw, exists := c.Get("user_id")
		if !exists {
			c.Next()
			return
		}

		userID, ok := userIDRaw.(uuid.UUID)
		if !ok {
			c.Next()
			return
		}

		// Truncate current time to window boundary
		now := time.Now()
		windowStart := now.Truncate(cfg.Window).Unix()

		count, err := userRepo.IncrementRateLimit(c.Request.Context(), userID, windowStart)
		if err != nil {
			// On DB error, allow the request through (fail open)
			c.Next()
			return
		}

		if count > cfg.Requests {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
				"error": "rate limit exceeded — try again later",
			})
			return
		}

		c.Next()
	}
}
