# Quick Start Guide

## Prerequisites

- Python 3.8+ installed
- Node.js 18+ installed
- CodeLlama model file (see below)

## Step 1: Download Model

1. Download `codellama-7b-instruct.Q4_K_M.gguf` from [Hugging Face](https://huggingface.co/TheBloke/CodeLlama-7B-Instruct-GGUF)
2. Place it in the `./models/` directory

## Step 2: Setup (Option A - Automated)

Run the setup script:
```bash
./setup.sh
```

## Step 2: Setup (Option B - Manual)

### Backend Setup
```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt

# For M2 Mac with Metal support:
CMAKE_ARGS="-DLLAMA_METAL=on" pip install llama-cpp-python --force-reinstall --no-cache-dir
```

### Frontend Setup
```bash
cd frontend
npm install
```

## Step 3: Run the Application

### Terminal 1 - Start Backend
```bash
cd backend
source venv/bin/activate  # On Windows: venv\Scripts\activate
python3 app.py
```

You should see:
```
Loading CodeLlama model...
Model loaded successfully!
Starting server on http://localhost:5001
```

### Terminal 2 - Start Frontend
```bash
cd frontend
npm run dev
```

You should see:
```
VITE v5.x.x  ready in xxx ms

➜  Local:   http://localhost:5173/
```

## Step 4: Use the Application

1. Open http://localhost:5173 in your browser
2. Enter a project description, for example:
   - "Create a landing page for a coffee shop with menu and contact form"
   - "Build a simple calculator with basic operations"
   - "Make a pricing page with 3 tiers and feature comparison"
3. Click "Generate Project"
4. Watch files generate in real-time
5. View code in the editor and preview in the right panel

## Troubleshooting

### Model Not Found Error
- Ensure the model file is in `./models/codellama-7b-instruct.Q4_K_M.gguf`
- Check the file path in `backend/app.py` matches your model filename

### Port Already in Use
- Backend uses port 5001 - change in `backend/app.py` if needed
- Frontend uses port 5173 - change in `frontend/vite.config.ts` if needed

### High RAM Usage
- Reduce `n_ctx` to 1024 in `backend/app.py`
- Reduce `n_gpu_layers` to 20
- Use a smaller quantized model (Q3_K_M)

### WebSocket Connection Issues
- Ensure backend is running before starting frontend
- Check that CORS is enabled in `backend/app.py`

## Next Steps

- Try different prompts to see various project types
- Experiment with the generated code
- Download projects as ZIP files
- Customize the prompts in `backend/app.py` for better results
