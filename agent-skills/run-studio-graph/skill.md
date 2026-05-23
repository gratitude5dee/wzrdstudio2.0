# Skill: run-studio-graph

Executes a saved compute graph node-by-node.

**Endpoint**: `POST /functions/v1/compute-execute`
**Body**: `{ "project_id": "uuid" }`

Streams `{ node_id, status, progress, artifacts }` events.
