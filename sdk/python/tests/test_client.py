"""
Unit tests for the ESMClient.

Uses respx to mock HTTP requests.
"""

import pytest
import httpx
import respx

from esm_do import (
    ESMClient,
    ESMModule,
    TestResult,
    RunResult,
    WriteResult,
    DeleteResult,
    ModuleVersion,
    ModuleNotFoundError,
    ValidationError,
    AuthenticationError,
    RateLimitError,
    ExecutionError,
)


# =============================================================================
# Fixtures
# =============================================================================


@pytest.fixture
def base_url():
    return "https://esm.do"


@pytest.fixture
def client(base_url):
    return ESMClient(base_url=base_url, token="test-token")


@pytest.fixture
def mock_module():
    return {
        "name": "@test/example",
        "types": "export function hello(name: string): string;",
        "module": "export function hello(name) { return `Hello, ${name}!`; }",
        "tests": "test('hello', () => { expect(hello('World')).toBe('Hello, World!'); });",
        "script": "console.log(hello('World'));",
        "version": "abc123",
        "createdAt": "2024-01-01T00:00:00Z",
        "updatedAt": "2024-01-01T00:00:00Z",
    }


# =============================================================================
# Read Tests
# =============================================================================


@pytest.mark.asyncio
async def test_read_module(client, base_url, mock_module):
    """Test reading a module."""
    with respx.mock:
        respx.get(f"{base_url}/@test/example").mock(
            return_value=httpx.Response(200, json={"data": mock_module})
        )

        module = await client.read("@test/example")

        assert isinstance(module, ESMModule)
        assert module.name == "@test/example"
        assert module.version == "abc123"
        assert "hello" in module.module

    await client.close()


@pytest.mark.asyncio
async def test_read_module_with_version(client, base_url, mock_module):
    """Test reading a specific version of a module."""
    with respx.mock:
        respx.get(f"{base_url}/@test/example").mock(
            return_value=httpx.Response(200, json={"data": mock_module})
        )

        module = await client.read("@test/example", version="abc123")

        assert module.version == "abc123"

    await client.close()


@pytest.mark.asyncio
async def test_read_module_not_found(client, base_url):
    """Test reading a non-existent module."""
    with respx.mock:
        respx.get(f"{base_url}/@test/missing").mock(
            return_value=httpx.Response(404, json={"error": "Module not found"})
        )

        with pytest.raises(ModuleNotFoundError) as exc_info:
            await client.read("@test/missing")

        assert exc_info.value.module_name == "@test/missing"

    await client.close()


# =============================================================================
# Write Tests
# =============================================================================


@pytest.mark.asyncio
async def test_write_module(client, base_url):
    """Test writing a new module."""
    with respx.mock:
        respx.post(f"{base_url}/@test/new").mock(
            return_value=httpx.Response(
                201,
                json={
                    "data": {
                        "name": "@test/new",
                        "version": "def456",
                        "created": True,
                    }
                },
            )
        )

        result = await client.write(
            name="@test/new",
            types="export function greet(): string;",
            module="export function greet() { return 'Hi!'; }",
        )

        assert isinstance(result, WriteResult)
        assert result.name == "@test/new"
        assert result.version == "def456"
        assert result.created is True

    await client.close()


@pytest.mark.asyncio
async def test_write_module_with_tests(client, base_url):
    """Test writing a module with tests."""
    with respx.mock:
        respx.post(f"{base_url}/@test/with-tests").mock(
            return_value=httpx.Response(
                201,
                json={
                    "data": {
                        "name": "@test/with-tests",
                        "version": "ghi789",
                        "created": True,
                        "testResults": {
                            "passed": 2,
                            "failed": 0,
                            "total": 2,
                            "duration": 50,
                            "results": [],
                        },
                    }
                },
            )
        )

        result = await client.write(
            name="@test/with-tests",
            types="export function add(a: number, b: number): number;",
            module="export function add(a, b) { return a + b; }",
            tests="test('add', () => expect(add(1, 2)).toBe(3));",
        )

        assert result.test_results is not None
        assert result.test_results.passed == 2
        assert result.test_results.failed == 0

    await client.close()


@pytest.mark.asyncio
async def test_write_module_validation_error(client, base_url):
    """Test writing with validation error."""
    with respx.mock:
        respx.post(f"{base_url}/@test/invalid").mock(
            return_value=httpx.Response(400, json={"error": "Tests failed"})
        )

        with pytest.raises(ValidationError):
            await client.write(
                name="@test/invalid",
                types="invalid",
                module="invalid",
            )

    await client.close()


# =============================================================================
# Run Tests
# =============================================================================


@pytest.mark.asyncio
async def test_run_script(client, base_url):
    """Test running a module's script."""
    with respx.mock:
        respx.post(f"{base_url}/@test/example/run").mock(
            return_value=httpx.Response(
                200,
                json={
                    "data": {
                        "result": {"greeting": "Hello, World!"},
                        "logs": [{"level": "log", "args": ["Hello, World!"]}],
                        "duration": 25,
                    }
                },
            )
        )

        result = await client.run("@test/example", args={"name": "World"})

        assert isinstance(result, RunResult)
        assert result.result == {"greeting": "Hello, World!"}
        assert result.duration == 25

    await client.close()


@pytest.mark.asyncio
async def test_run_script_with_timeout(client, base_url):
    """Test running a script with custom timeout."""
    with respx.mock:
        route = respx.post(f"{base_url}/@test/example/run").mock(
            return_value=httpx.Response(
                200,
                json={
                    "data": {
                        "result": None,
                        "logs": [],
                        "duration": 100,
                    }
                },
            )
        )

        result = await client.run("@test/example", timeout=5000)

        assert result.duration == 100
        # Verify timeout was sent in request
        request = route.calls[0].request
        body = request.read()
        assert b'"timeout": 5000' in body

    await client.close()


# =============================================================================
# Test Method Tests
# =============================================================================


@pytest.mark.asyncio
async def test_run_tests(client, base_url):
    """Test running a module's tests."""
    with respx.mock:
        respx.post(f"{base_url}/@test/example/test").mock(
            return_value=httpx.Response(
                200,
                json={
                    "data": {
                        "passed": 3,
                        "failed": 1,
                        "total": 4,
                        "duration": 150,
                        "results": [
                            {"name": "test1", "status": "passed", "duration": 30},
                            {"name": "test2", "status": "passed", "duration": 40},
                            {"name": "test3", "status": "passed", "duration": 35},
                            {
                                "name": "test4",
                                "status": "failed",
                                "duration": 45,
                                "error": "Expected true, got false",
                            },
                        ],
                    }
                },
            )
        )

        result = await client.test("@test/example")

        assert isinstance(result, TestResult)
        assert result.passed == 3
        assert result.failed == 1
        assert result.total == 4
        assert len(result.results) == 4
        assert not result.success

    await client.close()


@pytest.mark.asyncio
async def test_run_tests_all_pass(client, base_url):
    """Test running tests that all pass."""
    with respx.mock:
        respx.post(f"{base_url}/@test/passing/test").mock(
            return_value=httpx.Response(
                200,
                json={
                    "data": {
                        "passed": 5,
                        "failed": 0,
                        "total": 5,
                        "duration": 200,
                        "results": [],
                    }
                },
            )
        )

        result = await client.test("@test/passing")

        assert result.success is True

    await client.close()


# =============================================================================
# Versions Tests
# =============================================================================


@pytest.mark.asyncio
async def test_get_versions(client, base_url):
    """Test getting module version history."""
    with respx.mock:
        respx.get(f"{base_url}/@test/example/versions").mock(
            return_value=httpx.Response(
                200,
                json={
                    "data": [
                        {
                            "version": "abc123",
                            "message": "Initial release",
                            "timestamp": "2024-01-01T00:00:00Z",
                        },
                        {
                            "version": "def456",
                            "message": "Bug fix",
                            "timestamp": "2024-01-02T00:00:00Z",
                            "parent": "abc123",
                        },
                    ]
                },
            )
        )

        versions = await client.versions("@test/example")

        assert len(versions) == 2
        assert all(isinstance(v, ModuleVersion) for v in versions)
        assert versions[0].version == "abc123"
        assert versions[1].parent == "abc123"

    await client.close()


# =============================================================================
# Delete Tests
# =============================================================================


@pytest.mark.asyncio
async def test_delete_module(client, base_url):
    """Test deleting a module."""
    with respx.mock:
        respx.delete(f"{base_url}/@test/example").mock(
            return_value=httpx.Response(
                200,
                json={
                    "data": {
                        "deleted": True,
                        "name": "@test/example",
                        "commit": {"sha": "abc123", "message": "Delete @test/example"},
                    }
                },
            )
        )

        result = await client.delete("@test/example")

        assert isinstance(result, DeleteResult)
        assert result.deleted is True
        assert result.name == "@test/example"

    await client.close()


@pytest.mark.asyncio
async def test_delete_module_not_found(client, base_url):
    """Test deleting a non-existent module."""
    with respx.mock:
        respx.delete(f"{base_url}/@test/missing").mock(
            return_value=httpx.Response(404, json={"error": "Module not found"})
        )

        with pytest.raises(ModuleNotFoundError):
            await client.delete("@test/missing")

    await client.close()


# =============================================================================
# Authentication Tests
# =============================================================================


@pytest.mark.asyncio
async def test_authentication_error(client, base_url):
    """Test handling authentication errors."""
    with respx.mock:
        respx.post(f"{base_url}/@test/private").mock(
            return_value=httpx.Response(401, json={"error": "Invalid token"})
        )

        with pytest.raises(AuthenticationError):
            await client.write(
                name="@test/private",
                types="export const x: number;",
                module="export const x = 1;",
            )

    await client.close()


@pytest.mark.asyncio
async def test_rate_limit_error(client, base_url):
    """Test handling rate limit errors."""
    with respx.mock:
        respx.get(f"{base_url}/@test/example").mock(
            return_value=httpx.Response(
                429,
                json={"error": "Rate limit exceeded"},
                headers={"Retry-After": "60"},
            )
        )

        with pytest.raises(RateLimitError) as exc_info:
            await client.read("@test/example")

        assert exc_info.value.retry_after == 60

    await client.close()


# =============================================================================
# Client Configuration Tests
# =============================================================================


def test_client_default_config():
    """Test client default configuration."""
    client = ESMClient()

    assert client.base_url == "https://esm.do"
    assert client.token is None
    assert client.timeout == 30.0
    assert client.max_retries == 3


def test_client_custom_config():
    """Test client custom configuration."""
    client = ESMClient(
        base_url="https://custom.esm.do",
        token="my-token",
        timeout=60.0,
        max_retries=5,
        retry_delay=2.0,
    )

    assert client.base_url == "https://custom.esm.do"
    assert client.token == "my-token"
    assert client.timeout == 60.0
    assert client.max_retries == 5
    assert client.retry_delay == 2.0


def test_client_strips_trailing_slash():
    """Test that trailing slash is stripped from base URL."""
    client = ESMClient(base_url="https://esm.do/")
    assert client.base_url == "https://esm.do"


# =============================================================================
# Sync Method Tests
# =============================================================================


def test_read_sync(base_url, mock_module):
    """Test synchronous read method."""
    client = ESMClient(base_url=base_url)

    with respx.mock:
        respx.get(f"{base_url}/@test/example").mock(
            return_value=httpx.Response(200, json={"data": mock_module})
        )

        module = client.read_sync("@test/example")

        assert isinstance(module, ESMModule)
        assert module.name == "@test/example"


def test_run_sync(base_url):
    """Test synchronous run method."""
    client = ESMClient(base_url=base_url)

    with respx.mock:
        respx.post(f"{base_url}/@test/example/run").mock(
            return_value=httpx.Response(
                200,
                json={
                    "data": {
                        "result": "Hello!",
                        "logs": [],
                        "duration": 10,
                    }
                },
            )
        )

        result = client.run_sync("@test/example")

        assert isinstance(result, RunResult)
        assert result.result == "Hello!"


# =============================================================================
# Context Manager Tests
# =============================================================================


@pytest.mark.asyncio
async def test_async_context_manager(base_url, mock_module):
    """Test using client as async context manager."""
    with respx.mock:
        respx.get(f"{base_url}/@test/example").mock(
            return_value=httpx.Response(200, json={"data": mock_module})
        )

        async with ESMClient(base_url=base_url) as client:
            module = await client.read("@test/example")
            assert module.name == "@test/example"


# =============================================================================
# Retry Tests
# =============================================================================


@pytest.mark.asyncio
async def test_retry_on_server_error(base_url):
    """Test automatic retry on server errors."""
    client = ESMClient(base_url=base_url, max_retries=3, retry_delay=0.01)
    call_count = 0

    def side_effect(request):
        nonlocal call_count
        call_count += 1
        if call_count < 3:
            return httpx.Response(500, json={"error": "Server error"})
        return httpx.Response(
            200,
            json={
                "data": {
                    "name": "@test/example",
                    "types": "",
                    "module": "",
                    "tests": "",
                    "script": "",
                    "version": "v1",
                }
            },
        )

    with respx.mock:
        respx.get(f"{base_url}/@test/example").mock(side_effect=side_effect)

        module = await client.read("@test/example")

        assert module.name == "@test/example"
        assert call_count == 3

    await client.close()


# =============================================================================
# Type Tests
# =============================================================================


def test_test_case_result_passed_property():
    """Test TestCaseResult.passed property."""
    from esm_do import TestCaseResult

    passed = TestCaseResult(name="test1", status="passed")
    failed = TestCaseResult(name="test2", status="failed", error="Assertion failed")

    assert passed.passed is True
    assert failed.passed is False


def test_run_result_output_property():
    """Test RunResult.output property."""
    result1 = RunResult(result="hello", logs=[], duration=10)
    result2 = RunResult(value="world", logs=[], duration=10)

    assert result1.output == "hello"
    assert result2.output == "world"


def test_test_result_success_property():
    """Test TestResult.success property."""
    success = TestResult(passed=5, failed=0, total=5, duration=100, results=[])
    failure = TestResult(passed=4, failed=1, total=5, duration=100, results=[])

    assert success.success is True
    assert failure.success is False
