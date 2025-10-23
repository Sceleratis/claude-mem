# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Claude-mem is a persistent memory system for Claude Code that captures tool executions, processes them via Claude Agent SDK, and injects context into future sessions. It operates as a plugin with 5 lifecycle hooks, a PM2-managed worker service, an MCP search server, and SQLite storage.

**Current Version**: 4.2.1
**Tech Stack**: TypeScript, Node.js 18+, SQLite3 (better-sqlite3), Express.js, PM2, Claude Agent SDK

## Critical Development Rules

### Build and Deployment Pipeline

**IMPORTANT**: This project has TWO locations:
1. **Development repository**: Where you're working now
2. **Installed plugin**: `~/.claude/plugins/marketplaces/claude-mem-fork/`

When making changes, you MUST:

```bash
# 1. Build the project (compiles TypeScript to plugin/scripts/)
npm run build

# 2. Copy built worker to installed plugin location
cp plugin/scripts/worker-service.cjs ~/.claude/plugins/marketplaces/claude-mem-fork/plugin/scripts/worker-service.cjs

# 3. Restart the PM2 worker
npx pm2 flush claude-mem-worker && npx pm2 restart claude-mem-worker

# 4. Check logs to verify fix
npx pm2 logs claude-mem-worker --lines 30 --nostream
```

**Why this matters**: The PM2 worker runs the built code from the plugin directory, NOT your local development code. If you don't copy the rebuilt files, your changes won't take effect.

### Cross-Platform Path Handling

**NEVER hardcode paths to Claude Code executable**. Always use the shared `findClaudeExecutable()` function from `src/utils/cli.ts`:

```typescript
import { findClaudeExecutable } from '../utils/cli.js';

// Good:
const claudePath = findClaudeExecutable();

// Bad:
const claudePath = '/Users/someone/.nvm/versions/node/v24.5.0/bin/claude';
const claudePath = 'C:\\Users\\someone\\.local\\bin\\claude.exe';
```

The function searches in this order:
1. `CLAUDE_CODE_PATH` environment variable
2. System PATH (using `which`/`where` command)
3. Common installation paths (OS-specific)

### Database Abstraction Layer is Deprecated

**IMPORTANT**: `src/shared/storage.ts` is deprecated and throws errors. Always use `SessionStore` directly:

```typescript
// Good:
import { SessionStore } from '../services/sqlite/SessionStore.js';
const store = new SessionStore();

// Bad:
import { getStorageProvider } from '../shared/storage.js'; // This will throw errors
```

`SessionStore` uses better-sqlite3 as the primary database implementation. `Database.ts` (which uses bun:sqlite) is legacy code.

## Common Development Tasks

### Building the Project

```bash
# Build all hooks, worker service, and search server
npm run build

# Output location: plugin/scripts/
# - Hooks: *-hook.js
# - Worker: worker-service.cjs
# - Search: search-server.js
```

### Managing the Worker Service

```bash
# Check status
npx pm2 status claude-mem-worker

# View logs (last 30 lines)
npx pm2 logs claude-mem-worker --lines 30 --nostream

# View only errors
npx pm2 logs claude-mem-worker --err --lines 10 --nostream

# Restart worker
npx pm2 restart claude-mem-worker

# Flush logs (clear old logs)
npx pm2 flush claude-mem-worker
```

### Checking Database Contents

**Database Location**: `~/.claude-mem/claude-mem.db` (expands to `${HOME}/.claude-mem/claude-mem.db` on Unix/macOS or `%USERPROFILE%\.claude-mem\claude-mem.db` on Windows)

```bash
# Recent observations (cross-platform)
node -e "
const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');
const dbPath = path.join(os.homedir(), '.claude-mem', 'claude-mem.db');
const db = new Database(dbPath, { readonly: true });
console.log('Recent Observations:');
const obs = db.prepare('SELECT id, type, title, created_at FROM observations ORDER BY created_at_epoch DESC LIMIT 5').all();
obs.forEach(o => console.log(\`  [\${o.type}] \${o.title} (ID: \${o.id})\`));
db.close();
"

# Recent summaries (cross-platform)
node -e "
const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');
const dbPath = path.join(os.homedir(), '.claude-mem', 'claude-mem.db');
const db = new Database(dbPath, { readonly: true });
console.log('Recent Summaries:');
const sums = db.prepare('SELECT id, request, learned FROM session_summaries ORDER BY created_at_epoch DESC LIMIT 3').all();
sums.forEach(s => console.log(\`  \${s.request}\n  Learned: \${s.learned ? s.learned.substring(0, 80) + '...' : 'N/A'}\`));
db.close();
"
```

### Running Tests

```bash
# Run all tests
npm test

# Test context injection (simulates SessionStart hook)
npm run test:context

# Verbose output
npm run test:context:verbose

# Run specific test file
node --test tests/session-lifecycle.test.ts
```

### TypeScript Verification

```bash
# Check for TypeScript errors without emitting
npx tsc --noEmit
```

## Architecture Deep-Dive

### Hook Execution Flow

```
User starts Claude Code
  ↓
SessionStart Hook (context-hook.js)
  → Queries database for last 10 session summaries
  → Injects context via hookSpecificOutput JSON
  → Auto-starts PM2 worker if not running
  ↓
User types prompt
  ↓
UserPromptSubmit Hook (new-hook.js)
  → Creates/retrieves SDK session record
  → Saves raw user prompt to user_prompts table (v4.2.0+)
  → Sends init signal to worker service
  ↓
Claude executes tools (Read, Write, Bash, Edit, etc.)
  ↓
PostToolUse Hook (save-hook.js) - fires after EACH tool
  → Sends observation to worker service HTTP endpoint
  → Worker queues observation for SDK processing
  ↓
Claude stops (user presses stop button)
  ↓
Summary Hook (summary-hook.js)
  → Requests summary generation from worker
  → Worker processes all observations via Claude Agent SDK
  → Generates final summary with learnings/decisions
  ↓
Session ends (user closes or /clear)
  ↓
SessionEnd Hook (cleanup-hook.js)
  → Marks session as completed (graceful cleanup)
  → Skips cleanup on /clear to preserve ongoing sessions
```

### Worker Service Architecture

**Port**: Fixed at 37777 (configurable via `CLAUDE_MEM_WORKER_PORT`)
**Process Manager**: PM2 (configured in `ecosystem.config.cjs`)
**HTTP Framework**: Express.js

**Key Design Decision**: Worker runs as a separate process to avoid hook timeout issues. Hooks communicate via HTTP REST API, allowing async processing without blocking Claude.

**REST API Endpoints**:
- `POST /sessions/:id/init` - Initialize SDK session
- `POST /sessions/:id/observations` - Queue tool observations
- `POST /sessions/:id/summarize` - Generate summary
- `GET /sessions/:id/status` - Check status
- `DELETE /sessions/:id` - Clean up session
- `GET /health` - Health check

### Database Schema (SQLite)

**Location**: `~/.claude-mem/claude-mem.db`
**Mode**: WAL (Write-Ahead Logging) for better concurrency

**Core Tables**:
- `sdk_sessions` - Session tracking (status, project, prompt_counter)
- `observations` - Individual tool executions with hierarchical fields
- `session_summaries` - AI-generated summaries (multiple per session)
- `user_prompts` - Raw user prompts with FTS5 search (v4.2.0+)

**FTS5 Virtual Tables** (for full-text search):
- `observations_fts` - Synced via triggers
- `session_summaries_fts` - Synced via triggers
- `user_prompts_fts` - Synced via triggers (v4.2.0+)

**Observation Structure**:
- `title` - Short description
- `subtitle` - Additional context (optional)
- `narrative` - Full explanation
- `facts` - JSON array of key facts
- `concepts` - JSON array of tags/concepts
- `files_read` - JSON array of file paths read
- `files_modified` - JSON array of file paths modified
- `type` - One of: decision, bugfix, feature, refactor, discovery, change

### MCP Search Server

**Configuration**: `plugin/.mcp.json`
**Entry Point**: `plugin/scripts/search-server.js`
**Transport**: stdio (communicates with Claude Code via stdin/stdout)

**8 Search Tools**:
1. `search_observations` - Full-text search across observations
2. `search_sessions` - Full-text search across session summaries
3. `search_user_prompts` - Full-text search across raw user prompts
4. `find_by_concept` - Find observations with specific concept tags
5. `find_by_file` - Find observations/sessions referencing file paths
6. `find_by_type` - Find observations by type (decision/bugfix/etc.)
7. `get_recent_context` - Get recent session context for a project
8. `advanced_search` - Combined search with multiple filters

**Citation Scheme**: `claude-mem://observation/{id}` or `claude-mem://session/{id}`

## Key Files and Their Purposes

### Hook Entry Points (src/bin/hooks/)
- `context-hook.ts` - SessionStart: Injects past context
- `new-hook.ts` - UserPromptSubmit: Creates session, saves user prompt
- `save-hook.ts` - PostToolUse: Captures tool observations
- `summary-hook.ts` - Stop: Generates session summary
- `cleanup-hook.ts` - SessionEnd: Marks session complete

### Hook Implementations (src/hooks/)
Contains the actual logic for each hook, separated from entry points for testability.

### Worker Service (src/services/)
- `worker-service.ts` - Express HTTP server, session management, PM2 entry point
- `sqlite/SessionStore.ts` - Primary database interface (better-sqlite3)
- `sqlite/SessionSearch.ts` - FTS5 full-text search service
- `sqlite/migrations.ts` - Database schema migrations
- `sqlite/Database.ts` - Legacy (bun:sqlite) - DO NOT USE

### SDK Integration (src/sdk/)
- `worker.ts` - Unix socket server, processes observations via Claude Agent SDK
- `prompts.ts` - XML prompt builders for init/observation/summary
- `parser.ts` - XML response parser for structured data extraction

### MCP Server (src/servers/)
- `search-server.ts` - MCP server exposing 8 search tools

### Utilities (src/utils/)
- `cli.ts` - **CRITICAL**: Cross-platform Claude executable finder
- `logger.ts` - Structured logging with color output
- `port-allocator.ts` - Dynamic port allocation for worker service

### Shared (src/shared/)
- `paths.ts` - Data directory and database path constants
- `config.ts` - Configuration loading
- `storage.ts` - **DEPRECATED**: Do not use, throws errors

### Build Scripts (scripts/)
- `build-hooks.js` - Builds all hooks, worker, and search server using esbuild

### Configuration Files
- `ecosystem.config.cjs` - PM2 configuration (logs, restart policy, port)
- `tsconfig.json` - TypeScript compiler options
- `package.json` - Dependencies, scripts, version
- `plugin/.mcp.json` - MCP server registration
- `plugin/hooks/hooks.json` - Hook definitions for Claude Code

## Database Migrations

Migrations are handled in `SessionStore` constructor:
1. `initializeSchema()` - Creates base tables if fresh database
2. `ensureWorkerPortColumn()` - Migration 5
3. `ensurePromptTrackingColumns()` - Migration 6
4. `removeSessionSummariesUniqueConstraint()` - Migration 7
5. `addObservationHierarchicalFields()` - Migration 8
6. `makeObservationsTextNullable()` - Migration 9
7. `createUserPromptsTable()` - Migration 10 (v4.2.0)

**Adding a New Migration**:
1. Add method to `SessionStore` class
2. Call in constructor after existing migrations
3. Use `schema_versions` table to track applied migrations
4. Make migrations idempotent (safe to run multiple times)

## Known Issues and Workarounds

### Windows Exit Code 3221225786 (STATUS_ACCESS_VIOLATION)

**Symptom**: Blank terminal windows spawn when SDK tries to use Claude executable

**Root Cause**: Windows-specific issue with Claude Agent SDK process spawning

**Impact**: Cosmetic annoyance - does NOT prevent memory system from working. Observations are still captured despite these errors.

**Status**: Known issue, no fix currently available

### Import.meta Warning During Build

**Symptom**: Warning about `import.meta` with "cjs" output format in `src/shared/paths.ts:14:31`

**Impact**: Non-critical build warning, doesn't affect functionality

**Status**: Expected warning due to ESM/CJS interop

## Troubleshooting Guide

### Worker Not Processing Observations

1. Check PM2 status: `npx pm2 status`
2. View error logs: `npx pm2 logs claude-mem-worker --err --lines 30 --nostream`
3. Common issue: Old built code running - rebuild and copy worker-service.cjs
4. Restart worker: `npx pm2 restart claude-mem-worker`

### TypeScript Compilation Errors

1. Run `npx tsc --noEmit` to see all errors
2. Common issues:
   - Missing type declarations (create in `src/types/`)
   - Incorrect function signatures (check SDK version)
   - Import path issues (use `.js` extension for imports)

### Database Locked Errors

1. Stop PM2 worker: `npx pm2 stop claude-mem-worker`
2. Check for stale connections: `lsof ~/.claude-mem/claude-mem.db` (macOS/Linux)
3. Restart worker: `npx pm2 start ecosystem.config.cjs`

### Hooks Not Firing

1. Check `plugin/scripts/` for built executables
2. Verify permissions: `ls -la plugin/scripts/*.js`
3. Test manually: `echo '{"session_id":"test-123","cwd":"'$(pwd)'","source":"startup"}' | node plugin/scripts/context-hook.js`

## Version History Notes

### v4.2.0 → v4.2.1 (Current)
- User prompt storage with FTS5 full-text search
- New `user_prompts` table and `search_user_prompts` MCP tool
- Migration 10: Creates user_prompts with FTS5 indexing
- Citations: `claude-mem://user-prompt/{id}` URI scheme

### v4.1.0
- Graceful session cleanup (marks complete vs DELETE)
- Fixed `/clear` command session interruption

### v4.0.0
- MCP Search Server with 8 specialized tools
- Data directory relocated to `${CLAUDE_PLUGIN_ROOT}/data/`
- Worker auto-starts in SessionStart hook
- HTTP REST API architecture

### v3.x
- Legacy SQLite storage backend
- Mintlify documentation (removed in v4.0)
- Data stored in `~/.claude-mem/` (changed in v4.0)

## Important Architectural Decisions

### Why HTTP REST API for Worker Communication?

**Problem**: Hooks have strict timeout limits (60-180s). Processing observations via Claude Agent SDK can take longer.

**Solution**: Hooks send observations to worker service via HTTP POST, then exit immediately. Worker processes asynchronously without blocking hooks.

### Why PM2 Process Management?

**Problem**: Worker service needs to survive across multiple Claude Code sessions. Node.js doesn't have built-in daemon support.

**Solution**: PM2 manages worker as long-running background process with auto-restart, log rotation, and graceful shutdown.

### Why FTS5 Full-Text Search?

**Problem**: Searching thousands of observations with LIKE queries is slow and inflexible.

**Solution**: SQLite FTS5 virtual tables provide fast full-text search with relevance ranking. Automatic sync triggers keep FTS5 tables in sync with main tables.

### Why Graceful Cleanup Instead of DELETE?

**Problem**: Aggressive session deletion (HTTP DELETE) interrupted summary generation when users ran `/clear`.

**Solution**: SessionEnd hook now marks sessions complete and lets workers finish naturally. Skips cleanup on `/clear` commands to preserve ongoing work.

## License

AGPL-3.0 - See LICENSE file for details
