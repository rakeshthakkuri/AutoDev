#!/bin/bash

echo "🚀 Setting up AI Code Generator..."

# Setup backend
echo "📦 Setting up backend..."
cd backend

# Create .env from example if not exists
if [ ! -f ".env" ]; then
    echo "Creating .env file..."
    cp .env.example .env
    echo "⚠️  Please update backend/.env with your ANTHROPIC_API_KEY"
fi

npm install

cd ..

# Setup frontend
echo "📦 Setting up frontend..."
cd frontend
npm install

cd ..

echo "✅ Setup complete!"
echo ""
echo "To start the application:"
echo "1. Backend: cd backend && npm run dev"
echo "2. Frontend: cd frontend && npm run dev"
echo ""
echo "Important: Make sure you have added your ANTHROPIC_API_KEY to backend/.env"
