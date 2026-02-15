from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from flask_socketio import SocketIO, emit
from llama_cpp import Llama
import json
import os
import shutil
import zipfile
import logging
import signal
from pathlib import Path
from datetime import datetime
from functools import wraps
import sys

# Import custom services
import sys
sys.path.insert(0, str(Path(__file__).parent))

from src.services.exceptions import ModelLoadError, GenerationError, ValidationError, TimeoutError
from src.services.code_validator import CodeValidator
from src.services.retry_handler import RetryHandler

app = Flask(__name__)
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

# Get the project root directory (parent of backend directory)
BASE_DIR = Path(__file__).parent.parent
MODEL_PATH = BASE_DIR / "models" / "codellama-7b-instruct.Q4_K_M.gguf"
GENERATED_DIR = BASE_DIR / "generated"
LOG_DIR = BASE_DIR / "backend" / "logs"

# Setup logging
LOG_DIR.mkdir(parents=True, exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler(LOG_DIR / 'error.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

# Initialize services
validator = CodeValidator()
retry_handler = RetryHandler(max_retries=3, initial_delay=2.0, max_delay=10.0)

# Initialize model (lazy loading)
llm = None

def get_model():
    global llm
    if llm is None:
        try:
            logger.info("Loading CodeLlama model...")
            logger.info(f"Model path: {MODEL_PATH}")
            if not MODEL_PATH.exists():
                raise ModelLoadError(
                    f"Model file not found at {MODEL_PATH}",
                    details={"path": str(MODEL_PATH)}
                )
            
            llm = Llama(
                model_path=str(MODEL_PATH),
                n_ctx=2048,           # Context window
                n_batch=512,          # Batch size
                n_gpu_layers=35,      # M2 GPU layers
                n_threads=4,          # CPU threads
                use_mlock=False,
                verbose=False
            )
            logger.info("Model loaded successfully!")
        except Exception as e:
            logger.error(f"Failed to load model: {str(e)}")
            if isinstance(e, ModelLoadError):
                raise
            raise ModelLoadError(f"Failed to load model: {str(e)}", details={"error": str(e)})
    return llm

def timeout_handler(signum, frame):
    """Handle timeout signal."""
    raise TimeoutError("Operation timed out", operation="code_generation", timeout=30)

def with_timeout(timeout_seconds=30):
    """Decorator to add timeout to functions (Unix only)."""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Only use signal-based timeout on Unix systems
            if hasattr(signal, 'SIGALRM'):
                old_handler = signal.signal(signal.SIGALRM, timeout_handler)
                signal.alarm(timeout_seconds)
                try:
                    result = func(*args, **kwargs)
                finally:
                    signal.alarm(0)
                    signal.signal(signal.SIGALRM, old_handler)
                return result
            else:
                # On Windows, just call the function (timeout not supported)
                logger.warning("Timeout not supported on this platform")
                return func(*args, **kwargs)
        return wrapper
    return decorator

def create_error_response(error_code: str, message: str, details: dict = None):
    """Create structured error response."""
    return {
        "success": False,
        "error": {
            "code": error_code,
            "message": message,
            "details": details or {}
        }
    }

# Agent prompts
ANALYZER_PROMPT = """You are a requirements analyzer. Extract structured requirements from user prompts.

User Request: {prompt}

Output a JSON object with:
- projectType: "landing-page" | "web-app" | "dashboard" | "portfolio" | "game"
- features: list of features
- styling: "modern" | "minimal" | "colorful" | "professional"
- framework: "react" | "vanilla-js" | "html-only"

Output ONLY valid JSON, no explanations:"""

PLANNER_PROMPT = """You are a project architect. Create a file structure plan for a web project.

Requirements: {requirements}

IMPORTANT: For web projects, you MUST include:
- index.html (main HTML file)
- styles.css or src/index.css (styles)
- script.js or src/index.js (JavaScript if needed)

Output a JSON object with:
- files: array of {{path, purpose, dependencies}}
- techStack: array of technologies

Example for a landing page:
{{"files": [{{"path": "index.html", "purpose": "Main HTML page"}}, {{"path": "styles.css", "purpose": "CSS styles"}}, {{"path": "script.js", "purpose": "JavaScript functionality"}}], "techStack": ["HTML", "CSS", "JavaScript"]}}

Output ONLY valid JSON:"""

CODE_GENERATOR_PROMPT = """You are an expert developer. Generate production-ready code.

Project Context: {context}
File: {file_path}
Requirements: {requirements}

IMPORTANT RULES:
1. Generate COMPLETE, working code with NO placeholders
2. For HTML files: Include full <!DOCTYPE html>, <html>, <head>, and <body> tags
3. For CSS files: Include all necessary styles for the project
4. For JS files: Include complete, functional JavaScript
5. Use modern best practices
6. Make it fully responsive
7. Add helpful comments
8. NO explanations, ONLY code

Generate the complete {file_path} file:"""

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint."""
    try:
        return jsonify({"status": "healthy", "timestamp": datetime.now().isoformat()})
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        return jsonify(create_error_response("HEALTH_CHECK_ERROR", str(e))), 500

@app.route('/api/analyze', methods=['POST'])
def analyze_prompt():
    """Analyze user prompt and extract requirements."""
    try:
        data = request.json
        if not data:
            return jsonify(create_error_response("INVALID_REQUEST", "No data provided")), 400
        
        user_prompt = data.get('prompt', '')
        if not user_prompt:
            return jsonify(create_error_response("INVALID_REQUEST", "Prompt is required")), 400
        
        model = get_model()
        
        prompt = ANALYZER_PROMPT.format(prompt=user_prompt)
        
        response = model(
            prompt,
            max_tokens=500,
            temperature=0.1,
            stop=["User:", "\n\n"]
        )
        
        try:
            result = json.loads(response['choices'][0]['text'].strip())
        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse analyze response: {str(e)}, using fallback")
            # Fallback
            result = {
                "projectType": "web-app",
                "features": ["responsive design", "modern UI"],
                "styling": "modern",
                "framework": "vanilla-js"
            }
        
        return jsonify(result)
    
    except ModelLoadError as e:
        logger.error(f"Model load error in analyze: {str(e)}")
        return jsonify(create_error_response("MODEL_LOAD_ERROR", str(e), e.details)), 500
    
    except Exception as e:
        logger.error(f"Error in analyze_prompt: {str(e)}", exc_info=True)
        return jsonify(create_error_response("ANALYZE_ERROR", str(e))), 500

@app.route('/api/plan', methods=['POST'])
def create_plan():
    """Create project plan from requirements."""
    try:
        data = request.json
        if not data:
            return jsonify(create_error_response("INVALID_REQUEST", "No data provided")), 400
        
        requirements = data.get('requirements', {})
        if not requirements:
            return jsonify(create_error_response("INVALID_REQUEST", "Requirements are required")), 400
        
        model = get_model()
        
        prompt = PLANNER_PROMPT.format(requirements=json.dumps(requirements))
        
        response = model(
            prompt,
            max_tokens=800,
            temperature=0.1
        )
        
        try:
            result = json.loads(response['choices'][0]['text'].strip())
        except json.JSONDecodeError as e:
            logger.warning(f"Error parsing plan response: {e}")
            result = {}
        
        # Always ensure we have HTML files for web projects
        files = result.get('files', [])
        framework = requirements.get('framework', 'vanilla-js')
        project_type = requirements.get('projectType', 'web-app')
        
        # Check if we have any HTML files
        has_html = any('index.html' in str(f.get('path', '') if isinstance(f, dict) else f).lower() for f in files)
        
        # For web projects, we MUST have HTML
        if project_type in ['landing-page', 'web-app', 'portfolio', 'dashboard'] or framework != 'react':
            if not has_html:
                print("Warning: No HTML file in plan, adding index.html")
                # Remove any .jsx files if we're not using React
                if framework != 'react':
                    files = [f for f in files if not (isinstance(f, dict) and f.get('path', '').endswith('.jsx'))]
                # Prepend index.html
                files.insert(0, {"path": "index.html", "purpose": "Main HTML page"})
                result['files'] = files
            
            # Ensure we have CSS
            has_css = any('.css' in str(f.get('path', '') if isinstance(f, dict) else f).lower() for f in files)
            if not has_css:
                print("Warning: No CSS file in plan, adding styles.css")
                files.append({"path": "styles.css", "purpose": "CSS styles"})
                result['files'] = files
        
        # If result is empty, use fallback
        if not result or not result.get('files'):
            framework = requirements.get('framework', 'vanilla-js')
            if framework == 'react':
                result = {
                    "files": [
                        {"path": "index.html", "purpose": "Entry point"},
                        {"path": "src/App.jsx", "purpose": "Main component"},
                        {"path": "src/index.css", "purpose": "Styles"}
                    ],
                    "techStack": ["React", "Tailwind CSS"]
                }
            else:
                result = {
                    "files": [
                        {"path": "index.html", "purpose": "Main page"},
                        {"path": "styles.css", "purpose": "Styles"},
                        {"path": "script.js", "purpose": "Interactivity"}
                    ],
                    "techStack": ["HTML", "CSS", "JavaScript"]
                }
        
        return jsonify(result)
    
    except ModelLoadError as e:
        logger.error(f"Model load error in create_plan: {str(e)}")
        return jsonify(create_error_response("MODEL_LOAD_ERROR", str(e), e.details)), 500
    
    except Exception as e:
        logger.error(f"Error in create_plan: {str(e)}", exc_info=True)
        return jsonify(create_error_response("PLAN_ERROR", str(e))), 500
    
    except ModelLoadError as e:
        logger.error(f"Model load error in create_plan: {str(e)}")
        return jsonify(create_error_response("MODEL_LOAD_ERROR", str(e), e.details)), 500
    
    except Exception as e:
        logger.error(f"Error in create_plan: {str(e)}", exc_info=True)
        return jsonify(create_error_response("PLAN_ERROR", str(e))), 500

@socketio.on('generate_project')
def handle_generation(data):
    try:
        user_prompt = data.get('prompt', '')
        requirements = data.get('requirements', {})
        plan = data.get('plan', {})
        
        logger.info(f"Received generation request for: {user_prompt[:50]}...")
        logger.info(f"Plan files: {plan.get('files', [])}")
        
        model = get_model()
        
        project_id = f"project_{hash(user_prompt) % 10000}"
        project_dir = GENERATED_DIR / project_id
        project_dir.mkdir(parents=True, exist_ok=True)
        
        emit('status', {'message': 'Starting generation...', 'progress': 0})
        
        files = plan.get('files', [])
        
        # CRITICAL: Ensure index.html is always first for web projects
        framework = requirements.get('framework', 'vanilla-js')
        project_type = requirements.get('projectType', 'web-app')
        
        # Check if HTML file exists in plan
        has_html = any('index.html' in str(f.get('path', '') if isinstance(f, dict) else f).lower() for f in files)
        
        # Force HTML for non-React web projects
        if (project_type in ['landing-page', 'web-app', 'portfolio', 'dashboard'] or framework != 'react') and not has_html:
            logger.warning("CRITICAL: No HTML file in plan! Adding index.html as first file.")
            html_file = {"path": "index.html", "purpose": "Main HTML page"}
            files.insert(0, html_file)
        
        total_files = len(files)
        
        if total_files == 0:
            logger.warning("No files in plan!")
            emit('generation_complete', {
                'message': 'No files to generate',
                'projectId': project_id,
                'files': {},
                'downloadUrl': ''
            })
            return
        
        logger.info(f"Generating {total_files} files...")
        logger.info(f"Files to generate: {[f.get('path', f) if isinstance(f, dict) else f for f in files]}")
        generated_files = {}
        
        # Sort files to ensure HTML is generated first
        def file_priority(file_info):
            if isinstance(file_info, dict):
                path = file_info.get('path', '')
            else:
                path = str(file_info)
            if 'index.html' in path.lower():
                return 0  # Highest priority
            elif path.endswith('.html'):
                return 1
            elif path.endswith('.css'):
                return 2
            else:
                return 3
        
        files = sorted(files, key=file_priority)
    
        for idx, file_info in enumerate(files):
            # Handle both dict and string formats
            if isinstance(file_info, dict):
                file_path = file_info.get('path', '')
            else:
                file_path = str(file_info)
            
            if not file_path:
                logger.warning(f"Empty file path at index {idx}")
                continue
            
            # Normalize file path - remove leading slashes and ensure it's relative
            file_path = file_path.lstrip('/').lstrip('\\')
            
            logger.info(f"Generating file {idx+1}/{total_files}: {file_path}")
            
            emit('status', {
                'message': f'Generating {file_path}...',
                'progress': int((idx / total_files) * 100)
            })
            
            context = {
                "userPrompt": user_prompt,
                "requirements": requirements,
                "generatedFiles": list(generated_files.keys())
            }
            
            # Customize prompt based on file type
            base_prompt = CODE_GENERATOR_PROMPT.format(
                context=json.dumps(context),
                file_path=file_path,
                requirements=json.dumps(requirements)
            )
            
            # Add extra instructions for HTML files
            if file_path.endswith('.html') or file_path == 'index.html':
                prompt = base_prompt + "\n\nCRITICAL: This is an HTML file. You MUST generate a complete, valid HTML document with <!DOCTYPE html>, <html>, <head>, and <body> tags. Include all content in the HTML file itself."
            else:
                prompt = base_prompt
            
            try:
                # Define generation function for retry handler
                def generate_code_func(retry_prompt):
                    try:
                        response = model(
                            retry_prompt,
                            max_tokens=1500,
                            temperature=0.2,
                            stop=["```", "User:", "File:"]
                        )
                        
                        # Handle different response formats
                        if isinstance(response, dict):
                            if 'choices' in response and len(response['choices']) > 0:
                                code = response['choices'][0].get('text', '').strip()
                            else:
                                code = response.get('text', '').strip()
                        else:
                            code = str(response).strip()
                        
                        # Clean up code
                        code = code.replace('```html', '').replace('```javascript', '').replace('```css', '').replace('```jsx', '').replace('```', '').strip()
                        
                        if not code:
                            return {'code': None, 'error': 'Generated code is empty'}
                        
                        return {'code': code, 'error': None}
                    except Exception as e:
                        logger.error(f"Generation error for {file_path}: {str(e)}")
                        return {'code': None, 'error': str(e)}
                
                # Initial generation attempt
                result = generate_code_func(prompt)
                
                if not result['code']:
                    # Retry with error feedback
                    logger.warning(f"Initial generation failed for {file_path}: {result['error']}")
                    retry_result = retry_handler.retry_with_feedback(
                        generate_code_func,
                        prompt,
                        result['error'],
                        file_path,
                        attempt=0
                    )
                    
                    if not retry_result['success']:
                        logger.error(f"Failed to generate {file_path} after retries: {retry_result['error']}")
                        emit('file_error', {
                            'path': file_path,
                            'error': retry_result['error'],
                            'attempts': retry_result['attempt']
                        })
                        continue
                    
                    code = retry_result['code']
                else:
                    code = result['code']
                
                # Validate the generated code
                validation_result = validator.validate_file(code, file_path)
                
                # Use fixed code if available
                if validation_result.get('fixed_code'):
                    code = validation_result['fixed_code']
                    logger.info(f"Auto-fixed {file_path}: {validation_result.get('fixes_applied', [])}")
                
                # Emit validation results
                emit('file_validated', {
                    'path': file_path,
                    'is_valid': validation_result['is_valid'],
                    'errors': validation_result['errors'],
                    'warnings': validation_result['warnings'],
                    'fixes_applied': validation_result.get('fixes_applied', [])
                })
                
                # If validation failed and couldn't be fixed, retry generation
                if not validation_result['is_valid'] and not validation_result.get('fixed_code'):
                    error_context = f"Validation errors: {', '.join(validation_result['errors'])}"
                    logger.warning(f"Validation failed for {file_path}, retrying: {error_context}")
                    
                    retry_result = retry_handler.retry_with_feedback(
                        generate_code_func,
                        prompt,
                        error_context,
                        file_path,
                        attempt=0
                    )
                    
                    if retry_result['success']:
                        code = retry_result['code']
                        # Re-validate retried code
                        validation_result = validator.validate_file(code, file_path)
                        if validation_result.get('fixed_code'):
                            code = validation_result['fixed_code']
                    else:
                        logger.error(f"Failed to generate valid code for {file_path} after validation retry")
                        emit('file_error', {
                            'path': file_path,
                            'error': f"Validation failed: {', '.join(validation_result['errors'])}",
                            'attempts': retry_result['attempt']
                        })
                        continue
                
                # Save file - ensure path is relative to project_dir
                full_path = project_dir / file_path
                full_path = full_path.resolve()
                project_dir_resolved = project_dir.resolve()
                
                # Security check: ensure the file is within project_dir
                if not str(full_path).startswith(str(project_dir_resolved)):
                    logger.error(f"Security violation: Attempted to write outside project directory: {file_path}")
                    emit('file_error', {
                        'path': file_path,
                        'error': 'Security violation: Invalid file path',
                        'attempts': 0
                    })
                    continue
                
                full_path.parent.mkdir(parents=True, exist_ok=True)
                full_path.write_text(code)
                
                generated_files[file_path] = code
                
                logger.info(f"Successfully generated {file_path} ({len(code)} chars)")
                
                emit('file_generated', {
                    'path': file_path,
                    'content': code,
                    'validation': {
                        'is_valid': validation_result['is_valid'],
                        'warnings': validation_result['warnings']
                    }
                })
                
            except TimeoutError as e:
                logger.error(f"Timeout generating {file_path}: {str(e)}")
                emit('file_error', {
                    'path': file_path,
                    'error': f"Generation timed out after 30 seconds",
                    'attempts': 0
                })
                continue
            except GenerationError as e:
                logger.error(f"Generation error for {file_path}: {str(e)}")
                emit('file_error', {
                    'path': file_path,
                    'error': str(e),
                    'attempts': 0
                })
                continue
            except Exception as e:
                logger.error(f"Unexpected error generating {file_path}: {str(e)}", exc_info=True)
                emit('file_error', {
                    'path': file_path,
                    'error': f"Unexpected error: {str(e)}",
                    'attempts': 0
                })
                continue
        
        # Create ZIP
        if generated_files:
            zip_path = GENERATED_DIR / f"{project_id}.zip"
            with zipfile.ZipFile(str(zip_path), 'w') as zipf:
                for file_path, content in generated_files.items():
                    zipf.writestr(file_path, content)
            logger.info(f"Created ZIP: {zip_path}")
        
        # Get validation and retry metrics
        validation_metrics = validator.get_metrics()
        retry_metrics = retry_handler.get_metrics()
        
        emit('generation_complete', {
            'message': 'Project generated successfully!',
            'projectId': project_id,
            'files': generated_files,
            'downloadUrl': f'/api/download/{project_id}',
            'metrics': {
                'files_generated': len(generated_files),
                'validation': validation_metrics,
                'retries': retry_metrics
            }
        })
        logger.info(f"Generation complete: {len(generated_files)} files generated")
        logger.info(f"Validation metrics: {validation_metrics}")
        logger.info(f"Retry metrics: {retry_metrics}")
        
    except ModelLoadError as e:
        logger.error(f"Model load error in handle_generation: {str(e)}")
        emit('generation_complete', {
            'message': f'Model load error: {str(e)}',
            'projectId': '',
            'files': {},
            'downloadUrl': '',
            'error': {
                'code': 'MODEL_LOAD_ERROR',
                'message': str(e),
                'details': e.details
            }
        })
    except Exception as e:
        logger.error(f"Error in handle_generation: {str(e)}", exc_info=True)
        emit('generation_complete', {
            'message': f'Error: {str(e)}',
            'projectId': '',
            'files': {},
            'downloadUrl': '',
            'error': {
                'code': 'GENERATION_ERROR',
                'message': str(e)
            }
        })

@app.route('/api/download/<project_id>', methods=['GET'])
def download_project(project_id):
    zip_path = GENERATED_DIR / f"{project_id}.zip"
    if zip_path.exists():
        return send_file(str(zip_path), as_attachment=True)
    return jsonify({"error": "Project not found"}), 404

if __name__ == '__main__':
    GENERATED_DIR.mkdir(parents=True, exist_ok=True)
    logger.info("Starting server on http://localhost:5001")
    logger.info(f"Project root: {BASE_DIR}")
    logger.info(f"Model path: {MODEL_PATH}")
    logger.info(f"Generated dir: {GENERATED_DIR}")
    socketio.run(app, host='0.0.0.0', port=5001, debug=True)
