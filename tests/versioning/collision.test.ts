import { describe, it, expect } from 'vitest'
import { generateVersion } from '../../src/types.js'

describe('Version Generation', () => {
  describe('collision resistance', () => {
    it('should not have collisions in 10,000 rapid generations', () => {
      const versions = new Set<string>()
      const count = 10000

      for (let i = 0; i < count; i++) {
        versions.add(generateVersion())
      }

      // All versions should be unique
      expect(versions.size).toBe(count)
    })

    it('should not have collisions across concurrent generation', async () => {
      const promises: Promise<string>[] = []
      const count = 1000

      for (let i = 0; i < count; i++) {
        promises.push(Promise.resolve(generateVersion()))
      }

      const versions = await Promise.all(promises)
      const unique = new Set(versions)

      expect(unique.size).toBe(count)
    })
  })

  describe('entropy', () => {
    it('should have sufficient entropy (>48 bits)', () => {
      // Current implementation: timestamp (36 base) + 6 chars of Math.random
      // Math.random provides ~32 bits of entropy
      // 6 base36 chars = ~31 bits
      // This is NOT sufficient

      const versions = []
      for (let i = 0; i < 100; i++) {
        versions.push(generateVersion())
      }

      // Check that the random portion has sufficient length
      // After timestamp, should have at least 12 chars of randomness
      const randomParts = versions.map(v => {
        const parts = v.split('-')
        return parts.length > 1 ? parts[1] : v.slice(-12)
      })

      // All random parts should be >= 12 chars for sufficient entropy
      randomParts.forEach(part => {
        expect(part.length).toBeGreaterThanOrEqual(12)
      })
    })

    it('should use cryptographically secure randomness', () => {
      // This test documents the requirement
      // Implementation should use crypto.randomBytes or crypto.getRandomValues
      // Not Math.random()

      // For now, we can only verify the version looks random enough
      const versions = new Set<string>()
      for (let i = 0; i < 100; i++) {
        versions.add(generateVersion())
      }

      // Check for patterns that suggest weak randomness
      const patterns = Array.from(versions)
      const randomParts = patterns.map(v => v.split('-')[1] || v.slice(-8))

      // All random parts should be different
      const uniqueRandom = new Set(randomParts)
      expect(uniqueRandom.size).toBe(patterns.length)
    })
  })

  describe('format consistency', () => {
    it('should produce URL-safe versions', () => {
      for (let i = 0; i < 100; i++) {
        const version = generateVersion()

        // Should not contain URL-unsafe characters
        expect(version).toMatch(/^[a-zA-Z0-9_-]+$/)

        // Should not contain + / = (base64 unsafe chars)
        expect(version).not.toContain('+')
        expect(version).not.toContain('/')
        expect(version).not.toContain('=')
      }
    })

    it('should be sortable by timestamp', () => {
      const versions: string[] = []

      // Generate versions with small delays
      for (let i = 0; i < 10; i++) {
        versions.push(generateVersion())
      }

      // Versions generated later should sort after earlier ones
      const sorted = [...versions].sort()

      // Note: When versions are generated at the same millisecond,
      // the timestamp prefix is identical and the random suffix determines order.
      // We verify that sorting works and that versions with later timestamps
      // would sort after earlier ones by checking the timestamp prefix ordering.
      const timestampPrefixes = versions.map(v => v.split('-')[0])
      const sortedTimestampPrefixes = [...timestampPrefixes].sort()
      expect(sortedTimestampPrefixes).toEqual(timestampPrefixes)
    })

    it('should have consistent length', () => {
      const versions: string[] = []
      for (let i = 0; i < 100; i++) {
        versions.push(generateVersion())
      }

      // All versions should have similar length (within small range)
      const lengths = versions.map(v => v.length)
      const minLen = Math.min(...lengths)
      const maxLen = Math.max(...lengths)

      // Length variance should be small (timestamp can vary by 1-2 chars)
      expect(maxLen - minLen).toBeLessThanOrEqual(3)
    })
  })

  describe('timestamp component', () => {
    it('should include current timestamp', () => {
      const before = Date.now()
      const version = generateVersion()
      const after = Date.now()

      // Extract timestamp from version (first part before -)
      const timestampPart = version.split('-')[0] || version.slice(0, 8)
      const timestamp = parseInt(timestampPart, 36)

      // Timestamp should be within test window
      expect(timestamp).toBeGreaterThanOrEqual(before)
      expect(timestamp).toBeLessThanOrEqual(after)
    })
  })
})
