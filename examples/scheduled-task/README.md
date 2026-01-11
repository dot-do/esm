# Scheduled Task Example

This example demonstrates how to create esm.do modules with scheduling capabilities using cron expressions.

## Features

- Cron expression parsing and validation
- Next run time calculation
- Task execution with result tracking
- Execution history and statistics
- Common schedule presets

## Cron Expression Format

Standard 5-field cron format:

```
* * * * *
| | | | |
| | | | +--- Day of week (0-6, Sunday=0)
| | | +----- Month (1-12)
| | +------- Day of month (1-31)
| +--------- Hour (0-23)
+----------- Minute (0-59)
```

### Special Characters

- `*` - Any value
- `,` - Value list separator (e.g., `1,3,5`)
- `-` - Range of values (e.g., `1-5`)
- `/` - Step values (e.g., `*/15` = every 15)

## Running the Example

```bash
npx tsx examples/scheduled-task/module.ts
```

## API Reference

### `isValidCron(expression: string): boolean`

Validates a cron expression:

```typescript
isValidCron('0 9 * * 1-5')  // true - weekdays at 9 AM
isValidCron('invalid')       // false
```

### `parseCron(expression: string): CronComponents`

Parses a cron expression into its components:

```typescript
const cron = parseCron('0 9 * * 1-5')
// {
//   minute: '0',
//   hour: '9',
//   dayOfMonth: '*',
//   month: '*',
//   dayOfWeek: '1-5'
// }
```

### `getNextRun(expression: string, from?: Date): Date`

Calculates the next execution time:

```typescript
const next = getNextRun('0 9 * * *')
console.log(`Next run: ${next.toISOString()}`)
```

### `executeTask(taskId: string, handler: string): Promise<TaskResult>`

Executes a task and returns the result:

```typescript
const result = await executeTask('my-task', 'return { status: "ok" }')
// {
//   taskId: 'my-task',
//   startedAt: Date,
//   completedAt: Date,
//   duration: 5,
//   success: true,
//   result: { status: 'ok' }
// }
```

### `getTaskHistory(taskId: string): TaskHistory`

Retrieves execution history for a task:

```typescript
const history = getTaskHistory('my-task')
// {
//   taskId: 'my-task',
//   executions: [...],
//   lastRun: Date,
//   runCount: 10,
//   successCount: 9,
//   failureCount: 1
// }
```

## Common Presets

```typescript
import { cronPresets } from '@examples/scheduled-task'

cronPresets.everyMinute  // '* * * * *'
cronPresets.everyHour    // '0 * * * *'
cronPresets.everyDay     // '0 0 * * *'
cronPresets.everyWeek    // '0 0 * * 0'
cronPresets.everyMonth   // '0 0 1 * *'
cronPresets.weekdays     // '0 9 * * 1-5'
cronPresets.weekends     // '0 10 * * 0,6'
```

## Integration with Cloudflare Workers

Cloudflare Workers supports cron triggers. Configure in `wrangler.toml`:

```toml
[triggers]
crons = ["0 9 * * *"]  # Daily at 9 AM UTC
```

Then handle the event in your worker:

```typescript
export default {
  async scheduled(event: ScheduledEvent, env: Env) {
    const esm = ESM.withStorage(new CloudflareStorage(env))
    const result = await esm.run('@myorg/daily-task')
    console.log('Task completed:', result.value)
  }
}
```

## Usage Patterns

### Daily Report Generation

```typescript
// Schedule: 0 8 * * * (daily at 8 AM)
const reportModule = {
  types: `export declare function generateReport(): Promise<Report>`,
  module: `
    export async function generateReport() {
      const data = await fetchDailyMetrics()
      const report = formatReport(data)
      await sendEmail(report)
      return report
    }
  `,
  script: `return await generateReport()`
}
```

### Periodic Cleanup

```typescript
// Schedule: 0 2 * * 0 (weekly at 2 AM on Sunday)
const cleanupModule = {
  types: `export declare function cleanup(): Promise<CleanupResult>`,
  module: `
    export async function cleanup() {
      const deleted = await deleteOldRecords(30) // older than 30 days
      await vacuumDatabase()
      return { deleted, timestamp: new Date() }
    }
  `,
  script: `return await cleanup()`
}
```

### Health Checks

```typescript
// Schedule: */5 * * * * (every 5 minutes)
const healthCheckModule = {
  types: `export declare function checkHealth(): Promise<HealthStatus>`,
  module: `
    export async function checkHealth() {
      const checks = await Promise.all([
        checkDatabase(),
        checkCache(),
        checkExternalAPIs()
      ])
      return {
        healthy: checks.every(c => c.ok),
        checks
      }
    }
  `,
  script: `return await checkHealth()`
}
```

## Error Handling

Tasks that throw errors are tracked in the history:

```typescript
const result = await executeTask('risky-task', `
  const response = await fetch('https://api.example.com/data')
  if (!response.ok) throw new Error(\`API error: \${response.status}\`)
  return response.json()
`)

if (!result.success) {
  console.error('Task failed:', result.error)
  // Implement retry logic or alerting
}
```

## Monitoring

Use task history for monitoring:

```typescript
const history = getTaskHistory('critical-task')

// Calculate success rate
const successRate = history.successCount / history.runCount

// Alert on high failure rate
if (successRate < 0.9) {
  await sendAlert('Critical task has low success rate', {
    successRate,
    recentFailures: history.executions
      .filter(e => !e.success)
      .slice(-5)
  })
}
```
