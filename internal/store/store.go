package store

import (
	"crypto/rand"
	"database/sql"
	"embed"
	"encoding/hex"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	_ "github.com/ncruces/go-sqlite3/driver"
	_ "github.com/ncruces/go-sqlite3/embed"
	"github.com/pressly/goose/v3"
	"golang.org/x/crypto/bcrypt"
)

//go:embed migrations/*.sql
var migrationFS embed.FS

var idPattern = regexp.MustCompile(`^[a-z0-9-]{1,32}$`)

type User struct {
	ID          int64  `json:"id"`
	Username    string `json:"username"`
	DisplayName string `json:"displayName"`
}

type Progress struct {
	Lessons       []string `json:"lessons"`
	Drills        []string `json:"drills"`
	Wins          int      `json:"wins"`
	Losses        int      `json:"losses"`
	Draws         int      `json:"draws"`
	HighestBeaten int      `json:"highestBeaten"`
	FamilyGames   int      `json:"familyGames"`
}

type Member struct {
	DisplayName   string `json:"displayName"`
	Lessons       int    `json:"lessons"`
	Drills        int    `json:"drills"`
	Wins          int    `json:"wins"`
	HighestBeaten int    `json:"highestBeaten"`
}

type Store struct {
	db *sql.DB
}

func Open(path string) (*Store, error) {
	dsn := "file:" + path + "?_pragma=foreign_keys(1)&_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)"
	db, err := sql.Open("sqlite3", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	if err := db.Ping(); err != nil {
		_ = db.Close()
		return nil, err
	}
	goose.SetBaseFS(migrationFS)
	if err := goose.SetDialect("sqlite3"); err != nil {
		_ = db.Close()
		return nil, err
	}
	if err := goose.Up(db, "migrations"); err != nil {
		_ = db.Close()
		return nil, err
	}
	return &Store{db: db}, nil
}

func (s *Store) Close() error { return s.db.Close() }

func (s *Store) CreateUser(username, displayName, password string) (User, string, error) {
	username = strings.ToLower(strings.TrimSpace(username))
	displayName = strings.TrimSpace(displayName)
	if !validUsername(username) {
		return User{}, "", fmt.Errorf("username")
	}
	if displayName == "" || len(displayName) > 40 || strings.ContainsAny(displayName, "\r\n\t") {
		return User{}, "", fmt.Errorf("name")
	}
	if len(password) < 8 || len(password) > 72 {
		return User{}, "", fmt.Errorf("password")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return User{}, "", err
	}
	res, err := s.db.Exec(
		`INSERT INTO users (username, display_name, password_hash) VALUES (?, ?, ?)`,
		username, displayName, string(hash),
	)
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			return User{}, "", fmt.Errorf("taken")
		}
		return User{}, "", err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return User{}, "", err
	}
	user := User{ID: id, Username: username, DisplayName: displayName}
	token, err := s.newSession(id)
	if err != nil {
		return User{}, "", err
	}
	return user, token, nil
}

func (s *Store) Login(username, password string) (User, string, error) {
	username = strings.ToLower(strings.TrimSpace(username))
	var user User
	var hash string
	err := s.db.QueryRow(
		`SELECT id, username, display_name, password_hash FROM users WHERE username = ?`,
		username,
	).Scan(&user.ID, &user.Username, &user.DisplayName, &hash)
	if errors.Is(err, sql.ErrNoRows) {
		return User{}, "", fmt.Errorf("bad")
	}
	if err != nil {
		return User{}, "", err
	}
	if bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) != nil {
		return User{}, "", fmt.Errorf("bad")
	}
	token, err := s.newSession(user.ID)
	if err != nil {
		return User{}, "", err
	}
	return user, token, nil
}

func (s *Store) newSession(userID int64) (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	token := hex.EncodeToString(buf)
	exp := time.Now().UTC().Add(30 * 24 * time.Hour).Format(time.RFC3339)
	_, err := s.db.Exec(`INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)`, token, userID, exp)
	return token, err
}

func (s *Store) UserByToken(token string) (User, error) {
	var user User
	var exp string
	err := s.db.QueryRow(
		`SELECT u.id, u.username, u.display_name, s.expires_at
		 FROM sessions s JOIN users u ON u.id = s.user_id
		 WHERE s.token = ?`, token,
	).Scan(&user.ID, &user.Username, &user.DisplayName, &exp)
	if errors.Is(err, sql.ErrNoRows) {
		return User{}, fmt.Errorf("unauthorized")
	}
	if err != nil {
		return User{}, err
	}
	when, err := time.Parse(time.RFC3339, exp)
	if err != nil || time.Now().After(when) {
		_, _ = s.db.Exec(`DELETE FROM sessions WHERE token = ?`, token)
		return User{}, fmt.Errorf("unauthorized")
	}
	return user, nil
}

func (s *Store) Logout(token string) error {
	_, err := s.db.Exec(`DELETE FROM sessions WHERE token = ?`, token)
	return err
}

func (s *Store) Progress(userID int64) (Progress, error) {
	var lessons, drills string
	var p Progress
	err := s.db.QueryRow(
		`SELECT lessons, drills, wins, losses, draws, highest_beaten, family_games
		 FROM progress WHERE user_id = ?`, userID,
	).Scan(&lessons, &drills, &p.Wins, &p.Losses, &p.Draws, &p.HighestBeaten, &p.FamilyGames)
	if errors.Is(err, sql.ErrNoRows) {
		return emptyProgress(), nil
	}
	if err != nil {
		return Progress{}, err
	}
	p.Lessons = splitIDs(lessons)
	p.Drills = splitIDs(drills)
	return p, nil
}

func (s *Store) SaveProgress(userID int64, p Progress) (Progress, error) {
	p = Sanitize(p)
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := s.db.Exec(
		`INSERT INTO progress (user_id, lessons, drills, wins, losses, draws, highest_beaten, family_games, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		 ON CONFLICT(user_id) DO UPDATE SET
		   lessons = excluded.lessons,
		   drills = excluded.drills,
		   wins = excluded.wins,
		   losses = excluded.losses,
		   draws = excluded.draws,
		   highest_beaten = excluded.highest_beaten,
		   family_games = excluded.family_games,
		   updated_at = excluded.updated_at`,
		userID, strings.Join(p.Lessons, ","), strings.Join(p.Drills, ","),
		p.Wins, p.Losses, p.Draws, p.HighestBeaten, p.FamilyGames, now,
	)
	if err != nil {
		return Progress{}, err
	}
	return p, nil
}

func (s *Store) Family() ([]Member, error) {
	rows, err := s.db.Query(
		`SELECT u.display_name,
		        COALESCE(p.lessons, ''),
		        COALESCE(p.drills, ''),
		        COALESCE(p.wins, 0),
		        COALESCE(p.highest_beaten, 0)
		 FROM users u
		 LEFT JOIN progress p ON p.user_id = u.id
		 ORDER BY COALESCE(p.highest_beaten, 0) DESC, u.display_name COLLATE NOCASE`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Member{}
	for rows.Next() {
		var name, lessons, drills string
		var wins, highest int
		if err := rows.Scan(&name, &lessons, &drills, &wins, &highest); err != nil {
			return nil, err
		}
		out = append(out, Member{
			DisplayName:   name,
			Lessons:       len(splitIDs(lessons)),
			Drills:        len(splitIDs(drills)),
			Wins:          wins,
			HighestBeaten: highest,
		})
	}
	return out, rows.Err()
}

func emptyProgress() Progress {
	return Progress{Lessons: []string{}, Drills: []string{}}
}

func Sanitize(p Progress) Progress {
	p.Lessons = cleanIDs(p.Lessons)
	p.Drills = cleanIDs(p.Drills)
	p.Wins = clamp(p.Wins)
	p.Losses = clamp(p.Losses)
	p.Draws = clamp(p.Draws)
	p.FamilyGames = clamp(p.FamilyGames)
	if p.HighestBeaten < 0 {
		p.HighestBeaten = 0
	}
	if p.HighestBeaten > 4 {
		p.HighestBeaten = 4
	}
	return p
}

func cleanIDs(ids []string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, id := range ids {
		id = strings.ToLower(strings.TrimSpace(id))
		if !idPattern.MatchString(id) || seen[id] {
			continue
		}
		seen[id] = true
		out = append(out, id)
		if len(out) == 64 {
			break
		}
	}
	if out == nil {
		return []string{}
	}
	return out
}

func splitIDs(raw string) []string {
	if strings.TrimSpace(raw) == "" {
		return []string{}
	}
	return cleanIDs(strings.Split(raw, ","))
}

func clamp(n int) int {
	if n < 0 {
		return 0
	}
	if n > 100000 {
		return 100000
	}
	return n
}

func validUsername(name string) bool {
	if len(name) < 3 || len(name) > 20 {
		return false
	}
	for i, r := range name {
		ok := (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '_'
		if i == 0 && (r < 'a' || r > 'z') {
			return false
		}
		if !ok {
			return false
		}
	}
	return true
}
