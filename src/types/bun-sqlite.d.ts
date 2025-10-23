/**
 * Type declarations for Bun's native SQLite module
 * Bun:sqlite provides a compatible API with better-sqlite3
 */
declare module 'bun:sqlite' {
  interface Database {
    run(sql: string, ...params: any[]): void;
    prepare(sql: string): any;
    exec(sql: string): void;
    query(sql: string): any;
    transaction<T = any>(fn: (...args: any[]) => T): (...args: any[]) => T;
    close(): void;
  }

  interface DatabaseConstructor {
    new (filename: string, options?: { create?: boolean; readwrite?: boolean; readonly?: boolean }): Database;
  }

  const Database: DatabaseConstructor;
  export default Database;
}
