// Package web embeds the Vite build into the application binary.
package web

import "embed"

// Build the frontend with Bun before compiling Go. The marker keeps tooling
// usable in a fresh checkout; the HTTP server reports an absent build clearly.
//
//go:embed all:dist
var Files embed.FS
