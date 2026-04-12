# V2 Pipeline — Prompt Issues Found During Live Testing

## Issues for Phase B Tuning

### PROMPT ISSUE 1: "use client" directive missing in Next.js components
- **Affected**: Components using React hooks (useState, useEffect) in Next.js projects
- **Root cause**: FRAMEWORK_PROMPTS['nextjs'] mentions "use client" but doesn't enforce it strongly enough
- **Example**: `components/layout/Header.tsx` and `components/sections/TestimonialsCarousel.tsx` both use hooks but lack the directive
- **Fix**: Strengthen the Next.js prompt to explicitly require "use client" at the top of any file using hooks

### PROMPT ISSUE 2: LLM generates excessive files for "simple" complexity
- **Affected**: Simple prompts generating 15+ files (should be 3-7)
- **Root cause**: PLANNER_PROMPT doesn't enforce file count limits strictly enough for each complexity tier
- **Example**: Simple portfolio generated 15 files including data files, config files
- **Fix**: Add explicit "MUST generate between X and Y files" constraints per complexity level

### PROMPT ISSUE 3: Layout.tsx validation failures in Next.js
- **Affected**: `app/layout.tsx` repeatedly fails validation, falls back to template
- **Root cause**: The Next.js layout requires specific structure (html, body tags) that the code gen prompt doesn't enforce clearly enough
- **Example**: 3 retries all failed for layout.tsx in smoke test 2
- **Fix**: Add a specific sub-prompt for Next.js layout files with exact structure requirements

### PROMPT ISSUE 4: Config files use module.exports instead of export default
- **Affected**: `next.config.js`, `tailwind.config.js`, `postcss.config.js`
- **Root cause**: These files correctly use CommonJS `module.exports` but the contract extraction considers this "no default export"
- **Classification**: CONTRACT EXTRACTION GAP (not really a prompt issue)
- **Fix**: Update contract extraction to recognize `module.exports` as a valid export pattern

### PROMPT ISSUE 5: Navbar.jsx validation errors persist through fix attempts
- **Affected**: Complex navigation components with many elements
- **Root cause**: LLM generates components that are too complex for the token budget, causing truncation
- **Example**: Navbar.jsx failed after 2 fix attempts + 1 recovery, fell back to template
- **Fix**: Token budget awareness in the codegen prompt ("prioritize working code over completeness")
