// tests/utils/patterns.test.ts
import { describe, it, expect } from 'vitest'

/**
 * RED tests for centralized regex patterns in utils/patterns.ts
 *
 * These tests define the expected interface and behavior for pattern utilities.
 * Tests are written to FAIL until implementation exists.
 *
 * Related issues:
 * - esm-4l4k.2: RED - Centralized regex patterns
 * - esm-4l4k.6: GREEN - Create patterns module
 */

describe('MODULE_NAME_PATTERN', () => {
  describe('valid scoped module names', () => {
    it('should match simple scoped module @scope/name', async () => {
      const { MODULE_NAME_PATTERN } = await import('../../src/utils/patterns.js')
      expect(MODULE_NAME_PATTERN.test('@scope/name')).toBe(true)
    })

    it('should match scoped module with hyphenated org @my-org/pkg', async () => {
      const { MODULE_NAME_PATTERN } = await import('../../src/utils/patterns.js')
      expect(MODULE_NAME_PATTERN.test('@my-org/pkg')).toBe(true)
    })

    it('should match nested scoped module @scope/name/nested', async () => {
      const { MODULE_NAME_PATTERN } = await import('../../src/utils/patterns.js')
      expect(MODULE_NAME_PATTERN.test('@scope/name/nested')).toBe(true)
    })

    it('should match deeply nested module @org/a/b/c/d', async () => {
      const { MODULE_NAME_PATTERN } = await import('../../src/utils/patterns.js')
      expect(MODULE_NAME_PATTERN.test('@org/a/b/c/d')).toBe(true)
    })

    it('should match module with numbers @scope123/pkg456', async () => {
      const { MODULE_NAME_PATTERN } = await import('../../src/utils/patterns.js')
      expect(MODULE_NAME_PATTERN.test('@scope123/pkg456')).toBe(true)
    })

    it('should match module with underscores @my_org/my_pkg', async () => {
      const { MODULE_NAME_PATTERN } = await import('../../src/utils/patterns.js')
      expect(MODULE_NAME_PATTERN.test('@my_org/my_pkg')).toBe(true)
    })

    it('should match single letter scope and name @a/b', async () => {
      const { MODULE_NAME_PATTERN } = await import('../../src/utils/patterns.js')
      expect(MODULE_NAME_PATTERN.test('@a/b')).toBe(true)
    })
  })

  describe('invalid module names', () => {
    it('should reject unscoped module name no-scope', async () => {
      const { MODULE_NAME_PATTERN } = await import('../../src/utils/patterns.js')
      expect(MODULE_NAME_PATTERN.test('no-scope')).toBe(false)
    })

    it('should reject empty scope @/empty', async () => {
      const { MODULE_NAME_PATTERN } = await import('../../src/utils/patterns.js')
      expect(MODULE_NAME_PATTERN.test('@/empty')).toBe(false)
    })

    it('should reject empty name @scope/', async () => {
      const { MODULE_NAME_PATTERN } = await import('../../src/utils/patterns.js')
      expect(MODULE_NAME_PATTERN.test('@scope/')).toBe(false)
    })

    it('should reject missing @ symbol scope/name', async () => {
      const { MODULE_NAME_PATTERN } = await import('../../src/utils/patterns.js')
      expect(MODULE_NAME_PATTERN.test('scope/name')).toBe(false)
    })

    it('should reject double @ symbol @@scope/name', async () => {
      const { MODULE_NAME_PATTERN } = await import('../../src/utils/patterns.js')
      expect(MODULE_NAME_PATTERN.test('@@scope/name')).toBe(false)
    })

    it('should reject path traversal ../escape', async () => {
      const { MODULE_NAME_PATTERN } = await import('../../src/utils/patterns.js')
      expect(MODULE_NAME_PATTERN.test('../escape')).toBe(false)
    })

    it('should reject path traversal in module @scope/../escape', async () => {
      const { MODULE_NAME_PATTERN } = await import('../../src/utils/patterns.js')
      expect(MODULE_NAME_PATTERN.test('@scope/../escape')).toBe(false)
    })

    it('should reject empty string', async () => {
      const { MODULE_NAME_PATTERN } = await import('../../src/utils/patterns.js')
      expect(MODULE_NAME_PATTERN.test('')).toBe(false)
    })

    it('should reject just @ symbol', async () => {
      const { MODULE_NAME_PATTERN } = await import('../../src/utils/patterns.js')
      expect(MODULE_NAME_PATTERN.test('@')).toBe(false)
    })

    it('should reject trailing slash @scope/name/', async () => {
      const { MODULE_NAME_PATTERN } = await import('../../src/utils/patterns.js')
      expect(MODULE_NAME_PATTERN.test('@scope/name/')).toBe(false)
    })
  })
})

describe('EXPORT_PATTERN', () => {
  describe('named exports', () => {
    it('should match export function declaration', async () => {
      const { EXPORT_PATTERN } = await import('../../src/utils/patterns.js')
      const code = 'export function foo() {}'
      expect(EXPORT_PATTERN.test(code)).toBe(true)
    })

    it('should match export const declaration', async () => {
      const { EXPORT_PATTERN } = await import('../../src/utils/patterns.js')
      const code = 'export const bar = 42'
      expect(EXPORT_PATTERN.test(code)).toBe(true)
    })

    it('should match export let declaration', async () => {
      const { EXPORT_PATTERN } = await import('../../src/utils/patterns.js')
      const code = 'export let baz = "hello"'
      expect(EXPORT_PATTERN.test(code)).toBe(true)
    })

    it('should match export class declaration', async () => {
      const { EXPORT_PATTERN } = await import('../../src/utils/patterns.js')
      const code = 'export class MyClass {}'
      expect(EXPORT_PATTERN.test(code)).toBe(true)
    })

    it('should match export async function declaration', async () => {
      const { EXPORT_PATTERN } = await import('../../src/utils/patterns.js')
      const code = 'export async function asyncFn() {}'
      expect(EXPORT_PATTERN.test(code)).toBe(true)
    })
  })

  describe('default exports', () => {
    it('should match export default function', async () => {
      const { EXPORT_PATTERN } = await import('../../src/utils/patterns.js')
      const code = 'export default function() {}'
      expect(EXPORT_PATTERN.test(code)).toBe(true)
    })

    it('should match export default class', async () => {
      const { EXPORT_PATTERN } = await import('../../src/utils/patterns.js')
      const code = 'export default class {}'
      expect(EXPORT_PATTERN.test(code)).toBe(true)
    })

    it('should match export default identifier', async () => {
      const { EXPORT_PATTERN } = await import('../../src/utils/patterns.js')
      const code = 'export default myValue'
      expect(EXPORT_PATTERN.test(code)).toBe(true)
    })
  })

  describe('re-exports', () => {
    it('should match export braces from module', async () => {
      const { EXPORT_PATTERN } = await import('../../src/utils/patterns.js')
      const code = "export { foo, bar } from './module'"
      expect(EXPORT_PATTERN.test(code)).toBe(true)
    })

    it('should match export star from module', async () => {
      const { EXPORT_PATTERN } = await import('../../src/utils/patterns.js')
      const code = "export * from './module'"
      expect(EXPORT_PATTERN.test(code)).toBe(true)
    })

    it('should match export star as namespace', async () => {
      const { EXPORT_PATTERN } = await import('../../src/utils/patterns.js')
      const code = "export * as utils from './utils'"
      expect(EXPORT_PATTERN.test(code)).toBe(true)
    })
  })

  describe('non-exports', () => {
    it('should not match regular function declaration', async () => {
      const { EXPORT_PATTERN } = await import('../../src/utils/patterns.js')
      const code = 'function foo() {}'
      expect(EXPORT_PATTERN.test(code)).toBe(false)
    })

    it('should not match regular const declaration', async () => {
      const { EXPORT_PATTERN } = await import('../../src/utils/patterns.js')
      const code = 'const bar = 42'
      expect(EXPORT_PATTERN.test(code)).toBe(false)
    })

    it('should not match comment containing export', async () => {
      const { EXPORT_PATTERN } = await import('../../src/utils/patterns.js')
      const code = '// export function foo() {}'
      expect(EXPORT_PATTERN.test(code)).toBe(false)
    })
  })
})

describe('IMPORT_PATTERN', () => {
  describe('named imports', () => {
    it('should match import braces from module', async () => {
      const { IMPORT_PATTERN } = await import('../../src/utils/patterns.js')
      const code = "import { foo } from '@scope/module'"
      expect(IMPORT_PATTERN.test(code)).toBe(true)
    })

    it('should match multiple named imports', async () => {
      const { IMPORT_PATTERN } = await import('../../src/utils/patterns.js')
      const code = "import { foo, bar, baz } from './local'"
      expect(IMPORT_PATTERN.test(code)).toBe(true)
    })

    it('should match renamed imports', async () => {
      const { IMPORT_PATTERN } = await import('../../src/utils/patterns.js')
      const code = "import { foo as myFoo } from './module'"
      expect(IMPORT_PATTERN.test(code)).toBe(true)
    })
  })

  describe('default imports', () => {
    it('should match default import', async () => {
      const { IMPORT_PATTERN } = await import('../../src/utils/patterns.js')
      const code = "import MyModule from '@scope/module'"
      expect(IMPORT_PATTERN.test(code)).toBe(true)
    })

    it('should match default with named imports', async () => {
      const { IMPORT_PATTERN } = await import('../../src/utils/patterns.js')
      const code = "import Default, { named } from './module'"
      expect(IMPORT_PATTERN.test(code)).toBe(true)
    })
  })

  describe('namespace imports', () => {
    it('should match namespace import', async () => {
      const { IMPORT_PATTERN } = await import('../../src/utils/patterns.js')
      const code = "import * as utils from '@utils/helpers'"
      expect(IMPORT_PATTERN.test(code)).toBe(true)
    })
  })

  describe('side-effect imports', () => {
    it('should match side-effect import', async () => {
      const { IMPORT_PATTERN } = await import('../../src/utils/patterns.js')
      const code = "import './side-effects'"
      expect(IMPORT_PATTERN.test(code)).toBe(true)
    })
  })

  describe('dynamic imports', () => {
    it('should match dynamic import expression', async () => {
      const { IMPORT_PATTERN } = await import('../../src/utils/patterns.js')
      const code = "const mod = await import('./dynamic')"
      expect(IMPORT_PATTERN.test(code)).toBe(true)
    })

    it('should match dynamic import with template literal', async () => {
      const { IMPORT_PATTERN } = await import('../../src/utils/patterns.js')
      const code = 'const mod = await import(`./modules/${name}`)'
      expect(IMPORT_PATTERN.test(code)).toBe(true)
    })
  })

  describe('non-imports', () => {
    it('should not match regular function call', async () => {
      const { IMPORT_PATTERN } = await import('../../src/utils/patterns.js')
      const code = 'const result = myFunction()'
      expect(IMPORT_PATTERN.test(code)).toBe(false)
    })

    it('should not match require statement', async () => {
      const { IMPORT_PATTERN } = await import('../../src/utils/patterns.js')
      const code = "const mod = require('./module')"
      expect(IMPORT_PATTERN.test(code)).toBe(false)
    })

    it('should not match comment containing import', async () => {
      const { IMPORT_PATTERN } = await import('../../src/utils/patterns.js')
      const code = "// import { foo } from './module'"
      expect(IMPORT_PATTERN.test(code)).toBe(false)
    })
  })
})

describe('pattern utility functions', () => {
  describe('isValidModuleName', () => {
    it('should validate scoped module names', async () => {
      const { isValidModuleName } = await import('../../src/utils/patterns.js')
      expect(isValidModuleName('@scope/name')).toBe(true)
      expect(isValidModuleName('@my-org/pkg')).toBe(true)
      expect(isValidModuleName('@scope/name/nested')).toBe(true)
    })

    it('should reject invalid module names', async () => {
      const { isValidModuleName } = await import('../../src/utils/patterns.js')
      expect(isValidModuleName('no-scope')).toBe(false)
      expect(isValidModuleName('@/empty')).toBe(false)
      expect(isValidModuleName('@scope/')).toBe(false)
    })
  })

  describe('extractModuleScope', () => {
    it('should extract scope from module name', async () => {
      const { extractModuleScope } = await import('../../src/utils/patterns.js')
      expect(extractModuleScope('@scope/name')).toBe('@scope')
      expect(extractModuleScope('@my-org/pkg/nested')).toBe('@my-org')
    })

    it('should return null for invalid module names', async () => {
      const { extractModuleScope } = await import('../../src/utils/patterns.js')
      expect(extractModuleScope('no-scope')).toBeNull()
      expect(extractModuleScope('@/empty')).toBeNull()
    })
  })

  describe('extractModulePath', () => {
    it('should extract path from module name', async () => {
      const { extractModulePath } = await import('../../src/utils/patterns.js')
      expect(extractModulePath('@scope/name')).toBe('name')
      expect(extractModulePath('@my-org/pkg/nested/deep')).toBe('pkg/nested/deep')
    })

    it('should return null for invalid module names', async () => {
      const { extractModulePath } = await import('../../src/utils/patterns.js')
      expect(extractModulePath('no-scope')).toBeNull()
      expect(extractModulePath('@scope/')).toBeNull()
    })
  })
})
