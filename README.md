# AI Code Generator (Lovable Clone)

A full-stack AI-powered code generator that creates web projects from natural language descriptions using CodeLlama.

## Features

- 🚀 Generate complete web projects from text prompts
- 📝 Real-time code generation with progress tracking
- 👁️ Live preview of generated projects
- 📁 File tree navigation
- 💾 Download projects as ZIP files
- 🎨 Modern, responsive UI

## Prerequisites

- Python 3.8+
- Node.js 18+
- CodeLlama model file (`codellama-7b-instruct.Q4_K_M.gguf`)

## Setup

### 1. Install Model

Place your CodeLlama model file in the `models/` directory:
```bash
mv ~/Downloads/codellama-7b-instruct.Q4_K_M.gguf ./models/
```

### 2. Backend Setup

```bash
cd backend

# Install Python dependencies
pip3 install -r requirements.txt

# For M2 Mac with Metal support:
CMAKE_ARGS="-DLLAMA_METAL=on" pip3 install llama-cpp-python --force-reinstall --no-cache-dir
```

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

## Running the Application

### Start Backend

```bash
cd backend
python3 app.py
```

The backend will start on `http://localhost:5001`

### Start Frontend

```bash
cd frontend
npm run dev
```

The frontend will start on `http://localhost:5173`

## Usage

1. Open `http://localhost:5173` in your browser
2. Enter a project description in the prompt box
3. Click "Generate Project"
4. Watch as files are generated in real-time
5. View code in the editor and preview in the right panel
6. Download the project as a ZIP file when complete

## Example Prompts

- "Create a landing page for a SaaS product with hero section, features, and pricing"
- "Build a todo app with add, delete, and mark complete functionality"
- "Make a portfolio website with projects gallery and contact form"
- "Create a landing page for a coffee shop with menu and contact form"
- "Build a simple calculator with basic operations"

## Project Structure

```
lovable-clone/
├── backend/
│   ├── app.py              # Flask backend with CodeLlama integration
│   ├── requirements.txt    # Python dependencies
│   └── src/                # Additional backend modules
├── frontend/
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── store/          # State management
│   │   └── App.tsx         # Main app component
│   └── package.json        # Frontend dependencies
├── models/                 # CodeLlama model files
└── generated/              # Generated projects (created at runtime)
```

## Optimization Tips

### If RAM usage is high:

1. Reduce `n_ctx` to 1024 in `backend/app.py`
2. Reduce `n_batch` to 256
3. Reduce `n_gpu_layers` to 20
4. Use Q3 or Q2 quantized model

### Monitor RAM Usage

```bash
top -pid $(pgrep -f "python3 app.py")
```

## Troubleshooting

### Model not loading
- Ensure the model file is in `./models/` directory
- Check file path in `app.py` matches your model filename

### WebSocket connection issues
- Ensure backend is running on port 5001
- Check CORS settings in `app.py`

### Frontend build errors
- Run `npm install` in the frontend directory
- Clear `node_modules` and reinstall if needed

## Next Steps

- [ ] Add download button for ZIP files
- [ ] Add project history/save feature
- [ ] Add code editing in Monaco editor
- [ ] Add deployment to Vercel/Netlify
- [ ] Add chat interface for iterative improvements
- [ ] Add more templates and examples
- [ ] Add syntax highlighting in preview
- [ ] Add error handling and validation

## License

MIT
