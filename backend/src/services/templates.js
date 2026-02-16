
export const getModernHtmlTemplate = (type = 'landing-page', title = 'My Website', description = '') => {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="${description || 'A modern website built with AI'}">
    <title>${title}</title>
    <link rel="stylesheet" href="styles.css">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --primary: #4f46e5;
            --primary-dark: #4338ca;
            --secondary: #10b981;
            --text-main: #1f2937;
            --text-light: #6b7280;
            --bg-light: #f9fafb;
            --white: #ffffff;
            --max-width: 1200px;
        }
    </style>
</head>
<body>
    <header class="header">
        <nav class="nav-container">
            <div class="logo">${title}</div>
            <ul class="nav-links">
                <li><a href="#home" class="active">Home</a></li>
                <li><a href="#features">Features</a></li>
                <li><a href="#about">About</a></li>
                <li><a href="#contact" class="btn-primary">Get Started</a></li>
            </ul>
            <button class="mobile-menu-btn" aria-label="Toggle menu">
                <span></span>
                <span></span>
                <span></span>
            </button>
        </nav>
    </header>

    <main>
        <section id="home" class="hero">
            <div class="container">
                <div class="hero-content">
                    <h1>Build Something <span class="text-gradient">Amazing</span></h1>
                    <p class="hero-subtitle">${description || 'Create stunning web experiences with our modern platform. Fast, responsive, and accessible by default.'}</p>
                    <div class="cta-group">
                        <a href="#contact" class="btn btn-primary">Start Now</a>
                        <a href="#features" class="btn btn-outline">Learn More</a>
                    </div>
                </div>
                <div class="hero-image">
                    <div class="placeholder-image">Hero Image</div>
                </div>
            </div>
        </section>

        <section id="features" class="features">
            <div class="container">
                <div class="section-header">
                    <h2>Why Choose Us</h2>
                    <p>Everything you need to succeed online</p>
                </div>
                <div class="feature-grid">
                    <div class="feature-card">
                        <div class="icon">🚀</div>
                        <h3>Lightning Fast</h3>
                        <p>Optimized for speed and performance across all devices.</p>
                    </div>
                    <div class="feature-card">
                        <div class="icon">📱</div>
                        <h3>Fully Responsive</h3>
                        <p>Looks perfect on desktops, tablets, and mobile phones.</p>
                    </div>
                    <div class="feature-card">
                        <div class="icon">🛡️</div>
                        <h3>Secure by Design</h3>
                        <p>Built with security best practices from the ground up.</p>
                    </div>
                </div>
            </div>
        </section>

        <section id="about" class="about">
            <div class="container">
                <div class="about-grid">
                    <div class="about-content">
                        <h2>About Our Platform</h2>
                        <p>We believe in making web development accessible to everyone. Our tools help you build professional websites in minutes, not days.</p>
                        <ul class="check-list">
                            <li>Modern Technology Stack</li>
                            <li>Professional Design Patterns</li>
                            <li>SEO Optimized Structure</li>
                        </ul>
                    </div>
                    <div class="about-image">
                        <div class="placeholder-image">About Image</div>
                    </div>
                </div>
            </div>
        </section>
    </main>

    <footer class="footer">
        <div class="container">
            <div class="footer-grid">
                <div class="footer-col">
                    <h4>${title}</h4>
                    <p>Building the future of the web.</p>
                </div>
                <div class="footer-col">
                    <h4>Links</h4>
                    <a href="#home">Home</a>
                    <a href="#features">Features</a>
                    <a href="#about">About</a>
                </div>
                <div class="footer-col">
                    <h4>Legal</h4>
                    <a href="#">Privacy</a>
                    <a href="#">Terms</a>
                </div>
                <div class="footer-col">
                    <h4>Social</h4>
                    <div class="social-links">
                        <a href="#">Twitter</a>
                        <a href="#">GitHub</a>
                        <a href="#">LinkedIn</a>
                    </div>
                </div>
            </div>
            <div class="footer-bottom">
                <p>&copy; ${new Date().getFullYear()} ${title}. All rights reserved.</p>
            </div>
        </div>
    </footer>

    <script src="script.js"></script>
</body>
</html>`;
};

export const getModernCssTemplate = () => {
    return `/* Modern CSS Reset & Variables */
* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

:root {
    --primary: #4f46e5;
    --primary-dark: #4338ca;
    --secondary: #10b981;
    --text-main: #1f2937;
    --text-light: #6b7280;
    --bg-light: #f9fafb;
    --white: #ffffff;
    --border: #e5e7eb;
    --shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    --radius: 0.5rem;
    --transition: all 0.3s ease;
}

body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    line-height: 1.6;
    color: var(--text-main);
    background-color: var(--white);
}

/* Typography */
h1, h2, h3, h4 {
    line-height: 1.2;
    margin-bottom: 1rem;
    color: var(--text-main);
}

h1 { font-size: 3.5rem; font-weight: 800; }
h2 { font-size: 2.5rem; font-weight: 700; }
h3 { font-size: 1.5rem; font-weight: 600; }

.text-gradient {
    background: linear-gradient(135deg, var(--primary), var(--secondary));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
}

/* Layout */
.container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 1.5rem;
}

section {
    padding: 5rem 0;
}

/* Header & Nav */
.header {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(10px);
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    z-index: 1000;
}

.nav-container {
    display: flex;
    justify-content: space-between;
    align-items: center;
    max-width: 1200px;
    margin: 0 auto;
    padding: 1rem 1.5rem;
}

.logo {
    font-size: 1.5rem;
    font-weight: 800;
    color: var(--primary);
}

.nav-links {
    display: flex;
    gap: 2rem;
    list-style: none;
    align-items: center;
}

.nav-links a {
    text-decoration: none;
    color: var(--text-main);
    font-weight: 500;
    transition: var(--transition);
}

.nav-links a:hover {
    color: var(--primary);
}

/* Buttons */
.btn {
    display: inline-block;
    padding: 0.75rem 1.5rem;
    border-radius: var(--radius);
    text-decoration: none;
    font-weight: 600;
    transition: var(--transition);
    cursor: pointer;
    border: 2px solid transparent;
}

.btn-primary {
    background-color: var(--primary);
    color: var(--white) !important;
}

.btn-primary:hover {
    background-color: var(--primary-dark);
    transform: translateY(-2px);
}

.btn-outline {
    background-color: transparent;
    border-color: var(--primary);
    color: var(--primary) !important;
}

.btn-outline:hover {
    background-color: var(--primary);
    color: var(--white) !important;
}

/* Hero Section */
.hero {
    padding-top: 8rem;
    background: linear-gradient(to bottom, var(--bg-light), var(--white));
}

.hero-content {
    text-align: center;
    max-width: 800px;
    margin: 0 auto 4rem;
}

.hero-subtitle {
    font-size: 1.25rem;
    color: var(--text-light);
    margin-bottom: 2rem;
}

.cta-group {
    display: flex;
    gap: 1rem;
    justify-content: center;
}

.hero-image {
    background: var(--bg-light);
    border-radius: 1rem;
    overflow: hidden;
    box-shadow: var(--shadow);
    margin-top: 3rem;
}

.placeholder-image {
    height: 400px;
    background: #e5e7eb;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-light);
    font-size: 2rem;
    font-weight: 600;
}

/* Features Section */
.features {
    background-color: var(--white);
}

.section-header {
    text-align: center;
    margin-bottom: 4rem;
}

.feature-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 2rem;
}

.feature-card {
    padding: 2rem;
    background: var(--bg-light);
    border-radius: 1rem;
    transition: var(--transition);
}

.feature-card:hover {
    transform: translateY(-5px);
    box-shadow: var(--shadow);
}

.icon {
    font-size: 2.5rem;
    margin-bottom: 1rem;
}

/* Footer */
.footer {
    background-color: #111827;
    color: var(--white);
    padding: 4rem 0 2rem;
}

.footer-grid {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr 1fr;
    gap: 4rem;
    margin-bottom: 3rem;
}

.footer-col h4 {
    color: var(--white);
    margin-bottom: 1.5rem;
}

.footer-col a {
    display: block;
    color: #9ca3af;
    text-decoration: none;
    margin-bottom: 0.5rem;
    transition: var(--transition);
}

.footer-col a:hover {
    color: var(--white);
}

.footer-bottom {
    border-top: 1px solid #374151;
    padding-top: 2rem;
    text-align: center;
    color: #9ca3af;
}

/* Mobile Responsive */
@media (max-width: 768px) {
    h1 { font-size: 2.5rem; }
    
    .nav-links {
        display: none;
    }
    
    .mobile-menu-btn {
        display: block;
    }
    
    .footer-grid {
        grid-template-columns: 1fr;
        gap: 2rem;
    }
    
    .cta-group {
        flex-direction: column;
    }
}
`;
};

export const getModernJavascriptTemplate = () => {
    return `/**
 * Main Application Logic
 * Handles interactions, animations, and state management
 */

document.addEventListener('DOMContentLoaded', () => {
    // Initialize application
    initApp();
});

const initApp = () => {
    setupNavigation();
    setupAnimations();
    setupSmoothScroll();
};

// Navigation Handling
const setupNavigation = () => {
    const header = document.querySelector('.header');
    const mobileBtn = document.querySelector('.mobile-menu-btn');
    const navLinks = document.querySelector('.nav-links');
    
    // Sticky header effect
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    });
    
    // Mobile menu toggle
    if (mobileBtn) {
        mobileBtn.addEventListener('click', () => {
            navLinks.classList.toggle('active');
            mobileBtn.classList.toggle('active');
        });
    }
};

// Intersection Observer for animations
const setupAnimations = () => {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px'
    };
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-in');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);
    
    // Observe all cards and sections
    document.querySelectorAll('.feature-card, .hero-content, .about-content').forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'opacity 0.6s ease-out, transform 0.6s ease-out';
        observer.observe(el);
    });
    
    // Add animation class logic
    document.head.insertAdjacentHTML('beforeend', \`
        <style>
            .animate-in {
                opacity: 1 !important;
                transform: translateY(0) !important;
            }
        </style>
    \`);
};

// Smooth Scrolling
const setupSmoothScroll = () => {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            const target = document.querySelector(targetId);
            
            if (target) {
                const headerOffset = 80;
                const elementPosition = target.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
                
                window.scrollTo({
                    top: offsetPosition,
                    behavior: "smooth"
                });
                
                // Close mobile menu if open
                const navLinks = document.querySelector('.nav-links');
                if (navLinks && navLinks.classList.contains('active')) {
                    navLinks.classList.remove('active');
                }
            }
        });
    });
};
`;
};

export const getModernReactTemplate = (componentName = "App", title = "My App", description = "") => {
    return `import React, { useState, useEffect } from 'react';
import './index.css';

const ${componentName} = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  const toggleMenu = () => setIsMenuOpen(!isMenuOpen);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-50">
        <nav className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="text-xl font-bold text-indigo-600">${title}</div>
          
          {/* Desktop Menu */}
          <div className="hidden md:flex space-x-6">
            <a href="#home" className="text-gray-600 hover:text-indigo-600 transition">Home</a>
            <a href="#features" className="text-gray-600 hover:text-indigo-600 transition">Features</a>
            <a href="#about" className="text-gray-600 hover:text-indigo-600 transition">About</a>
            <a href="#contact" className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition">Contact</a>
          </div>

          {/* Mobile Menu Button */}
          <button onClick={toggleMenu} className="md:hidden text-gray-600 focus:outline-none">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {isMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </nav>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <div className="md:hidden bg-white border-t border-gray-100 py-2">
            <a href="#home" className="block px-4 py-2 text-gray-600 hover:bg-gray-50">Home</a>
            <a href="#features" className="block px-4 py-2 text-gray-600 hover:bg-gray-50">Features</a>
            <a href="#about" className="block px-4 py-2 text-gray-600 hover:bg-gray-50">About</a>
            <a href="#contact" className="block px-4 py-2 text-indigo-600 font-medium hover:bg-gray-50">Contact</a>
          </div>
        )}
      </header>

      <main>
        {/* Hero Section */}
        <section id="home" className="py-20 bg-gradient-to-br from-indigo-50 to-purple-50">
          <div className="container mx-auto px-4 text-center">
            <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              Welcome to ${title}
            </h1>
            <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
              ${description || "Experience the future of web development with our modern React application."}
            </p>
            <div className="flex justify-center gap-4">
              <button className="px-8 py-3 bg-indigo-600 text-white rounded-lg shadow-lg hover:bg-indigo-700 transition transform hover:-translate-y-1">
                Get Started
              </button>
              <button className="px-8 py-3 bg-white text-indigo-600 border border-indigo-200 rounded-lg shadow-sm hover:bg-gray-50 transition">
                Learn More
              </button>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="py-20 bg-white">
          <div className="container mx-auto px-4">
            <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">Key Features</h2>
            <div className="grid md:grid-cols-3 gap-8">
              {[
                { title: 'Modern Stack', desc: 'Built with React and Tailwind CSS' },
                { title: 'Responsive', desc: 'Looks great on all devices' },
                { title: 'Fast', desc: 'Optimized for performance' }
              ].map((feature, idx) => (
                <div key={idx} className="p-6 bg-gray-50 rounded-xl hover:shadow-md transition duration-300">
                  <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center mb-4">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                  <p className="text-gray-600">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-gray-900 text-white py-12">
        <div className="container mx-auto px-4 text-center">
          <p>&copy; ${new Date().getFullYear()} ${title}. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default ${componentName};
`;
};

export const getTemplate = (filePath, projectContext = {}) => {
    const context = projectContext || {};
    const projectType = context.projectType || 'landing-page';
    const title = context.title || 'My Website';
    const description = context.description || '';
    
    if (filePath.endsWith('.html') || filePath === 'index.html') {
        return getModernHtmlTemplate(projectType, title, description);
    } else if (filePath.endsWith('.css')) {
        return getModernCssTemplate();
    } else if (filePath.endsWith('.js')) {
        return getModernJavascriptTemplate();
    } else if (filePath.endsWith('.jsx') || filePath.endsWith('.tsx')) {
        let componentName = "App";
        if (filePath.includes('/')) {
            const filename = filePath.split('/').pop();
            componentName = filename.split('.')[0];
        } else if (filePath.includes('.')) {
            componentName = filePath.split('.')[0];
        }
        
        // Capitalize first letter
        componentName = componentName.charAt(0).toUpperCase() + componentName.slice(1);
        return getModernReactTemplate(componentName, title, description);
    } else {
        return `// Template for ${filePath}\n// Content would be generated here`;
    }
};
