// src/errors.ts
// Re-export core errors from @dotdo/esm

export {
  ESMError,
  ModuleNotFoundError,
  ValidationError,
  ExecutionError,
  StorageError,
} from '@dotdo/esm'

// Import ESMError for extending (src-specific errors)
import { ESMError } from '@dotdo/esm'

// src-specific error not in core
export class CircularDependencyError extends ESMError {
  cycle: string[]
  constructor(cycle: string[]) {
    super(`Circular dependency detected: ${cycle.join(' -> ')}`, 'CIRCULAR_DEPENDENCY')
    this.name = 'CircularDependencyError'
    this.cycle = cycle
  }
}
