/**
 * CRUD API Example - Complete CRUD Operations
 *
 * Demonstrates a full-featured CRUD API with:
 * - In-memory storage
 * - Validation
 * - Pagination
 * - Sorting and filtering
 * - Error handling
 */

import { ESM } from '@dotdo/esm'

// Type definitions (also in types.ts)
const types = `
/**
 * Unique identifier for entities
 */
export type EntityId = string

/**
 * Base entity with common fields
 */
export interface BaseEntity {
  id: EntityId
  createdAt: Date
  updatedAt: Date
}

/**
 * User entity
 */
export interface User extends BaseEntity {
  email: string
  name: string
  role: 'admin' | 'user' | 'guest'
  active: boolean
}

/**
 * Input for creating a user
 */
export interface CreateUserInput {
  email: string
  name: string
  role?: 'admin' | 'user' | 'guest'
}

/**
 * Input for updating a user
 */
export interface UpdateUserInput {
  email?: string
  name?: string
  role?: 'admin' | 'user' | 'guest'
  active?: boolean
}

/**
 * Query options for listing
 */
export interface QueryOptions {
  limit?: number
  offset?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  filter?: Record<string, unknown>
}

/**
 * Paginated response
 */
export interface PaginatedResponse<T> {
  items: T[]
  total: number
  limit: number
  offset: number
  hasMore: boolean
}

/**
 * Operation result
 */
export interface OperationResult<T = void> {
  success: boolean
  data?: T
  error?: string
}

/**
 * Creates a new user
 */
export declare function createUser(input: CreateUserInput): Promise<OperationResult<User>>

/**
 * Reads a user by ID
 */
export declare function getUser(id: EntityId): Promise<OperationResult<User>>

/**
 * Updates an existing user
 */
export declare function updateUser(id: EntityId, input: UpdateUserInput): Promise<OperationResult<User>>

/**
 * Deletes a user
 */
export declare function deleteUser(id: EntityId): Promise<OperationResult<void>>

/**
 * Lists all users with pagination
 */
export declare function listUsers(options?: QueryOptions): Promise<OperationResult<PaginatedResponse<User>>>

/**
 * Searches users by query
 */
export declare function searchUsers(query: string): Promise<OperationResult<User[]>>

/**
 * Gets user statistics
 */
export declare function getUserStats(): Promise<{ total: number; active: number; byRole: Record<string, number> }>
`

// Module implementation
const module = `
// In-memory storage
const users = new Map()
let idCounter = 1

// Helper: Generate ID
function generateId() {
  return \`user_\${Date.now()}_\${idCounter++}\`
}

// Helper: Validate email
function isValidEmail(email) {
  return typeof email === 'string' && /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)
}

// Helper: Success response
function success(data) {
  return { success: true, data }
}

// Helper: Error response
function error(message) {
  return { success: false, error: message }
}

// CREATE
export async function createUser(input) {
  // Validation
  if (!input || typeof input !== 'object') {
    return error('Input must be an object')
  }
  if (!input.email || !isValidEmail(input.email)) {
    return error('Valid email is required')
  }
  if (!input.name || typeof input.name !== 'string' || input.name.trim().length === 0) {
    return error('Name is required')
  }

  // Check for duplicate email
  for (const user of users.values()) {
    if (user.email === input.email) {
      return error('Email already exists')
    }
  }

  const now = new Date()
  const user = {
    id: generateId(),
    email: input.email.toLowerCase().trim(),
    name: input.name.trim(),
    role: input.role || 'user',
    active: true,
    createdAt: now,
    updatedAt: now
  }

  users.set(user.id, user)
  return success(user)
}

// READ
export async function getUser(id) {
  if (!id || typeof id !== 'string') {
    return error('Valid ID is required')
  }

  const user = users.get(id)
  if (!user) {
    return error('User not found')
  }

  return success(user)
}

// UPDATE
export async function updateUser(id, input) {
  if (!id || typeof id !== 'string') {
    return error('Valid ID is required')
  }
  if (!input || typeof input !== 'object') {
    return error('Input must be an object')
  }

  const user = users.get(id)
  if (!user) {
    return error('User not found')
  }

  // Validate email if provided
  if (input.email !== undefined) {
    if (!isValidEmail(input.email)) {
      return error('Invalid email format')
    }
    // Check for duplicate (excluding current user)
    for (const [uid, u] of users.entries()) {
      if (uid !== id && u.email === input.email) {
        return error('Email already exists')
      }
    }
  }

  // Apply updates
  const updated = {
    ...user,
    ...(input.email !== undefined && { email: input.email.toLowerCase().trim() }),
    ...(input.name !== undefined && { name: input.name.trim() }),
    ...(input.role !== undefined && { role: input.role }),
    ...(input.active !== undefined && { active: input.active }),
    updatedAt: new Date()
  }

  users.set(id, updated)
  return success(updated)
}

// DELETE
export async function deleteUser(id) {
  if (!id || typeof id !== 'string') {
    return error('Valid ID is required')
  }

  if (!users.has(id)) {
    return error('User not found')
  }

  users.delete(id)
  return success()
}

// LIST with pagination
export async function listUsers(options = {}) {
  const {
    limit = 10,
    offset = 0,
    sortBy = 'createdAt',
    sortOrder = 'desc',
    filter = {}
  } = options

  let items = Array.from(users.values())

  // Apply filters
  if (filter.role) {
    items = items.filter(u => u.role === filter.role)
  }
  if (filter.active !== undefined) {
    items = items.filter(u => u.active === filter.active)
  }

  // Sort
  items.sort((a, b) => {
    const aVal = a[sortBy]
    const bVal = b[sortBy]
    const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
    return sortOrder === 'asc' ? cmp : -cmp
  })

  const total = items.length
  const paginatedItems = items.slice(offset, offset + limit)

  return success({
    items: paginatedItems,
    total,
    limit,
    offset,
    hasMore: offset + paginatedItems.length < total
  })
}

// SEARCH
export async function searchUsers(query) {
  if (!query || typeof query !== 'string') {
    return error('Query string is required')
  }

  const lowerQuery = query.toLowerCase()
  const results = Array.from(users.values()).filter(user =>
    user.name.toLowerCase().includes(lowerQuery) ||
    user.email.toLowerCase().includes(lowerQuery)
  )

  return success(results)
}

// STATS
export async function getUserStats() {
  const allUsers = Array.from(users.values())

  const byRole = {}
  for (const user of allUsers) {
    byRole[user.role] = (byRole[user.role] || 0) + 1
  }

  return {
    total: allUsers.length,
    active: allUsers.filter(u => u.active).length,
    byRole
  }
}
`

// Test suite (also in tests.ts)
const tests = `
describe('createUser', () => {
  it('creates a valid user', async () => {
    const result = await createUser({ email: 'test@example.com', name: 'Test User' })
    expect(result.success).toBe(true)
    expect(result.data.email).toBe('test@example.com')
    expect(result.data.name).toBe('Test User')
    expect(result.data.role).toBe('user')
    expect(result.data.active).toBe(true)
    expect(result.data.id).toBeDefined()
  })

  it('creates user with custom role', async () => {
    const result = await createUser({ email: 'admin@example.com', name: 'Admin', role: 'admin' })
    expect(result.success).toBe(true)
    expect(result.data.role).toBe('admin')
  })

  it('fails on invalid email', async () => {
    const result = await createUser({ email: 'invalid', name: 'Test' })
    expect(result.success).toBe(false)
    expect(result.error).toContain('email')
  })

  it('fails on missing name', async () => {
    const result = await createUser({ email: 'test2@example.com', name: '' })
    expect(result.success).toBe(false)
    expect(result.error).toContain('Name')
  })

  it('fails on duplicate email', async () => {
    await createUser({ email: 'dup@example.com', name: 'First' })
    const result = await createUser({ email: 'dup@example.com', name: 'Second' })
    expect(result.success).toBe(false)
    expect(result.error).toContain('exists')
  })
})

describe('getUser', () => {
  it('retrieves existing user', async () => {
    const created = await createUser({ email: 'get@example.com', name: 'Get Test' })
    const result = await getUser(created.data.id)
    expect(result.success).toBe(true)
    expect(result.data.email).toBe('get@example.com')
  })

  it('fails on non-existent user', async () => {
    const result = await getUser('non_existent_id')
    expect(result.success).toBe(false)
    expect(result.error).toContain('not found')
  })
})

describe('updateUser', () => {
  it('updates user fields', async () => {
    const created = await createUser({ email: 'update@example.com', name: 'Update Test' })
    const result = await updateUser(created.data.id, { name: 'Updated Name' })
    expect(result.success).toBe(true)
    expect(result.data.name).toBe('Updated Name')
    expect(result.data.email).toBe('update@example.com')
  })

  it('can deactivate user', async () => {
    const created = await createUser({ email: 'deactivate@example.com', name: 'Deactivate' })
    const result = await updateUser(created.data.id, { active: false })
    expect(result.success).toBe(true)
    expect(result.data.active).toBe(false)
  })

  it('fails on duplicate email', async () => {
    await createUser({ email: 'existing@example.com', name: 'Existing' })
    const created = await createUser({ email: 'change@example.com', name: 'Change' })
    const result = await updateUser(created.data.id, { email: 'existing@example.com' })
    expect(result.success).toBe(false)
    expect(result.error).toContain('exists')
  })
})

describe('deleteUser', () => {
  it('deletes existing user', async () => {
    const created = await createUser({ email: 'delete@example.com', name: 'Delete Test' })
    const result = await deleteUser(created.data.id)
    expect(result.success).toBe(true)

    const getResult = await getUser(created.data.id)
    expect(getResult.success).toBe(false)
  })

  it('fails on non-existent user', async () => {
    const result = await deleteUser('non_existent_id')
    expect(result.success).toBe(false)
  })
})

describe('listUsers', () => {
  it('lists users with pagination', async () => {
    // Create test users
    await createUser({ email: 'list1@example.com', name: 'List 1' })
    await createUser({ email: 'list2@example.com', name: 'List 2' })

    const result = await listUsers({ limit: 5 })
    expect(result.success).toBe(true)
    expect(result.data.items.length).toBeGreaterThan(0)
    expect(result.data.total).toBeDefined()
  })

  it('filters by role', async () => {
    await createUser({ email: 'guest@example.com', name: 'Guest', role: 'guest' })
    const result = await listUsers({ filter: { role: 'guest' } })
    expect(result.success).toBe(true)
    expect(result.data.items.every(u => u.role === 'guest')).toBe(true)
  })
})

describe('searchUsers', () => {
  it('searches by name', async () => {
    await createUser({ email: 'search@example.com', name: 'Searchable User' })
    const result = await searchUsers('Searchable')
    expect(result.success).toBe(true)
    expect(result.data.length).toBeGreaterThan(0)
  })

  it('searches by email', async () => {
    await createUser({ email: 'findme@example.com', name: 'Find Me' })
    const result = await searchUsers('findme')
    expect(result.success).toBe(true)
    expect(result.data.length).toBeGreaterThan(0)
  })
})

describe('getUserStats', () => {
  it('returns statistics', async () => {
    const stats = await getUserStats()
    expect(typeof stats.total).toBe('number')
    expect(typeof stats.active).toBe('number')
    expect(typeof stats.byRole).toBe('object')
  })
})
`

// Executable script
const script = `
console.log('CRUD API Demo')
console.log('=============\\n')

// Create users
console.log('Creating users...')
const alice = await createUser({ email: 'alice@example.com', name: 'Alice Johnson', role: 'admin' })
const bob = await createUser({ email: 'bob@example.com', name: 'Bob Smith' })
const charlie = await createUser({ email: 'charlie@example.com', name: 'Charlie Brown', role: 'guest' })

console.log(\`Created: \${alice.data.name} (ID: \${alice.data.id})\`)
console.log(\`Created: \${bob.data.name} (ID: \${bob.data.id})\`)
console.log(\`Created: \${charlie.data.name} (ID: \${charlie.data.id})\`)

// Read a user
console.log('\\nReading user...')
const readResult = await getUser(alice.data.id)
console.log(\`Read: \${readResult.data.name} - \${readResult.data.email} (\${readResult.data.role})\`)

// Update a user
console.log('\\nUpdating user...')
const updateResult = await updateUser(bob.data.id, { role: 'admin', name: 'Robert Smith' })
console.log(\`Updated: \${updateResult.data.name} is now \${updateResult.data.role}\`)

// List all users
console.log('\\nListing all users...')
const listResult = await listUsers({ sortBy: 'name', sortOrder: 'asc' })
for (const user of listResult.data.items) {
  console.log(\`  - \${user.name} (\${user.email}) - \${user.role}\`)
}

// Search users
console.log('\\nSearching for "Smith"...')
const searchResult = await searchUsers('Smith')
console.log(\`Found \${searchResult.data.length} user(s)\`)

// Get stats
console.log('\\nUser statistics:')
const stats = await getUserStats()
console.log(\`  Total: \${stats.total}\`)
console.log(\`  Active: \${stats.active}\`)
console.log(\`  By role: \${JSON.stringify(stats.byRole)}\`)

// Delete a user
console.log('\\nDeleting Charlie...')
await deleteUser(charlie.data.id)
console.log('Deleted successfully')

// Final stats
const finalStats = await getUserStats()
console.log(\`\\nFinal count: \${finalStats.total} users\`)

return {
  created: 3,
  remaining: finalStats.total,
  stats: finalStats
}
`

// Create and run the example
async function main() {
  const esm = ESM.create()

  console.log('Writing CRUD API module...')

  const result = await esm.write({
    name: '@examples/crud-api',
    types,
    module,
    tests,
    script,
  })

  console.log('Module written successfully!')
  console.log(`Version: ${result.version}`)
  console.log(`Tests: ${result.testResults?.passed}/${result.testResults?.total} passed`)

  // Run the script
  console.log('\nRunning CRUD demo...')
  const runResult = await esm.run('@examples/crud-api')
  console.log('Result:', runResult.value)
}

main().catch(console.error)
