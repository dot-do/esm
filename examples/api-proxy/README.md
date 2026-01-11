# API Proxy Example

This example demonstrates how to create an esm.do module that wraps external REST APIs, providing type-safe interfaces and built-in error handling.

## Features

- External API integration with `fetch`
- Configurable timeout and retry logic
- Response transformation
- Comprehensive error handling
- Type-safe API responses

## Module Structure

The API proxy module provides:

1. **`createApiClient(config)`** - Factory for creating configured fetch clients
2. **`getWeather(location)`** - Weather data API
3. **`getGitHubRepo(owner, repo)`** - GitHub repository info
4. **`getRandomJoke()`** - Random joke API

## Running the Example

```bash
npx tsx examples/api-proxy/module.ts
```

## API Design Patterns

### Response Wrapper

All API functions return a consistent response structure:

```typescript
interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}
```

This allows consumers to handle success and error cases uniformly:

```typescript
const result = await getWeather('London')
if (result.success) {
  console.log(result.data.temperature)
} else {
  console.error(result.error)
}
```

### Configured Client

The `createApiClient` factory allows customizing request behavior:

```typescript
const client = createApiClient({
  timeout: 10000,  // 10 second timeout
  retries: 3       // Retry failed requests 3 times
})

const response = await client('https://api.example.com/data')
```

## Usage Examples

### Via SDK

```typescript
import { ESM } from '@dotdo/esm'

const esm = ESM.create()

// Import the module dynamically
const { getWeather, getGitHubRepo } = await esm.import('@examples/api-proxy')

// Use the API functions
const weather = await getWeather('Tokyo')
const repo = await getGitHubRepo('dot-do', 'esm')
```

### Via HTTP API

```bash
# Create the module
curl -X POST https://esm.do/@examples/api-proxy \
  -H "Content-Type: application/json" \
  -d @module.json

# Run with arguments
curl -X POST https://esm.do/@examples/api-proxy/run \
  -H "Content-Type: application/json" \
  -d '{"location": "Paris"}'
```

### Via CLI

```bash
# Run the module script
esm run @examples/api-proxy

# Run with environment variables for API keys
ESM_API_KEY=xxx esm run @examples/api-proxy
```

## Extending the Proxy

To add a new API endpoint:

1. Add type definitions for the new endpoint
2. Implement the function using `createApiClient`
3. Add tests for error cases and success cases
4. Update the script to demonstrate the new functionality

```typescript
// Types
export declare function getStockPrice(symbol: string): Promise<ApiResponse<StockData>>

// Implementation
export async function getStockPrice(symbol) {
  const client = createApiClient({ timeout: 5000 })
  const response = await client(`https://api.stocks.example.com/${symbol}`)
  return handleResponse(response, transformStockData)
}
```

## Error Handling

The module handles several error cases:

1. **Network Errors** - Caught and returned as error responses
2. **Timeout** - AbortController cancels long-running requests
3. **Invalid Input** - Validated before making requests
4. **Parse Errors** - JSON parsing failures are caught
5. **HTTP Errors** - Non-2xx responses converted to error format

## Security Considerations

1. API keys should be passed via environment variables, not hardcoded
2. The module sanitizes user input before including in URLs
3. Response data is validated before returning
4. Timeouts prevent denial-of-service from slow APIs
