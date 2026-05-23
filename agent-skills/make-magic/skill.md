# Skill: make-magic

End-to-end pipeline:
1. `POST /functions/v1/project-create` with `{ concept, format }` → returns `project_id`.
2. Poll `/functions/v1/storyline-status?project_id=…` until `complete`.
3. Navigate user (or call `/project-auto-generate` with phase `images`, then `videos`).
4. Trigger Director's Cut: `POST /functions/v1/directors-cut { project_id }`.
5. Poll `/functions/v1/directors-cut/status?project_id=…` until `final_url` returned.

Each step deducts credits; check `/billing/credits` first.
