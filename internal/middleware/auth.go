package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/quizgen/quizgen/internal/repository"
	"github.com/quizgen/quizgen/internal/service"
)

// Auth extracts and validates the Bearer token; sets user_id in context.
// userRepo используется для проверки, что юзер из токена ещё существует в БД
// (после очистки/пересоздания БД токены становятся «висячими»).
func Auth(authSvc *service.AuthService, userRepo *repository.UserRepository) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if header == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "authorization header required"})
			return
		}

		parts := strings.SplitN(header, " ", 2)
		if len(parts) != 2 || !strings.EqualFold(parts[0], "bearer") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid authorization format"})
			return
		}

		userID, err := authSvc.VerifyToken(parts[1])
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
			return
		}

		user, err := userRepo.GetByID(c.Request.Context(), userID)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "user lookup failed"})
			return
		}
		if user == nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "user no longer exists, please log in again"})
			return
		}

		c.Set("user_id", userID)
		c.Next()
	}
}
