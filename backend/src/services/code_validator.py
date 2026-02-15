"""Code validation service for HTML, CSS, JavaScript, and JSX."""

import re
import subprocess
import tempfile
import os
from typing import Dict, List, Tuple, Optional
from pathlib import Path

class CodeValidator:
    """Validates and auto-fixes code for different file types."""
    
    def __init__(self):
        self.validation_metrics = {
            'total_validations': 0,
            'passed': 0,
            'failed': 0,
            'auto_fixed': 0
        }
    
    def validate_html(self, code: str, file_path: str = '') -> Tuple[bool, List[str], List[str], Optional[str]]:
        """
        Validate HTML code.
        Returns: (is_valid, errors, warnings, fixed_code)
        """
        errors = []
        warnings = []
        fixed_code = code
        
        # Check for DOCTYPE
        if not re.search(r'<!DOCTYPE\s+html', code, re.IGNORECASE):
            errors.append("Missing DOCTYPE declaration")
            fixed_code = f"<!DOCTYPE html>\n{fixed_code}"
        
        # Check for html tag
        if not re.search(r'<html', code, re.IGNORECASE):
            errors.append("Missing <html> tag")
            if '<!DOCTYPE' in fixed_code:
                fixed_code = fixed_code.replace('<!DOCTYPE html>', '<!DOCTYPE html>\n<html>')
            else:
                fixed_code = f"<html>\n{fixed_code}"
            if '</html>' not in fixed_code:
                fixed_code = f"{fixed_code}\n</html>"
        
        # Check for head tag
        if not re.search(r'<head', code, re.IGNORECASE):
            warnings.append("Missing <head> tag")
            if '<body' in fixed_code:
                fixed_code = fixed_code.replace('<body', '<head>\n</head>\n<body')
            elif '</html>' in fixed_code:
                fixed_code = fixed_code.replace('</html>', '<head>\n</head>\n</html>')
        
        # Check for body tag
        if not re.search(r'<body', code, re.IGNORECASE):
            warnings.append("Missing <body> tag")
            if '</head>' in fixed_code:
                fixed_code = fixed_code.replace('</head>', '</head>\n<body>\n')
            if '</html>' in fixed_code:
                fixed_code = fixed_code.replace('</html>', '</body>\n</html>')
        
        # Check for unclosed tags (basic check)
        open_tags = re.findall(r'<([a-zA-Z][a-zA-Z0-9]*)[^>]*>', code)
        close_tags = re.findall(r'</([a-zA-Z][a-zA-Z0-9]*)>', code)
        
        # Count self-closing tags
        self_closing = re.findall(r'<([a-zA-Z][a-zA-Z0-9]*)[^>]*/>', code)
        
        # Simple tag balance check (excluding self-closing)
        tag_counts = {}
        for tag in open_tags:
            if tag.lower() not in ['br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'source', 'track', 'wbr']:
                tag_counts[tag.lower()] = tag_counts.get(tag.lower(), 0) + 1
        
        for tag in close_tags:
            tag_counts[tag.lower()] = tag_counts.get(tag.lower(), 0) - 1
        
        unbalanced = [tag for tag, count in tag_counts.items() if count > 0]
        if unbalanced:
            warnings.append(f"Potentially unclosed tags: {', '.join(unbalanced)}")
        
        # Check for basic structure
        if len(code.strip()) < 50:
            errors.append("HTML file is too short (likely incomplete)")
        
        is_valid = len(errors) == 0
        return is_valid, errors, warnings, fixed_code if fixed_code != code else None
    
    def validate_css(self, code: str, file_path: str = '') -> Tuple[bool, List[str], List[str], Optional[str]]:
        """
        Validate CSS code.
        Returns: (is_valid, errors, warnings, fixed_code)
        """
        errors = []
        warnings = []
        fixed_code = code
        
        # Check for unmatched braces
        open_braces = code.count('{')
        close_braces = code.count('}')
        
        if open_braces != close_braces:
            errors.append(f"Unmatched braces: {open_braces} opening, {close_braces} closing")
            # Try to fix by adding missing closing braces
            diff = open_braces - close_braces
            if diff > 0:
                fixed_code = code + '\n' + '}' * diff
                warnings.append(f"Auto-added {diff} closing brace(s)")
        
        # Check for unmatched parentheses
        open_parens = code.count('(')
        close_parens = code.count(')')
        
        if open_parens != close_parens:
            warnings.append(f"Unmatched parentheses: {open_parens} opening, {close_parens} closing")
        
        # Check for unmatched brackets
        open_brackets = code.count('[')
        close_brackets = code.count(']')
        
        if open_brackets != close_brackets:
            warnings.append(f"Unmatched brackets: {open_brackets} opening, {close_brackets} closing")
        
        # Check for empty file
        if len(code.strip()) == 0:
            warnings.append("CSS file is empty")
        
        # Basic syntax check - look for common errors
        if re.search(r'[{}]\s*[{}]', code):
            warnings.append("Consecutive braces detected (possible syntax error)")
        
        is_valid = len(errors) == 0
        return is_valid, errors, warnings, fixed_code if fixed_code != code else None
    
    def validate_javascript(self, code: str, file_path: str = '') -> Tuple[bool, List[str], List[str], Optional[str]]:
        """
        Validate JavaScript code using Node.js.
        Returns: (is_valid, errors, warnings, fixed_code)
        """
        errors = []
        warnings = []
        fixed_code = None
        
        # Basic checks before running Node.js
        open_braces = code.count('{')
        close_braces = code.count('}')
        if open_braces != close_braces:
            errors.append(f"Unmatched braces: {open_braces} opening, {close_braces} closing")
        
        open_parens = code.count('(')
        close_parens = code.count(')')
        if open_parens != close_parens:
            errors.append(f"Unmatched parentheses: {open_parens} opening, {close_parens} closing")
        
        # Try to use Node.js for syntax validation
        try:
            with tempfile.NamedTemporaryFile(mode='w', suffix='.js', delete=False) as f:
                f.write(code)
                temp_path = f.name
            
            try:
                result = subprocess.run(
                    ['node', '--check', temp_path],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                
                if result.returncode != 0:
                    error_msg = result.stderr.strip()
                    # Extract meaningful error
                    if 'SyntaxError' in error_msg:
                        match = re.search(r'SyntaxError: (.+)', error_msg)
                        if match:
                            errors.append(f"Syntax error: {match.group(1)}")
                        else:
                            errors.append("JavaScript syntax error detected")
                    else:
                        errors.append(f"JavaScript validation error: {error_msg[:200]}")
            finally:
                os.unlink(temp_path)
        except subprocess.TimeoutExpired:
            warnings.append("JavaScript validation timed out")
        except FileNotFoundError:
            warnings.append("Node.js not found - skipping syntax validation")
        except Exception as e:
            warnings.append(f"Could not validate JavaScript: {str(e)}")
        
        # Check for empty file
        if len(code.strip()) == 0:
            warnings.append("JavaScript file is empty")
        
        is_valid = len(errors) == 0
        return is_valid, errors, warnings, fixed_code
    
    def validate_jsx(self, code: str, file_path: str = '') -> Tuple[bool, List[str], List[str], Optional[str]]:
        """
        Validate JSX code (basic checks).
        Returns: (is_valid, errors, warnings, fixed_code)
        """
        errors = []
        warnings = []
        fixed_code = None
        
        # Check for React import
        if 'React' in code or 'react' in code.lower():
            if not re.search(r'import\s+.*\s+from\s+[\'"]react', code):
                warnings.append("JSX code should import React")
        
        # Check for JSX syntax (basic)
        if '<' in code and '>' in code:
            # Check for unclosed JSX tags (basic)
            jsx_tags = re.findall(r'<([A-Z][a-zA-Z0-9]*)[^>]*>', code)
            jsx_closing = re.findall(r'</([A-Z][a-zA-Z0-9]*)>', code)
            
            if len(jsx_tags) != len(jsx_closing):
                warnings.append("Potentially unclosed JSX tags")
        
        # Use JavaScript validator for basic syntax
        js_valid, js_errors, js_warnings, _ = self.validate_javascript(code, file_path)
        errors.extend(js_errors)
        warnings.extend(js_warnings)
        
        is_valid = len(errors) == 0
        return is_valid, errors, warnings, fixed_code
    
    def auto_fix_common_errors(self, code: str, file_type: str) -> Tuple[str, List[str]]:
        """
        Attempt to auto-fix common code errors.
        Returns: (fixed_code, fixes_applied)
        """
        fixes_applied = []
        fixed_code = code
        
        if file_type == 'html':
            # Add DOCTYPE if missing
            if not re.search(r'<!DOCTYPE', fixed_code, re.IGNORECASE):
                fixed_code = f"<!DOCTYPE html>\n{fixed_code}"
                fixes_applied.append("Added DOCTYPE declaration")
            
            # Ensure html tag wraps content
            if '<html' not in fixed_code.lower():
                fixed_code = f"<html>\n{fixed_code}\n</html>"
                fixes_applied.append("Wrapped content in html tags")
        
        elif file_type == 'css':
            # Balance braces
            open_braces = fixed_code.count('{')
            close_braces = fixed_code.count('}')
            if open_braces > close_braces:
                fixed_code += '\n' + '}' * (open_braces - close_braces)
                fixes_applied.append(f"Added {open_braces - close_braces} closing brace(s)")
        
        elif file_type in ['js', 'jsx']:
            # Balance braces
            open_braces = fixed_code.count('{')
            close_braces = fixed_code.count('}')
            if open_braces > close_braces:
                fixed_code += '\n' + '}' * (open_braces - close_braces)
                fixes_applied.append(f"Added {open_braces - close_braces} closing brace(s)")
        
        return fixed_code, fixes_applied
    
    def validate_file(self, code: str, file_path: str) -> Dict:
        """
        Validate a file based on its extension.
        Returns validation result dictionary.
        """
        self.validation_metrics['total_validations'] += 1
        
        file_ext = Path(file_path).suffix.lower()
        file_name = Path(file_path).name.lower()
        
        is_valid = False
        errors = []
        warnings = []
        fixed_code = None
        fixes_applied = []
        
        try:
            if file_ext == '.html' or file_name == 'index.html':
                is_valid, errors, warnings, fixed_code = self.validate_html(code, file_path)
            elif file_ext == '.css':
                is_valid, errors, warnings, fixed_code = self.validate_css(code, file_path)
            elif file_ext == '.js':
                is_valid, errors, warnings, fixed_code = self.validate_javascript(code, file_path)
            elif file_ext in ['.jsx', '.tsx']:
                is_valid, errors, warnings, fixed_code = self.validate_jsx(code, file_path)
            else:
                warnings.append(f"Unknown file type: {file_ext}")
                is_valid = True  # Don't fail on unknown types
            
            # Attempt auto-fix if validation failed
            if not is_valid and fixed_code is None:
                fixed_code, fixes_applied = self.auto_fix_common_errors(code, file_ext.lstrip('.'))
                if fixes_applied:
                    # Re-validate after fix
                    if file_ext == '.html' or file_name == 'index.html':
                        is_valid, errors, warnings, _ = self.validate_html(fixed_code, file_path)
                    elif file_ext == '.css':
                        is_valid, errors, warnings, _ = self.validate_css(fixed_code, file_path)
            
            if is_valid:
                self.validation_metrics['passed'] += 1
            else:
                self.validation_metrics['failed'] += 1
            
            if fixes_applied:
                self.validation_metrics['auto_fixed'] += 1
            
        except Exception as e:
            errors.append(f"Validation error: {str(e)}")
            self.validation_metrics['failed'] += 1
        
        return {
            'is_valid': is_valid,
            'errors': errors,
            'warnings': warnings,
            'fixed_code': fixed_code,
            'fixes_applied': fixes_applied,
            'file_path': file_path
        }
    
    def get_metrics(self) -> Dict:
        """Get validation metrics."""
        return self.validation_metrics.copy()
