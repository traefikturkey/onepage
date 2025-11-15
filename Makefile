# Simple dev targets

.PHONY: up dev serve

# Hot-reloading dev server (restarts on server.ts changes). For static file edits,
# just refresh the browser; the server doesn't need to restart.
up dev:
	@echo "Starting Bun dev (hot-reload) on http://localhost:${PORT:-5173} (override with PORT)"
	PORT=${PORT:-5173} bun dev

# Plain run (no auto-restart)
serve:
	@echo "Starting Bun server on http://localhost:${PORT:-5173} (override with PORT)"
	PORT=${PORT:-5173} bun run server.ts
