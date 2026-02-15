"""Custom exception classes for the AI Code Generator."""

class ModelLoadError(Exception):
    """Raised when model fails to load."""
    def __init__(self, message, details=None):
        self.message = message
        self.details = details or {}
        super().__init__(self.message)

class GenerationError(Exception):
    """Raised when code generation fails."""
    def __init__(self, message, file_path=None, details=None):
        self.message = message
        self.file_path = file_path
        self.details = details or {}
        super().__init__(self.message)

class ValidationError(Exception):
    """Raised when code validation fails."""
    def __init__(self, message, file_path=None, errors=None, warnings=None):
        self.message = message
        self.file_path = file_path
        self.errors = errors or []
        self.warnings = warnings or []
        super().__init__(self.message)

class TimeoutError(Exception):
    """Raised when operation times out."""
    def __init__(self, message, operation=None, timeout=None):
        self.message = message
        self.operation = operation
        self.timeout = timeout
        super().__init__(self.message)
