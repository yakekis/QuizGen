package service

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/quizgen/quizgen/internal/models"
	"github.com/quizgen/quizgen/internal/repository"
)

// AuthService handles registration, login, and JWT-like token management.
type AuthService struct {
	userRepo  *repository.UserRepository
	secretKey []byte
	tokenTTL  time.Duration
}

func NewAuthService(userRepo *repository.UserRepository, secretKey string, tokenTTL time.Duration) *AuthService {
	return &AuthService{
		userRepo:  userRepo,
		secretKey: []byte(secretKey),
		tokenTTL:  tokenTTL,
	}
}

func (s *AuthService) Register(ctx context.Context, req *models.RegisterRequest) (*models.AuthResponse, error) {
	existing, err := s.userRepo.GetByEmail(ctx, req.Email)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		return nil, fmt.Errorf("email already registered")
	}

	hash, err := HashPassword(req.Password)
	if err != nil {
		return nil, err
	}

	user := &models.User{
		Email:        req.Email,
		Name:         req.Name,
		PasswordHash: hash,
	}
	if err := s.userRepo.Create(ctx, user); err != nil {
		return nil, err
	}

	token, err := s.issueToken(user.ID)
	if err != nil {
		return nil, err
	}
	return &models.AuthResponse{Token: token, User: *user}, nil
}

func (s *AuthService) Login(ctx context.Context, req *models.LoginRequest) (*models.AuthResponse, error) {
	user, err := s.userRepo.GetByEmail(ctx, req.Email)
	if err != nil || user == nil {
		return nil, fmt.Errorf("invalid credentials")
	}
	if !CheckPassword(user.PasswordHash, req.Password) {
		return nil, fmt.Errorf("invalid credentials")
	}

	token, err := s.issueToken(user.ID)
	if err != nil {
		return nil, err
	}
	return &models.AuthResponse{Token: token, User: *user}, nil
}

// GetProfile возвращает текущего пользователя по ID.
func (s *AuthService) GetProfile(ctx context.Context, userID uuid.UUID) (*models.User, error) {
	user, err := s.userRepo.GetByID(ctx, userID)
	if err != nil || user == nil {
		return nil, fmt.Errorf("user not found")
	}
	return user, nil
}

// UpdateProfile меняет имя/email и (опционально) пароль текущего пользователя.
func (s *AuthService) UpdateProfile(ctx context.Context, userID uuid.UUID, req *models.UpdateProfileRequest) (*models.User, error) {
	user, err := s.userRepo.GetByID(ctx, userID)
	if err != nil || user == nil {
		return nil, fmt.Errorf("user not found")
	}

	// Email должен оставаться уникальным.
	if req.Email != user.Email {
		existing, err := s.userRepo.GetByEmail(ctx, req.Email)
		if err != nil {
			return nil, err
		}
		if existing != nil && existing.ID != userID {
			return nil, fmt.Errorf("email already registered")
		}
	}

	// Смена пароля — только при верном текущем пароле.
	if req.NewPassword != "" {
		if len(req.NewPassword) < 8 {
			return nil, fmt.Errorf("new password must be at least 8 characters")
		}
		if !CheckPassword(user.PasswordHash, req.CurrentPassword) {
			return nil, fmt.Errorf("current password is incorrect")
		}
		hash, err := HashPassword(req.NewPassword)
		if err != nil {
			return nil, err
		}
		if err := s.userRepo.UpdatePassword(ctx, userID, hash); err != nil {
			return nil, err
		}
	}

	user.Name = req.Name
	user.Email = req.Email
	if err := s.userRepo.UpdateProfile(ctx, user); err != nil {
		return nil, err
	}
	return user, nil
}

// VerifyToken validates a token and returns the user ID.
func (s *AuthService) VerifyToken(token string) (uuid.UUID, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return uuid.Nil, fmt.Errorf("malformed token")
	}

	// Verify signature
	msg := parts[0] + "." + parts[1]
	expectedSig := s.sign(msg)
	if parts[2] != expectedSig {
		return uuid.Nil, fmt.Errorf("invalid signature")
	}

	// Decode payload
	payloadJSON, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return uuid.Nil, err
	}

	var payload tokenPayload
	if err := json.Unmarshal(payloadJSON, &payload); err != nil {
		return uuid.Nil, err
	}

	if time.Now().After(payload.ExpiresAt) {
		return uuid.Nil, fmt.Errorf("token expired")
	}

	return payload.UserID, nil
}

type tokenPayload struct {
	UserID    uuid.UUID `json:"uid"`
	ExpiresAt time.Time `json:"exp"`
}

func (s *AuthService) issueToken(userID uuid.UUID) (string, error) {
	payload := tokenPayload{
		UserID:    userID,
		ExpiresAt: time.Now().Add(s.tokenTTL),
	}
	payloadJSON, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}

	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"HS256"}`))
	body := base64.RawURLEncoding.EncodeToString(payloadJSON)
	msg := header + "." + body
	sig := s.sign(msg)
	return msg + "." + sig, nil
}

func (s *AuthService) sign(msg string) string {
	mac := hmac.New(sha256.New, s.secretKey)
	mac.Write([]byte(msg))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}
