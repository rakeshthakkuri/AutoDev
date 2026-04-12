// ═══════════════════════════════════════════════════════════════════════════════
// Comprehensive Template Library — fallback templates for 8 frameworks
// ═══════════════════════════════════════════════════════════════════════════════

import config from '../config.js';

const year = new Date().getFullYear();

// ─── Package.json Templates ─────────────────────────────────────────────────

const packageJsonTemplates = {
    react: (title) => JSON.stringify({
        name: slug(title), version: '0.1.0', private: true, type: 'module',
        scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' },
        dependencies: { react: '^18.2.0', 'react-dom': '^18.2.0' },
        devDependencies: { '@vitejs/plugin-react': '^4.2.1', vite: '^5.0.0' }
    }, null, 2),

    'react-ts': (title) => JSON.stringify({
        name: slug(title), version: '0.1.0', private: true, type: 'module',
        scripts: { dev: 'vite', build: 'tsc && vite build', preview: 'vite preview' },
        dependencies: { react: '^18.2.0', 'react-dom': '^18.2.0' },
        devDependencies: {
            '@types/react': '^18.2.43', '@types/react-dom': '^18.2.17',
            '@vitejs/plugin-react': '^4.2.1', typescript: '^5.3.0', vite: '^5.0.0'
        }
    }, null, 2),

    nextjs: (title) => JSON.stringify({
        name: slug(title), version: '0.1.0', private: true,
        scripts: { dev: 'next dev', build: 'next build', start: 'next start', lint: 'next lint' },
        dependencies: { next: '^14.1.0', react: '^18.2.0', 'react-dom': '^18.2.0' },
        devDependencies: { '@types/node': '^20.0.0', '@types/react': '^18.2.43', typescript: '^5.3.0', autoprefixer: '^10.4.0', postcss: '^8.4.0', tailwindcss: '^3.4.0' }
    }, null, 2),

    vue: (title) => JSON.stringify({
        name: slug(title), version: '0.1.0', private: true, type: 'module',
        scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' },
        dependencies: { vue: '^3.4.0' },
        devDependencies: { '@vitejs/plugin-vue': '^5.0.0', vite: '^5.0.0' }
    }, null, 2),

    svelte: (title) => JSON.stringify({
        name: slug(title), version: '0.1.0', private: true, type: 'module',
        scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' },
        dependencies: {},
        devDependencies: { '@sveltejs/vite-plugin-svelte': '^3.0.0', svelte: '^4.2.0', vite: '^5.0.0' }
    }, null, 2),

    angular: (title) => JSON.stringify({
        name: slug(title), version: '0.1.0', private: true,
        scripts: { start: 'ng serve', build: 'ng build', test: 'ng test' },
        dependencies: { '@angular/core': '^17.0.0', '@angular/common': '^17.0.0', '@angular/compiler': '^17.0.0', '@angular/platform-browser': '^17.0.0', '@angular/platform-browser-dynamic': '^17.0.0', rxjs: '^7.8.0', 'zone.js': '^0.14.0', tslib: '^2.6.0' },
        devDependencies: { '@angular/cli': '^17.0.0', '@angular/compiler-cli': '^17.0.0', typescript: '^5.3.0' }
    }, null, 2),

    astro: (title) => JSON.stringify({
        name: slug(title), version: '0.1.0', private: true, type: 'module',
        scripts: { dev: 'astro dev', build: 'astro build', preview: 'astro preview' },
        dependencies: { astro: '^4.0.0' },
        devDependencies: {}
    }, null, 2),
};

// ─── Config File Templates ──────────────────────────────────────────────────

const configTemplates = {
    'tsconfig.json': (framework) => {
        const base = { compilerOptions: { target: 'ES2020', module: 'ESNext', moduleResolution: 'bundler', strict: true, esModuleInterop: true, skipLibCheck: true, forceConsistentCasingInFileNames: true } };
        if (framework === 'react-ts' || framework === 'react') {
            base.compilerOptions.jsx = 'react-jsx';
            base.compilerOptions.lib = ['ES2020', 'DOM', 'DOM.Iterable'];
            base.include = ['src'];
        } else if (framework === 'nextjs') {
            base.compilerOptions.jsx = 'preserve';
            base.compilerOptions.lib = ['dom', 'dom.iterable', 'esnext'];
            base.compilerOptions.allowJs = true;
            base.compilerOptions.incremental = true;
            base.compilerOptions.plugins = [{ name: 'next' }];
            base.compilerOptions.paths = { '@/*': ['./*'] };
            base.include = ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'];
            base.exclude = ['node_modules'];
        } else if (framework === 'angular') {
            base.compilerOptions.experimentalDecorators = true;
            base.compilerOptions.lib = ['ES2020', 'DOM'];
            base.include = ['src'];
        }
        return JSON.stringify(base, null, 2);
    },

    'vite.config.js': (framework) => {
        if (framework === 'vue') return `import { defineConfig } from 'vite';\nimport vue from '@vitejs/plugin-vue';\n\nexport default defineConfig({\n  plugins: [vue()],\n});\n`;
        if (framework === 'svelte') return `import { defineConfig } from 'vite';\nimport { svelte } from '@sveltejs/vite-plugin-svelte';\n\nexport default defineConfig({\n  plugins: [svelte()],\n});\n`;
        if (framework === 'react' || framework === 'react-ts') return `import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\n\nexport default defineConfig({\n  plugins: [react()],\n});\n`;
        return `import { defineConfig } from 'vite';\n\nexport default defineConfig({});\n`;
    },

    'tailwind.config.js': () => `/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx,vue,svelte,astro}",
    "./app/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: { primary: { 50: '#eef2ff', 100: '#e0e7ff', 500: '#6366f1', 600: '#4f46e5', 700: '#4338ca', 900: '#312e81' } },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
};
`,

    'postcss.config.js': () => `export default {\n  plugins: {\n    tailwindcss: {},\n    autoprefixer: {},\n  },\n};\n`,

    'next.config.js': () => `/** @type {import('next').NextConfig} */\nconst nextConfig = {};\n\nmodule.exports = nextConfig;\n`,

    'svelte.config.js': () => `import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';\n\nexport default {\n  preprocess: vitePreprocess(),\n};\n`,

    'astro.config.mjs': () => `import { defineConfig } from 'astro/config';\n\nexport default defineConfig({});\n`,

    'angular.json': (title) => JSON.stringify({
        "$schema": "./node_modules/@angular/cli/lib/config/schema.json",
        version: 1, newProjectRoot: "projects",
        projects: { [slug(title)]: { projectType: "application", root: "", sourceRoot: "src", architect: { build: { builder: "@angular-devkit/build-angular:application", options: { outputPath: "dist", index: "src/index.html", browser: "src/main.ts", tsConfig: "tsconfig.json" } }, serve: { builder: "@angular-devkit/build-angular:dev-server" } } } }
    }, null, 2),
};

// ─── Vanilla JS Templates ───────────────────────────────────────────────────

const vanillaHtml = (title = 'My Website', desc = '') => `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="description" content="${desc || 'A modern website built with AI'}">
    <title>${title}</title>
    <link rel="stylesheet" href="styles.css">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
</head>
<body>
    <header class="header">
        <nav class="nav-container">
            <div class="logo">${title}</div>
            <ul class="nav-links">
                <li><a href="#home">Home</a></li>
                <li><a href="#proof">Proof</a></li>
                <li><a href="#features">Features</a></li>
                <li><a href="#how">How it works</a></li>
                <li><a href="#contact" class="btn btn-primary">Get Started</a></li>
            </ul>
            <button class="mobile-menu-btn" aria-label="Toggle menu"><span></span><span></span><span></span></button>
        </nav>
    </header>
    <main>
        <section id="home" class="hero">
            <div class="container">
                <span class="eyebrow">Trusted by modern product teams</span>
                <h1>Turn your product story into a <span class="text-gradient">high-converting</span> website</h1>
                <p class="hero-subtitle">${desc || 'Launch a polished brand presence with clear messaging, persuasive sections, and conversion-ready calls to action.'}</p>
                <div class="cta-group">
                    <a href="#contact" class="btn btn-primary">Start free trial</a>
                    <a href="#features" class="btn btn-outline">See features</a>
                </div>
                <div class="hero-metrics" aria-label="Key performance metrics">
                    <div><strong>34%</strong><span>higher conversion</span></div>
                    <div><strong>2.5x</strong><span>faster launch cycle</span></div>
                    <div><strong>99.9%</strong><span>uptime reliability</span></div>
                </div>
            </div>
        </section>
        <section id="proof" class="proof">
            <div class="container">
                <p class="proof-label">Teams shipping with confidence</p>
                <div class="proof-grid">
                    <span>Northbound Labs</span>
                    <span>Acorn Cloud</span>
                    <span>FieldAtlas</span>
                    <span>Summit AI</span>
                </div>
            </div>
        </section>
        <section id="features" class="features">
            <div class="container">
                <h2 class="section-title">Built to move visitors from interest to action</h2>
                <div class="feature-grid">
                    <div class="feature-card"><div class="icon">&#9889;</div><h3>Compelling hero messaging</h3><p>Clear value proposition, audience fit, and CTA hierarchy that increases intent.</p></div>
                    <div class="feature-card"><div class="icon">&#128241;</div><h3>Responsive section system</h3><p>Every section scales smoothly from mobile to desktop with token-based spacing.</p></div>
                    <div class="feature-card"><div class="icon">&#128274;</div><h3>Accessible by default</h3><p>Semantic structure, visible focus states, and contrast-safe color combinations.</p></div>
                </div>
            </div>
        </section>
        <section id="how" class="how-it-works">
            <div class="container">
                <h2 class="section-title">How it works</h2>
                <ol class="steps">
                    <li><strong>Define your narrative</strong><p>Capture positioning, audience, and proof points.</p></li>
                    <li><strong>Compose conversion sections</strong><p>Build trust with feature, process, and testimonial blocks.</p></li>
                    <li><strong>Ship and optimize</strong><p>Launch quickly and refine with real user feedback.</p></li>
                </ol>
            </div>
        </section>
        <section class="testimonial">
            <div class="container">
                <blockquote>"We replaced a generic page with this framework and saw qualified demo requests increase within two weeks."</blockquote>
                <p>- Maya Patel, Growth Lead at Northbound Labs</p>
            </div>
        </section>
        <section id="contact" class="final-cta">
            <div class="container">
                <h2>Ready to launch a premium landing page?</h2>
                <p>Start with a conversion-ready foundation and customize the story for your brand.</p>
                <a href="#home" class="btn btn-primary">Get started now</a>
            </div>
        </section>
    </main>
    <footer class="footer"><div class="container"><p>&copy; ${year} ${title}. All rights reserved.</p></div></footer>
    <script src="script.js"></script>
</body>
</html>`;

const vanillaCss = () => `/* Modern Reset & Design Tokens */
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
:root {
  --primary: #4f46e5; --primary-dark: #3730a3; --secondary: #14b8a6;
  --text: #0f172a; --text-light: #475569; --bg: #ffffff; --bg-soft: #f8fafc;
  --border: #e2e8f0; --radius-sm: 10px; --radius-md: 16px; --radius-lg: 24px;
  --shadow-soft: 0 8px 30px rgba(15, 23, 42, 0.08); --transition: all .28s cubic-bezier(.22,1,.36,1);
  --space-2: .5rem; --space-3: .75rem; --space-4: 1rem; --space-6: 1.5rem; --space-8: 2rem; --space-12: 3rem; --space-16: 4rem;
}
body { font-family: 'Inter', system-ui, sans-serif; line-height: 1.6; color: var(--text); background: var(--bg); text-rendering: optimizeLegibility; }
h1, h2, h3 { line-height: 1.2; }
h1 { font-size: clamp(2.5rem, 6vw, 4rem); font-weight: 800; letter-spacing: -0.02em; }
h2 { font-size: clamp(1.75rem, 3.8vw, 2.6rem); font-weight: 700; letter-spacing: -0.01em; }
.text-gradient { background: linear-gradient(135deg, var(--primary), var(--secondary)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
.container { max-width: 1160px; margin: 0 auto; padding: 0 var(--space-6); }
section { padding: var(--space-16) 0; }
.section-title { text-align: center; margin-bottom: var(--space-12); }
.eyebrow { display: inline-block; margin-bottom: var(--space-4); padding: .35rem .75rem; border: 1px solid var(--border); border-radius: 999px; font-size: .85rem; color: var(--text-light); background: var(--bg-soft); }
/* Header */
.header { position: fixed; top: 0; left: 0; width: 100%; background: rgba(255,255,255,.9); backdrop-filter: blur(10px); border-bottom: 1px solid var(--border); z-index: 1000; }
.nav-container { display: flex; justify-content: space-between; align-items: center; max-width: 1160px; margin: 0 auto; padding: var(--space-4) var(--space-6); }
.logo { font-size: 1.5rem; font-weight: 800; color: var(--primary); }
.nav-links { display: flex; gap: var(--space-8); list-style: none; align-items: center; }
.nav-links a { text-decoration: none; color: var(--text); font-weight: 500; transition: var(--transition); }
.nav-links a:hover { color: var(--primary); }
.mobile-menu-btn { display: none; background: none; border: none; cursor: pointer; }
/* Buttons */
.btn { display: inline-block; padding: .8rem 1.4rem; border-radius: var(--radius-sm); text-decoration: none; font-weight: 600; transition: var(--transition); cursor: pointer; border: 2px solid transparent; }
.btn-primary { background: var(--primary); color: #fff !important; }
.btn-primary:hover { background: var(--primary-dark); transform: translateY(-1px); box-shadow: var(--shadow-soft); }
.btn-outline { border-color: var(--primary); color: var(--primary) !important; background: transparent; }
.btn-outline:hover { background: var(--primary); color: #fff !important; }
.btn:focus-visible, .nav-links a:focus-visible { outline: 3px solid rgba(79, 70, 229, 0.35); outline-offset: 2px; }
/* Hero */
.hero { padding-top: 9rem; background: linear-gradient(to bottom, var(--bg-soft), var(--bg)); text-align: center; }
.hero-subtitle { font-size: 1.15rem; color: var(--text-light); margin: var(--space-4) auto var(--space-8); max-width: 760px; }
.cta-group { display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap; }
.hero-metrics { margin-top: var(--space-12); display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-4); text-align: left; }
.hero-metrics div { border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--bg); padding: var(--space-4); }
.hero-metrics strong { display: block; font-size: 1.5rem; }
.hero-metrics span { color: var(--text-light); font-size: .9rem; }
.proof { padding: var(--space-8) 0; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); background: var(--bg-soft); }
.proof-label { text-align: center; color: var(--text-light); margin-bottom: var(--space-4); }
.proof-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-4); text-align: center; font-weight: 600; color: #334155; }
/* Features */
.feature-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 2rem; }
.feature-card { padding: var(--space-8); background: var(--bg-soft); border-radius: var(--radius-md); border: 1px solid var(--border); transition: var(--transition); }
.feature-card:hover { transform: translateY(-4px); box-shadow: var(--shadow-soft); }
.icon { font-size: 2.5rem; margin-bottom: 1rem; }
.steps { list-style: none; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-6); }
.steps li { border: 1px solid var(--border); border-radius: var(--radius-md); padding: var(--space-6); background: var(--bg); }
.steps li p { margin-top: var(--space-2); color: var(--text-light); }
.testimonial { background: #0f172a; color: #fff; text-align: center; }
.testimonial blockquote { font-size: clamp(1.2rem, 2.5vw, 1.8rem); max-width: 900px; margin: 0 auto var(--space-4); }
.testimonial p { color: #cbd5e1; }
.final-cta { text-align: center; }
.final-cta p { color: var(--text-light); margin: var(--space-4) auto var(--space-8); max-width: 620px; }
/* Footer */
.footer { border-top: 1px solid var(--border); color: var(--text-light); padding: var(--space-8) 0; text-align: center; }
@media (max-width: 768px) {
  .nav-links { display: none; }
  .nav-links.active { display: grid; gap: var(--space-3); position: absolute; top: 68px; right: var(--space-4); background: #fff; padding: var(--space-4); border: 1px solid var(--border); border-radius: var(--radius-md); box-shadow: var(--shadow-soft); }
  .mobile-menu-btn { display: block; }
  .cta-group { flex-direction: column; align-items: center; }
  .hero-metrics { grid-template-columns: 1fr; }
  .proof-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .steps { grid-template-columns: 1fr; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
}
`;

const vanillaJs = () => `document.addEventListener('DOMContentLoaded', () => {
  // Sticky header
  const header = document.querySelector('.header');
  window.addEventListener('scroll', () => {
    header?.classList.toggle('scrolled', window.scrollY > 50);
  });

  // Mobile menu toggle
  const mobileBtn = document.querySelector('.mobile-menu-btn');
  const navLinks = document.querySelector('.nav-links');
  mobileBtn?.addEventListener('click', () => {
    navLinks?.classList.toggle('active');
    mobileBtn?.classList.toggle('active');
  });

  // Smooth scroll
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', e => {
      e.preventDefault();
      const target = document.querySelector(anchor.getAttribute('href'));
      if (target) {
        window.scrollTo({ top: target.offsetTop - 80, behavior: 'smooth' });
        navLinks?.classList.remove('active');
      }
    });
  });

  // Intersection Observer for fade-in
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('visible'); observer.unobserve(entry.target); }
    });
  }, { threshold: 0.1 });
  document.querySelectorAll('.feature-card, .hero').forEach(el => {
    el.style.opacity = '0'; el.style.transform = 'translateY(20px)';
    el.style.transition = 'opacity .6s ease, transform .6s ease';
    observer.observe(el);
  });
  const style = document.createElement('style');
  style.textContent = '.visible { opacity: 1 !important; transform: translateY(0) !important; }';
  document.head.appendChild(style);
});
`;

// ─── React Templates ────────────────────────────────────────────────────────

const reactIndexHtml = (title) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.jsx"></script>
</body>
</html>`;

const reactMain = () => `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`;

const reactApp = (title = 'My App', desc = '') => `import React, { useState } from 'react';
import './index.css';

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const featureItems = [
    { icon: '\\u26A1', title: 'Compelling hero messaging', desc: 'Clear value proposition and CTA hierarchy tuned for conversion.' },
    { icon: '\\uD83D\\uDCF1', title: 'Responsive section system', desc: 'Structured blocks that scale from mobile to desktop.' },
    { icon: '\\uD83D\\uDD12', title: 'Accessible by default', desc: 'Semantic structure, contrast-safe palette, and visible focus states.' },
  ];

  return (
    <div className="app">
      <header className="header">
        <nav className="nav-container">
          <div className="logo">${title}</div>
          <div className={\`nav-links \${menuOpen ? 'active' : ''}\`}>
            <a href="#home">Home</a>
            <a href="#proof">Proof</a>
            <a href="#features">Features</a>
            <a href="#how">How it works</a>
            <a href="#contact" className="btn btn-primary">Get Started</a>
          </div>
          <button className="mobile-menu-btn" onClick={() => setMenuOpen(!menuOpen)}>
            <span /><span /><span />
          </button>
        </nav>
      </header>

      <main>
        <section id="home" className="hero">
          <div className="container">
            <span className="eyebrow">Trusted by modern product teams</span>
            <h1>Turn your product story into a <span className="text-gradient">high-converting</span> website</h1>
            <p className="hero-subtitle">${desc || 'Launch a polished brand presence with clear messaging, persuasive sections, and conversion-ready calls to action.'}</p>
            <div className="cta-group">
              <button className="btn btn-primary">Start free trial</button>
              <button className="btn btn-outline">See features</button>
            </div>
            <div className="hero-metrics" aria-label="Key performance metrics">
              <div><strong>34%</strong><span>higher conversion</span></div>
              <div><strong>2.5x</strong><span>faster launch cycle</span></div>
              <div><strong>99.9%</strong><span>uptime reliability</span></div>
            </div>
          </div>
        </section>
        <section id="proof" className="proof">
          <div className="container">
            <p className="proof-label">Teams shipping with confidence</p>
            <div className="proof-grid">
              <span>Northbound Labs</span>
              <span>Acorn Cloud</span>
              <span>FieldAtlas</span>
              <span>Summit AI</span>
            </div>
          </div>
        </section>

        <section id="features" className="features">
          <div className="container">
            <h2 className="section-title">Built to move visitors from interest to action</h2>
            <div className="feature-grid">
              {featureItems.map((f, i) => (
                <div key={i} className="feature-card">
                  <div className="icon">{f.icon}</div>
                  <h3>{f.title}</h3>
                  <p>{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section id="how" className="how-it-works">
          <div className="container">
            <h2 className="section-title">How it works</h2>
            <ol className="steps">
              <li><strong>Define your narrative</strong><p>Capture positioning, audience, and proof points.</p></li>
              <li><strong>Compose conversion sections</strong><p>Build trust with feature, process, and testimonial blocks.</p></li>
              <li><strong>Ship and optimize</strong><p>Launch quickly and refine with real user feedback.</p></li>
            </ol>
          </div>
        </section>
        <section className="testimonial">
          <div className="container">
            <blockquote>"We replaced a generic page with this framework and saw qualified demo requests increase within two weeks."</blockquote>
            <p>- Maya Patel, Growth Lead at Northbound Labs</p>
          </div>
        </section>
        <section id="contact" className="final-cta">
          <div className="container">
            <h2>Ready to launch a premium landing page?</h2>
            <p>Start with a conversion-ready foundation and customize the story for your brand.</p>
            <button className="btn btn-primary">Get started now</button>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="container"><p>&copy; ${year} ${title}. All rights reserved.</p></div>
      </footer>
    </div>
  );
}
`;

const reactCss = vanillaCss; // reuse — same classes

// ─── React-TS Templates (extend React with TS) ─────────────────────────────

const reactTsIndexHtml = (title) => reactIndexHtml(title).replace('/src/main.jsx', '/src/main.tsx');

const reactTsMain = () => reactMain().replace("'./App'", "'./App'"); // same structure, .tsx file

const reactTsApp = (title = 'My App', desc = '') => `import React, { useState } from 'react';
import './index.css';

interface Feature {
  icon: string;
  title: string;
  desc: string;
}

const features: Feature[] = [
  { icon: '\\u26A1', title: 'Compelling hero messaging', desc: 'Clear value proposition and CTA hierarchy tuned for conversion.' },
  { icon: '\\uD83D\\uDCF1', title: 'Responsive section system', desc: 'Structured blocks that scale from mobile to desktop.' },
  { icon: '\\uD83D\\uDD12', title: 'Accessible by default', desc: 'Semantic structure, contrast-safe palette, and visible focus states.' },
];

export default function App(): React.ReactElement {
  const [menuOpen, setMenuOpen] = useState<boolean>(false);

  return (
    <div className="app">
      <header className="header">
        <nav className="nav-container">
          <div className="logo">${title}</div>
          <div className={\`nav-links \${menuOpen ? 'active' : ''}\`}>
            <a href="#home">Home</a>
            <a href="#proof">Proof</a>
            <a href="#features">Features</a>
            <a href="#how">How it works</a>
            <a href="#contact" className="btn btn-primary">Get Started</a>
          </div>
          <button className="mobile-menu-btn" onClick={() => setMenuOpen(!menuOpen)}>
            <span /><span /><span />
          </button>
        </nav>
      </header>

      <main>
        <section id="home" className="hero">
          <div className="container">
            <span className="eyebrow">Trusted by modern product teams</span>
            <h1>Turn your product story into a <span className="text-gradient">high-converting</span> website</h1>
            <p className="hero-subtitle">${desc || 'Launch a polished brand presence with clear messaging, persuasive sections, and conversion-ready calls to action.'}</p>
            <div className="cta-group">
              <button className="btn btn-primary">Start free trial</button>
              <button className="btn btn-outline">See features</button>
            </div>
            <div className="hero-metrics" aria-label="Key performance metrics">
              <div><strong>34%</strong><span>higher conversion</span></div>
              <div><strong>2.5x</strong><span>faster launch cycle</span></div>
              <div><strong>99.9%</strong><span>uptime reliability</span></div>
            </div>
          </div>
        </section>
        <section id="proof" className="proof">
          <div className="container">
            <p className="proof-label">Teams shipping with confidence</p>
            <div className="proof-grid">
              <span>Northbound Labs</span>
              <span>Acorn Cloud</span>
              <span>FieldAtlas</span>
              <span>Summit AI</span>
            </div>
          </div>
        </section>

        <section id="features" className="features">
          <div className="container">
            <h2 className="section-title">Built to move visitors from interest to action</h2>
            <div className="feature-grid">
              {features.map((f, i) => (
                <div key={i} className="feature-card">
                  <div className="icon">{f.icon}</div>
                  <h3>{f.title}</h3>
                  <p>{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section id="how" className="how-it-works">
          <div className="container">
            <h2 className="section-title">How it works</h2>
            <ol className="steps">
              <li><strong>Define your narrative</strong><p>Capture positioning, audience, and proof points.</p></li>
              <li><strong>Compose conversion sections</strong><p>Build trust with feature, process, and testimonial blocks.</p></li>
              <li><strong>Ship and optimize</strong><p>Launch quickly and refine with real user feedback.</p></li>
            </ol>
          </div>
        </section>
        <section className="testimonial">
          <div className="container">
            <blockquote>"We replaced a generic page with this framework and saw qualified demo requests increase within two weeks."</blockquote>
            <p>- Maya Patel, Growth Lead at Northbound Labs</p>
          </div>
        </section>
        <section id="contact" className="final-cta">
          <div className="container">
            <h2>Ready to launch a premium landing page?</h2>
            <p>Start with a conversion-ready foundation and customize the story for your brand.</p>
            <button className="btn btn-primary">Get started now</button>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="container"><p>&copy; ${year} ${title}. All rights reserved.</p></div>
      </footer>
    </div>
  );
}
`;

// ─── Next.js Templates ──────────────────────────────────────────────────────

const nextLayout = (title = 'My App') => `import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '${title}',
  description: 'Built with Next.js and AI',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`;

const nextPage = (title = 'My App', desc = '') => `export default function Home() {
  return (
    <main className="min-h-screen">
      <header className="fixed top-0 w-full bg-white/90 backdrop-blur border-b z-50">
        <nav className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <span className="text-xl font-bold text-indigo-600">${title}</span>
          <div className="hidden md:flex gap-6 items-center">
            <a href="#home" className="text-gray-600 hover:text-indigo-600 transition">Home</a>
            <a href="#proof" className="text-gray-600 hover:text-indigo-600 transition">Proof</a>
            <a href="#features" className="text-gray-600 hover:text-indigo-600 transition">Features</a>
            <a href="#how" className="text-gray-600 hover:text-indigo-600 transition">How it works</a>
            <a href="#contact" className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition">Contact</a>
          </div>
        </nav>
      </header>

      <section id="home" className="pt-32 pb-20 bg-gradient-to-br from-indigo-50 to-purple-50">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <p className="inline-flex px-3 py-1 mb-6 rounded-full text-sm text-slate-600 border border-slate-200 bg-white">Trusted by modern product teams</p>
          <h1 className="text-5xl font-extrabold text-gray-900 mb-6">Turn your product story into a <span className="text-indigo-600">high-converting</span> website</h1>
          <p className="text-xl text-gray-600 mb-8">${desc || 'Launch a polished brand presence with clear messaging, persuasive sections, and conversion-ready calls to action.'}</p>
          <div className="flex justify-center gap-4">
            <button className="px-8 py-3 bg-indigo-600 text-white rounded-lg shadow-lg hover:bg-indigo-700 transition">Start free trial</button>
            <button className="px-8 py-3 bg-white text-indigo-600 border border-indigo-200 rounded-lg hover:bg-gray-50 transition">See features</button>
          </div>
          <div className="grid md:grid-cols-3 gap-4 mt-10 text-left">
            <div className="rounded-xl border border-slate-200 bg-white p-4"><strong className="block text-2xl">34%</strong><span className="text-slate-600 text-sm">higher conversion</span></div>
            <div className="rounded-xl border border-slate-200 bg-white p-4"><strong className="block text-2xl">2.5x</strong><span className="text-slate-600 text-sm">faster launch cycle</span></div>
            <div className="rounded-xl border border-slate-200 bg-white p-4"><strong className="block text-2xl">99.9%</strong><span className="text-slate-600 text-sm">uptime reliability</span></div>
          </div>
        </div>
      </section>
      <section id="proof" className="py-8 border-y bg-slate-50">
        <div className="max-w-6xl mx-auto px-4">
          <p className="text-slate-500 text-center mb-4">Teams shipping with confidence</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center font-semibold text-slate-700">
            <span>Northbound Labs</span>
            <span>Acorn Cloud</span>
            <span>FieldAtlas</span>
            <span>Summit AI</span>
          </div>
        </div>
      </section>

      <section id="features" className="py-20">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">Built to move visitors from interest to action</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[{ t: 'Compelling hero messaging', d: 'Clear value proposition and CTA hierarchy tuned for conversion.', i: '\\u26A1' }, { t: 'Responsive section system', d: 'Structured blocks that scale from mobile to desktop.', i: '\\uD83D\\uDCF1' }, { t: 'Accessible by default', d: 'Semantic structure, contrast-safe palette, and visible focus states.', i: '\\uD83D\\uDD12' }].map((f, i) => (
              <div key={i} className="p-6 bg-gray-50 rounded-xl hover:shadow-md transition">
                <span className="text-3xl mb-3 block">{f.i}</span>
                <h3 className="text-xl font-semibold mb-2">{f.t}</h3>
                <p className="text-gray-600">{f.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section id="how" className="py-20 bg-slate-50">
        <div className="max-w-6xl mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">How it works</h2>
          <ol className="grid md:grid-cols-3 gap-6">
            <li className="rounded-xl border bg-white p-6"><strong>Define your narrative</strong><p className="text-slate-600 mt-2">Capture positioning, audience, and proof points.</p></li>
            <li className="rounded-xl border bg-white p-6"><strong>Compose conversion sections</strong><p className="text-slate-600 mt-2">Build trust with feature, process, and testimonial blocks.</p></li>
            <li className="rounded-xl border bg-white p-6"><strong>Ship and optimize</strong><p className="text-slate-600 mt-2">Launch quickly and refine with real user feedback.</p></li>
          </ol>
        </div>
      </section>
      <section className="py-16 bg-slate-900 text-white text-center">
        <div className="max-w-4xl mx-auto px-4">
          <blockquote className="text-2xl font-medium mb-4">"We replaced a generic page with this framework and saw qualified demo requests increase within two weeks."</blockquote>
          <p className="text-slate-300">- Maya Patel, Growth Lead at Northbound Labs</p>
        </div>
      </section>
      <section id="contact" className="py-20 text-center">
        <div className="max-w-3xl mx-auto px-4">
          <h2 className="text-3xl font-bold mb-4">Ready to launch a premium landing page?</h2>
          <p className="text-slate-600 mb-8">Start with a conversion-ready foundation and customize the story for your brand.</p>
          <button className="px-8 py-3 bg-indigo-600 text-white rounded-lg shadow-lg hover:bg-indigo-700 transition">Get started now</button>
        </div>
      </section>

      <footer className="bg-gray-900 text-white py-8 text-center">
        <p>&copy; ${year} ${title}. All rights reserved.</p>
      </footer>
    </main>
  );
}
`;

const nextGlobalsCss = () => `@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  font-family: 'Inter', system-ui, sans-serif;
}
`;

// ─── Vue Templates ──────────────────────────────────────────────────────────

const vueIndexHtml = (title) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/main.js"></script>
</body>
</html>`;

const vueMain = () => `import { createApp } from 'vue';
import App from './App.vue';
import './style.css';

createApp(App).mount('#app');
`;

const vueApp = (title = 'My App', desc = '') => `<template>
  <div class="app">
    <header class="header">
      <nav class="nav-container">
        <div class="logo">${title}</div>
        <div :class="['nav-links', { active: menuOpen }]">
          <a href="#home">Home</a>
          <a href="#features">Features</a>
          <a href="#about">About</a>
          <a href="#contact" class="btn btn-primary">Get Started</a>
        </div>
        <button class="mobile-menu-btn" @click="menuOpen = !menuOpen">
          <span /><span /><span />
        </button>
      </nav>
    </header>

    <main>
      <section id="home" class="hero">
        <div class="container">
          <h1>Welcome to <span class="text-gradient">${title}</span></h1>
          <p class="hero-subtitle">${desc || 'Build amazing web experiences with Vue 3.'}</p>
          <div class="cta-group">
            <button class="btn btn-primary">Get Started</button>
            <button class="btn btn-outline">Learn More</button>
          </div>
        </div>
      </section>

      <section id="features" class="features">
        <div class="container">
          <h2 class="section-title">Key Features</h2>
          <div class="feature-grid">
            <div v-for="(f, i) in features" :key="i" class="feature-card">
              <div class="icon">{{ f.icon }}</div>
              <h3>{{ f.title }}</h3>
              <p>{{ f.desc }}</p>
            </div>
          </div>
        </div>
      </section>
    </main>

    <footer class="footer">
      <div class="container"><p>&copy; ${year} ${title}. All rights reserved.</p></div>
    </footer>
  </div>
</template>

<script setup>
import { ref } from 'vue';

const menuOpen = ref(false);
const features = ref([
  { icon: '\\u26A1', title: 'Fast', desc: 'Optimized for performance' },
  { icon: '\\uD83D\\uDCF1', title: 'Responsive', desc: 'Looks great on all devices' },
  { icon: '\\uD83D\\uDD12', title: 'Secure', desc: 'Built with best practices' },
]);
</script>

<style scoped>
/* Component styles are in the global style.css */
</style>
`;

// ─── Svelte Templates ───────────────────────────────────────────────────────

const svelteMain = () => `import App from './App.svelte';

const app = new App({ target: document.getElementById('app') });

export default app;
`;

const svelteApp = (title = 'My App', desc = '') => `<script>
  let menuOpen = false;
  const features = [
    { icon: '\\u26A1', title: 'Fast', desc: 'Optimized for performance' },
    { icon: '\\uD83D\\uDCF1', title: 'Responsive', desc: 'Looks great on all devices' },
    { icon: '\\uD83D\\uDD12', title: 'Secure', desc: 'Built with best practices' },
  ];
</script>

<div class="app">
  <header class="header">
    <nav class="nav-container">
      <div class="logo">${title}</div>
      <div class="nav-links" class:active={menuOpen}>
        <a href="#home">Home</a>
        <a href="#features">Features</a>
        <a href="#about">About</a>
        <a href="#contact" class="btn btn-primary">Get Started</a>
      </div>
      <button class="mobile-menu-btn" on:click={() => menuOpen = !menuOpen}>
        <span /><span /><span />
      </button>
    </nav>
  </header>

  <main>
    <section id="home" class="hero">
      <div class="container">
        <h1>Welcome to <span class="text-gradient">${title}</span></h1>
        <p class="hero-subtitle">${desc || 'Build amazing web experiences with Svelte.'}</p>
        <div class="cta-group">
          <button class="btn btn-primary">Get Started</button>
          <button class="btn btn-outline">Learn More</button>
        </div>
      </div>
    </section>

    <section id="features" class="features">
      <div class="container">
        <h2 class="section-title">Key Features</h2>
        <div class="feature-grid">
          {#each features as f, i}
            <div class="feature-card">
              <div class="icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          {/each}
        </div>
      </div>
    </section>
  </main>

  <footer class="footer">
    <div class="container"><p>&copy; ${year} ${title}. All rights reserved.</p></div>
  </footer>
</div>

<style>
  /* Component styles are in the global app.css */
</style>
`;

// ─── Angular Templates ──────────────────────────────────────────────────────

const angularIndexHtml = (title) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
</head>
<body>
  <app-root></app-root>
</body>
</html>`;

const angularMainTs = () => `import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent).catch(err => console.error(err));
`;

const angularAppComponentTs = (title) => `import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  title = '${title}';
  menuOpen = signal(false);
  features = [
    { icon: '\\u26A1', title: 'Fast', desc: 'Optimized for performance' },
    { icon: '\\uD83D\\uDCF1', title: 'Responsive', desc: 'Looks great on all devices' },
    { icon: '\\uD83D\\uDD12', title: 'Secure', desc: 'Built with best practices' },
  ];

  toggleMenu() { this.menuOpen.update(v => !v); }
}
`;

const angularAppComponentHtml = (title, desc) => `<header class="header">
  <nav class="nav-container">
    <div class="logo">${title}</div>
    <div class="nav-links" [class.active]="menuOpen()">
      <a href="#home">Home</a>
      <a href="#features">Features</a>
      <a href="#about">About</a>
      <a href="#contact" class="btn btn-primary">Get Started</a>
    </div>
    <button class="mobile-menu-btn" (click)="toggleMenu()">
      <span></span><span></span><span></span>
    </button>
  </nav>
</header>

<main>
  <section id="home" class="hero">
    <div class="container">
      <h1>Welcome to <span class="text-gradient">{{ title }}</span></h1>
      <p class="hero-subtitle">${desc || 'Build amazing web experiences with Angular.'}</p>
      <div class="cta-group">
        <button class="btn btn-primary">Get Started</button>
        <button class="btn btn-outline">Learn More</button>
      </div>
    </div>
  </section>

  <section id="features" class="features">
    <div class="container">
      <h2 class="section-title">Key Features</h2>
      <div class="feature-grid">
        <div *ngFor="let f of features" class="feature-card">
          <div class="icon">{{ f.icon }}</div>
          <h3>{{ f.title }}</h3>
          <p>{{ f.desc }}</p>
        </div>
      </div>
    </div>
  </section>
</main>

<footer class="footer">
  <div class="container"><p>&copy; ${year} {{ title }}. All rights reserved.</p></div>
</footer>
`;

// ─── Astro Templates ────────────────────────────────────────────────────────

const astroLayout = (title) => `---
interface Props { title?: string; }
const { title = '${title}' } = Astro.props;
---
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{title}</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
</head>
<body>
  <slot />
</body>
</html>
`;

const astroIndexPage = (title, desc) => `---
import Layout from '../layouts/Layout.astro';
---
<Layout title="${title}">
  <header class="header">
    <nav class="nav-container">
      <div class="logo">${title}</div>
      <div class="nav-links">
        <a href="#home">Home</a>
        <a href="#features">Features</a>
        <a href="#about">About</a>
        <a href="#contact" class="btn btn-primary">Get Started</a>
      </div>
    </nav>
  </header>

  <main>
    <section id="home" class="hero">
      <div class="container">
        <h1>Welcome to <span class="text-gradient">${title}</span></h1>
        <p class="hero-subtitle">${desc || 'Build amazing web experiences with Astro.'}</p>
        <div class="cta-group">
          <a href="#contact" class="btn btn-primary">Get Started</a>
          <a href="#features" class="btn btn-outline">Learn More</a>
        </div>
      </div>
    </section>

    <section id="features" class="features">
      <div class="container">
        <h2 class="section-title">Key Features</h2>
        <div class="feature-grid">
          <div class="feature-card"><div class="icon">&#9889;</div><h3>Fast</h3><p>Optimized for performance.</p></div>
          <div class="feature-card"><div class="icon">&#128241;</div><h3>Responsive</h3><p>Looks great on all devices.</p></div>
          <div class="feature-card"><div class="icon">&#128274;</div><h3>Secure</h3><p>Built with best practices.</p></div>
        </div>
      </div>
    </section>
  </main>

  <footer class="footer">
    <div class="container"><p>&copy; ${year} ${title}. All rights reserved.</p></div>
  </footer>
</Layout>

<style>
  ${vanillaCss()}
</style>
`;

// ─── Helper ─────────────────────────────────────────────────────────────────
function slug(title) {
    return (title || 'my-project').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'my-project';
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Template Router
// ═══════════════════════════════════════════════════════════════════════════════

export const getTemplate = (filePath, ctx = {}) => {
    const { projectType = 'landing-page', framework = config.defaultFramework, stylingFramework = 'plain-css', title = 'My Website', description = '' } = ctx;
    const fp = filePath.toLowerCase();
    const fname = filePath.split('/').pop().toLowerCase();

    // ── Config files (framework-agnostic lookups) ────────────────────────
    if (fname === 'package.json') {
        const gen = packageJsonTemplates[framework] || packageJsonTemplates['react'];
        return gen(title);
    }
    if (fname === 'tsconfig.json') return configTemplates['tsconfig.json'](framework);
    if (fname === 'vite.config.js' || fname === 'vite.config.ts') return configTemplates['vite.config.js'](framework);
    if (fname === 'tailwind.config.js' || fname === 'tailwind.config.ts') return configTemplates['tailwind.config.js']();
    if (fname === 'postcss.config.js' || fname === 'postcss.config.cjs') return configTemplates['postcss.config.js']();
    if (fname === 'next.config.js' || fname === 'next.config.mjs') return configTemplates['next.config.js']();
    if (fname === 'svelte.config.js') return configTemplates['svelte.config.js']();
    if (fname === 'astro.config.mjs') return configTemplates['astro.config.mjs']();
    if (fname === 'angular.json') return configTemplates['angular.json'](title);

    // ── Framework-specific file routing ──────────────────────────────────

    // -- Vanilla JS --
    if (framework === config.defaultFramework) {
        if (fp.endsWith('.html')) return vanillaHtml(title, description);
        if (fp.endsWith('.css')) return vanillaCss();
        if (fp.endsWith('.js')) return vanillaJs();
    }

    // -- React --
    if (framework === 'react') {
        if (fname === 'index.html') return reactIndexHtml(title);
        if (fname === 'main.jsx' || fname === 'main.js') return reactMain();
        if (fname.startsWith('app.') && fname.endsWith('.jsx')) return reactApp(title, description);
        if (fp.endsWith('.css')) return reactCss();
        if (fp.endsWith('.jsx')) return reactApp(title, description); // generic component fallback
    }

    // -- React-TS --
    if (framework === 'react-ts') {
        if (fname === 'index.html') return reactTsIndexHtml(title);
        if (fname === 'main.tsx' || fname === 'main.ts') return reactTsMain();
        if (fname.startsWith('app.') && fname.endsWith('.tsx')) return reactTsApp(title, description);
        if (fp.endsWith('.css')) return reactCss();
        if (fp.endsWith('.tsx')) return reactTsApp(title, description);
        if (fname === 'index.ts' && fp.includes('types')) return `export interface Feature {\n  icon: string;\n  title: string;\n  desc: string;\n}\n`;
    }

    // -- Next.js --
    if (framework === 'nextjs') {
        if (fname === 'layout.tsx') return nextLayout(title);
        if (fname === 'page.tsx') return nextPage(title, description);
        if (fname === 'globals.css' || fname === 'global.css') return nextGlobalsCss();
        if (fp.endsWith('.tsx')) return nextPage(title, description); // generic page fallback
        if (fp.endsWith('.css')) return nextGlobalsCss();
    }

    // -- Vue --
    if (framework === 'vue') {
        if (fname === 'index.html') return vueIndexHtml(title);
        if (fname === 'main.js' || fname === 'main.ts') return vueMain();
        if (fname === 'app.vue') return vueApp(title, description);
        if (fp.endsWith('.vue')) return vueApp(title, description);
        if (fp.endsWith('.css')) return vanillaCss();
    }

    // -- Svelte --
    if (framework === 'svelte') {
        if (fname === 'main.js' || fname === 'main.ts') return svelteMain();
        if (fname === 'app.svelte') return svelteApp(title, description);
        if (fp.endsWith('.svelte')) return svelteApp(title, description);
        if (fp.endsWith('.css')) return vanillaCss();
    }

    // -- Angular --
    if (framework === 'angular') {
        if (fname === 'index.html') return angularIndexHtml(title);
        if (fname === 'main.ts') return angularMainTs();
        if (fname.endsWith('.component.ts')) return angularAppComponentTs(title);
        if (fname.endsWith('.component.html')) return angularAppComponentHtml(title, description);
        if (fp.endsWith('.css')) return vanillaCss();
    }

    // -- Astro --
    if (framework === 'astro') {
        if (fname === 'layout.astro') return astroLayout(title);
        if (fname.endsWith('.astro') && fp.includes('pages')) return astroIndexPage(title, description);
        if (fp.endsWith('.astro')) return astroIndexPage(title, description);
        if (fp.endsWith('.css')) return vanillaCss();
    }

    // ── Generic fallbacks by extension ───────────────────────────────────
    if (fp.endsWith('.html')) return vanillaHtml(title, description);
    if (fp.endsWith('.css')) return vanillaCss();
    if (fp.endsWith('.js')) return vanillaJs();
    if (fp.endsWith('.jsx')) return reactApp(title, description);
    if (fp.endsWith('.tsx')) return reactTsApp(title, description);
    if (fp.endsWith('.vue')) return vueApp(title, description);
    if (fp.endsWith('.svelte')) return svelteApp(title, description);
    if (fp.endsWith('.astro')) return astroIndexPage(title, description);
    if (fp.endsWith('.json')) return '{}';

    return `// Template for ${filePath}\n// Generated by AI Project Generator\n`;
};

// Re-export individual template generators for testing
export {
    packageJsonTemplates, configTemplates,
    vanillaHtml, vanillaCss, vanillaJs,
    reactIndexHtml, reactMain, reactApp,
    reactTsApp, nextLayout, nextPage, nextGlobalsCss,
    vueIndexHtml, vueMain, vueApp,
    svelteMain, svelteApp,
    angularIndexHtml, angularMainTs, angularAppComponentTs, angularAppComponentHtml,
    astroLayout, astroIndexPage,
};
