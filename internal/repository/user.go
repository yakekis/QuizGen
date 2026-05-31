package repository

import (
	"context"
	"database/sql"

	"github.com/google/uuid"

	"github.com/quizgen/quizgen/internal/models"
)

type UserRepository struct {
	db *sql.DB
}

func NewUserRepository(db *sql.DB) *UserRepository {
	return &UserRepository{db: db}
}

func (r *UserRepository) Create(ctx context.Context, u *models.User) error {
	if u.ID == uuid.Nil {
		u.ID = uuid.New()
	}
	return r.db.QueryRowContext(ctx, `
		INSERT INTO users (id, email, name, password_hash)
		VALUES ($1,$2,$3,$4)
		RETURNING created_at, updated_at`,
		u.ID, u.Email, u.Name, u.PasswordHash,
	).Scan(&u.CreatedAt, &u.UpdatedAt)
}

func (r *UserRepository) GetByEmail(ctx context.Context, email string) (*models.User, error) {
	u := &models.User{}
	err := r.db.QueryRowContext(ctx, `
		SELECT id, email, name, password_hash, created_at, updated_at
		FROM users WHERE email=$1`, email,
	).Scan(&u.ID, &u.Email, &u.Name, &u.PasswordHash, &u.CreatedAt, &u.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return u, err
}

func (r *UserRepository) GetByID(ctx context.Context, id uuid.UUID) (*models.User, error) {
	u := &models.User{}
	err := r.db.QueryRowContext(ctx, `
		SELECT id, email, name, password_hash, created_at, updated_at
		FROM users WHERE id=$1`, id,
	).Scan(&u.ID, &u.Email, &u.Name, &u.PasswordHash, &u.CreatedAt, &u.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return u, err
}

// UpdateProfile обновляет имя и email пользователя.
func (r *UserRepository) UpdateProfile(ctx context.Context, u *models.User) error {
	return r.db.QueryRowContext(ctx, `
		UPDATE users SET name=$1, email=$2 WHERE id=$3
		RETURNING created_at, updated_at`,
		u.Name, u.Email, u.ID,
	).Scan(&u.CreatedAt, &u.UpdatedAt)
}

// UpdatePassword сохраняет новый хеш пароля.
func (r *UserRepository) UpdatePassword(ctx context.Context, id uuid.UUID, passwordHash string) error {
	_, err := r.db.ExecContext(ctx, `UPDATE users SET password_hash=$1 WHERE id=$2`, passwordHash, id)
	return err
}

// ── Rate limiting ─────────────────────────────────────────────────────────────

// IncrementRateLimit bumps the counter for the current window and returns the new count.
func (r *UserRepository) IncrementRateLimit(ctx context.Context, userID uuid.UUID, windowStart int64) (int, error) {
	var count int
	err := r.db.QueryRowContext(ctx, `
		INSERT INTO rate_limits (user_id, window_start, request_count)
		VALUES ($1, to_timestamp($2), 1)
		ON CONFLICT (user_id, window_start)
		DO UPDATE SET request_count = rate_limits.request_count + 1
		RETURNING request_count`,
		userID, windowStart,
	).Scan(&count)
	return count, err
}
