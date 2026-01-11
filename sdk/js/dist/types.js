/**
 * @esm.do/sdk - Type Definitions
 *
 * This file contains all the type definitions for the ESM.do SDK client.
 * Types are aligned with the esm.do API and core package types.
 */
/**
 * SDK Error class with additional context
 */
export class ESMError extends Error {
    status;
    requestId;
    details;
    constructor(message, status, requestId, details) {
        super(message);
        this.status = status;
        this.requestId = requestId;
        this.details = details;
        this.name = 'ESMError';
    }
}
/**
 * Network error for connection issues
 */
export class NetworkError extends ESMError {
    constructor(message, cause) {
        super(message, 0, undefined, { cause: cause?.message });
        this.name = 'NetworkError';
    }
}
/**
 * Timeout error for requests that exceed the timeout
 */
export class TimeoutError extends ESMError {
    constructor(timeout) {
        super(`Request timeout after ${timeout}ms`, 408);
        this.name = 'TimeoutError';
    }
}
/**
 * Retry exhausted error when all retry attempts fail
 */
export class RetryExhaustedError extends ESMError {
    attempts;
    lastError;
    constructor(attempts, lastError) {
        super(`All ${attempts} retry attempts failed: ${lastError.message}`, 0);
        this.attempts = attempts;
        this.lastError = lastError;
        this.name = 'RetryExhaustedError';
    }
}
//# sourceMappingURL=types.js.map