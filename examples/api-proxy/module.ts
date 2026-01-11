/**
 * API Proxy Example - External API Integration
 *
 * Demonstrates how to create an esm.do module that:
 * - Wraps external REST APIs
 * - Handles authentication
 * - Transforms responses
 * - Provides type-safe interfaces
 */

import { ESM } from '@dotdo/esm'

// Type definitions for the API proxy module
const types = `
/**
 * Weather data returned by the API
 */
export interface WeatherData {
  location: string
  temperature: number
  humidity: number
  conditions: string
  timestamp: string
}

/**
 * GitHub repository information
 */
export interface GitHubRepo {
  name: string
  description: string | null
  stars: number
  forks: number
  language: string | null
  url: string
}

/**
 * API response wrapper
 */
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

/**
 * Fetches weather data for a location
 * @param location - City name or coordinates
 * @returns Weather data wrapped in API response
 */
export declare function getWeather(location: string): Promise<ApiResponse<WeatherData>>

/**
 * Fetches GitHub repository information
 * @param owner - Repository owner
 * @param repo - Repository name
 * @returns Repository info wrapped in API response
 */
export declare function getGitHubRepo(owner: string, repo: string): Promise<ApiResponse<GitHubRepo>>

/**
 * Fetches a random joke from an external API
 * @returns A random joke string
 */
export declare function getRandomJoke(): Promise<ApiResponse<string>>

/**
 * Configuration for API requests
 */
export interface ApiConfig {
  timeout?: number
  retries?: number
}

/**
 * Creates a configured API client
 * @param config - API configuration
 * @returns A configured fetch function
 */
export declare function createApiClient(config?: ApiConfig): (url: string, options?: RequestInit) => Promise<Response>
`

// Module implementation with fetch-based API calls
const module = `
// Helper function to handle API responses
async function handleResponse(response, transform) {
  if (!response.ok) {
    return {
      success: false,
      error: \`HTTP \${response.status}: \${response.statusText}\`
    }
  }

  try {
    const data = await response.json()
    return {
      success: true,
      data: transform ? transform(data) : data
    }
  } catch (error) {
    return {
      success: false,
      error: \`Failed to parse response: \${error.message}\`
    }
  }
}

// Create a configured API client with timeout and retry logic
export function createApiClient(config = {}) {
  const { timeout = 5000, retries = 2 } = config

  return async function fetchWithRetry(url, options = {}) {
    let lastError

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), timeout)

        const response = await fetch(url, {
          ...options,
          signal: controller.signal
        })

        clearTimeout(timeoutId)
        return response
      } catch (error) {
        lastError = error
        if (attempt < retries) {
          // Exponential backoff
          await new Promise(r => setTimeout(r, 100 * Math.pow(2, attempt)))
        }
      }
    }

    throw lastError
  }
}

// Weather API proxy (using mock data for demo)
export async function getWeather(location) {
  if (!location || typeof location !== 'string') {
    return { success: false, error: 'Location must be a non-empty string' }
  }

  // In a real implementation, this would call an external weather API
  // For demo purposes, we return simulated data
  const mockWeatherData = {
    location: location,
    temperature: Math.round(15 + Math.random() * 20),
    humidity: Math.round(40 + Math.random() * 40),
    conditions: ['Sunny', 'Cloudy', 'Partly Cloudy', 'Rainy'][Math.floor(Math.random() * 4)],
    timestamp: new Date().toISOString()
  }

  return { success: true, data: mockWeatherData }
}

// GitHub API proxy
export async function getGitHubRepo(owner, repo) {
  if (!owner || !repo) {
    return { success: false, error: 'Owner and repo are required' }
  }

  try {
    const client = createApiClient({ timeout: 10000 })
    const response = await client(\`https://api.github.com/repos/\${owner}/\${repo}\`, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'esm.do-api-proxy'
      }
    })

    return handleResponse(response, (data) => ({
      name: data.name,
      description: data.description,
      stars: data.stargazers_count,
      forks: data.forks_count,
      language: data.language,
      url: data.html_url
    }))
  } catch (error) {
    return { success: false, error: error.message }
  }
}

// Joke API proxy
export async function getRandomJoke() {
  try {
    const client = createApiClient()
    const response = await client('https://official-joke-api.appspot.com/random_joke', {
      headers: { 'Accept': 'application/json' }
    })

    return handleResponse(response, (data) => \`\${data.setup} - \${data.punchline}\`)
  } catch (error) {
    // Fallback to a default joke if API fails
    return {
      success: true,
      data: 'Why do programmers prefer dark mode? Because light attracts bugs!'
    }
  }
}
`

// Test suite
const tests = `
describe('createApiClient', () => {
  it('creates a client with default config', () => {
    const client = createApiClient()
    expect(typeof client).toBe('function')
  })

  it('creates a client with custom config', () => {
    const client = createApiClient({ timeout: 10000, retries: 3 })
    expect(typeof client).toBe('function')
  })
})

describe('getWeather', () => {
  it('returns weather data for a valid location', async () => {
    const result = await getWeather('New York')
    expect(result.success).toBe(true)
    expect(result.data).toBeDefined()
    expect(result.data.location).toBe('New York')
    expect(typeof result.data.temperature).toBe('number')
    expect(typeof result.data.humidity).toBe('number')
    expect(typeof result.data.conditions).toBe('string')
  })

  it('returns error for empty location', async () => {
    const result = await getWeather('')
    expect(result.success).toBe(false)
    expect(result.error).toBe('Location must be a non-empty string')
  })

  it('returns error for null location', async () => {
    const result = await getWeather(null)
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })
})

describe('getGitHubRepo', () => {
  it('returns error when owner is missing', async () => {
    const result = await getGitHubRepo('', 'repo')
    expect(result.success).toBe(false)
    expect(result.error).toBe('Owner and repo are required')
  })

  it('returns error when repo is missing', async () => {
    const result = await getGitHubRepo('owner', '')
    expect(result.success).toBe(false)
    expect(result.error).toBe('Owner and repo are required')
  })
})

describe('getRandomJoke', () => {
  it('returns a joke string on success', async () => {
    const result = await getRandomJoke()
    expect(result.success).toBe(true)
    expect(typeof result.data).toBe('string')
    expect(result.data.length).toBeGreaterThan(0)
  })
})
`

// Executable script demonstrating the API proxy
const script = `
console.log('API Proxy Demo')
console.log('==============\\n')

// Get weather for a location
console.log('Fetching weather for San Francisco...')
const weather = await getWeather('San Francisco')
if (weather.success) {
  console.log(\`Location: \${weather.data.location}\`)
  console.log(\`Temperature: \${weather.data.temperature}°C\`)
  console.log(\`Humidity: \${weather.data.humidity}%\`)
  console.log(\`Conditions: \${weather.data.conditions}\`)
}

console.log('\\n---\\n')

// Get a random joke
console.log('Fetching a random joke...')
const joke = await getRandomJoke()
if (joke.success) {
  console.log(joke.data)
}

return {
  weather: weather.data,
  joke: joke.data
}
`

// Create and run the example
async function main() {
  const esm = ESM.create()

  console.log('Writing API proxy module...')

  const result = await esm.write({
    name: '@examples/api-proxy',
    types,
    module,
    tests,
    script,
  })

  console.log('Module written successfully!')
  console.log(`Version: ${result.version}`)
  console.log(`Tests: ${result.testResults?.passed}/${result.testResults?.total} passed`)

  // Run the script
  console.log('\nRunning API proxy demo...')
  const runResult = await esm.run('@examples/api-proxy')
  console.log('Result:', runResult.value)
}

main().catch(console.error)
