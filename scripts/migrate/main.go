package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
)

func main() {
	_ = godotenv.Load()

	direction := "up"
	if len(os.Args) > 1 {
		direction = os.Args[1]
	}

	dsn := fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=%s",
		env("DB_USER", "quizgen"),
		env("DB_PASSWORD", "quizgen_secret"),
		env("DB_HOST", "localhost"),
		env("DB_PORT", "5432"),
		env("DB_NAME", "quizgen"),
		env("DB_SSLMODE", "disable"),
	)

	db, err := sql.Open("postgres", dsn)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Fatalf("ping: %v", err)
	}

	// Ensure schema_migrations table
	if _, err := db.Exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
		version VARCHAR(255) PRIMARY KEY,
		applied_at TIMESTAMPTZ DEFAULT NOW()
	)`); err != nil {
		log.Fatalf("create migrations table: %v", err)
	}

	migrationsDir := "./migrations"
	entries, err := os.ReadDir(migrationsDir)
	if err != nil {
		log.Fatalf("read migrations dir: %v", err)
	}

	switch direction {
	case "up":
		runUp(db, migrationsDir, entries)
	case "down":
		runDown(db, migrationsDir, entries)
	case "status":
		showStatus(db, migrationsDir, entries)
	default:
		log.Fatalf("unknown direction: %s (use up, down, status)", direction)
	}
}

func runUp(db *sql.DB, dir string, entries []os.DirEntry) {
	files := filterFiles(entries, ".up.sql")
	sort.Strings(files)

	for _, f := range files {
		version := strings.TrimSuffix(filepath.Base(f), ".up.sql")
		var exists bool
		_ = db.QueryRow(`SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version=$1)`, version).Scan(&exists)
		if exists {
			log.Printf("skip (already applied): %s", version)
			continue
		}

		content, err := os.ReadFile(filepath.Join(dir, f))
		if err != nil {
			log.Fatalf("read %s: %v", f, err)
		}

		tx, err := db.Begin()
		if err != nil {
			log.Fatalf("begin tx: %v", err)
		}
		if _, err := tx.Exec(string(content)); err != nil {
			tx.Rollback()
			log.Fatalf("execute %s: %v", f, err)
		}
		if _, err := tx.Exec(`INSERT INTO schema_migrations (version) VALUES ($1)`, version); err != nil {
			tx.Rollback()
			log.Fatalf("record migration %s: %v", version, err)
		}
		tx.Commit()
		log.Printf("✓ applied: %s", version)
	}
}

func runDown(db *sql.DB, dir string, entries []os.DirEntry) {
	files := filterFiles(entries, ".down.sql")
	sort.Sort(sort.Reverse(sort.StringSlice(files)))

	if len(files) == 0 {
		log.Println("no down migrations found")
		return
	}

	f := files[0]
	version := strings.TrimSuffix(filepath.Base(f), ".down.sql")
	content, err := os.ReadFile(filepath.Join(dir, f))
	if err != nil {
		log.Fatalf("read %s: %v", f, err)
	}

	tx, _ := db.Begin()
	if _, err := tx.Exec(string(content)); err != nil {
		tx.Rollback()
		log.Fatalf("execute down %s: %v", f, err)
	}
	tx.Exec(`DELETE FROM schema_migrations WHERE version=$1`, version)
	tx.Commit()
	log.Printf("✓ rolled back: %s", version)
}

func showStatus(db *sql.DB, dir string, entries []os.DirEntry) {
	files := filterFiles(entries, ".up.sql")
	sort.Strings(files)
	for _, f := range files {
		version := strings.TrimSuffix(filepath.Base(f), ".up.sql")
		var exists bool
		_ = db.QueryRow(`SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version=$1)`, version).Scan(&exists)
		status := "pending"
		if exists {
			status = "applied"
		}
		log.Printf("[%s] %s", status, version)
	}
}

func filterFiles(entries []os.DirEntry, suffix string) []string {
	var out []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), suffix) {
			out = append(out, e.Name())
		}
	}
	return out
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
