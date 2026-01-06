/**
 * esm.do - Living ESM modules for AI agents
 *
 * This is the main entry point for the esm.do package.
 */

export { ESM, type WriteOptions, type WriteResult, type ReadResult, type RunResult, type RunOptions, type TestOptions, type TestResult, type SingleTestResult, type DeleteResult, type FileChange, type DiffResult, type ESMOptions } from './esm.js'
export type { StoredModule, ModuleVersion, ModuleStorage, WriteResult as StorageWriteResult, GitxClient } from './storage/types.js'

import { ESM } from './esm.js'

/**
 * Default ESM instance for convenience
 */
export const esm = new ESM()

export default ESM
