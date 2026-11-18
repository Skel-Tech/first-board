package ui

import (
	"embed"
	"io/fs"
)

//go:embed static
var root embed.FS

func Files() fs.FS {
	sub, err := fs.Sub(root, "static")
	if err != nil {
		panic(err)
	}
	return sub
}
