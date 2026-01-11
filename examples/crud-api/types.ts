/**
 * CRUD API Types
 *
 * Type definitions for a complete CRUD (Create, Read, Update, Delete) API module.
 */

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
 * Input for creating a user (without generated fields)
 */
export interface CreateUserInput {
  email: string
  name: string
  role?: 'admin' | 'user' | 'guest'
}

/**
 * Input for updating a user (all fields optional)
 */
export interface UpdateUserInput {
  email?: string
  name?: string
  role?: 'admin' | 'user' | 'guest'
  active?: boolean
}

/**
 * Query options for listing entities
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
 * CRUD operations interface
 */
export interface CrudOperations<T extends BaseEntity, CreateInput, UpdateInput> {
  create(input: CreateInput): Promise<OperationResult<T>>
  read(id: EntityId): Promise<OperationResult<T>>
  update(id: EntityId, input: UpdateInput): Promise<OperationResult<T>>
  delete(id: EntityId): Promise<OperationResult<void>>
  list(options?: QueryOptions): Promise<OperationResult<PaginatedResponse<T>>>
}
