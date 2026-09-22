#!/bin/bash
export PORT=3001
cd artifacts/api-server && npm run dev &
export PORT=3000
cd artifacts/fileit && npm run dev &
wait
