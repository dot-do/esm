/**
 * @esm.do/sdk - HTTP Client Implementation
 *
 * Low-level HTTP client with automatic retries, exponential backoff,
 * and proper error handling.
 */
import { type RequestOptions, type ApiResponse } from './types.js';
export interface HttpClientConfig {
    /**
     * Base URL for requests
     */
    readonly baseUrl: string;
    /**
     * Default timeout in milliseconds
     * @default 30000
     */
    readonly timeout: number;
    /**
     * Maximum retry attempts
     * @default 3
     */
    readonly maxRetries: number;
    /**
     * Initial retry delay in milliseconds
     * @default 1000
     */
    readonly retryDelay: number;
    /**
     * Default headers for all requests
     */
    readonly headers: Record<string, string>;
    /**
     * Authentication token
     */
    readonly token?: string | undefined;
}
/**
 * HTTP client with automatic retries and exponential backoff
 */
export declare class HttpClient {
    private readonly config;
    constructor(config: Partial<HttpClientConfig> & {
        baseUrl: string;
    });
    /**
     * Build the full URL for a request
     */
    private buildUrl;
    /**
     * Build headers for a request
     */
    private buildHeaders;
    /**
     * Check if an error is retryable
     */
    private isRetryable;
    /**
     * Sleep for a given number of milliseconds
     */
    private sleep;
    /**
     * Calculate exponential backoff delay
     */
    private getRetryDelay;
    /**
     * Parse the response body as JSON
     */
    private parseResponse;
    /**
     * Make a request with automatic retries
     */
    request<T>(path: string, options?: RequestOptions): Promise<ApiResponse<T>>;
    /**
     * Make a single request (no retries)
     */
    private makeRequest;
    /**
     * Combine multiple abort signals
     */
    private combineSignals;
    /**
     * Make a GET request
     */
    get<T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<ApiResponse<T>>;
    /**
     * Make a POST request
     */
    post<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<ApiResponse<T>>;
    /**
     * Make a DELETE request
     */
    delete<T>(path: string, options?: Omit<RequestOptions, 'method'>): Promise<ApiResponse<T>>;
    /**
     * Make a PUT request
     */
    put<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<ApiResponse<T>>;
    /**
     * Make a PATCH request
     */
    patch<T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>): Promise<ApiResponse<T>>;
}
//# sourceMappingURL=client.d.ts.map