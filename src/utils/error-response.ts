// src/utils/error-response.ts
import { ESMError } from '../errors.js'

export interface ErrorResponse {
  error: string
  code: string
  status: number
}

/**
 * Maps error codes to HTTP status codes
 */
const ERROR_STATUS_MAP: Record<string, number> = {
  MODULE_NOT_FOUND: 404,
  VALIDATION_ERROR: 400,
  EXECUTION_ERROR: 500,
  STORAGE_ERROR: 500,
  INTERNAL_ERROR: 500,
}

/**
 * Formats an error into a consistent response shape
 * @param error - The error to format
 * @returns Formatted error response with error message, code, and HTTP status
 */
export function formatError(error: Error): ErrorResponse {
  // Handle ESMError and its subclasses
  if (error instanceof ESMError) {
    const status = ERROR_STATUS_MAP[error.code] ?? 500
    return {
      error: error.message,
      code: error.code,
      status,
    }
  }

  // Handle unknown/generic errors
  return {
    error: error.message,
    code: 'INTERNAL_ERROR',
    status: 500,
  }
}
