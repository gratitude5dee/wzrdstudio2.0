#!/bin/bash
set -e

cd /Users/gratitud3/Downloads/mogstudio-repo

# Install dependencies if node_modules is missing or incomplete
if [ ! -d "node_modules" ] || [ ! -f "node_modules/.package-lock.json" ]; then
  echo "Installing dependencies..."
  npm install
fi

# Verify key dependencies are available
node -e "require('zustand'); require('framer-motion'); require('sonner')" 2>/dev/null || {
  echo "ERROR: Required dependencies not found. Running npm install..."
  npm install
}

# Ensure .env exists
if [ ! -f ".env" ]; then
  echo "WARNING: .env file not found. Supabase features will not work."
  echo "Copy .env.example to .env and fill in credentials."
fi

# Move bgvid.mp4 to public/ if it's still in repo root
if [ -f "bgvid.mp4" ] && [ ! -f "public/bgvid.mp4" ]; then
  echo "Moving bgvid.mp4 to public/..."
  mv bgvid.mp4 public/bgvid.mp4
fi

echo "Environment ready."
