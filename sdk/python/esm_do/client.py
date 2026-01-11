"""
esm.do Python SDK - Main Client

This module provides the ESMClient class for interacting with the esm.do API.
Supports both async and sync operations with automatic retries.
"""

import asyncio
from typing import Optional, Dict, Any, Union, List
from functools import wraps
import httpx

from .types import (
    ESMModule,
    ModuleWriteOptions,
    ModuleInfo,
    TestResult,
    RunResult,
    ModuleVersion,
    WriteResult,
    DeleteResult,
    VersionList,
)
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


# Default configuration
DEFAULT_BASE_URL = "https://esm.do"
DEFAULT_TIMEOUT = 30.0
DEFAULT_MAX_RETRIES = 3
DEFAULT_RETRY_DELAY = 1.0


def _sync_wrapper(async_method):
    """Decorator to create a sync version of an async method."""

    @wraps(async_method)
    def wrapper(self, *args, **kwargs):
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None

        if loop and loop.is_running():
            # If we're already in an async context, create a new thread
            import concurrent.futures

            with concurrent.futures.ThreadPoolExecutor() as pool:
                future = pool.submit(
                    asyncio.run, async_method(self, *args, **kwargs)
                )
                return future.result()
        else:
            return asyncio.run(async_method(self, *args, **kwargs))

    return wrapper


class ESMClient:
    """
    Client for interacting with the esm.do API.

    Provides both async and sync methods for:
    - Reading modules
    - Writing/creating modules
    - Running module scripts
    - Running module tests
    - Managing module versions
    - Deleting modules

    Example usage:
        # Async usage
        client = ESMClient(base_url="https://esm.do", token="xxx")
        module = await client.read("@scope/name")
        result = await client.run("@scope/name", args={"foo": "bar"})

        # Sync usage
        module = client.read_sync("@scope/name")
        result = client.run_sync("@scope/name", args={"foo": "bar"})
    """

    def __init__(
        self,
        base_url: str = DEFAULT_BASE_URL,
        token: Optional[str] = None,
        timeout: float = DEFAULT_TIMEOUT,
        max_retries: int = DEFAULT_MAX_RETRIES,
        retry_delay: float = DEFAULT_RETRY_DELAY,
    ) -> None:
        """
        Initialize the ESM client.

        Args:
            base_url: The base URL for the esm.do API.
            token: Optional authentication token.
            timeout: Request timeout in seconds.
            max_retries: Maximum number of retry attempts for failed requests.
            retry_delay: Initial delay between retries (exponential backoff).
        """
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.timeout = timeout
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        self._client: Optional[httpx.AsyncClient] = None

    def _get_headers(self) -> Dict[str, str]:
        """Build request headers including authentication."""
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create the async HTTP client."""
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                headers=self._get_headers(),
                timeout=httpx.Timeout(self.timeout),
            )
        return self._client

    async def close(self) -> None:
        """Close the HTTP client."""
        if self._client and not self._client.is_closed:
            await self._client.aclose()
            self._client = None

    async def __aenter__(self) -> "ESMClient":
        """Async context manager entry."""
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        """Async context manager exit."""
        await self.close()

    def _handle_error_response(
        self, response: httpx.Response, module_name: Optional[str] = None
    ) -> None:
        """Convert HTTP error responses to appropriate exceptions."""
        status = response.status_code

        try:
            data = response.json()
            error_message = data.get("error", response.text)
        except Exception:
            error_message = response.text

        if status == 401:
            raise AuthenticationError(error_message)
        elif status == 404:
            if module_name:
                raise ModuleNotFoundError(module_name)
            raise ESMError(error_message, code="NOT_FOUND", status_code=404)
        elif status == 400:
            raise ValidationError(error_message)
        elif status == 429:
            retry_after = response.headers.get("Retry-After")
            raise RateLimitError(
                error_message,
                retry_after=int(retry_after) if retry_after else None,
            )
        elif status == 500:
            raise ExecutionError(error_message)
        else:
            raise ESMError(error_message, status_code=status)

    async def _request(
        self,
        method: str,
        path: str,
        json: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None,
        module_name: Optional[str] = None,
    ) -> httpx.Response:
        """
        Make an HTTP request with automatic retries.

        Args:
            method: HTTP method (GET, POST, DELETE, etc.)
            path: API endpoint path
            json: JSON body for POST/PUT requests
            params: Query parameters
            module_name: Optional module name for error context

        Returns:
            The HTTP response

        Raises:
            Various ESMError subclasses for different error conditions
        """
        client = await self._get_client()
        last_error: Optional[Exception] = None

        for attempt in range(self.max_retries):
            try:
                response = await client.request(
                    method=method,
                    url=path,
                    json=json,
                    params=params,
                )

                if response.status_code >= 400:
                    # Don't retry client errors (4xx) except rate limits
                    if response.status_code == 429:
                        retry_after = response.headers.get("Retry-After", "1")
                        await asyncio.sleep(float(retry_after))
                        continue
                    elif response.status_code < 500:
                        self._handle_error_response(response, module_name)
                    else:
                        # Retry server errors
                        if attempt < self.max_retries - 1:
                            await asyncio.sleep(
                                self.retry_delay * (2**attempt)
                            )
                            continue
                        self._handle_error_response(response, module_name)

                return response

            except httpx.TimeoutException as e:
                last_error = e
                if attempt < self.max_retries - 1:
                    await asyncio.sleep(self.retry_delay * (2**attempt))
                    continue
                raise TimeoutError(f"Request timed out: {e}")

            except httpx.RequestError as e:
                last_error = e
                if attempt < self.max_retries - 1:
                    await asyncio.sleep(self.retry_delay * (2**attempt))
                    continue
                raise NetworkError(f"Network error: {e}", original_error=e)

        # Should not reach here, but just in case
        raise NetworkError(
            f"Request failed after {self.max_retries} attempts",
            original_error=last_error,
        )

    # =========================================================================
    # Async API Methods
    # =========================================================================

    async def read(
        self,
        name: str,
        version: Optional[str] = None,
    ) -> ESMModule:
        """
        Read a module from the registry.

        Args:
            name: The module name (e.g., "@scope/name" or "name")
            version: Optional specific version to read

        Returns:
            The ESMModule object

        Raises:
            ModuleNotFoundError: If the module doesn't exist
        """
        path = f"/{name}"
        params = {"version": version} if version else None

        response = await self._request("GET", path, params=params, module_name=name)
        data = response.json()

        # Handle both direct module response and wrapped response
        if "data" in data:
            data = data["data"]

        return ESMModule(**data)

    async def write(
        self,
        name: str,
        types: str,
        module: str,
        tests: Optional[str] = None,
        script: Optional[str] = None,
        force: bool = False,
        tag: Optional[str] = None,
        commit_message: Optional[str] = None,
    ) -> WriteResult:
        """
        Write/create a module in the registry.

        Args:
            name: The module name
            types: TypeScript type definitions
            module: Module source code
            tests: Optional test code
            script: Optional script code
            force: If True, save even if tests fail
            tag: Optional version tag
            commit_message: Optional commit message

        Returns:
            WriteResult with version info and optional test results

        Raises:
            ValidationError: If the module fails validation
        """
        body = {
            "types": types,
            "module": module,
        }
        if tests is not None:
            body["tests"] = tests
        if script is not None:
            body["script"] = script

        options: Dict[str, Any] = {}
        if force:
            options["force"] = True
        if tag:
            options["tag"] = tag
        if commit_message:
            options["commitMessage"] = commit_message
        if options:
            body["options"] = options

        response = await self._request("POST", f"/{name}", json=body, module_name=name)
        data = response.json()

        if "data" in data:
            data = data["data"]

        return WriteResult(**data)

    async def run(
        self,
        name: str,
        args: Optional[Dict[str, Any]] = None,
        timeout: Optional[int] = None,
    ) -> RunResult:
        """
        Run a module's script.

        Args:
            name: The module name
            args: Optional arguments to pass to the script
            timeout: Optional execution timeout in milliseconds

        Returns:
            RunResult with the execution result and logs

        Raises:
            ModuleNotFoundError: If the module doesn't exist
            ExecutionError: If script execution fails
        """
        body: Dict[str, Any] = {}
        if args:
            body["input"] = args
        if timeout:
            body["timeout"] = timeout

        response = await self._request(
            "POST", f"/{name}/run", json=body if body else None, module_name=name
        )
        data = response.json()

        if "data" in data:
            data = data["data"]

        return RunResult(**data)

    async def test(
        self,
        name: str,
        timeout: Optional[int] = None,
    ) -> TestResult:
        """
        Run a module's tests.

        Args:
            name: The module name
            timeout: Optional execution timeout in milliseconds

        Returns:
            TestResult with pass/fail counts and individual test results

        Raises:
            ModuleNotFoundError: If the module doesn't exist
            ExecutionError: If test execution fails
        """
        body: Dict[str, Any] = {}
        if timeout:
            body["timeout"] = timeout

        response = await self._request(
            "POST", f"/{name}/test", json=body if body else None, module_name=name
        )
        data = response.json()

        if "data" in data:
            data = data["data"]

        return TestResult(**data)

    async def versions(
        self,
        name: str,
    ) -> List[ModuleVersion]:
        """
        Get version history for a module.

        Args:
            name: The module name

        Returns:
            List of ModuleVersion objects

        Raises:
            ModuleNotFoundError: If the module doesn't exist
        """
        response = await self._request("GET", f"/{name}/versions", module_name=name)
        data = response.json()

        if "data" in data:
            data = data["data"]

        if isinstance(data, list):
            return [ModuleVersion(**v) for v in data]
        elif isinstance(data, dict) and "versions" in data:
            return [ModuleVersion(**v) for v in data["versions"]]

        return []

    async def delete(
        self,
        name: str,
    ) -> DeleteResult:
        """
        Delete a module from the registry.

        Args:
            name: The module name

        Returns:
            DeleteResult confirming deletion

        Raises:
            ModuleNotFoundError: If the module doesn't exist
        """
        response = await self._request("DELETE", f"/{name}", module_name=name)
        data = response.json()

        if "data" in data:
            data = data["data"]

        return DeleteResult(**data)

    async def info(
        self,
        name: str,
        version: Optional[str] = None,
    ) -> ModuleInfo:
        """
        Get basic module information.

        Args:
            name: The module name
            version: Optional specific version

        Returns:
            ModuleInfo with basic metadata

        Raises:
            ModuleNotFoundError: If the module doesn't exist
        """
        path = f"/{name}"
        params = {"version": version} if version else None

        response = await self._request("GET", path, params=params, module_name=name)
        data = response.json()

        if "data" in data:
            data = data["data"]

        return ModuleInfo(**data)

    async def list_modules(
        self,
        pattern: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[str]:
        """
        List available modules.

        Args:
            pattern: Optional glob pattern to filter modules
            limit: Maximum number of results
            offset: Offset for pagination

        Returns:
            List of module names
        """
        params: Dict[str, Any] = {"limit": limit, "offset": offset}
        if pattern:
            params["pattern"] = pattern

        response = await self._request("GET", "/", params=params)
        data = response.json()

        if "data" in data:
            data = data["data"]

        if isinstance(data, list):
            return data
        elif isinstance(data, dict) and "modules" in data:
            return data["modules"]

        return []

    # =========================================================================
    # Sync API Methods (wrappers around async methods)
    # =========================================================================

    def read_sync(
        self,
        name: str,
        version: Optional[str] = None,
    ) -> ESMModule:
        """Synchronous version of read()."""
        return _sync_wrapper(self.read)(self, name, version)

    def write_sync(
        self,
        name: str,
        types: str,
        module: str,
        tests: Optional[str] = None,
        script: Optional[str] = None,
        force: bool = False,
        tag: Optional[str] = None,
        commit_message: Optional[str] = None,
    ) -> WriteResult:
        """Synchronous version of write()."""
        return _sync_wrapper(self.write)(
            self, name, types, module, tests, script, force, tag, commit_message
        )

    def run_sync(
        self,
        name: str,
        args: Optional[Dict[str, Any]] = None,
        timeout: Optional[int] = None,
    ) -> RunResult:
        """Synchronous version of run()."""
        return _sync_wrapper(self.run)(self, name, args, timeout)

    def test_sync(
        self,
        name: str,
        timeout: Optional[int] = None,
    ) -> TestResult:
        """Synchronous version of test()."""
        return _sync_wrapper(self.test)(self, name, timeout)

    def versions_sync(
        self,
        name: str,
    ) -> List[ModuleVersion]:
        """Synchronous version of versions()."""
        return _sync_wrapper(self.versions)(self, name)

    def delete_sync(
        self,
        name: str,
    ) -> DeleteResult:
        """Synchronous version of delete()."""
        return _sync_wrapper(self.delete)(self, name)

    def info_sync(
        self,
        name: str,
        version: Optional[str] = None,
    ) -> ModuleInfo:
        """Synchronous version of info()."""
        return _sync_wrapper(self.info)(self, name, version)

    def list_modules_sync(
        self,
        pattern: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> List[str]:
        """Synchronous version of list_modules()."""
        return _sync_wrapper(self.list_modules)(self, pattern, limit, offset)
