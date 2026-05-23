# Skill: render-timeline

Generates every shot's image then video for a project (parallel queue).

**Endpoint**: `POST /functions/v1/project-auto-generate`
**Body**: `{ "project_id": "uuid", "phase": "images" | "videos" }`

Poll progress via SSE on `/functions/v1/project-auto-generate/stream?project_id=…`.
