#!/bin/bash

# Launch the backend with local env vars.
cd "$(dirname "$0")"
if [ -f ".env.local" ]; then
  # shellcheck disable=SC1091
  source ".env.local"
fi
node server.js
