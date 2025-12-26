#!/bin/bash

# Setup script to create .env.local file with Convex configuration

echo "Setting up .env.local file..."

# Check if .env.local already exists
if [ -f .env.local ]; then
    echo ".env.local already exists. Backing up to .env.local.backup"
    cp .env.local .env.local.backup
fi

# Create .env.local from example
if [ -f env.example ]; then
    cp env.example .env.local
    echo "Created .env.local from env.example"
    echo ""
    echo "⚠️  IMPORTANT: Add your Convex deployment URL to .env.local"
    echo "   Run 'npx convex dev' to get your deployment URL"
    echo "   Then update NEXT_PUBLIC_CONVEX_URL in .env.local"
else
    # Create .env.local with default content
    cat > .env.local << 'EOF'
# Convex Configuration
# Get your deployment URL from: https://dashboard.convex.dev
# After running `npx convex dev`, copy the deployment URL here
NEXT_PUBLIC_CONVEX_URL=

# Clerk Authentication (if using)
# NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
# CLERK_SECRET_KEY=your_clerk_secret_key

# Add other environment variables as needed
EOF
    echo "Created .env.local with default configuration"
    echo ""
    echo "⚠️  IMPORTANT: Add your Convex deployment URL to .env.local"
    echo "   Run 'npx convex dev' to get your deployment URL"
    echo "   Then update NEXT_PUBLIC_CONVEX_URL in .env.local"
fi

echo ""
echo "✅ Setup complete!"

