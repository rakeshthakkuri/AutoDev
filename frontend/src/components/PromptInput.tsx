import { useState, useEffect } from 'react';
import { Wand2 } from 'lucide-react';
import { GenerationStore } from '../store/generation';

interface PromptInputProps {
  onGenerate?: (prompt: string) => void;
  initialValue?: string;
}

export default function PromptInput({ onGenerate, initialValue = '' }: PromptInputProps) {
  const [prompt, setPrompt] = useState(initialValue);
  const { generateProject, isGenerating } = GenerationStore();
  
  // Update prompt when initialValue changes
  useEffect(() => {
    if (initialValue && !prompt) {
      setPrompt(initialValue);
    }
  }, [initialValue]);

  const handleGenerate = () => {
    if (prompt.trim() && !isGenerating) {
      if (onGenerate) {
        onGenerate(prompt);
      }
      generateProject(prompt);
    }
  };

  const examples = [
    "Create a landing page for a SaaS product with hero section, features, and pricing",
    "Build a todo app with add, delete, and mark complete functionality",
    "Make a portfolio website with projects gallery and contact form"
  ];

  return (
    <div className="prompt-input">
      <h2>What do you want to build?</h2>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Describe your project in natural language..."
        rows={6}
        disabled={isGenerating}
      />
      <button onClick={handleGenerate} disabled={isGenerating || !prompt.trim()}>
        <Wand2 size={20} />
        {isGenerating ? 'Generating...' : 'Generate Project'}
      </button>
      
      <div className="examples">
        <p>Examples:</p>
        {examples.map((ex, i) => (
          <button key={i} className="example" onClick={() => setPrompt(ex)}>
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}
