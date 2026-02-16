import { useState } from 'react';
import { Sparkles, Code, Zap, Rocket, ArrowRight, Github, Star } from 'lucide-react';
import PromptInput from './PromptInput';

export default function LandingPage() {
  const [showPrompt, setShowPrompt] = useState(false);

  const features = [
    {
      icon: <Code size={24} />,
      title: 'AI-Powered Generation',
      description: 'Transform your ideas into working code with advanced AI models'
    },
    {
      icon: <Zap size={24} />,
      title: 'Instant Preview',
      description: 'See your project come to life in real-time with live preview'
    },
    {
      icon: <Rocket size={24} />,
      title: 'Full-Stack Projects',
      description: 'Generate complete web applications with HTML, CSS, and JavaScript'
    }
  ];

  const examples = [
    "Create a modern landing page with hero section, features, and pricing",
    "Build a todo app with add, delete, and mark complete functionality",
    "Make a portfolio website with projects gallery and contact form",
    "Design a dashboard with charts and data visualization"
  ];

  const handleGetStarted = () => {
    setShowPrompt(true);
    // Scroll to prompt input
    setTimeout(() => {
      const promptElement = document.querySelector('.prompt-input');
      promptElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
  };

  return (
    <div className="landing-page">
      <div className="landing-hero">
        <div className="hero-background">
          <div className="gradient-orb orb-1"></div>
          <div className="gradient-orb orb-2"></div>
          <div className="gradient-orb orb-3"></div>
        </div>
        
        <div className="hero-content">
          <div className="hero-badge">
            <Sparkles size={16} />
            <span>Powered by AI</span>
          </div>
          
          <h1 className="hero-title">
            Build <span className="gradient-text">Web Projects</span>
            <br />
            with Natural Language
          </h1>
          
          <p className="hero-description">
            Describe what you want to build, and watch as AI generates a complete,
            working web application in seconds. No coding required.
          </p>
          
          <div className="hero-actions">
            <button onClick={handleGetStarted} className="btn-primary-large">
              Get Started
              <ArrowRight size={20} />
            </button>
            <button className="btn-secondary-large">
              <Github size={20} />
              View on GitHub
            </button>
          </div>
          
          <div className="hero-stats">
            <div className="stat-item">
              <div className="stat-value">10K+</div>
              <div className="stat-label">Projects Generated</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">99%</div>
              <div className="stat-label">Success Rate</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">5⭐</div>
              <div className="stat-label">User Rating</div>
            </div>
          </div>
        </div>
      </div>

      {showPrompt && (
        <div className="landing-prompt-section">
          <div className="prompt-container">
            <h2>What would you like to build?</h2>
            <PromptInput />
          </div>
        </div>
      )}

      <div className="landing-features">
        <h2 className="section-title">Why Choose AI Code Generator?</h2>
        <div className="features-grid">
          {features.map((feature, index) => (
            <div key={index} className="feature-card">
              <div className="feature-icon">{feature.icon}</div>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="landing-examples">
        <h2 className="section-title">Try These Examples</h2>
        <div className="examples-grid">
          {examples.map((example, index) => (
            <div 
              key={index} 
              className="example-card"
              onClick={() => {
                setShowPrompt(true);
                setTimeout(() => {
                  const textarea = document.querySelector('.prompt-input textarea') as HTMLTextAreaElement;
                  if (textarea) {
                    textarea.value = example;
                    textarea.dispatchEvent(new Event('input', { bubbles: true }));
                  }
                }, 100);
              }}
            >
              <div className="example-icon">
                <Star size={20} />
              </div>
              <p>{example}</p>
              <ArrowRight size={16} className="example-arrow" />
            </div>
          ))}
        </div>
      </div>

      <div className="landing-footer">
        <p>Built with ❤️ using React, TypeScript, and AI</p>
        <div className="footer-links">
          <a href="#">Documentation</a>
          <a href="#">Support</a>
          <a href="#">Privacy</a>
        </div>
      </div>
    </div>
  );
}
