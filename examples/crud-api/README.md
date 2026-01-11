# CRUD API Example

A complete CRUD (Create, Read, Update, Delete) API implementation demonstrating best practices for building data management modules with esm.do.

## Features

- Full CRUD operations for user management
- Input validation with descriptive error messages
- Pagination and sorting
- Search functionality
- Statistics and aggregations
- Comprehensive test suite

## Files

- `module.ts` - Main module implementation
- `types.ts` - TypeScript type definitions
- `tests.ts` - Standalone test suite for local development

## API Reference

### Create User

```typescript
const result = await createUser({
  email: 'user@example.com',
  name: 'John Doe',
  role: 'admin' // optional, defaults to 'user'
})

// Result: { success: true, data: User }
```

### Get User

```typescript
const result = await getUser('user_123')

// Result: { success: true, data: User }
// Or: { success: false, error: 'User not found' }
```

### Update User

```typescript
const result = await updateUser('user_123', {
  name: 'Jane Doe',
  role: 'admin',
  active: false
})

// Result: { success: true, data: User }
```

### Delete User

```typescript
const result = await deleteUser('user_123')

// Result: { success: true }
```

### List Users

```typescript
const result = await listUsers({
  limit: 10,
  offset: 0,
  sortBy: 'createdAt',
  sortOrder: 'desc',
  filter: {
    role: 'admin',
    active: true
  }
})

// Result: { success: true, data: PaginatedResponse<User> }
```

### Search Users

```typescript
const result = await searchUsers('john')

// Result: { success: true, data: User[] }
```

### Get Statistics

```typescript
const stats = await getUserStats()

// Result: { total: 100, active: 95, byRole: { admin: 5, user: 90, guest: 5 } }
```

## Running the Example

```bash
# Run the main module
npx tsx examples/crud-api/module.ts

# Run the test suite
npx vitest examples/crud-api/tests.ts
```

## Usage with esm.do

### Via SDK

```typescript
import { ESM } from '@dotdo/esm'

const esm = ESM.create()

// Write the module
await esm.write({
  name: '@myorg/users-api',
  types: '/* from types.ts */',
  module: '/* from module.ts */',
  tests: '/* test code */',
  script: '/* demo script */'
})

// Run tests
const testResult = await esm.test('@myorg/users-api')
console.log(`Tests: ${testResult.passed}/${testResult.total}`)

// Execute the demo script
const result = await esm.run('@myorg/users-api')
```

### Via HTTP API

```bash
# Create a user
curl -X POST https://esm.do/@myorg/users-api/run \
  -H "Content-Type: application/json" \
  -d '{
    "action": "create",
    "data": {
      "email": "user@example.com",
      "name": "John Doe"
    }
  }'

# List users with pagination
curl "https://esm.do/@myorg/users-api/run?action=list&limit=10&offset=0"

# Search users
curl "https://esm.do/@myorg/users-api/run?action=search&query=john"
```

## Best Practices Demonstrated

### 1. Consistent Response Format

All operations return a consistent structure:

```typescript
interface OperationResult<T> {
  success: boolean
  data?: T
  error?: string
}
```

### 2. Input Validation

```typescript
if (!input.email || !isValidEmail(input.email)) {
  return error('Valid email is required')
}
```

### 3. Immutable Updates

```typescript
const updated = {
  ...user,
  ...input,
  updatedAt: new Date()
}
```

### 4. Pagination Support

```typescript
interface QueryOptions {
  limit?: number
  offset?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  filter?: Record<string, unknown>
}
```

### 5. Comprehensive Testing

Tests cover:
- Happy path scenarios
- Error cases
- Edge cases
- Pagination
- Search functionality
- Data integrity

## Extending the Module

### Adding New Entity Types

1. Define types in `types.ts`
2. Create CRUD functions following the same pattern
3. Add corresponding tests
4. Update the demo script

### Adding Relationships

```typescript
interface Post extends BaseEntity {
  title: string
  content: string
  authorId: EntityId
}

async function getPostsByUser(userId: EntityId) {
  const posts = Array.from(postsStore.values())
    .filter(p => p.authorId === userId)
  return success(posts)
}
```

### Adding Soft Delete

```typescript
async function softDelete(id: EntityId) {
  return updateUser(id, {
    active: false,
    deletedAt: new Date()
  })
}

async function listActive(options?: QueryOptions) {
  return listUsers({
    ...options,
    filter: { ...options?.filter, active: true }
  })
}
```
