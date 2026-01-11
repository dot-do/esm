"""
esm.do Python SDK

A Python client library for interacting with the esm.do module system.

Example usage:
    from esm_do import ESMClient

    # Async usage
    async def main():
        client = ESMClient(base_url="https://esm.do", token="xxx")
        module = await client.read("@scope/name")
        result = await client.run("@scope/name", args={"foo": "bar"})

    # Sync usage
    client = ESMClient(base_url="https://esm.do", token="xxx")
    module = client.read_sync("@scope/name")
    result = client.run_sync("@scope/name", args={"foo": "bar"})
"""

__version__ = "0.1.0"

# Main client
from .client import ESMClient

# Types
from .types import (
    ESMModule,
    ModuleWriteOptions,
    ModuleInfo,
    TestCaseResult,
    TestResult,
    LogEntry,
    RunResult,
    ModuleVersion,
    VersionList,
    WriteResult,
    DeleteResult,
    APIResponse,
    ErrorResponse,
)

# Exceptions
from .exceptions import (
    ESMError,
    ModuleNotFoundError,
    ValidationError,
    ExecutionError,
    AuthenticationError,
    RateLimitError,
    NetworkError,
    TimeoutError,
)

__all__ = [
    # Version
    "__version__",
    # Client
    "ESMClient",
    # Types
    "ESMModule",
    "ModuleWriteOptions",
    "ModuleInfo",
    "TestCaseResult",
    "TestResult",
    "LogEntry",
    "RunResult",
    "ModuleVersion",
    "VersionList",
    "WriteResult",
    "DeleteResult",
    "APIResponse",
    "ErrorResponse",
    # Exceptions
    "ESMError",
    "ModuleNotFoundError",
    "ValidationError",
    "ExecutionError",
    "AuthenticationError",
    "RateLimitError",
    "NetworkError",
    "TimeoutError",
]
