"""
esm.do Python SDK - Custom Exceptions

This module defines all custom exceptions used by the ESM client.
"""

from typing import Optional, Dict, Any


class ESMError(Exception):
    """Base exception for all ESM errors."""

    def __init__(
        self,
        message: str,
        code: str = "ESM_ERROR",
        status_code: Optional[int] = None,
        details: Optional[Dict[str, Any]] = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code
        self.details = details or {}

    def __repr__(self) -> str:
        return f"{self.__class__.__name__}(message={self.message!r}, code={self.code!r})"


class ModuleNotFoundError(ESMError):
    """Raised when a module is not found."""

    def __init__(self, module_name: str) -> None:
        super().__init__(
            message=f"Module not found: {module_name}",
            code="MODULE_NOT_FOUND",
            status_code=404,
            details={"module_name": module_name},
        )
        self.module_name = module_name


class ValidationError(ESMError):
    """Raised when validation fails."""

    def __init__(
        self,
        message: str,
        errors: Optional[Dict[str, str]] = None,
    ) -> None:
        super().__init__(
            message=message,
            code="VALIDATION_ERROR",
            status_code=400,
            details={"errors": errors or {}},
        )
        self.errors = errors or {}


class ExecutionError(ESMError):
    """Raised when script or test execution fails."""

    def __init__(
        self,
        message: str,
        logs: Optional[list] = None,
        original_error: Optional[str] = None,
    ) -> None:
        super().__init__(
            message=message,
            code="EXECUTION_ERROR",
            status_code=500,
            details={"logs": logs or [], "original_error": original_error},
        )
        self.logs = logs or []
        self.original_error = original_error


class AuthenticationError(ESMError):
    """Raised when authentication fails."""

    def __init__(self, message: str = "Authentication failed") -> None:
        super().__init__(
            message=message,
            code="AUTHENTICATION_ERROR",
            status_code=401,
        )


class RateLimitError(ESMError):
    """Raised when rate limit is exceeded."""

    def __init__(
        self,
        message: str = "Rate limit exceeded",
        retry_after: Optional[int] = None,
    ) -> None:
        super().__init__(
            message=message,
            code="RATE_LIMIT_ERROR",
            status_code=429,
            details={"retry_after": retry_after},
        )
        self.retry_after = retry_after


class NetworkError(ESMError):
    """Raised when a network error occurs."""

    def __init__(
        self,
        message: str,
        original_error: Optional[Exception] = None,
    ) -> None:
        super().__init__(
            message=message,
            code="NETWORK_ERROR",
            details={"original_error": str(original_error) if original_error else None},
        )
        self.original_error = original_error


class TimeoutError(ESMError):
    """Raised when a request times out."""

    def __init__(self, message: str = "Request timed out") -> None:
        super().__init__(
            message=message,
            code="TIMEOUT_ERROR",
            status_code=408,
        )
