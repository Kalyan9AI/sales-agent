#!/bin/bash

# Azure App Service startup script for Voice Agent

echo "Starting Voice Agent application..."

# Set production environment
export NODE_ENV=production

# Create necessary directories
mkdir -p temp_audio
mkdir -p conversation_history
mkdir -p public

# Set proper permissions
chmod 755 temp_audio
chmod 755 conversation_history
chmod 755 public

# Install production dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install --production
fi

# Start the application
echo "Starting Node.js server..."
node server.js 