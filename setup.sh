#!/bin/bash

echo "🚀 Setting up AI Code Generator..."

# Check if model file exists
if [ ! -f "./models/codellama-7b-instruct.Q4_K_M.gguf" ]; then
    echo "⚠️  Model file not found!"
    echo "Please place codellama-7b-instruct.Q4_K_M.gguf in the ./models/ directory"
    echo "You can download it from: https://huggingface.co/TheBloke/CodeLlama-7B-Instruct-GGUF"
    exit 1
fi

# Setup backend
echo "📦 Setting up backend..."
cd backend
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate
pip install -r requirements.txt

# Install llama-cpp-python with Metal support (for M2 Mac)
echo "🔧 Installing llama-cpp-python with Metal support..."
CMAKE_ARGS="-DLLAMA_METAL=on" pip install llama-cpp-python --force-reinstall --no-cache-dir

cd ..

# Setup frontend
echo "📦 Setting up frontend..."
cd frontend
npm install

cd ..

echo "✅ Setup complete!"
echo ""
echo "To start the application:"
echo "1. Backend: cd backend && source venv/bin/activate && python3 app.py"
echo "2. Frontend: cd frontend && npm run dev"
echo ""
echo "Then open http://localhost:5173 in your browser"
