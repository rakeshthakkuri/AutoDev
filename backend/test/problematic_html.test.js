import { describe, it } from 'node:test';
import assert from 'node:assert';
import { CodeValidator } from '../src/services/validator.js';

describe('CodeValidator - Problematic HTML Handling (User Provided)', () => {
    const validator = new CodeValidator();

    const userHtml = `<!DOCTYPE html> 
 <html lang="en"> 
 <head> 
     <meta charset="UTF-8"> 
     <meta name="viewport" content="width=device-width, initial-scale=1.0"> 
     <meta name="description" content="A modern weather application displaying current conditions with a clean user interface."> 
     <title>WeatherWise - Current Conditions</title> 
     <link rel="stylesheet" href="styles.css"> 
     <link rel="icon" href="data:image/svg+xml,<svg xmlns=" \`http://www.w3.org/2000/svg\` " viewBox="0 0 100 100"><text y=".9em" font-size="90">☀️</text></svg>"> 
     <link rel="preconnect" href=" \`https://fonts.googleapis.com\` "> 
     <link rel="preconnect" href=" \`https://fonts.gstatic.com\` " crossorigin> 
     <link href=" \`https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600;700&display=swap\` " rel="stylesheet"> 
 </head> 
 <body> 
     <div class="background-overlay"></div> 
     <header class="app-header" role="banner"> 
         <div class="container header-content"> 
             <h1 class="app-title">WeatherWise</h1> 
             <nav class="main-nav" aria-label="Main navigation"> 
                 <ul class="nav-list"> 
                     <li class="nav-item"><a href="#" class="nav-link current" aria-current="page">Current Weather</a></li> 
                     <li class="nav-item"><a href="#" class="nav-link">Forecast (Coming Soon)</a></li> 
                 </ul> 
             </nav> 
         </div> 
     </header> 
 
     <main class="app-main" role="main"> 
         <section class="weather-search" aria-labelledby="search-heading"> 
             <div class="container"> 
                 <h2 id="search-heading" class="visually-hidden">Search for a location</h2> 
                 <form id="location-form" class="search-form" role="search"> 
                     <label for="location-input" class="visually-hidden">Enter city name or zip code</label> 
                     <input type="text" id="location-input" class="search-input" placeholder="Enter city name or zip code..." aria-label="Location search input"> 
                     <button type="submit" class="search-button" aria-label="Search weather"> 
                         <svg xmlns=" \`http://www.w3.org/2000/svg\` " width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-search"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg> 
                     </button> 
                 </form> 
                 <p id="error-message" class="error-message" role="alert" aria-live="assertive"></p> 
             </div> 
         </section> 
 
         <section class="current-weather" aria-labelledby="current-weather-heading"> 
             <div class="container weather-card" id="weather-display"> 
                 <h2 id="current-weather-heading" class="visually-hidden">Current Weather Conditions</h2> 
                 <div class="loading-spinner" aria-label="Loading weather data" role="status"></div> 
                 <div class="weather-data hidden"> 
                     <div class="location-info"> 
                         <h3 class="city-name" id="city-name"></h3> 
                         <p class="date-time" id="date-time"></p> 
                     </div> 
                     <div class="main-conditions"> 
                         <img src="" alt="Weather icon" class="weather-icon" id="weather-icon"> 
                         <p class="temperature" id="temperature"></p> 
                         <p class="description" id="description"></p> 
                     </div> 
                     <div class="details-grid"> 
                         <div class="detail-item"> 
                             <span class="detail-label">Feels Like:</span> 
                             <span class="detail-value" id="feels-like"></span> 
                         </div> 
                         <div class="detail-item"> 
                             <span class="detail-label">Humidity:</span> 
                             <span class="detail-value" id="humidity"></span> 
                         </div> 
                         <div class="detail-item"> 
                             <span class="detail-label">Wind Speed:</span> 
                             <span class="detail-value" id="wind-speed"></span> 
                         </div> 
                         <div class="detail-item"> 
                             <span class="detail-label">Pressure:</span> 
                             <span class="detail-value" id="pressure"></span> 
                         </div> 
                         <div class="detail-item"> 
                             <span class="detail-label">Visibility:</span> 
                             <span class="detail-value" id="visibility"></span> 
                         </div> 
                         <div class="detail-item"> 
                             <span class="detail-label">UV Index:</span> 
                             <span class="detail-value" id="uv-index">N/A</span> 
                         </div> 
                     </div> 
                 </div> 
             </div> 
         </section> 
     </main> 
 
     <footer class="app-footer" role="contentinfo"> 
         <div class="container"> 
             <p>&copy; <span id="current-year"></span> WeatherWise. All rights reserved.</p> 
             <p>Powered by <a href=" \`https://openweathermap.org/\` " target="_blank" rel="noopener noreferrer" class="footer-link">OpenWeatherMap</a> & <a href=" \`https://unsplash.com/\` " target="_blank" rel="noopener noreferrer" class="footer-link">Unsplash</a></p> 
         </div> 
     </footer> 
 
     <script src="script.js" defer></script> 
 </body> 
 </html>`;

    it('should clean all backticked URLs and artifacts in the user provided HTML', () => {
        const result = validator.validateFile(userHtml, 'index.html', 'vanilla-js');
        const fixed = result.fixedCode || userHtml;
        
        // Verify no backticks remain in URLs
        assert.ok(!fixed.includes('\`https://'), 'Should strip backticks from https URLs');
        assert.ok(!fixed.includes('\`http://'), 'Should strip backticks from http URLs');
        
        // Verify specific links are fixed and trimmed
        assert.ok(fixed.includes('href="https://fonts.googleapis.com"'), 'Should fix fonts preconnect');
        assert.ok(fixed.includes('href="https://openweathermap.org/"'), 'Should fix footer link');
        assert.ok(fixed.includes('xmlns="http://www.w3.org/2000/svg"'), 'Should fix SVG namespace');
        
        // Verify no extra spaces inside quotes for these attributes
        assert.ok(!fixed.includes('xmlns=" http'), 'Should not have leading space in xmlns');
        assert.ok(!fixed.includes('href=" https'), 'Should not have leading space in href');
    });

    it('should clean backticked URLs in the Quiz Master HTML', () => {
        const quizHtml = `<!DOCTYPE html> 
 <html lang="en"> 
 <head> 
     <meta charset="UTF-8"> 
     <meta name="viewport" content="width=device-width, initial-scale=1.0"> 
     <title>Quiz Master Challenge</title> 
     <meta name="description" content="Test your knowledge with the Quiz Master Challenge! A fun and interactive multiple-choice quiz game."> 
     <link rel="stylesheet" href="styles.css"> 
     <link rel="preconnect" href=" \`https://fonts.googleapis.com\` "> 
     <link rel="preconnect" href=" \`https://fonts.gstatic.com\` " crossorigin> 
     <link href=" \`https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&family=Roboto:wght@400;500&display=swap\` " rel="stylesheet"> 
 </head> 
 <body> 
     <header class="site-header"> 
         <div class="container"> 
             <h1 class="site-title">Quiz Master Challenge</h1> 
             <nav class="main-nav" aria-label="Main navigation"> 
                 <ul class="nav-list"> 
                     <li class="nav-item"><a href="#quiz-section" class="nav-link">Start Quiz</a></li> 
                     <li class="nav-item"><a href="#how-to-play" class="nav-link">How to Play</a></li> 
                 </ul> 
             </nav> 
         </div> 
     </header> 
 
     <main class="main-content"> 
         <section id="hero-section" class="hero-section" aria-labelledby="hero-title"> 
             <div class="hero-overlay"></div> 
             <img src=" \`https://images.unsplash.com/photo-1531297484001-80022131f5a1?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=MnwxfDB8MXxyYW5kb218MHx8cXVpeixxdWVzdGlvbnN8fHx8fHwxNzE3NzY4NDY1&ixlib=rb-4.0.3&q=80&w=1080\` " alt="Abstract background with glowing lines representing knowledge and questions" class="hero-image"> 
             <div class="container hero-content"> 
                 <h2 id="hero-title" class="hero-title">Test Your Knowledge, Challenge Your Mind!</h2> 
                 <p class="hero-description">Dive into a world of questions and discover how much you truly know. Are you ready for the ultimate quiz challenge?</p> 
                 <button id="start-quiz-btn" class="btn btn-primary">Start Quiz Now</button> 
             </div> 
         </section> 
 
         <section id="quiz-section" class="quiz-section container" aria-labelledby="quiz-heading"> 
             <h2 id="quiz-heading" class="section-title">The Challenge Awaits!</h2> 
             <div class="quiz-container"> 
                 <div class="quiz-header"> 
                     <p class="question-counter" aria-live="polite">Question <span id="current-question-num">1</span> of <span id="total-questions-num">10</span></p> 
                     <p class="score-tracker" aria-live="polite">Score: <span id="current-score">0</span></p> 
                 </div> 
                 <div class="quiz-card" role="region" aria-live="polite" aria-atomic="true"> 
                     <p id="question-text" class="question-text">Loading question...</p> 
                     <div id="answer-buttons" class="answer-buttons" role="group" aria-label="Answer choices"> 
                         <!-- Answer buttons will be injected here by JavaScript --> 
                     </div> 
                     <button id="next-question-btn" class="btn btn-secondary" disabled aria-label="Next question">Next Question</button> 
                 </div> 
             </div> 
             <div id="quiz-results" class="quiz-results hidden" role="dialog" aria-modal="true" aria-labelledby="results-title"> 
                 <h3 id="results-title" class="results-title">Quiz Complete!</h3> 
                 <p class="final-score">You scored <span id="final-score-display">0</span> out of <span id="max-score-display">0</span>!</p> 
                 <p id="score-message" class="score-message"></p> 
                 <button id="restart-quiz-btn" class="btn btn-primary">Play Again</button> 
             </div> 
         </section> 
 
         <section id="how-to-play" class="how-to-play-section container" aria-labelledby="how-to-play-heading"> 
             <h2 id="how-to-play-heading" class="section-title">How to Play</h2> 
             <div class="how-to-play-grid"> 
                 <div class="step-card"> 
                     <img src=" \`https://images.unsplash.com/photo-1516321497487-e288ad7ab135?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=MnwxfDB8MXxyYW5kb218MHx8c3RhcnQsYnV0dG9uLGljb258fHx8fHwxNzE3NzY4NDY1&ixlib=rb-4.0.3&q=80&w=400\` " alt="A hand pressing a start button" class="step-icon"> 
                     <h3>1. Start the Quiz</h3> 
                     <p>Click the "Start Quiz Now" button to begin your challenge.</p> 
                 </div> 
                 <div class="step-card"> 
                     <img src=" \`https://images.unsplash.com/photo-1517032200257-094730657c4c?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=MnwxfDB8MXxyYW5kb218MHx8Y2hvb2ljZSxhbnN3ZXJzLGljb258fHx8fHwxNzE3NzY4NDY1&ixlib=rb-4.0.3&q=80&w=400\` " alt="Multiple choice options on a screen" class="step-icon"> 
                     <h3>2. Answer Questions</h3> 
                     <p>Read each question carefully and select the best answer from the given options.</p> 
                 </div> 
                 <div class="step-card"> 
                     <img src=" \`https://images.unsplash.com/photo-1517032200257-094730657c4c?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=MnwxfDB8MXxyYW5kb218MHx8c2NvcmUsdHJhY2tpbmcsZ2FtZXx8fHx8fHwxNzE3NzY4NDY1&ixlib=rb-4.0.3&q=80&w=400\` " alt="A scoreboard showing points" class="step-icon"> 
                     <h3>3. Track Your Score</h3> 
                     <p>Your score will update with each correct answer. Aim for the highest!</p> 
                 </div> 
                 <div class="step-card"> 
                     <img src=" \`https://images.unsplash.com/photo-1517032200257-094730657c4c?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=MnwxfDB8MXxyYW5kb218MHx8cmVzdWx0cyxmaW5hbCx3aW58fHx8fHwxNzE3NzY4NDY1&ixlib=rb-4.0.3&q=80&w=400\` " alt="A trophy or award for achievement" class="step-icon"> 
                     <h3>4. See Your Results</h3> 
                     <p>At the end, view your final score and see how well you performed.</p> 
                 </div> 
             </div> 
         </section> 
     </main> 
 
     <footer class="site-footer"> 
         <div class="container"> 
             <p>&copy; 2023 Quiz Master Challenge. All rights reserved.</p> 
             <p>Images by <a href=" \`https://unsplash.com/\` " target="_blank" rel="noopener noreferrer">Unsplash</a></p> 
         </div> 
     </footer> 
 
     <script src="script.js" defer></script> 
 </body> 
 </html>`;

        const result = validator.validateFile(quizHtml, 'index.html', 'vanilla-js');
        const fixed = result.fixedCode || quizHtml;

        assert.ok(!fixed.includes('\`https://'), 'Should strip backticks from URLs');
        assert.ok(fixed.includes('href="https://fonts.googleapis.com"'), 'Should fix fonts preconnect');
        assert.ok(fixed.includes('src="https://images.unsplash.com'), 'Should fix image src');
        assert.ok(!fixed.includes('href=" https'), 'Should trim leading spaces in href');
    });

    it('should fix nested quotes in SVG data URIs', () => {
        const svgHtml = `<!DOCTYPE html>
<html>
<head>
    <link rel="icon" href="data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">☀️</text></svg>">
</head>
<body>
    <img src="data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><circle cx="10" cy="10" r="5" fill="red"/></svg>" alt="Red dot">
</body>
</html>`;
        const result = validator.validateFile(svgHtml, 'index.html', 'vanilla-js');
        const fixed = result.fixedCode || svgHtml;
        
        // Verify nested quotes are changed to single quotes
        assert.ok(fixed.includes("xmlns='http://www.w3.org/2000/svg'"), 'Should use single quotes for nested xmlns');
        assert.ok(fixed.includes("fill='red'"), 'Should use single quotes for nested fill');
        assert.ok(fixed.includes('href="data:image/svg+xml'), 'Should keep outer double quotes');
    });

    it('should handle single quoted attributes with backticks', () => {
        const singleHtml = `<img src=' \`https://ex.com/a.png\` ' data-info=' \`some info\` '>`;
        const result = validator.validateFile(singleHtml, 'test.html', 'vanilla-js');
        const fixed = result.fixedCode || singleHtml;

        assert.ok(!fixed.includes('`'), 'Should remove backticks from single quoted attributes');
        assert.ok(fixed.includes("src='https://ex.com/a.png'"), 'Should fix src in single quotes');
        assert.ok(fixed.includes("data-info='some info'"), 'Should fix data-info in single quotes');
    });

    it('should handle backticks nested deep in URLs', () => {
        const complexHtml = `<a href="https://example.com/search?q=\`AI\`&ref=\` \`site\` \` ">Search</a>`;
        const result = validator.validateFile(complexHtml, 'test.html', 'vanilla-js');
        const fixed = result.fixedCode || complexHtml;

        assert.ok(!fixed.includes('`'), 'Should remove all backticks from URL');
        assert.ok(fixed.includes('q=AI'), 'Should preserve parameter value');
        assert.ok(fixed.includes('ref=site'), 'Should preserve parameter value and trim');
    });

    it('should handle multiple backticked attributes in one tag', () => {
        const multiHtml = `<img src=" \`https://ex.com/a.png\` " data-hover=" \`https://ex.com/b.png\` ">`;
        const result = validator.validateFile(multiHtml, 'test.html', 'vanilla-js');
        const fixed = result.fixedCode || multiHtml;

        assert.ok(!fixed.includes('`'), 'Should remove all backticks');
        assert.ok(fixed.includes('src="https://ex.com/a.png"'), 'Should fix src');
        assert.ok(fixed.includes('data-hover="https://ex.com/b.png"'), 'Should fix data-hover');
    });

    it('should clean backticks from style attributes with url()', () => {
        const singleHtml = `<div style='background-image: url(\`https://example.com/img.jpg\`)'></div>
        <img src=' \`https://example.com/logo.png\` ' alt='Logo'>`;
        const result = validator.validateFile(singleHtml, 'test.html', 'vanilla-js');
        const fixed = result.fixedCode || singleHtml;
        
        assert.ok(fixed.includes("url(https://example.com/img.jpg)"), 'Should fix url() with backticks');
        assert.ok(fixed.includes("src='https://example.com/logo.png'"), 'Should fix src with single quotes and backticks');
    });
});
