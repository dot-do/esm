# ADR 001: Cloudflare Workers as Runtime Platform

## Status

Accepted

## Context

esm.do needs a runtime platform that can:

1. Execute user-provided JavaScript code safely
2. Provide low-latency access globally
3. Scale automatically with demand
4. Support persistent storage for modules
5. Enable dynamic code execution

We considered several options:

- **AWS Lambda**: Mature serverless platform with container-based isolation
- **Google Cloud Functions**: Similar to Lambda, container-based
- **Deno Deploy**: V8 isolate-based, TypeScript-first
- **Cloudflare Workers**: V8 isolate-based with edge locations

## Decision

We chose **Cloudflare Workers** as the runtime platform.

## Rationale

### V8 Isolate Model

Workers uses V8 isolates instead of containers, providing:

- **Faster cold starts**: ~0ms vs 100-500ms for containers
- **Better resource efficiency**: Multiple isolates per process
- **Native JavaScript isolation**: V8's security model

### Edge Network

Cloudflare's global network provides:

- **200+ locations**: Low latency worldwide
- **Automatic routing**: Requests served from nearest edge
- **Built-in CDN**: Static assets cached at edge

### Integrated Services

Workers integrates with:

- **KV**: Key-value storage for module content
- **D1**: SQLite database for queries
- **R2**: Object storage for large files
- **Durable Objects**: Coordination and state

### workerd Runtime

The open-source workerd runtime enables:

- **Local development**: Same runtime locally via wrangler
- **Testing**: Unit tests with Miniflare
- **Deployment**: Direct deploy to production

### unsafe_eval Binding

The `unsafe_eval` binding enables dynamic code execution:

```jsonc
{
  "unsafe": {
    "bindings": [
      { "name": "unsafe_eval", "type": "eval" }
    ]
  }
}
```

This is critical for executing user-provided tests and scripts.

## Consequences

### Positive

1. **Fast execution**: V8 isolates start in ~0ms
2. **Global distribution**: Modules served from edge
3. **Integrated storage**: KV, D1, R2 available
4. **Familiar environment**: JavaScript/TypeScript
5. **ai-evaluate compatibility**: Uses Miniflare internally

### Negative

1. **Vendor lock-in**: Some APIs are Cloudflare-specific
2. **Limited CPU time**: 50ms/request (free), 30s (paid)
3. **Memory limits**: 128MB per isolate
4. **No native Node.js**: Must use Web APIs or polyfills

### Mitigations

1. **Core package abstraction**: `@dotdo/esm` has zero Cloudflare deps
2. **Storage interface**: `ModuleStorage` can be implemented for any backend
3. **Timeout handling**: External timeout wrapper for CPU-bound code
4. **nodejs_compat flag**: Enables Node.js API polyfills

## Alternatives Considered

### AWS Lambda

**Pros**:
- Mature ecosystem
- Container flexibility
- Longer execution times (15 min)

**Cons**:
- Slower cold starts
- More complex deployment
- No integrated edge

### Deno Deploy

**Pros**:
- TypeScript-first
- Similar isolate model
- Built-in testing

**Cons**:
- Smaller network
- Less storage options
- Newer platform

### Self-Hosted

**Pros**:
- Full control
- No vendor lock-in
- Custom isolation

**Cons**:
- Operational burden
- No global distribution
- Security responsibility

## References

- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [How Workers Works](https://developers.cloudflare.com/workers/learning/how-workers-works/)
- [workerd Runtime](https://github.com/cloudflare/workerd)
- [ai-evaluate Package](https://github.com/primitives-org/ai-evaluate)
