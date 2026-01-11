/**
 * AI Function Example - AI-Powered Module
 *
 * Demonstrates how to create an esm.do module that leverages AI capabilities:
 * - Text generation and completion
 * - Structured data extraction
 * - Content classification
 * - Semantic analysis
 */

import { ESM } from '@dotdo/esm'

// Type definitions for AI-powered functions
const types = `
/**
 * Sentiment analysis result
 */
export interface SentimentResult {
  text: string
  sentiment: 'positive' | 'negative' | 'neutral'
  confidence: number
  keywords: string[]
}

/**
 * Extracted entity from text
 */
export interface Entity {
  text: string
  type: 'person' | 'organization' | 'location' | 'date' | 'other'
  start: number
  end: number
}

/**
 * Text summarization result
 */
export interface SummaryResult {
  original: string
  summary: string
  wordCount: {
    original: number
    summary: number
  }
  compressionRatio: number
}

/**
 * Classification result
 */
export interface ClassificationResult {
  text: string
  category: string
  confidence: number
  allCategories: Array<{ category: string; confidence: number }>
}

/**
 * Analyzes the sentiment of text
 * @param text - Text to analyze
 * @returns Sentiment analysis result
 */
export declare function analyzeSentiment(text: string): Promise<SentimentResult>

/**
 * Extracts named entities from text
 * @param text - Text to process
 * @returns Array of extracted entities
 */
export declare function extractEntities(text: string): Promise<Entity[]>

/**
 * Summarizes long text
 * @param text - Text to summarize
 * @param maxLength - Maximum length of summary (in words)
 * @returns Summary result
 */
export declare function summarize(text: string, maxLength?: number): Promise<SummaryResult>

/**
 * Classifies text into categories
 * @param text - Text to classify
 * @param categories - Available categories
 * @returns Classification result
 */
export declare function classify(text: string, categories: string[]): Promise<ClassificationResult>

/**
 * Generates text based on a prompt
 * @param prompt - The prompt to complete
 * @param options - Generation options
 * @returns Generated text
 */
export declare function generate(prompt: string, options?: GenerateOptions): Promise<string>

/**
 * Options for text generation
 */
export interface GenerateOptions {
  maxTokens?: number
  temperature?: number
  stopSequences?: string[]
}
`

// Module implementation with AI capabilities
const module = `
// Simulated AI functions for demonstration
// In production, these would call actual AI APIs (OpenAI, Anthropic, etc.)

/**
 * Simple word-based sentiment analysis (demo implementation)
 */
export async function analyzeSentiment(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('Text must be a non-empty string')
  }

  const lowerText = text.toLowerCase()

  // Simple keyword-based sentiment (in production, use ML model)
  const positiveWords = ['good', 'great', 'excellent', 'amazing', 'wonderful', 'happy', 'love', 'best', 'fantastic', 'awesome']
  const negativeWords = ['bad', 'terrible', 'awful', 'horrible', 'hate', 'worst', 'poor', 'disappointing', 'sad', 'angry']

  const words = lowerText.split(/\\s+/)
  let positiveCount = 0
  let negativeCount = 0
  const keywords = []

  for (const word of words) {
    if (positiveWords.includes(word)) {
      positiveCount++
      keywords.push(word)
    }
    if (negativeWords.includes(word)) {
      negativeCount++
      keywords.push(word)
    }
  }

  let sentiment = 'neutral'
  let confidence = 0.5

  if (positiveCount > negativeCount) {
    sentiment = 'positive'
    confidence = Math.min(0.5 + (positiveCount * 0.1), 0.95)
  } else if (negativeCount > positiveCount) {
    sentiment = 'negative'
    confidence = Math.min(0.5 + (negativeCount * 0.1), 0.95)
  }

  return {
    text,
    sentiment,
    confidence: Math.round(confidence * 100) / 100,
    keywords
  }
}

/**
 * Simple entity extraction (demo implementation)
 */
export async function extractEntities(text) {
  if (!text || typeof text !== 'string') {
    throw new Error('Text must be a non-empty string')
  }

  const entities = []

  // Simple pattern-based entity extraction
  // Names (capitalized words not at start of sentence)
  const namePattern = /(?<!^|\\. )([A-Z][a-z]+(?:\\s+[A-Z][a-z]+)*)/g
  let match
  while ((match = namePattern.exec(text)) !== null) {
    entities.push({
      text: match[1],
      type: 'person',
      start: match.index,
      end: match.index + match[1].length
    })
  }

  // Dates (simple patterns)
  const datePattern = /(\\d{1,2}[\\/-]\\d{1,2}[\\/-]\\d{2,4}|(?:January|February|March|April|May|June|July|August|September|October|November|December)\\s+\\d{1,2},?\\s+\\d{4})/gi
  while ((match = datePattern.exec(text)) !== null) {
    entities.push({
      text: match[1],
      type: 'date',
      start: match.index,
      end: match.index + match[1].length
    })
  }

  return entities
}

/**
 * Simple text summarization (demo implementation)
 */
export async function summarize(text, maxLength = 50) {
  if (!text || typeof text !== 'string') {
    throw new Error('Text must be a non-empty string')
  }

  const sentences = text.split(/[.!?]+/).filter(s => s.trim())
  const originalWordCount = text.split(/\\s+/).length

  // Simple extractive summarization: take first N sentences up to maxLength words
  const summaryParts = []
  let wordCount = 0

  for (const sentence of sentences) {
    const sentenceWords = sentence.trim().split(/\\s+/)
    if (wordCount + sentenceWords.length <= maxLength) {
      summaryParts.push(sentence.trim())
      wordCount += sentenceWords.length
    } else {
      break
    }
  }

  const summary = summaryParts.join('. ') + (summaryParts.length > 0 ? '.' : '')

  return {
    original: text,
    summary,
    wordCount: {
      original: originalWordCount,
      summary: wordCount
    },
    compressionRatio: Math.round((1 - wordCount / originalWordCount) * 100) / 100
  }
}

/**
 * Simple text classification (demo implementation)
 */
export async function classify(text, categories) {
  if (!text || typeof text !== 'string') {
    throw new Error('Text must be a non-empty string')
  }
  if (!Array.isArray(categories) || categories.length === 0) {
    throw new Error('Categories must be a non-empty array')
  }

  const lowerText = text.toLowerCase()

  // Simple keyword matching for categories
  const categoryKeywords = {
    technology: ['computer', 'software', 'ai', 'data', 'code', 'programming', 'tech', 'app', 'digital'],
    business: ['company', 'market', 'sales', 'revenue', 'profit', 'business', 'enterprise', 'startup'],
    sports: ['game', 'team', 'score', 'player', 'win', 'championship', 'match', 'tournament'],
    entertainment: ['movie', 'music', 'show', 'celebrity', 'film', 'concert', 'actor', 'singer'],
    science: ['research', 'study', 'discovery', 'experiment', 'scientist', 'theory', 'laboratory']
  }

  const scores = categories.map(category => {
    const keywords = categoryKeywords[category.toLowerCase()] || []
    let score = 0
    for (const keyword of keywords) {
      if (lowerText.includes(keyword)) {
        score += 1
      }
    }
    return {
      category,
      confidence: Math.min(score * 0.15 + 0.1, 0.95)
    }
  })

  scores.sort((a, b) => b.confidence - a.confidence)

  return {
    text,
    category: scores[0].category,
    confidence: scores[0].confidence,
    allCategories: scores
  }
}

/**
 * Simple text generation (demo implementation)
 */
export async function generate(prompt, options = {}) {
  if (!prompt || typeof prompt !== 'string') {
    throw new Error('Prompt must be a non-empty string')
  }

  const { maxTokens = 100, temperature = 0.7 } = options

  // Demo: Simple template-based generation
  const templates = [
    \`Based on your prompt about "\${prompt.slice(0, 50)}...", here's a thoughtful response.\`,
    \`Considering the topic of "\${prompt.slice(0, 50)}...", I would suggest exploring multiple perspectives.\`,
    \`The subject you've raised - "\${prompt.slice(0, 50)}..." - is certainly worth deeper examination.\`
  ]

  // Select based on temperature (higher = more random)
  const index = temperature > 0.5
    ? Math.floor(Math.random() * templates.length)
    : 0

  return templates[index]
}
`

// Test suite
const tests = `
describe('analyzeSentiment', () => {
  it('identifies positive sentiment', async () => {
    const result = await analyzeSentiment('This is a great and amazing product!')
    expect(result.sentiment).toBe('positive')
    expect(result.confidence).toBeGreaterThan(0.5)
    expect(result.keywords).toContain('great')
  })

  it('identifies negative sentiment', async () => {
    const result = await analyzeSentiment('This is terrible and horrible!')
    expect(result.sentiment).toBe('negative')
    expect(result.confidence).toBeGreaterThan(0.5)
  })

  it('identifies neutral sentiment', async () => {
    const result = await analyzeSentiment('The sky is blue.')
    expect(result.sentiment).toBe('neutral')
  })

  it('throws on empty text', async () => {
    await expect(analyzeSentiment('')).rejects.toThrow()
  })
})

describe('extractEntities', () => {
  it('extracts dates', async () => {
    const result = await extractEntities('Meeting on January 15, 2024')
    const dates = result.filter(e => e.type === 'date')
    expect(dates.length).toBeGreaterThan(0)
  })

  it('throws on empty text', async () => {
    await expect(extractEntities('')).rejects.toThrow()
  })
})

describe('summarize', () => {
  it('summarizes text', async () => {
    const longText = 'First sentence. Second sentence. Third sentence. Fourth sentence.'
    const result = await summarize(longText, 10)
    expect(result.wordCount.summary).toBeLessThanOrEqual(10)
    expect(result.compressionRatio).toBeGreaterThan(0)
  })

  it('throws on empty text', async () => {
    await expect(summarize('')).rejects.toThrow()
  })
})

describe('classify', () => {
  it('classifies technology text', async () => {
    const result = await classify('New software and AI developments', ['technology', 'sports'])
    expect(result.category).toBe('technology')
  })

  it('returns all category scores', async () => {
    const result = await classify('Hello world', ['tech', 'sports', 'business'])
    expect(result.allCategories).toHaveLength(3)
  })

  it('throws on empty categories', async () => {
    await expect(classify('test', [])).rejects.toThrow()
  })
})

describe('generate', () => {
  it('generates text from prompt', async () => {
    const result = await generate('Tell me about AI')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('respects options', async () => {
    const result = await generate('Test prompt', { temperature: 0.1 })
    expect(typeof result).toBe('string')
  })

  it('throws on empty prompt', async () => {
    await expect(generate('')).rejects.toThrow()
  })
})
`

// Executable script demonstrating AI capabilities
const script = `
console.log('AI Function Demo')
console.log('================\\n')

// Analyze sentiment
console.log('1. Sentiment Analysis')
const sentiment = await analyzeSentiment('I absolutely love this amazing product! It is fantastic and wonderful.')
console.log(\`   Text: "\${sentiment.text.slice(0, 50)}..."\`)
console.log(\`   Sentiment: \${sentiment.sentiment} (confidence: \${sentiment.confidence})\`)
console.log(\`   Keywords: \${sentiment.keywords.join(', ')}\`)

console.log('\\n2. Text Classification')
const classification = await classify(
  'The new AI software startup raised $10 million in funding',
  ['technology', 'business', 'sports', 'entertainment']
)
console.log(\`   Category: \${classification.category} (confidence: \${classification.confidence})\`)

console.log('\\n3. Text Summarization')
const longText = 'Artificial intelligence is transforming the technology landscape. Companies are investing heavily in AI research. Machine learning models are becoming more sophisticated. The future holds great promise for AI applications.'
const summary = await summarize(longText, 20)
console.log(\`   Original: \${summary.wordCount.original} words\`)
console.log(\`   Summary: \${summary.wordCount.summary} words\`)
console.log(\`   Compression: \${Math.round(summary.compressionRatio * 100)}%\`)
console.log(\`   Result: "\${summary.summary}"\`)

console.log('\\n4. Text Generation')
const generated = await generate('Explain the benefits of modular programming', { temperature: 0.7 })
console.log(\`   Generated: "\${generated}"\`)

return {
  sentiment: sentiment.sentiment,
  category: classification.category,
  compressionRatio: summary.compressionRatio,
  generated: generated.slice(0, 50)
}
`

// Create and run the example
async function main() {
  const esm = ESM.create()

  console.log('Writing AI function module...')

  const result = await esm.write({
    name: '@examples/ai-function',
    types,
    module,
    tests,
    script,
  })

  console.log('Module written successfully!')
  console.log(`Version: ${result.version}`)
  console.log(`Tests: ${result.testResults?.passed}/${result.testResults?.total} passed`)

  // Run the script
  console.log('\nRunning AI function demo...')
  const runResult = await esm.run('@examples/ai-function')
  console.log('Result:', runResult.value)
}

main().catch(console.error)
