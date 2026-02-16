import { getLlama, LlamaChatSession } from "node-llama-cpp";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Adjust path to point to the correct model location
const MODEL_PATH = path.join(__dirname, "../../../models/codellama-7b-instruct.Q4_K_M.gguf");

let model = null;
let context = null;
let llama = null;

// Simple Mutex for serial execution to prevent "No sequences left"
class Mutex {
    constructor() {
        this._queue = [];
        this._locked = false;
    }

    async acquire() {
        if (this._locked) {
            await new Promise(resolve => this._queue.push(resolve));
        }
        this._locked = true;
    }

    release() {
        if (this._queue.length > 0) {
            const resolve = this._queue.shift();
            resolve();
        } else {
            this._locked = false;
        }
    }
}

const generationMutex = new Mutex();

export const ANALYZER_PROMPT = `You are an expert requirements analyzer for web development projects.

Analyze this user request and extract detailed requirements:
"{prompt}"

Provide a comprehensive analysis with:
1. Project Type: landing-page | web-app | dashboard | portfolio | ecommerce | blog | documentation
2. Core Features: List all specific features requested
3. Design Style: modern | minimal | colorful | professional | elegant | creative
4. Complexity Level: simple | intermediate | advanced
5. Framework Preference: vanilla-js (default for simple projects) | react (for complex apps)
6. Special Requirements: animations, interactivity, responsiveness, accessibility

Output ONLY valid JSON. Do not include any other text, markdown formatting, or explanations.
JSON structure:
{
  "projectType": "<type>",
  "features": ["feature1", "feature2", ...],
  "styling": "<style>",
  "complexity": "<level>",
  "framework": "<framework>",
  "colorScheme": "<auto-suggested colors>",
  "layout": "<suggested layout type>"
}`;

export const PLANNER_PROMPT = `You are an expert web architect creating production-ready file structures.

Project Requirements:
{requirements}

CRITICAL RULES:
1. ALWAYS include index.html as the main entry point
2. Include styles.css for all styling (use modern CSS features)
3. Include script.js only if interactivity is needed
4. Keep structure simple and organized
5. Follow web development best practices

For a {projectType}, create a file structure that includes:
- index.html: Complete, semantic HTML5 with proper structure
- styles.css: Modern, responsive CSS with variables and flexbox/grid
- script.js: Clean, well-organized JavaScript (if needed)
- Additional files only if absolutely necessary

Output ONLY this JSON (no explanations):
{
  "files": [
    {"path": "index.html", "purpose": "Main HTML page with complete structure", "priority": 1},
    {"path": "styles.css", "purpose": "Modern responsive styles", "priority": 2},
    {"path": "script.js", "purpose": "Interactive features", "priority": 3}
  ],
  "techStack": ["HTML5", "CSS3", "JavaScript ES6+"],
  "designSystem": {"colors": [], "fonts": [], "spacing": ""}
}`;

export const CODE_GENERATOR_PROMPT = `You are a senior full-stack developer creating production-quality code.

CONTEXT:
- User Request: {userPrompt}
- Project Type: {projectType}
- Design Style: {styling}
- File to Generate: {file_path}

REQUIREMENTS:
{requirements}

MANDATORY CODE QUALITY STANDARDS:
1. COMPLETE, PRODUCTION-READY CODE - No placeholders, todos, or comments like "add content here"
2. SEMANTIC HTML5 - Proper tags (header, nav, main, section, footer, article)
3. MODERN CSS - Use CSS Grid, Flexbox, CSS Variables, smooth transitions
4. RESPONSIVE DESIGN - Mobile-first approach with proper breakpoints
5. ACCESSIBILITY - ARIA labels, semantic structure, keyboard navigation
6. BEST PRACTICES - Clean, maintainable, well-commented code
7. BROWSER COMPATIBILITY - Modern browsers (Chrome, Firefox, Safari, Edge)
8. PERFORMANCE - Optimized, fast-loading code

SPECIFIC INSTRUCTIONS FOR {file_path}:

HTML FILES:
- Complete <!DOCTYPE html> structure with proper head and body
- Include viewport meta tag, charset, and descriptive title
- Use semantic HTML5 elements
- Add Open Graph tags for social sharing
- Include all content - no placeholders!
- Link styles.css and script.js properly

CSS FILES:
- Start with CSS reset/normalization
- Use CSS custom properties for colors, spacing, fonts
- Mobile-first responsive design with breakpoints
- Smooth transitions and hover effects
- Modern layouts with Grid and Flexbox
- Typography scale and spacing system
- Dark mode support if appropriate

JAVASCRIPT FILES:
- Clean, modular ES6+ code
- Proper error handling
- Event delegation for better performance
- Smooth animations using RAF or CSS
- No jQuery - use vanilla JS
- Comments explaining complex logic

REACT/JSX FILES:
- Use functional components with hooks (useState, useEffect)
- Use 'className' instead of 'class'
- Always export the component as default
- Import React and necessary hooks
- Use Tailwind CSS classes for styling if applicable
- Handle loading and error states

Generate ONLY the code for {file_path} - NO explanations, NO markdown formatting:`;

export const initializeModel = async () => {
    if (context) return { model, context };
    
    try {
        console.log("Initializing Llama model...");
        llama = await getLlama();
        
        model = await llama.loadModel({
            modelPath: MODEL_PATH,
            gpuLayers: 35 // Adjust based on system
        });
        
        // Ensure enough sequences for concurrent requests
        context = await model.createContext({
            contextSize: 2048, // Reduced from 4096 to save VRAM
            batchSize: 512,    // nBatch
            sequences: 3       // Reduced from 10 to 3 to save VRAM
        });
        
        console.log("Model loaded successfully");
        return { model, context };
    } catch (e) {
        console.error("Failed to load model:", e);
        throw e;
    }
};

export const generateCompletion = async (prompt, options = {}) => {
    await generationMutex.acquire();
    let session = null;
    try {
        const { context } = await initializeModel();
        
        // Create a new session for each request or reuse if needed
        // For simple completion, we can use the context directly or a session
        session = new LlamaChatSession({
            contextSequence: context.getSequence()
        });

        // Simple completion wrapper
        // Note: node-llama-cpp API varies, using prompt() on session is standard for chat
        // For raw completion, we might need a different approach, but chat is fine
        
        const response = await session.prompt(prompt, {
            maxTokens: options.maxTokens || 2048,
            temperature: options.temperature || 0.1,
            topP: options.topP || 0.95,
            topK: options.topK || 40,
            repeatPenalty: options.repeatPenalty || 1.1,
            stopOnAbortSignal: true,
            ...options
        });

        return response;
    } catch (e) {
        console.error("Generation error:", e);
        throw e;
    } finally {
        if (session) {
            session.dispose();
        }
        generationMutex.release();
    }
};
