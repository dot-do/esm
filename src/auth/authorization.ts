/**
 * Authorization Service for esm.do
 *
 * Implements scope-based authorization with support for:
 * - Read/Write/Admin scope hierarchy
 * - Protected namespace enforcement
 *
 * Scope hierarchy:
 * - read: Can read public modules
 * - write: Can read + write modules (implies read)
 * - admin: Can read + write + manage protected namespaces (implies write)
 *
 * Protected namespaces:
 * - @protected/* requires admin scope for all operations
 */

// =============================================================================
// Authorization Scope Types
// =============================================================================

/**
 * Authorization scopes for esm.do
 */
export enum AuthScope {
  /** Read access - can fetch public modules */
  READ = 'read',
  /** Write access - can create/update modules (implies read) */
  WRITE = 'write',
  /** Admin access - can manage protected namespaces (implies write) */
  ADMIN = 'admin',
}

/**
 * Token payload with scopes
 */
export interface TokenPayload {
  /** Subject (user ID) */
  sub: string
  /** Issued at timestamp */
  iat: number
  /** Expiration timestamp */
  exp: number
  /** Granted scopes */
  scopes: AuthScope[]
}

/**
 * Authorization check result
 */
export interface AuthorizationResult {
  /** Whether the action is authorized */
  authorized: boolean
  /** Required scope for the action */
  requiredScope: AuthScope
  /** Granted scopes from token */
  grantedScopes: AuthScope[]
  /** Error message if not authorized */
  error?: string
}

/**
 * Authorization service interface
 */
export interface AuthorizationService {
  /** Check if token has required scope for an action */
  checkScope(token: TokenPayload, requiredScope: AuthScope): AuthorizationResult
  /** Check if token can access a specific module path */
  canAccessModule(token: TokenPayload, moduleName: string, action: 'read' | 'write' | 'delete'): AuthorizationResult
  /** Check if a scope implies another scope */
  scopeImplies(granted: AuthScope, required: AuthScope): boolean
  /** Get the minimum required scope for a module action */
  getRequiredScope(moduleName: string, action: 'read' | 'write' | 'delete'): AuthScope
  /** Check if a module is in a protected namespace */
  isProtectedNamespace(moduleName: string): boolean
}

// =============================================================================
// Scope Hierarchy
// =============================================================================

/**
 * Scope hierarchy levels (higher number = more privileges)
 */
const SCOPE_LEVELS: Record<AuthScope, number> = {
  [AuthScope.READ]: 1,
  [AuthScope.WRITE]: 2,
  [AuthScope.ADMIN]: 3,
}

// =============================================================================
// Authorization Service Implementation
// =============================================================================

class AuthorizationServiceImpl implements AuthorizationService {
  /**
   * Check if a granted scope implies a required scope
   * Based on the hierarchy: admin > write > read
   */
  scopeImplies(granted: AuthScope, required: AuthScope): boolean {
    return SCOPE_LEVELS[granted] >= SCOPE_LEVELS[required]
  }

  /**
   * Check if a module is in a protected namespace
   * Protected namespaces: @protected/*
   */
  isProtectedNamespace(moduleName: string): boolean {
    return moduleName.startsWith('@protected/')
  }

  /**
   * Get the minimum required scope for a module action
   */
  getRequiredScope(moduleName: string, action: 'read' | 'write' | 'delete'): AuthScope {
    // Protected namespaces require admin for all operations
    if (this.isProtectedNamespace(moduleName)) {
      return AuthScope.ADMIN
    }

    // Public modules: read requires read, write/delete require write
    switch (action) {
      case 'read':
        return AuthScope.READ
      case 'write':
      case 'delete':
        return AuthScope.WRITE
    }
  }

  /**
   * Check if a token has the required scope
   */
  checkScope(token: TokenPayload, requiredScope: AuthScope): AuthorizationResult {
    // Handle undefined or malformed scopes array
    const scopes = token.scopes ?? []
    const grantedScopes = Array.isArray(scopes) ? scopes : []

    // Check if any granted scope implies the required scope
    const hasScope = grantedScopes.some((granted) => this.scopeImplies(granted, requiredScope))

    if (hasScope) {
      return {
        authorized: true,
        requiredScope,
        grantedScopes,
      }
    }

    return {
      authorized: false,
      requiredScope,
      grantedScopes,
      error: `Insufficient scope: requires '${requiredScope}' but token has [${grantedScopes.join(', ')}]`,
    }
  }

  /**
   * Check if a token can access a specific module
   */
  canAccessModule(token: TokenPayload, moduleName: string, action: 'read' | 'write' | 'delete'): AuthorizationResult {
    const requiredScope = this.getRequiredScope(moduleName, action)
    const result = this.checkScope(token, requiredScope)

    // Add more specific error for protected namespace access
    if (!result.authorized && this.isProtectedNamespace(moduleName)) {
      result.error = `Admin scope required for protected namespace '${moduleName}'`
    }

    return result
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a new authorization service instance
 */
export function createAuthorizationService(): AuthorizationService {
  return new AuthorizationServiceImpl()
}
