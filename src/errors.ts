// src/errors.ts

export class ESMError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'ESMError';
    this.code = code;
  }
}

export class ModuleNotFoundError extends ESMError {
  moduleId: string;
  constructor(moduleId: string) {
    super(`Module not found: ${moduleId}`, 'MODULE_NOT_FOUND');
    this.name = 'ModuleNotFoundError';
    this.moduleId = moduleId;
  }
}

export class ValidationError extends ESMError {
  details: Record<string, string>;
  constructor(message: string, details?: Record<string, string>) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
    this.details = details || {};
  }
}

export class ExecutionError extends ESMError {
  originalError: Error | undefined;
  constructor(message: string, originalError?: Error) {
    super(message, 'EXECUTION_ERROR');
    this.name = 'ExecutionError';
    this.originalError = originalError ?? undefined;
  }
}

export class StorageError extends ESMError {
  operation: string;
  constructor(message: string, operation: string) {
    super(message, 'STORAGE_ERROR');
    this.name = 'StorageError';
    this.operation = operation;
  }
}

export class CircularDependencyError extends ESMError {
  cycle: string[];
  constructor(cycle: string[]) {
    super(`Circular dependency detected: ${cycle.join(' -> ')}`, 'CIRCULAR_DEPENDENCY');
    this.name = 'CircularDependencyError';
    this.cycle = cycle;
  }
}
