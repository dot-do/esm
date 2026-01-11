/**
 * Scheduled Task Example - Cron-based Execution
 *
 * Demonstrates how to create esm.do modules that can be scheduled:
 * - Cron expression parsing
 * - Task scheduling and execution
 * - Result persistence
 * - Error handling and retries
 */

import { ESM } from '@dotdo/esm'

// Type definitions for scheduled tasks
const types = `
/**
 * Cron schedule configuration
 */
export interface CronSchedule {
  expression: string
  timezone?: string
  description?: string
}

/**
 * Task execution result
 */
export interface TaskResult {
  taskId: string
  startedAt: Date
  completedAt: Date
  duration: number
  success: boolean
  result?: unknown
  error?: string
}

/**
 * Task configuration
 */
export interface TaskConfig {
  id: string
  name: string
  schedule: CronSchedule
  handler: string
  enabled: boolean
  retries?: number
  timeout?: number
}

/**
 * Task execution history entry
 */
export interface TaskHistory {
  taskId: string
  executions: TaskResult[]
  lastRun?: Date
  nextRun?: Date
  runCount: number
  successCount: number
  failureCount: number
}

/**
 * Parses a cron expression and returns the next execution time
 * @param expression - Cron expression (e.g., "0 0 * * *")
 * @param from - Starting point for calculation (defaults to now)
 * @returns Next execution Date
 */
export declare function getNextRun(expression: string, from?: Date): Date

/**
 * Validates a cron expression
 * @param expression - Cron expression to validate
 * @returns True if valid, false otherwise
 */
export declare function isValidCron(expression: string): boolean

/**
 * Parses a cron expression into its components
 * @param expression - Cron expression to parse
 * @returns Parsed cron components
 */
export declare function parseCron(expression: string): CronComponents

/**
 * Cron expression components
 */
export interface CronComponents {
  minute: string
  hour: string
  dayOfMonth: string
  month: string
  dayOfWeek: string
}

/**
 * Executes a task and returns the result
 * @param taskId - Task identifier
 * @param handler - Handler function code
 * @returns Task execution result
 */
export declare function executeTask(taskId: string, handler: string): Promise<TaskResult>

/**
 * Gets task execution history
 * @param taskId - Task identifier
 * @returns Task history
 */
export declare function getTaskHistory(taskId: string): TaskHistory

/**
 * Clears task history
 * @param taskId - Task identifier
 */
export declare function clearTaskHistory(taskId: string): void

/**
 * Common cron presets
 */
export declare const cronPresets: {
  everyMinute: string
  everyHour: string
  everyDay: string
  everyWeek: string
  everyMonth: string
  weekdays: string
  weekends: string
}
`

// Module implementation
const module = `
// Task history storage
const taskHistories = new Map()

// Common cron presets
export const cronPresets = {
  everyMinute: '* * * * *',
  everyHour: '0 * * * *',
  everyDay: '0 0 * * *',
  everyWeek: '0 0 * * 0',
  everyMonth: '0 0 1 * *',
  weekdays: '0 9 * * 1-5',
  weekends: '0 10 * * 0,6'
}

/**
 * Validates a cron expression
 */
export function isValidCron(expression) {
  if (!expression || typeof expression !== 'string') {
    return false
  }

  const parts = expression.trim().split(/\\s+/)

  // Standard cron has 5 fields
  if (parts.length !== 5) {
    return false
  }

  // Validate each field
  const patterns = [
    /^(\\*|\\d{1,2}(-\\d{1,2})?(,\\d{1,2}(-\\d{1,2})?)*|\\*\\/\\d{1,2})$/, // minute (0-59)
    /^(\\*|\\d{1,2}(-\\d{1,2})?(,\\d{1,2}(-\\d{1,2})?)*|\\*\\/\\d{1,2})$/, // hour (0-23)
    /^(\\*|\\d{1,2}(-\\d{1,2})?(,\\d{1,2}(-\\d{1,2})?)*|\\*\\/\\d{1,2})$/, // day of month (1-31)
    /^(\\*|\\d{1,2}(-\\d{1,2})?(,\\d{1,2}(-\\d{1,2})?)*|\\*\\/\\d{1,2})$/, // month (1-12)
    /^(\\*|\\d{1}(-\\d{1})?(,\\d{1}(-\\d{1})?)*|\\*\\/\\d{1})$/           // day of week (0-6)
  ]

  for (let i = 0; i < 5; i++) {
    if (!patterns[i].test(parts[i])) {
      return false
    }
  }

  return true
}

/**
 * Parses a cron expression into components
 */
export function parseCron(expression) {
  if (!isValidCron(expression)) {
    throw new Error('Invalid cron expression')
  }

  const parts = expression.trim().split(/\\s+/)

  return {
    minute: parts[0],
    hour: parts[1],
    dayOfMonth: parts[2],
    month: parts[3],
    dayOfWeek: parts[4]
  }
}

/**
 * Parses a cron field and returns matching values
 */
function parseCronField(field, min, max) {
  const values = new Set()

  for (const part of field.split(',')) {
    if (part === '*') {
      for (let i = min; i <= max; i++) values.add(i)
    } else if (part.includes('/')) {
      const [range, step] = part.split('/')
      const stepNum = parseInt(step, 10)
      const start = range === '*' ? min : parseInt(range, 10)
      for (let i = start; i <= max; i += stepNum) values.add(i)
    } else if (part.includes('-')) {
      const [start, end] = part.split('-').map(n => parseInt(n, 10))
      for (let i = start; i <= end; i++) values.add(i)
    } else {
      values.add(parseInt(part, 10))
    }
  }

  return Array.from(values).sort((a, b) => a - b)
}

/**
 * Gets the next run time for a cron expression
 */
export function getNextRun(expression, from = new Date()) {
  const cron = parseCron(expression)

  const minutes = parseCronField(cron.minute, 0, 59)
  const hours = parseCronField(cron.hour, 0, 23)
  const daysOfMonth = parseCronField(cron.dayOfMonth, 1, 31)
  const months = parseCronField(cron.month, 1, 12)
  const daysOfWeek = parseCronField(cron.dayOfWeek, 0, 6)

  const next = new Date(from)
  next.setSeconds(0)
  next.setMilliseconds(0)
  next.setMinutes(next.getMinutes() + 1)

  // Limit iterations to prevent infinite loop
  for (let iterations = 0; iterations < 366 * 24 * 60; iterations++) {
    const month = next.getMonth() + 1
    const dayOfMonth = next.getDate()
    const dayOfWeek = next.getDay()
    const hour = next.getHours()
    const minute = next.getMinutes()

    // Check if current time matches
    if (
      months.includes(month) &&
      (daysOfMonth.includes(dayOfMonth) || daysOfWeek.includes(dayOfWeek)) &&
      hours.includes(hour) &&
      minutes.includes(minute)
    ) {
      return next
    }

    // Increment minute
    next.setMinutes(next.getMinutes() + 1)
  }

  throw new Error('Could not calculate next run time')
}

/**
 * Executes a task and records the result
 */
export async function executeTask(taskId, handler) {
  const startedAt = new Date()
  let result
  let error
  let success = true

  try {
    // Execute the handler code
    // In production, this would use the sandbox executor
    const fn = new Function(handler)
    result = await fn()
  } catch (e) {
    success = false
    error = e.message
  }

  const completedAt = new Date()
  const taskResult = {
    taskId,
    startedAt,
    completedAt,
    duration: completedAt.getTime() - startedAt.getTime(),
    success,
    result,
    error
  }

  // Update history
  let history = taskHistories.get(taskId)
  if (!history) {
    history = {
      taskId,
      executions: [],
      runCount: 0,
      successCount: 0,
      failureCount: 0
    }
    taskHistories.set(taskId, history)
  }

  history.executions.push(taskResult)
  history.lastRun = startedAt
  history.runCount++
  if (success) {
    history.successCount++
  } else {
    history.failureCount++
  }

  // Keep only last 100 executions
  if (history.executions.length > 100) {
    history.executions = history.executions.slice(-100)
  }

  return taskResult
}

/**
 * Gets task execution history
 */
export function getTaskHistory(taskId) {
  const history = taskHistories.get(taskId)
  if (!history) {
    return {
      taskId,
      executions: [],
      runCount: 0,
      successCount: 0,
      failureCount: 0
    }
  }
  return { ...history }
}

/**
 * Clears task history
 */
export function clearTaskHistory(taskId) {
  taskHistories.delete(taskId)
}

/**
 * Formats a cron expression for human readability
 */
export function describeCron(expression) {
  const cron = parseCron(expression)

  const descriptions = {
    '* * * * *': 'Every minute',
    '0 * * * *': 'Every hour',
    '0 0 * * *': 'Every day at midnight',
    '0 0 * * 0': 'Every Sunday at midnight',
    '0 0 1 * *': 'First day of every month',
    '0 9 * * 1-5': 'Every weekday at 9 AM',
    '0 10 * * 0,6': 'Every weekend at 10 AM'
  }

  if (descriptions[expression]) {
    return descriptions[expression]
  }

  // Generate a basic description
  let desc = 'At '

  if (cron.minute === '*') {
    desc += 'every minute'
  } else if (cron.minute === '0') {
    desc += 'minute 0'
  } else {
    desc += \`minute \${cron.minute}\`
  }

  if (cron.hour !== '*') {
    desc += \` of hour \${cron.hour}\`
  }

  return desc
}
`

// Test suite
const tests = `
describe('isValidCron', () => {
  it('validates standard cron expressions', () => {
    expect(isValidCron('* * * * *')).toBe(true)
    expect(isValidCron('0 0 * * *')).toBe(true)
    expect(isValidCron('0 9 * * 1-5')).toBe(true)
    expect(isValidCron('*/15 * * * *')).toBe(true)
  })

  it('rejects invalid expressions', () => {
    expect(isValidCron('')).toBe(false)
    expect(isValidCron('* * *')).toBe(false)
    expect(isValidCron('invalid')).toBe(false)
    expect(isValidCron(null)).toBe(false)
  })
})

describe('parseCron', () => {
  it('parses cron expressions', () => {
    const result = parseCron('0 9 * * 1-5')
    expect(result.minute).toBe('0')
    expect(result.hour).toBe('9')
    expect(result.dayOfMonth).toBe('*')
    expect(result.month).toBe('*')
    expect(result.dayOfWeek).toBe('1-5')
  })

  it('throws on invalid expression', () => {
    expect(() => parseCron('invalid')).toThrow()
  })
})

describe('getNextRun', () => {
  it('calculates next run for every minute', () => {
    const now = new Date('2024-03-15T10:30:00')
    const next = getNextRun('* * * * *', now)
    expect(next.getMinutes()).toBe(31)
  })

  it('calculates next run for specific time', () => {
    const now = new Date('2024-03-15T08:00:00')
    const next = getNextRun('0 9 * * *', now)
    expect(next.getHours()).toBe(9)
    expect(next.getMinutes()).toBe(0)
  })

  it('wraps to next day if needed', () => {
    const now = new Date('2024-03-15T23:00:00')
    const next = getNextRun('0 8 * * *', now)
    expect(next.getDate()).toBe(16)
    expect(next.getHours()).toBe(8)
  })
})

describe('cronPresets', () => {
  it('has valid preset expressions', () => {
    expect(isValidCron(cronPresets.everyMinute)).toBe(true)
    expect(isValidCron(cronPresets.everyHour)).toBe(true)
    expect(isValidCron(cronPresets.everyDay)).toBe(true)
    expect(isValidCron(cronPresets.everyWeek)).toBe(true)
    expect(isValidCron(cronPresets.everyMonth)).toBe(true)
    expect(isValidCron(cronPresets.weekdays)).toBe(true)
    expect(isValidCron(cronPresets.weekends)).toBe(true)
  })
})

describe('executeTask', () => {
  it('executes a successful task', async () => {
    const result = await executeTask('test-task', 'return 42')
    expect(result.success).toBe(true)
    expect(result.result).toBe(42)
    expect(result.duration).toBeGreaterThanOrEqual(0)
  })

  it('handles task errors', async () => {
    const result = await executeTask('error-task', 'throw new Error("Test error")')
    expect(result.success).toBe(false)
    expect(result.error).toBe('Test error')
  })
})

describe('getTaskHistory', () => {
  it('returns empty history for new task', () => {
    const history = getTaskHistory('new-task')
    expect(history.executions).toEqual([])
    expect(history.runCount).toBe(0)
  })

  it('tracks executions', async () => {
    const taskId = 'history-test'
    clearTaskHistory(taskId)

    await executeTask(taskId, 'return 1')
    await executeTask(taskId, 'return 2')

    const history = getTaskHistory(taskId)
    expect(history.runCount).toBe(2)
    expect(history.successCount).toBe(2)
    expect(history.executions.length).toBe(2)
  })
})

describe('describeCron', () => {
  it('describes common patterns', () => {
    expect(describeCron('* * * * *')).toBe('Every minute')
    expect(describeCron('0 * * * *')).toBe('Every hour')
    expect(describeCron('0 0 * * *')).toBe('Every day at midnight')
  })
})
`

// Executable script
const script = `
console.log('Scheduled Task Demo')
console.log('====================\\n')

// Show cron presets
console.log('Available Cron Presets:')
for (const [name, expr] of Object.entries(cronPresets)) {
  console.log(\`  \${name}: \${expr}\`)
}

console.log('\\n---\\n')

// Parse and validate expressions
console.log('Cron Expression Parsing:')
const expressions = [
  '0 9 * * 1-5',   // Weekdays at 9 AM
  '*/15 * * * *', // Every 15 minutes
  '0 0 1 * *'     // First of month
]

for (const expr of expressions) {
  console.log(\`\\n  Expression: \${expr}\`)
  console.log(\`  Valid: \${isValidCron(expr)}\`)
  const parsed = parseCron(expr)
  console.log(\`  Parsed: minute=\${parsed.minute}, hour=\${parsed.hour}\`)
  console.log(\`  Description: \${describeCron(expr)}\`)
  const next = getNextRun(expr, new Date())
  console.log(\`  Next run: \${next.toISOString()}\`)
}

console.log('\\n---\\n')

// Execute some tasks
console.log('Task Execution:')

const task1 = await executeTask('demo-task-1', 'return { message: "Task completed", timestamp: Date.now() }')
console.log(\`\\n  Task 1: \${task1.success ? 'SUCCESS' : 'FAILED'}\`)
console.log(\`  Duration: \${task1.duration}ms\`)
console.log(\`  Result: \${JSON.stringify(task1.result)}\`)

const task2 = await executeTask('demo-task-2', 'return 1 + 2 + 3')
console.log(\`\\n  Task 2: \${task2.success ? 'SUCCESS' : 'FAILED'}\`)
console.log(\`  Result: \${task2.result}\`)

const task3 = await executeTask('demo-task-3', 'throw new Error("Simulated failure")')
console.log(\`\\n  Task 3: \${task3.success ? 'SUCCESS' : 'FAILED'}\`)
console.log(\`  Error: \${task3.error}\`)

console.log('\\n---\\n')

// Show task history
console.log('Task History:')
const history = getTaskHistory('demo-task-1')
console.log(\`  Total runs: \${history.runCount}\`)
console.log(\`  Successes: \${history.successCount}\`)
console.log(\`  Failures: \${history.failureCount}\`)

return {
  presets: Object.keys(cronPresets),
  executedTasks: 3,
  successRate: '67%'
}
`

// Create and run the example
async function main() {
  const esm = ESM.create()

  console.log('Writing scheduled task module...')

  const result = await esm.write({
    name: '@examples/scheduled-task',
    types,
    module,
    tests,
    script,
  })

  console.log('Module written successfully!')
  console.log(`Version: ${result.version}`)
  console.log(`Tests: ${result.testResults?.passed}/${result.testResults?.total} passed`)

  // Run the script
  console.log('\nRunning scheduled task demo...')
  const runResult = await esm.run('@examples/scheduled-task')
  console.log('Result:', runResult.value)
}

main().catch(console.error)
