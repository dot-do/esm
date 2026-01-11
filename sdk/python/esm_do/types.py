"""
esm.do Python SDK - Type Definitions

This module contains all Pydantic models and type definitions for the ESM client.
"""

from datetime import datetime
from typing import Optional, List, Dict, Any, Union
from pydantic import BaseModel, Field


# =============================================================================
# Core Module Types
# =============================================================================


class ESMModule(BaseModel):
    """Full module representation stored in the system."""

    name: str
    types: str
    module: str
    tests: str = ""
    script: str = ""
    version: str
    created_at: Optional[datetime] = Field(default=None, alias="createdAt")
    updated_at: Optional[datetime] = Field(default=None, alias="updatedAt")

    class Config:
        populate_by_name = True


class ModuleWriteOptions(BaseModel):
    """Options for writing/creating a module."""

    name: str
    types: str
    module: str
    tests: Optional[str] = None
    script: Optional[str] = None
    version: Optional[str] = None
    force: bool = False
    tag: Optional[str] = None
    commit_message: Optional[str] = Field(default=None, alias="commitMessage")

    class Config:
        populate_by_name = True


class ModuleInfo(BaseModel):
    """Basic module information."""

    name: str
    version: Optional[str] = None
    files: List[str] = Field(default_factory=list)


# =============================================================================
# Test Result Types
# =============================================================================


class TestCaseResult(BaseModel):
    """Result of a single test case."""

    name: str
    status: str  # 'passed', 'failed', 'skipped'
    duration: Optional[float] = None
    error: Optional[str] = None

    @property
    def passed(self) -> bool:
        """Check if the test passed."""
        return self.status == "passed"


class TestResult(BaseModel):
    """Result from running module tests."""

    passed: int
    failed: int
    total: int
    duration: float
    results: List[TestCaseResult] = Field(default_factory=list)

    @property
    def success(self) -> bool:
        """Check if all tests passed."""
        return self.failed == 0


# =============================================================================
# Run/Execution Result Types
# =============================================================================


class LogEntry(BaseModel):
    """Log entry from script execution."""

    level: str  # 'log', 'warn', 'error', 'info', 'debug'
    args: List[Any] = Field(default_factory=list)


class RunResult(BaseModel):
    """Result from running a module's script."""

    result: Any = None
    value: Any = None  # Alias for result
    logs: List[Union[LogEntry, Dict[str, Any]]] = Field(default_factory=list)
    duration: float = 0

    @property
    def output(self) -> Any:
        """Get the execution output (result or value)."""
        return self.result if self.result is not None else self.value


# =============================================================================
# Version History Types
# =============================================================================


class ModuleVersion(BaseModel):
    """Version history entry."""

    version: str
    message: str = ""
    timestamp: Optional[datetime] = None
    parent: Optional[str] = None


class VersionList(BaseModel):
    """List of module versions."""

    name: str
    versions: List[ModuleVersion] = Field(default_factory=list)


# =============================================================================
# Write/Delete Result Types
# =============================================================================


class WriteResult(BaseModel):
    """Result from writing a module."""

    name: str
    version: str
    created: bool = False
    updated: bool = False
    test_results: Optional[TestResult] = Field(default=None, alias="testResults")
    warning: Optional[str] = None

    class Config:
        populate_by_name = True


class DeleteResult(BaseModel):
    """Result from deleting a module."""

    deleted: bool
    name: str
    commit: Optional[Dict[str, str]] = None


# =============================================================================
# API Response Types
# =============================================================================


class APIResponse(BaseModel):
    """Generic API response wrapper."""

    status: int
    data: Optional[Any] = None
    error: Optional[str] = None

    @property
    def success(self) -> bool:
        """Check if the response was successful."""
        return 200 <= self.status < 300


class ErrorResponse(BaseModel):
    """Error response from the API."""

    status: int
    error: str
    details: Optional[Dict[str, Any]] = None
