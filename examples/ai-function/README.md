# AI Function Example

This example demonstrates how to create esm.do modules that leverage AI capabilities for text analysis, generation, and processing.

## Features

- **Sentiment Analysis** - Detect positive, negative, or neutral sentiment
- **Entity Extraction** - Find named entities (people, dates, locations)
- **Text Summarization** - Compress long text to key points
- **Classification** - Categorize text into predefined categories
- **Text Generation** - Generate text from prompts

## Module Functions

### `analyzeSentiment(text: string)`

Analyzes the emotional tone of text:

```typescript
const result = await analyzeSentiment('This product is amazing!')
// {
//   text: 'This product is amazing!',
//   sentiment: 'positive',
//   confidence: 0.75,
//   keywords: ['amazing']
// }
```

### `extractEntities(text: string)`

Extracts named entities from text:

```typescript
const entities = await extractEntities('John Smith met with Apple on January 15, 2024')
// [
//   { text: 'John Smith', type: 'person', start: 0, end: 10 },
//   { text: 'Apple', type: 'organization', start: 20, end: 25 },
//   { text: 'January 15, 2024', type: 'date', start: 29, end: 45 }
// ]
```

### `summarize(text: string, maxLength?: number)`

Creates a concise summary:

```typescript
const summary = await summarize(longArticle, 50)
// {
//   original: '...',
//   summary: 'Key points from the article...',
//   wordCount: { original: 500, summary: 50 },
//   compressionRatio: 0.9
// }
```

### `classify(text: string, categories: string[])`

Classifies text into categories:

```typescript
const result = await classify('New iPhone released today', ['technology', 'sports', 'politics'])
// {
//   text: 'New iPhone released today',
//   category: 'technology',
//   confidence: 0.85,
//   allCategories: [...]
// }
```

### `generate(prompt: string, options?: GenerateOptions)`

Generates text from a prompt:

```typescript
const text = await generate('Write a haiku about coding', {
  maxTokens: 50,
  temperature: 0.8
})
```

## Running the Example

```bash
npx tsx examples/ai-function/module.ts
```

## Integration with AI Providers

The demo uses simple rule-based implementations. For production use, integrate with AI APIs:

### OpenAI Integration

```typescript
import OpenAI from 'openai'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function analyzeSentiment(text: string) {
  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [{
      role: 'user',
      content: `Analyze the sentiment of this text and respond with JSON: "${text}"`
    }],
    response_format: { type: 'json_object' }
  })

  return JSON.parse(response.choices[0].message.content)
}
```

### Anthropic Integration

```typescript
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function generate(prompt: string) {
  const response = await anthropic.messages.create({
    model: 'claude-3-opus-20240229',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }]
  })

  return response.content[0].text
}
```

## Using with esm.do Sandbox

The esm.do sandbox provides built-in AI capabilities through the `ai` global:

```typescript
// In module code running in esm.do sandbox
export async function smartClassify(text) {
  // `ai` is provided by the sandbox environment
  const result = await ai.classify(text, {
    categories: ['tech', 'business', 'sports']
  })
  return result
}
```

## Best Practices

1. **Input Validation** - Always validate input before processing
2. **Error Handling** - Gracefully handle API failures
3. **Caching** - Cache results for repeated queries
4. **Rate Limiting** - Respect API rate limits
5. **Fallbacks** - Provide fallback behavior when AI is unavailable

## Cost Optimization

- Use smaller models for simple tasks
- Batch requests when possible
- Cache frequently requested analyses
- Set appropriate token limits

## Privacy Considerations

- Never log sensitive user data
- Use data minimization principles
- Consider data residency requirements
- Implement proper access controls
