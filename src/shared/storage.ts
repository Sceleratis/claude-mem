// NOTE: This module is currently not in use and requires refactoring
// The architecture has changed to use SessionStore directly instead of this abstraction layer

/*
import { 
  createStores, 
  SessionStore, 
  MemoryStore, 
  OverviewStore, 
  DiagnosticsStore,
  SessionInput,
  MemoryInput,
  OverviewInput,
  DiagnosticInput,
  SessionRow,
  MemoryRow,
  OverviewRow,
  DiagnosticRow,
  normalizeTimestamp
} from '../services/sqlite/index.js';
*/

import {
  SessionInput,
  MemoryInput,
  OverviewInput,
  DiagnosticInput,
  SessionRow,
  MemoryRow,
  OverviewRow,
  DiagnosticRow,
} from '../services/sqlite/types.js';

/**
 * Storage backend types
 */
export type StorageBackend = 'sqlite' | 'jsonl';

/**
 * Unified interface for storage operations
 */
export interface IStorageProvider {
  backend: StorageBackend;
  
  // Session operations
  createSession(session: SessionInput): Promise<SessionRow | void>;
  getSession(sessionId: string): Promise<SessionRow | null>;
  hasSession(sessionId: string): Promise<boolean>;
  getAllSessionIds(): Promise<Set<string>>;
  getRecentSessions(limit?: number): Promise<SessionRow[]>;
  getRecentSessionsForProject(project: string, limit?: number): Promise<SessionRow[]>;
  
  // Memory operations
  createMemory(memory: MemoryInput): Promise<MemoryRow | void>;
  createMemories(memories: MemoryInput[]): Promise<void>;
  getRecentMemories(limit?: number): Promise<MemoryRow[]>;
  getRecentMemoriesForProject(project: string, limit?: number): Promise<MemoryRow[]>;
  hasDocumentId(documentId: string): Promise<boolean>;
  
  // Overview operations
  createOverview(overview: OverviewInput): Promise<OverviewRow | void>;
  upsertOverview(overview: OverviewInput): Promise<OverviewRow | void>;
  getRecentOverviews(limit?: number): Promise<OverviewRow[]>;
  getRecentOverviewsForProject(project: string, limit?: number): Promise<OverviewRow[]>;
  
  // Diagnostic operations
  createDiagnostic(diagnostic: DiagnosticInput): Promise<DiagnosticRow | void>;
  
  // Health check
  isAvailable(): Promise<boolean>;
}

/**
 * SQLite-based storage provider
 * NOTE: This class is currently not implemented and is kept for future compatibility
 * The actual implementation uses SessionStore directly
 */
export class SQLiteStorageProvider implements IStorageProvider {
  public readonly backend = 'sqlite';

  async isAvailable(): Promise<boolean> {
    throw new Error('SQLiteStorageProvider is not currently implemented. Use SessionStore directly.');
  }

  async createSession(_session: SessionInput): Promise<SessionRow> {
    throw new Error('Not implemented');
  }

  async getSession(_sessionId: string): Promise<SessionRow | null> {
    throw new Error('Not implemented');
  }

  async hasSession(_sessionId: string): Promise<boolean> {
    throw new Error('Not implemented');
  }

  async getAllSessionIds(): Promise<Set<string>> {
    throw new Error('Not implemented');
  }

  async getRecentSessions(_limit = 5): Promise<SessionRow[]> {
    throw new Error('Not implemented');
  }

  async getRecentSessionsForProject(_project: string, _limit = 5): Promise<SessionRow[]> {
    throw new Error('Not implemented');
  }

  async createMemory(_memory: MemoryInput): Promise<MemoryRow> {
    throw new Error('Not implemented');
  }

  async createMemories(_memories: MemoryInput[]): Promise<void> {
    throw new Error('Not implemented');
  }

  async getRecentMemories(_limit = 10): Promise<MemoryRow[]> {
    throw new Error('Not implemented');
  }

  async getRecentMemoriesForProject(_project: string, _limit = 10): Promise<MemoryRow[]> {
    throw new Error('Not implemented');
  }

  async hasDocumentId(_documentId: string): Promise<boolean> {
    throw new Error('Not implemented');
  }

  async createOverview(_overview: OverviewInput): Promise<OverviewRow> {
    throw new Error('Not implemented');
  }

  async upsertOverview(_overview: OverviewInput): Promise<OverviewRow> {
    throw new Error('Not implemented');
  }

  async getRecentOverviews(_limit = 5): Promise<OverviewRow[]> {
    throw new Error('Not implemented');
  }

  async getRecentOverviewsForProject(_project: string, _limit = 5): Promise<OverviewRow[]> {
    throw new Error('Not implemented');
  }

  async createDiagnostic(_diagnostic: DiagnosticInput): Promise<DiagnosticRow> {
    throw new Error('Not implemented');
  }
}

/**
 * Storage provider singleton
 */
let storageProvider: IStorageProvider | null = null;

/**
 * Get the configured storage provider (always SQLite)
 * NOTE: This function is not currently working. Use SessionStore directly instead.
 */
export async function getStorageProvider(): Promise<IStorageProvider> {
  if (storageProvider) {
    return storageProvider;
  }

  throw new Error('SQLiteStorageProvider is not currently implemented. Use SessionStore directly.');
}
