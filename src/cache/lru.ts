/**
 * LRU Cache with TTL-based expiration and invalidation support
 *
 * Uses Map's insertion order for LRU tracking - Map iteration order
 * matches insertion order, so the first key is the least recently used.
 */
export class LRUCache<K, V> {
  private cache = new Map<K, { value: V; timestamp: number }>()

  constructor(
    private maxSize: number,
    private ttl?: number
  ) {}

  /**
   * Get a value from the cache
   * Returns undefined if not found or expired
   * Updates access time on successful get (makes it most recently used)
   */
  get(key: K): V | undefined {
    const entry = this.cache.get(key)
    if (!entry) return undefined

    // Check TTL
    if (this.ttl && Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key)
      return undefined
    }

    // Move to end (most recently used) by re-inserting
    this.cache.delete(key)
    this.cache.set(key, { ...entry, timestamp: Date.now() })
    return entry.value
  }

  /**
   * Set a value in the cache
   * Evicts least recently used item if at capacity
   */
  set(key: K, value: V): void {
    // Remove if exists (to update position)
    this.cache.delete(key)

    // Evict LRU if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value
      if (firstKey !== undefined) this.cache.delete(firstKey)
    }

    this.cache.set(key, { value, timestamp: Date.now() })
  }

  /**
   * Delete a specific key from the cache
   */
  delete(key: K): boolean {
    return this.cache.delete(key)
  }

  /**
   * Invalidate all entries matching a predicate
   * Useful for dependency-based invalidation
   */
  invalidate(predicate: (key: K) => boolean): void {
    for (const key of this.cache.keys()) {
      if (predicate(key)) {
        this.cache.delete(key)
      }
    }
  }

  /**
   * Clear all entries from the cache
   */
  clear(): void {
    this.cache.clear()
  }

  /**
   * Check if a key exists in the cache (without updating access time)
   */
  has(key: K): boolean {
    const entry = this.cache.get(key)
    if (!entry) return false

    // Check TTL
    if (this.ttl && Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key)
      return false
    }

    return true
  }

  /**
   * Get the current size of the cache
   */
  get size(): number {
    return this.cache.size
  }
}
