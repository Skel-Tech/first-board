package httpapi

import (
	"encoding/json"
	"errors"
	"io"
	"io/fs"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"firstboard/internal/store"
)

type Server struct {
	store *store.Store
	files fs.FS
	limit *failLimit
}

func Listen(addr string, st *store.Store, files fs.FS) error {
	s := &Server{store: st, files: files, limit: newFailLimit()}
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/signup", s.signup)
	mux.HandleFunc("POST /api/login", s.login)
	mux.HandleFunc("POST /api/logout", s.logout)
	mux.HandleFunc("GET /api/me", s.me)
	mux.HandleFunc("GET /api/progress", s.getProgress)
	mux.HandleFunc("PUT /api/progress", s.putProgress)
	mux.HandleFunc("GET /api/family", s.family)
	mux.HandleFunc("/", s.page)
	srv := &http.Server{
		Addr:              addr,
		Handler:           s.protect(mux),
		ReadHeaderTimeout: 5 * time.Second,
	}
	return srv.ListenAndServe()
}

func (s *Server) protect(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "same-origin")
		next.ServeHTTP(w, r)
	})
}

type credentials struct {
	Username    string `json:"username"`
	DisplayName string `json:"displayName"`
	Password    string `json:"password"`
}

func (s *Server) signup(w http.ResponseWriter, r *http.Request) {
	var body credentials
	if !decode(w, r, &body) {
		return
	}
	user, token, err := s.store.CreateUser(body.Username, body.DisplayName, body.Password)
	if err != nil {
		switch err.Error() {
		case "taken":
			writeErr(w, http.StatusConflict, "That username is taken. Try another.")
		case "username":
			writeErr(w, http.StatusBadRequest, "Usernames are 3 to 20 letters, and can include numbers or underscores.")
		case "name":
			writeErr(w, http.StatusBadRequest, "Add a name the family will recognize, up to 40 characters.")
		case "password":
			writeErr(w, http.StatusBadRequest, "Use a password of at least 8 characters.")
		default:
			writeErr(w, http.StatusInternalServerError, "Could not create that account.")
		}
		return
	}
	s.setCookie(w, token)
	writeJSON(w, http.StatusOK, map[string]any{"user": user, "token": token})
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	ip := clientIP(r)
	if !s.limit.allow(ip) {
		writeErr(w, http.StatusTooManyRequests, "Too many tries. Wait a few minutes and try again.")
		return
	}
	var body credentials
	if !decode(w, r, &body) {
		return
	}
	user, token, err := s.store.Login(body.Username, body.Password)
	if err != nil {
		if err.Error() == "bad" {
			s.limit.fail(ip)
			writeErr(w, http.StatusUnauthorized, "That username and password don't match.")
			return
		}
		writeErr(w, http.StatusInternalServerError, "Could not sign in.")
		return
	}
	s.limit.reset(ip)
	s.setCookie(w, token)
	writeJSON(w, http.StatusOK, map[string]any{"user": user, "token": token})
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	if token := tokenFrom(r); token != "" {
		_ = s.store.Logout(token)
	}
	http.SetCookie(w, &http.Cookie{Name: "firstboard", Value: "", Path: "/", MaxAge: -1, HttpOnly: true, SameSite: http.SameSiteLaxMode})
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	user, ok := s.auth(w, r)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"user": user})
}

func (s *Server) getProgress(w http.ResponseWriter, r *http.Request) {
	user, ok := s.auth(w, r)
	if !ok {
		return
	}
	p, err := s.store.Progress(user.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "Could not load progress.")
		return
	}
	writeJSON(w, http.StatusOK, p)
}

func (s *Server) putProgress(w http.ResponseWriter, r *http.Request) {
	user, ok := s.auth(w, r)
	if !ok {
		return
	}
	var p store.Progress
	if !decode(w, r, &p) {
		return
	}
	saved, err := s.store.SaveProgress(user.ID, p)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "Could not save progress.")
		return
	}
	writeJSON(w, http.StatusOK, saved)
}

func (s *Server) family(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.auth(w, r); !ok {
		return
	}
	members, err := s.store.Family()
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "Could not load the family.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"members": members})
}

func (s *Server) auth(w http.ResponseWriter, r *http.Request) (store.User, bool) {
	token := tokenFrom(r)
	if token == "" {
		writeErr(w, http.StatusUnauthorized, "Sign in to keep this with your account.")
		return store.User{}, false
	}
	user, err := s.store.UserByToken(token)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, "Sign in to keep this with your account.")
		return store.User{}, false
	}
	return user, true
}

func (s *Server) page(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		writeErr(w, http.StatusMethodNotAllowed, "That action is not available.")
		return
	}
	if strings.HasPrefix(r.URL.Path, "/api/") {
		writeErr(w, http.StatusNotFound, "Not found.")
		return
	}
	path := strings.TrimPrefix(r.URL.Path, "/")
	if path == "" || strings.HasSuffix(r.URL.Path, "/") {
		s.serveIndex(w, r)
		return
	}
	if strings.Contains(path, "..") {
		http.NotFound(w, r)
		return
	}
	f, err := s.files.Open(path)
	if err != nil {
		s.serveIndex(w, r)
		return
	}
	defer f.Close()
	stat, err := f.Stat()
	if err != nil || stat.IsDir() {
		s.serveIndex(w, r)
		return
	}
	rs, ok := f.(io.ReadSeeker)
	if !ok {
		s.serveIndex(w, r)
		return
	}
	w.Header().Set("Cache-Control", "no-cache")
	http.ServeContent(w, r, stat.Name(), stat.ModTime(), rs)
}

func (s *Server) serveIndex(w http.ResponseWriter, r *http.Request) {
	f, err := s.files.Open("index.html")
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer f.Close()
	stat, err := f.Stat()
	if err != nil {
		http.NotFound(w, r)
		return
	}
	rs := f.(io.ReadSeeker)
	w.Header().Set("Cache-Control", "no-cache")
	http.ServeContent(w, r, "index.html", stat.ModTime(), rs)
}

func (s *Server) setCookie(w http.ResponseWriter, token string) {
	http.SetCookie(w, &http.Cookie{
		Name:     "firstboard",
		Value:    token,
		Path:     "/",
		Expires:  time.Now().Add(30 * 24 * time.Hour),
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
}

func tokenFrom(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if strings.HasPrefix(strings.ToLower(h), "bearer ") {
		return strings.TrimSpace(h[7:])
	}
	if c, err := r.Cookie("firstboard"); err == nil {
		return c.Value
	}
	return ""
}

func decode(w http.ResponseWriter, r *http.Request, dst any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	dec := json.NewDecoder(r.Body)
	if err := dec.Decode(dst); err != nil && !errors.Is(err, io.EOF) {
		writeErr(w, http.StatusBadRequest, "That request was not valid.")
		return false
	}
	return true
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]string{"error": msg})
}

func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

type failLimit struct {
	mu   sync.Mutex
	hits map[string][]time.Time
}

func newFailLimit() *failLimit {
	return &failLimit{hits: map[string][]time.Time{}}
}

func (l *failLimit) allow(ip string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	return len(l.prune(ip)) < 8
}

func (l *failLimit) fail(ip string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.hits[ip] = append(l.prune(ip), time.Now())
}

func (l *failLimit) reset(ip string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.hits, ip)
}

func (l *failLimit) prune(ip string) []time.Time {
	window := time.Now().Add(-10 * time.Minute)
	prev := l.hits[ip]
	keep := prev[:0]
	for _, t := range prev {
		if t.After(window) {
			keep = append(keep, t)
		}
	}
	l.hits[ip] = keep
	return keep
}
