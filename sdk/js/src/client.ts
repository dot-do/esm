/**
 * @esm.do/sdk - HTTP Client Implementation
 *
 * Low-level HTTP client with automatic retries, exponential backoff,
 * and proper error handling.
 */

import {
  ESMError,
  NetworkError,
  TimeoutError,
  RetryExhaustedError,
  type RequestOptions,
  type ApiResponse,
  type HttpMethod,
  type ESMApiError,
} from './types.js'

// =============================================================================
// Client Configuration
// =============================================================================

export interface HttpClientConfig {
  /**
   * Base URL for requests
   */
  readonly baseUrl: string

  /**
   * Default timeout in milliseconds
   * @default 30000
   */
  readonly timeout: number

  /**
   * Maximum retry attempts
   * @default 3
   */
  readonly maxRetries: number

  /**
   * Initial retry delay in milliseconds
   * @default 1000
   */
  readonly retryDelay: number

  /**
   * Default headers for all requests
   */
  readonly headers: Record<string, string>

  /**
   * Authentication token
   */
  readonly token?: string | undefined
}

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_CONFIG: Omit<HttpClientConfig, 'baseUrl'> = {
  timeout: 30000,
  maxRetries: 3,
  retryDelay: 1000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
}

// =============================================================================
// HTTP Client Class
// =============================================================================

/**
 * HTTP client with automatic retries and exponential backoff
 */
export class HttpClient {
  private readonly config: HttpClientConfig

  constructor(config: Partial<HttpClientConfig> & { baseUrl: string }) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      headers: {
        ...DEFAULT_CONFIG.headers,
        ...config.headers,
      },
    }
  }

  /**
   * Build the full URL for a request
   */
  private buildUrl(path: string): string {
    const base = this.config.baseUrl.replace(/\/$/, '')
    const cleanPath = path.startsWith('/') ? path : `/${path}`
    return `${base}${cleanPath}`
  }

  /**
   * Build headers for a request
   */
  private buildHeaders(customHeaders?: Record<string, string>): Headers {
    const headers = new Headers(this.config.headers)

    // Add auth token if present
    if (this.config.token) {
      headers.set('Authorization', `Bearer ${this.config.token}`)
    }

    // Add custom headers
    if (customHeaders) {
      for (const [key, value] of Object.entries(customHeaders)) {
        headers.set(key, value)
      }
    }

    return headers
  }

  /**
   * Check if an error is retryable
   */
  private isRetryable(status: number): boolean {
    // Retry on network errors (status 0) and server errors (5xx)
    // Also retry on 429 (rate limited)
    return status === 0 || status === 429 || (status >= 500 && status < 600)
  }

  /**
   * Sleep for a given number of milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Calculate exponential backoff delay
   */
  private getRetryDelay(attempt: number): number {
    // Exponential backoff with jitter
    const baseDelay = this.config.retryDelay * Math.pow(2, attempt)
    const jitter = Math.random() * 0.3 * baseDelay
    return Math.min(baseDelay + jitter, 30000) // Cap at 30 seconds
  }

  /**
   * Parse the response body as JSON
   */
  private async parseResponse<T>(response: Response): Promise<T> {
    const text = await response.text()

    if (!text) {
      return {} as T
    }

    try {
      return JSON.parse(text) as T
    } catch {
      throw new ESMError(
        `Invalid JSON response: ${text.slice(0, 100)}`,
        response.status
      )
    }
  }

  /**
   * Make a request with automatic retries
   */
  async request<T>(
    path: string,
    options: RequestOptions = {}
  ): Promise<ApiResponse<T>> {
    const method = options.method || 'GET'
    const url = this.buildUrl(path)
    const headers = this.buildHeaders(options.headers)
    const timeout = options.timeout || this.config.timeout

    let lastError: Error = new Error('No request attempts made')

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      // Apply exponential backoff for retries (not first attempt)
      if (attempt > 0) {
        const delay = this.getRetryDelay(attempt - 1)
        await this.sleep(delay)
      }

      try {
        const result = await this.makeRequest<T>(
          url,
          method,
          headers,
          options.body,
          timeout,
          options.signal
        )
        return result
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        // Don't retry if it's not a retryable error
        if (error instanceof ESMError && !this.isRetryable(error.status)) {
          throw error
        }

        // Don't retry if this was the last attempt
        if (attempt === this.config.maxRetries) {
          break
        }

        // Don't retry if the request was aborted
        if (error instanceof Error && error.name === 'AbortError') {
          throw new TimeoutError(timeout)
        }
      }
    }

    throw new RetryExhaustedError(this.config.maxRetries + 1, lastError)
  }

  /**
   * Make a single request (no retries)
   */
  private async makeRequest<T>(
    url: string,
    method: HttpMethod,
    headers: Headers,
    body: unknown | undefined,
    timeout: number,
    signal?: AbortSignal
  ): Promise<ApiResponse<T>> {
    // Create abort controller for timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    // Combine signals if one was provided
    const combinedSignal = signal
      ? this.combineSignals(signal, controller.signal)
      : controller.signal

    try {
      const requestInit: RequestInit = {
        method,
        headers,
        signal: combinedSignal,
      }

      // Add body for non-GET requests
      if (body !== undefined && method !== 'GET') {
        requestInit.body = JSON.stringify(body)
      }

      const response = await fetch(url, requestInit)

      // Extract request ID from headers
      const requestId = response.headers.get('x-request-id') || undefined

      // Handle error responses
      if (!response.ok) {
        const errorData = await this.parseResponse<ESMApiError>(response)
        throw new ESMError(
          errorData.error || `HTTP ${response.status}`,
          response.status,
          requestId,
          errorData.details
        )
      }

      // Parse successful response
      const data = await this.parseResponse<T>(response)

      return {
        data,
        status: response.status,
        headers: response.headers,
        requestId,
      }
    } catch (error) {
      // Handle timeout/abort
      if (error instanceof Error && error.name === 'AbortError') {
        throw new TimeoutError(timeout)
      }

      // Handle network errors
      if (error instanceof TypeError) {
        throw new NetworkError('Network request failed', error)
      }

      // Re-throw ESMError as-is
      if (error instanceof ESMError) {
        throw error
      }

      // Wrap unknown errors
      throw new NetworkError(
        error instanceof Error ? error.message : 'Unknown error'
      )
    } finally {
      clearTimeout(timeoutId)
    }
  }

  /**
   * Combine multiple abort signals
   */
  private combineSignals(
    signal1: AbortSignal,
    signal2: AbortSignal
  ): AbortSignal {
    const controller = new AbortController()

    const abort = () => controller.abort()

    if (signal1.aborted || signal2.aborted) {
      controller.abort()
    } else {
      signal1.addEventListener('abort', abort, { once: true })
      signal2.addEventListener('abort', abort, { once: true })
    }

    return controller.signal
  }

  // =============================================================================
  // Convenience Methods
  // =============================================================================

  /**
   * Make a GET request
   */
  async get<T>(
    path: string,
    options?: Omit<RequestOptions, 'method' | 'body'>
  ): Promise<ApiResponse<T>> {
    return this.request<T>(path, { ...options, method: 'GET' })
  }

  /**
   * Make a POST request
   */
  async post<T>(
    path: string,
    body?: unknown,
    options?: Omit<RequestOptions, 'method' | 'body'>
  ): Promise<ApiResponse<T>> {
    return this.request<T>(path, { ...options, method: 'POST', body })
  }

  /**
   * Make a DELETE request
   */
  async delete<T>(
    path: string,
    options?: Omit<RequestOptions, 'method'>
  ): Promise<ApiResponse<T>> {
    return this.request<T>(path, { ...options, method: 'DELETE' })
  }

  /**
   * Make a PUT request
   */
  async put<T>(
    path: string,
    body?: unknown,
    options?: Omit<RequestOptions, 'method' | 'body'>
  ): Promise<ApiResponse<T>> {
    return this.request<T>(path, { ...options, method: 'PUT', body })
  }

  /**
   * Make a PATCH request
   */
  async patch<T>(
    path: string,
    body?: unknown,
    options?: Omit<RequestOptions, 'method' | 'body'>
  ): Promise<ApiResponse<T>> {
    return this.request<T>(path, { ...options, method: 'PATCH', body })
  }
}
