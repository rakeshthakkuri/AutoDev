"""Retry handler service with exponential backoff and error feedback."""

import time
import logging
from typing import Dict, List, Optional, Callable, Any
from ..services.exceptions import GenerationError, ValidationError

logger = logging.getLogger(__name__)

class RetryHandler:
    """Handles retries with exponential backoff and error feedback."""
    
    def __init__(self, max_retries: int = 3, initial_delay: float = 0.0, max_delay: float = 10.0):
        self.max_retries = max_retries
        self.initial_delay = initial_delay
        self.max_delay = max_delay
        self.retry_metrics = {
            'total_retries': 0,
            'successful_retries': 0,
            'failed_retries': 0,
            'retry_reasons': {}
        }
    
    def _calculate_delay(self, attempt: int) -> float:
        """Calculate exponential backoff delay."""
        delay = self.initial_delay * (2 ** attempt)
        return min(delay, self.max_delay)
    
    def _get_retry_prompt(self, original_prompt: str, error_context: str, attempt: int) -> str:
        """Generate retry prompt with error context."""
        return f"""{original_prompt}

PREVIOUS ATTEMPT FAILED (Attempt {attempt + 1}):
{error_context}

Please fix the following issues and generate correct code:
1. Address the errors mentioned above
2. Ensure complete, valid code
3. Include all necessary structure (DOCTYPE, tags, etc.)
4. Do not repeat the same mistakes

Generate the corrected code:"""
    
    def retry_with_feedback(
        self,
        generate_func: Callable,
        original_prompt: str,
        error_context: str,
        file_path: str,
        attempt: int = 0
    ) -> Dict[str, Any]:
        """
        Retry generation with error feedback.
        
        Args:
            generate_func: Function that generates code (takes prompt, returns code)
            original_prompt: Original generation prompt
            error_context: Error message from previous attempt
            file_path: Path of file being generated
            attempt: Current attempt number (0-indexed)
        
        Returns:
            Dictionary with 'success', 'code', 'error', 'attempt'
        """
        if attempt >= self.max_retries:
            self.retry_metrics['failed_retries'] += 1
            return {
                'success': False,
                'code': None,
                'error': f'Max retries ({self.max_retries}) exceeded',
                'attempt': attempt
            }
        
        self.retry_metrics['total_retries'] += 1
        
        # Calculate delay (exponential backoff)
        if attempt > 0:
            delay = self._calculate_delay(attempt - 1)
            time.sleep(delay)
            logger.info(f"Retrying {file_path} (attempt {attempt + 1}/{self.max_retries}) after {delay}s delay")
        
        try:
            # Create retry prompt with error context
            retry_prompt = self._get_retry_prompt(original_prompt, error_context, attempt)
            
            # Call generation function
            result = generate_func(retry_prompt)
            
            if result and result.get('code'):
                self.retry_metrics['successful_retries'] += 1
                return {
                    'success': True,
                    'code': result['code'],
                    'error': None,
                    'attempt': attempt + 1
                }
            else:
                # Generation returned empty/invalid
                error_msg = result.get('error', 'Generated code is empty or invalid')
                return self.retry_with_feedback(
                    generate_func,
                    original_prompt,
                    error_msg,
                    file_path,
                    attempt + 1
                )
        
        except Exception as e:
            error_msg = str(e)
            logger.error(f"Retry attempt {attempt + 1} failed for {file_path}: {error_msg}")
            
            # Track retry reason
            reason_key = type(e).__name__
            self.retry_metrics['retry_reasons'][reason_key] = \
                self.retry_metrics['retry_reasons'].get(reason_key, 0) + 1
            
            # Check if same error repeated
            if attempt > 0:
                # Could add logic here to detect repeated errors
                pass
            
            # Retry if not at max
            if attempt < self.max_retries - 1:
                return self.retry_with_feedback(
                    generate_func,
                    original_prompt,
                    error_msg,
                    file_path,
                    attempt + 1
                )
            else:
                self.retry_metrics['failed_retries'] += 1
                return {
                    'success': False,
                    'code': None,
                    'error': error_msg,
                    'attempt': attempt + 1
                }
    
    def should_continue(self, consecutive_failures: int, threshold: int = 3) -> bool:
        """
        Circuit breaker: Check if generation should continue.
        Returns False if too many consecutive failures.
        """
        if consecutive_failures >= threshold:
            logger.warning(f"Circuit breaker triggered: {consecutive_failures} consecutive failures")
            return False
        return True
    
    def get_metrics(self) -> Dict:
        """Get retry metrics."""
        return self.retry_metrics.copy()
    
    def reset_metrics(self):
        """Reset retry metrics."""
        self.retry_metrics = {
            'total_retries': 0,
            'successful_retries': 0,
            'failed_retries': 0,
            'retry_reasons': {}
        }
