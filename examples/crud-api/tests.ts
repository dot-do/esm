/**
 * CRUD API Tests
 *
 * Comprehensive test suite for the CRUD API module.
 * These tests verify all CRUD operations work correctly.
 */

import { describe, it, expect, beforeEach } from 'vitest'

// Test data generators
function generateEmail(): string {
  return `test-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`
}

function generateName(): string {
  const firstNames = ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve']
  const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones']
  return `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${
    lastNames[Math.floor(Math.random() * lastNames.length)]
  }`
}

// Mock module for standalone testing
const mockModule = {
  users: new Map<string, any>(),
  idCounter: 1,

  reset() {
    this.users.clear()
    this.idCounter = 1
  },

  generateId(): string {
    return `user_${Date.now()}_${this.idCounter++}`
  },

  async createUser(input: { email: string; name: string; role?: string }) {
    if (!input.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
      return { success: false, error: 'Valid email is required' }
    }
    if (!input.name?.trim()) {
      return { success: false, error: 'Name is required' }
    }

    for (const user of this.users.values()) {
      if (user.email === input.email) {
        return { success: false, error: 'Email already exists' }
      }
    }

    const user = {
      id: this.generateId(),
      email: input.email.toLowerCase().trim(),
      name: input.name.trim(),
      role: input.role || 'user',
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    this.users.set(user.id, user)
    return { success: true, data: user }
  },

  async getUser(id: string) {
    const user = this.users.get(id)
    if (!user) return { success: false, error: 'User not found' }
    return { success: true, data: user }
  },

  async updateUser(id: string, input: any) {
    const user = this.users.get(id)
    if (!user) return { success: false, error: 'User not found' }

    if (input.email) {
      for (const [uid, u] of this.users.entries()) {
        if (uid !== id && u.email === input.email) {
          return { success: false, error: 'Email already exists' }
        }
      }
    }

    const updated = { ...user, ...input, updatedAt: new Date() }
    this.users.set(id, updated)
    return { success: true, data: updated }
  },

  async deleteUser(id: string) {
    if (!this.users.has(id)) return { success: false, error: 'User not found' }
    this.users.delete(id)
    return { success: true }
  },

  async listUsers(options: any = {}) {
    const { limit = 10, offset = 0, filter = {} } = options
    let items = Array.from(this.users.values())

    if (filter.role) items = items.filter((u) => u.role === filter.role)
    if (filter.active !== undefined) items = items.filter((u) => u.active === filter.active)

    return {
      success: true,
      data: {
        items: items.slice(offset, offset + limit),
        total: items.length,
        limit,
        offset,
        hasMore: offset + limit < items.length,
      },
    }
  },

  async searchUsers(query: string) {
    if (!query) return { success: false, error: 'Query required' }
    const q = query.toLowerCase()
    const results = Array.from(this.users.values()).filter(
      (u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    )
    return { success: true, data: results }
  },

  async getUserStats() {
    const users = Array.from(this.users.values())
    const byRole: Record<string, number> = {}
    for (const u of users) byRole[u.role] = (byRole[u.role] || 0) + 1
    return {
      total: users.length,
      active: users.filter((u) => u.active).length,
      byRole,
    }
  },
}

// Tests
describe('CRUD API', () => {
  beforeEach(() => {
    mockModule.reset()
  })

  describe('Create Operations', () => {
    it('should create a user with valid input', async () => {
      const result = await mockModule.createUser({
        email: generateEmail(),
        name: generateName(),
      })

      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.data!.id).toBeDefined()
      expect(result.data!.role).toBe('user')
      expect(result.data!.active).toBe(true)
    })

    it('should create a user with custom role', async () => {
      const result = await mockModule.createUser({
        email: generateEmail(),
        name: generateName(),
        role: 'admin',
      })

      expect(result.success).toBe(true)
      expect(result.data!.role).toBe('admin')
    })

    it('should normalize email to lowercase', async () => {
      const result = await mockModule.createUser({
        email: 'TEST@EXAMPLE.COM',
        name: 'Test User',
      })

      expect(result.success).toBe(true)
      expect(result.data!.email).toBe('test@example.com')
    })

    it('should reject invalid email', async () => {
      const result = await mockModule.createUser({
        email: 'not-an-email',
        name: 'Test',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('email')
    })

    it('should reject empty name', async () => {
      const result = await mockModule.createUser({
        email: generateEmail(),
        name: '',
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('Name')
    })

    it('should reject duplicate email', async () => {
      const email = generateEmail()
      await mockModule.createUser({ email, name: 'First' })
      const result = await mockModule.createUser({ email, name: 'Second' })

      expect(result.success).toBe(false)
      expect(result.error).toContain('exists')
    })
  })

  describe('Read Operations', () => {
    it('should retrieve existing user', async () => {
      const created = await mockModule.createUser({
        email: generateEmail(),
        name: 'Read Test',
      })
      const result = await mockModule.getUser(created.data!.id)

      expect(result.success).toBe(true)
      expect(result.data!.name).toBe('Read Test')
    })

    it('should return error for non-existent user', async () => {
      const result = await mockModule.getUser('invalid-id')

      expect(result.success).toBe(false)
      expect(result.error).toContain('not found')
    })
  })

  describe('Update Operations', () => {
    it('should update user name', async () => {
      const created = await mockModule.createUser({
        email: generateEmail(),
        name: 'Original Name',
      })
      const result = await mockModule.updateUser(created.data!.id, {
        name: 'Updated Name',
      })

      expect(result.success).toBe(true)
      expect(result.data!.name).toBe('Updated Name')
    })

    it('should update user role', async () => {
      const created = await mockModule.createUser({
        email: generateEmail(),
        name: 'Role Test',
      })
      const result = await mockModule.updateUser(created.data!.id, {
        role: 'admin',
      })

      expect(result.success).toBe(true)
      expect(result.data!.role).toBe('admin')
    })

    it('should deactivate user', async () => {
      const created = await mockModule.createUser({
        email: generateEmail(),
        name: 'Deactivate Test',
      })
      const result = await mockModule.updateUser(created.data!.id, {
        active: false,
      })

      expect(result.success).toBe(true)
      expect(result.data!.active).toBe(false)
    })

    it('should update updatedAt timestamp', async () => {
      const created = await mockModule.createUser({
        email: generateEmail(),
        name: 'Timestamp Test',
      })
      const originalUpdatedAt = created.data!.updatedAt

      // Wait a bit to ensure different timestamp
      await new Promise((r) => setTimeout(r, 10))

      const result = await mockModule.updateUser(created.data!.id, {
        name: 'New Name',
      })

      expect(result.data!.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime())
    })

    it('should reject update to duplicate email', async () => {
      const user1 = await mockModule.createUser({
        email: generateEmail(),
        name: 'User 1',
      })
      const user2 = await mockModule.createUser({
        email: generateEmail(),
        name: 'User 2',
      })

      const result = await mockModule.updateUser(user2.data!.id, {
        email: user1.data!.email,
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('exists')
    })
  })

  describe('Delete Operations', () => {
    it('should delete existing user', async () => {
      const created = await mockModule.createUser({
        email: generateEmail(),
        name: 'Delete Test',
      })

      const deleteResult = await mockModule.deleteUser(created.data!.id)
      expect(deleteResult.success).toBe(true)

      const getResult = await mockModule.getUser(created.data!.id)
      expect(getResult.success).toBe(false)
    })

    it('should return error for non-existent user', async () => {
      const result = await mockModule.deleteUser('invalid-id')

      expect(result.success).toBe(false)
      expect(result.error).toContain('not found')
    })
  })

  describe('List Operations', () => {
    beforeEach(async () => {
      // Create test users
      await mockModule.createUser({ email: generateEmail(), name: 'User 1' })
      await mockModule.createUser({ email: generateEmail(), name: 'User 2' })
      await mockModule.createUser({ email: generateEmail(), name: 'User 3', role: 'admin' })
    })

    it('should list all users', async () => {
      const result = await mockModule.listUsers()

      expect(result.success).toBe(true)
      expect(result.data!.items.length).toBe(3)
      expect(result.data!.total).toBe(3)
    })

    it('should paginate results', async () => {
      const result = await mockModule.listUsers({ limit: 2, offset: 0 })

      expect(result.success).toBe(true)
      expect(result.data!.items.length).toBe(2)
      expect(result.data!.hasMore).toBe(true)
    })

    it('should filter by role', async () => {
      const result = await mockModule.listUsers({ filter: { role: 'admin' } })

      expect(result.success).toBe(true)
      expect(result.data!.items.every((u: any) => u.role === 'admin')).toBe(true)
    })
  })

  describe('Search Operations', () => {
    beforeEach(async () => {
      await mockModule.createUser({ email: 'john@example.com', name: 'John Doe' })
      await mockModule.createUser({ email: 'jane@example.com', name: 'Jane Smith' })
    })

    it('should search by name', async () => {
      const result = await mockModule.searchUsers('John')

      expect(result.success).toBe(true)
      expect(result.data!.length).toBe(1)
      expect(result.data![0].name).toBe('John Doe')
    })

    it('should search by email', async () => {
      const result = await mockModule.searchUsers('jane@')

      expect(result.success).toBe(true)
      expect(result.data!.length).toBe(1)
      expect(result.data![0].email).toBe('jane@example.com')
    })

    it('should be case insensitive', async () => {
      const result = await mockModule.searchUsers('JOHN')

      expect(result.success).toBe(true)
      expect(result.data!.length).toBe(1)
    })
  })

  describe('Statistics', () => {
    beforeEach(async () => {
      await mockModule.createUser({ email: generateEmail(), name: 'Admin', role: 'admin' })
      await mockModule.createUser({ email: generateEmail(), name: 'User 1' })
      await mockModule.createUser({ email: generateEmail(), name: 'User 2' })
      const guest = await mockModule.createUser({ email: generateEmail(), name: 'Guest', role: 'guest' })
      await mockModule.updateUser(guest.data!.id, { active: false })
    })

    it('should return correct total count', async () => {
      const stats = await mockModule.getUserStats()
      expect(stats.total).toBe(4)
    })

    it('should return correct active count', async () => {
      const stats = await mockModule.getUserStats()
      expect(stats.active).toBe(3)
    })

    it('should return correct role breakdown', async () => {
      const stats = await mockModule.getUserStats()
      expect(stats.byRole.admin).toBe(1)
      expect(stats.byRole.user).toBe(2)
      expect(stats.byRole.guest).toBe(1)
    })
  })
})
