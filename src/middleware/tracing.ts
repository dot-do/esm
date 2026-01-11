/**
 * OpenTelemetry Tracing Middleware for ESM Module System
 *
 * Provides distributed tracing support for esm.do:
 * - Span creation for requests
 * - Context propagation (W3C Trace Context)
 * - Export to Jaeger/OTLP
 * - Correlation with logs
 */

import type { Context, Middleware } from './chain.js'

// =============================================================================
// Types
// =============================================================================

export interface TracingConfig {
  /** Service name for traces */
  serviceName: string
  /** Service version */
  serviceVersion: string
  /** Tracing endpoint (Jaeger/OTLP) */
  endpoint: string
  /** Export protocol: 'jaeger' | 'otlp-http' | 'otlp-grpc' */
  protocol: 'jaeger' | 'otlp-http' | 'otlp-grpc'
  /** Sample rate (0.0 to 1.0) */
  sampleRate: number
  /** Enable debug mode */
  debug: boolean
  /** Default attributes to add to all spans */
  defaultAttributes: Record<string, string | number | boolean>
  /** Headers to propagate as span attributes */
  propagateHeaders: string[]
  /** Enable request body tracing (may impact performance) */
  traceRequestBody: boolean
  /** Enable response body tracing (may impact performance) */
  traceResponseBody: boolean
  /** Maximum body size to trace (bytes) */
  maxBodySize: number
}

export interface SpanContext {
  traceId: string
  spanId: string
  traceFlags: number
  traceState?: string
}

export interface Span {
  /** Span context */
  context: SpanContext
  /** Span name */
  name: string
  /** Span kind */
  kind: 'server' | 'client' | 'producer' | 'consumer' | 'internal'
  /** Start time in milliseconds */
  startTime: number
  /** End time in milliseconds (undefined until span ends) */
  endTime: number | undefined
  /** Span attributes */
  attributes: Record<string, string | number | boolean>
  /** Span events */
  events: SpanEvent[]
  /** Span status */
  status: SpanStatus
  /** Parent span context (undefined for root spans) */
  parentContext: SpanContext | undefined
  /** Set an attribute */
  setAttribute(key: string, value: string | number | boolean): void
  /** Add an event */
  addEvent(name: string, attributes?: Record<string, string | number | boolean>): void
  /** Set status */
  setStatus(status: SpanStatus): void
  /** End the span */
  end(): void
  /** Check if span is recording */
  isRecording(): boolean
}

export interface SpanEvent {
  name: string
  time: number
  attributes?: Record<string, string | number | boolean>
}

export interface SpanStatus {
  code: 'unset' | 'ok' | 'error'
  message?: string
}

export interface TracingMiddleware {
  /** Middleware function for request handling */
  middleware: Middleware
  /** Start a new span */
  startSpan(name: string, options?: StartSpanOptions): Span
  /** Get the current active span */
  getCurrentSpan(): Span | undefined
  /** Create a child span from a parent */
  createChildSpan(parent: Span, name: string, options?: StartSpanOptions): Span
  /** Extract trace context from headers */
  extractContext(headers: Headers): SpanContext | undefined
  /** Inject trace context into headers */
  injectContext(headers: Headers, context: SpanContext): void
  /** Get the configuration */
  getConfig(): TracingConfig
}

export interface StartSpanOptions {
  kind?: Span['kind']
  attributes?: Record<string, string | number | boolean>
  parentContext?: SpanContext | undefined
}

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_CONFIG: TracingConfig = {
  serviceName: 'esm-do',
  serviceVersion: '0.0.1',
  endpoint: 'http://localhost:4318/v1/traces',
  protocol: 'otlp-http',
  sampleRate: 1.0,
  debug: false,
  defaultAttributes: {},
  propagateHeaders: ['x-request-id', 'x-correlation-id'],
  traceRequestBody: false,
  traceResponseBody: false,
  maxBodySize: 1024,
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Generate a random 16-byte trace ID (32 hex chars)
 */
function generateTraceId(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Generate a random 8-byte span ID (16 hex chars)
 */
function generateSpanId(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Parse W3C Trace Context traceparent header
 * Format: {version}-{trace-id}-{parent-id}-{trace-flags}
 */
function parseTraceparent(header: string): SpanContext | undefined {
  const parts = header.split('-')
  if (parts.length < 4) return undefined

  const version = parts[0]
  const traceIdPart = parts[1]
  const spanIdPart = parts[2]
  const flagsPart = parts[3]

  // Only support version 00
  if (version !== '00') return undefined

  // Validate trace ID (32 hex chars, not all zeros)
  if (!traceIdPart || !/^[0-9a-f]{32}$/i.test(traceIdPart) || traceIdPart === '00000000000000000000000000000000') {
    return undefined
  }

  // Validate span ID (16 hex chars, not all zeros)
  if (!spanIdPart || !/^[0-9a-f]{16}$/i.test(spanIdPart) || spanIdPart === '0000000000000000') {
    return undefined
  }

  return {
    traceId: traceIdPart.toLowerCase(),
    spanId: spanIdPart.toLowerCase(),
    traceFlags: parseInt(flagsPart || '0', 16) || 0,
  }
}

/**
 * Format W3C Trace Context traceparent header
 */
function formatTraceparent(context: SpanContext): string {
  const flags = context.traceFlags.toString(16).padStart(2, '0')
  return `00-${context.traceId}-${context.spanId}-${flags}`
}

// =============================================================================
// Span Implementation
// =============================================================================

function createSpan(
  name: string,
  context: SpanContext,
  kind: Span['kind'],
  attributes: Record<string, string | number | boolean>,
  parentContext: SpanContext | undefined
): Span {
  // Internal state
  const state = {
    events: [] as SpanEvent[],
    attributes: { ...attributes },
    status: { code: 'unset' } as SpanStatus,
    endTime: undefined as number | undefined,
  }

  const span = {
    context,
    name,
    kind,
    startTime: performance.now(),
    parentContext,

    get attributes(): Record<string, string | number | boolean> {
      return state.attributes
    },

    get events(): SpanEvent[] {
      return state.events
    },

    get status(): SpanStatus {
      return state.status
    },

    get endTime(): number | undefined {
      return state.endTime
    },

    setAttribute(key: string, value: string | number | boolean): void {
      state.attributes[key] = value
    },

    addEvent(eventName: string, eventAttrs?: Record<string, string | number | boolean>): void {
      const event: SpanEvent = {
        name: eventName,
        time: performance.now(),
      }
      if (eventAttrs) {
        event.attributes = eventAttrs
      }
      state.events.push(event)
    },

    setStatus(newStatus: SpanStatus): void {
      state.status = newStatus
    },

    end(): void {
      state.endTime = performance.now()
    },

    isRecording(): boolean {
      return state.endTime === undefined
    },
  } satisfies Span

  return span
}

// =============================================================================
// Tracing Middleware Factory
// =============================================================================

/**
 * Creates an OpenTelemetry tracing middleware instance.
 *
 * @param config - Partial tracing configuration to override defaults
 * @returns TracingMiddleware instance
 */
export function createTracingMiddleware(config?: Partial<TracingConfig>): TracingMiddleware {
  const mergedConfig: TracingConfig = {
    ...DEFAULT_CONFIG,
    ...config,
    defaultAttributes: {
      ...DEFAULT_CONFIG.defaultAttributes,
      ...config?.defaultAttributes,
    },
    propagateHeaders: [...DEFAULT_CONFIG.propagateHeaders, ...(config?.propagateHeaders || [])],
  }

  // Track current span per request (using a simple stack for now)
  // In a real implementation, this would use async context
  let currentSpan: Span | undefined

  // Batch spans for export
  const spanBuffer: Span[] = []
  const BATCH_SIZE = 100
  // Note: FLUSH_INTERVAL would be used with setInterval in a long-running process
  // For serverless, we export spans immediately when buffer is full

  /**
   * Export spans to the tracing backend
   */
  async function exportSpans(spans: Span[]): Promise<void> {
    if (spans.length === 0) return

    if (mergedConfig.debug) {
      console.log(`[tracing] Exporting ${spans.length} spans`)
    }

    // Convert spans to OTLP format
    const otlpSpans = spans.map((span) => ({
      traceId: span.context.traceId,
      spanId: span.context.spanId,
      parentSpanId: span.parentContext?.spanId,
      name: span.name,
      kind: getSpanKindNumber(span.kind),
      startTimeUnixNano: Math.floor(span.startTime * 1_000_000).toString(),
      endTimeUnixNano: span.endTime ? Math.floor(span.endTime * 1_000_000).toString() : undefined,
      attributes: Object.entries(span.attributes).map(([key, value]) => ({
        key,
        value: formatAttributeValue(value),
      })),
      events: span.events.map((event) => ({
        name: event.name,
        timeUnixNano: Math.floor(event.time * 1_000_000).toString(),
        attributes: event.attributes
          ? Object.entries(event.attributes).map(([key, value]) => ({
              key,
              value: formatAttributeValue(value),
            }))
          : [],
      })),
      status: {
        code: span.status.code === 'error' ? 2 : span.status.code === 'ok' ? 1 : 0,
        message: span.status.message,
      },
    }))

    const payload = {
      resourceSpans: [
        {
          resource: {
            attributes: [
              { key: 'service.name', value: { stringValue: mergedConfig.serviceName } },
              { key: 'service.version', value: { stringValue: mergedConfig.serviceVersion } },
            ],
          },
          scopeSpans: [
            {
              scope: {
                name: 'esm-do-tracing',
                version: '1.0.0',
              },
              spans: otlpSpans,
            },
          ],
        },
      ],
    }

    try {
      // In a real Cloudflare Worker, we'd use fetch
      // For now, just log in debug mode
      if (mergedConfig.debug) {
        console.log('[tracing] Would export:', JSON.stringify(payload, null, 2))
      }

      // Attempt to send if endpoint is configured
      if (mergedConfig.endpoint && typeof fetch !== 'undefined') {
        await fetch(mergedConfig.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }).catch((err) => {
          if (mergedConfig.debug) {
            console.error('[tracing] Export failed:', err)
          }
        })
      }
    } catch (err) {
      if (mergedConfig.debug) {
        console.error('[tracing] Export error:', err)
      }
    }
  }

  function getSpanKindNumber(kind: Span['kind']): number {
    switch (kind) {
      case 'internal':
        return 1
      case 'server':
        return 2
      case 'client':
        return 3
      case 'producer':
        return 4
      case 'consumer':
        return 5
      default:
        return 0
    }
  }

  function formatAttributeValue(
    value: string | number | boolean
  ): { stringValue?: string; intValue?: string; boolValue?: boolean } {
    if (typeof value === 'string') return { stringValue: value }
    if (typeof value === 'number') return { intValue: String(Math.floor(value)) }
    if (typeof value === 'boolean') return { boolValue: value }
    return { stringValue: String(value) }
  }

  /**
   * Decide whether to sample this trace
   */
  function shouldSample(): boolean {
    return Math.random() < mergedConfig.sampleRate
  }

  /**
   * Add span to buffer and flush if needed
   */
  function bufferSpan(span: Span): void {
    spanBuffer.push(span)
    if (spanBuffer.length >= BATCH_SIZE) {
      const toExport = spanBuffer.splice(0, BATCH_SIZE)
      exportSpans(toExport)
    }
  }

  /**
   * Extract trace context from request headers
   */
  function extractContext(headers: Headers): SpanContext | undefined {
    const traceparent = headers.get('traceparent')
    if (traceparent) {
      return parseTraceparent(traceparent)
    }
    return undefined
  }

  /**
   * Inject trace context into response headers
   */
  function injectContext(headers: Headers, context: SpanContext): void {
    headers.set('traceparent', formatTraceparent(context))
    if (context.traceState) {
      headers.set('tracestate', context.traceState)
    }
  }

  /**
   * Start a new span
   */
  function startSpan(name: string, options?: StartSpanOptions): Span {
    const parentContext = options?.parentContext || currentSpan?.context

    const context: SpanContext = {
      traceId: parentContext?.traceId || generateTraceId(),
      spanId: generateSpanId(),
      traceFlags: shouldSample() ? 1 : 0,
    }

    const span = createSpan(
      name,
      context,
      options?.kind || 'internal',
      {
        ...mergedConfig.defaultAttributes,
        ...options?.attributes,
      },
      parentContext
    )

    currentSpan = span
    return span
  }

  /**
   * Create a child span from a parent
   */
  function createChildSpan(parent: Span, name: string, options?: StartSpanOptions): Span {
    return startSpan(name, {
      ...options,
      parentContext: parent.context,
    })
  }

  /**
   * Get the current active span
   */
  function getCurrentSpan(): Span | undefined {
    return currentSpan
  }

  /**
   * The middleware function that wraps request handling with tracing.
   */
  const middleware: Middleware = async (ctx: Context, next: () => Promise<Response>) => {
    // Extract parent context from incoming request
    const parentContext = extractContext(ctx.request.headers)

    // Create root span for this request
    const url = new URL(ctx.request.url)
    const spanName = `${ctx.request.method} ${url.pathname}`

    const span = startSpan(spanName, {
      kind: 'server',
      parentContext,
      attributes: {
        'http.method': ctx.request.method,
        'http.url': ctx.request.url,
        'http.host': url.host,
        'http.scheme': url.protocol.replace(':', ''),
        'http.target': url.pathname + url.search,
        'http.user_agent': ctx.request.headers.get('user-agent') || '',
      },
    })

    // Propagate headers as attributes
    for (const header of mergedConfig.propagateHeaders) {
      const value = ctx.request.headers.get(header)
      if (value) {
        span.setAttribute(`http.request.header.${header}`, value)
      }
    }

    let response: Response

    try {
      response = await next()

      // Record response attributes
      span.setAttribute('http.status_code', response.status)
      span.setAttribute('http.response_content_length', response.headers.get('content-length') || 0)

      // Set status based on HTTP status code
      if (response.status >= 400) {
        span.setStatus({
          code: 'error',
          message: `HTTP ${response.status}`,
        })
      } else {
        span.setStatus({ code: 'ok' })
      }

      // Inject trace context into response headers
      const newHeaders = new Headers(response.headers)
      injectContext(newHeaders, span.context)

      // Create new response with trace headers
      response = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      })
    } catch (error) {
      span.setStatus({
        code: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
      span.addEvent('exception', {
        'exception.type': error instanceof Error ? error.constructor.name : 'Error',
        'exception.message': error instanceof Error ? error.message : String(error),
      })
      throw error
    } finally {
      span.end()
      currentSpan = undefined

      // Buffer span for export (only if sampled)
      if (span.context.traceFlags & 1) {
        bufferSpan(span)
      }
    }

    return response
  }

  return {
    middleware,
    startSpan,
    getCurrentSpan,
    createChildSpan,
    extractContext,
    injectContext,
    getConfig(): TracingConfig {
      return { ...mergedConfig }
    },
  }
}

// =============================================================================
// Trace Context Utilities
// =============================================================================

/**
 * Create a span context with the given trace ID and span ID.
 */
export function createSpanContext(traceId: string, spanId: string, sampled = true): SpanContext {
  return {
    traceId,
    spanId,
    traceFlags: sampled ? 1 : 0,
  }
}

/**
 * Check if a span context is valid.
 */
export function isValidSpanContext(context: SpanContext): boolean {
  return (
    /^[0-9a-f]{32}$/i.test(context.traceId) &&
    context.traceId !== '00000000000000000000000000000000' &&
    /^[0-9a-f]{16}$/i.test(context.spanId) &&
    context.spanId !== '0000000000000000'
  )
}

/**
 * Check if a span context is sampled.
 */
export function isSampled(context: SpanContext): boolean {
  return (context.traceFlags & 1) === 1
}
