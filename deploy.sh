#!/bin/bash
# Запускать на сервере: bash /app/deploy.sh

set -e

echo "=== Pulling latest code ==="
cd /app
git pull origin main

echo "=== Rebuilding frontend ==="
cd /app/frontend
npm install
npm run build

echo "=== Restarting backend ==="
systemctl restart quizface

echo "=== Done! ==="
echo "App: http://5.42.99.113"
