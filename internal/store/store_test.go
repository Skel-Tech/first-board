package store

import (
	"path/filepath"
	"testing"
)

func TestAccountsAndProgress(t *testing.T) {
	dir := t.TempDir()
	st, err := Open(filepath.Join(dir, "board.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()

	user, token, err := st.CreateUser("sam", "Sam", "long-enough")
	if err != nil {
		t.Fatal(err)
	}
	if user.DisplayName != "Sam" || token == "" {
		t.Fatalf("unexpected user %#v", user)
	}
	if _, _, err := st.CreateUser("sam", "Other", "long-enough"); err == nil {
		t.Fatal("expected duplicate username to fail")
	}
	got, err := st.UserByToken(token)
	if err != nil || got.ID != user.ID {
		t.Fatalf("session: %v %#v", err, got)
	}
	saved, err := st.SaveProgress(user.ID, Progress{
		Lessons:       []string{"board", "pawns", "nope!"},
		Drills:        []string{"back-rank"},
		Wins:          2,
		HighestBeaten: 4,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(saved.Lessons) != 2 || saved.HighestBeaten != 4 {
		t.Fatalf("sanitize failed: %#v", saved)
	}
	again, err := st.Progress(user.ID)
	if err != nil || again.Wins != 2 {
		t.Fatalf("read back: %v %#v", err, again)
	}
	members, err := st.Family()
	if err != nil || len(members) != 1 || members[0].Lessons != 2 {
		t.Fatalf("family: %v %#v", err, members)
	}
	if _, _, err := st.Login("sam", "wrong-password"); err == nil {
		t.Fatal("expected bad password")
	}
	if _, _, err := st.Login("sam", "long-enough"); err != nil {
		t.Fatal(err)
	}
}
