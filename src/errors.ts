// src/errors.ts
// Re-export core errors from local core package build

export {
  ESMError,
  ModuleNotFoundError,
  ValidationError,
  ExecutionError,
  StorageError,
} from '../core/dist/index.js'

// Import ESMError for extending (src-specific errors)
import { ESMError } from '../core/dist/index.js'

// src-specific error not in core
export class CircularDependencyError extends ESMError {
  cycle: string[]
  constructor(cycle: string[]) {
    super(`Circular dependency detected: ${cycle.join(' -> ')}`, 'CIRCULAR_DEPENDENCY')
    this.name = 'CircularDependencyError'
    this.cycle = cycle
  }
}
