#!/usr/bin/env bash
#
# setup-hook.sh - Auto-install dependencies and run context hook
# This script handles path conversion for Windows/Unix compatibility
# and ensures dependencies are installed before running the context hook.

set -euo pipefail

# Logging functions
log_info() {
    echo "[setup-hook] INFO: $*" >&2
}

log_error() {
    echo "[setup-hook] ERROR: $*" >&2
}

log_debug() {
    if [[ "${DEBUG:-0}" == "1" ]]; then
        echo "[setup-hook] DEBUG: $*" >&2
    fi
}

# Convert Windows path to Unix path for bash compatibility
normalize_path() {
    local path="$1"
    
    # Try cygpath if available (Git Bash on Windows)
    if command -v cygpath >/dev/null 2>&1; then
        cygpath -u "$path" 2>/dev/null && return 0
    fi
    
    # Fallback: manual conversion for Git Bash/MSYS
    # Convert backslashes to forward slashes
    path="${path//\//}"
    
    # Convert Windows drive letter (C: -> /mnt/c or /c)
    if [[ "$path" =~ ^([A-Za-z]): ]]; then
        local drive="${BASH_REMATCH[1]}"
        drive=$(echo "$drive" | tr '[:upper:]' '[:lower:]')
        
        # Try /mnt/c style first (WSL style)
        if [[ -d "/mnt/$drive" ]]; then
            path="/mnt/$drive${path#[A-Za-z]:}"
        else
            # Fall back to /c style (Git Bash style)
            path="/$drive${path#[A-Za-z]:}"
        fi
    fi
    
    echo "$path"
}

# Main logic
main() {
    log_debug "CLAUDE_PLUGIN_ROOT: ${CLAUDE_PLUGIN_ROOT:-<not set>}"
    
    # Check if CLAUDE_PLUGIN_ROOT is set
    if [[ -z "${CLAUDE_PLUGIN_ROOT:-}" ]]; then
        log_error "CLAUDE_PLUGIN_ROOT environment variable is not set"
        exit 1
    fi
    
    # Normalize the plugin root path
    PLUGIN_ROOT=$(normalize_path "$CLAUDE_PLUGIN_ROOT")
    log_debug "Normalized PLUGIN_ROOT: $PLUGIN_ROOT"
    
    # Navigate to plugin parent directory
    PLUGIN_PARENT="$PLUGIN_ROOT/.."
    log_debug "Plugin parent directory: $PLUGIN_PARENT"
    
    if [[ ! -d "$PLUGIN_PARENT" ]]; then
        log_error "Plugin parent directory not found: $PLUGIN_PARENT"
        exit 1
    fi
    
    # Check if node_modules exists
    if [[ ! -d "$PLUGIN_PARENT/node_modules" ]]; then
        log_info "node_modules not found, running npm install..."
        
        cd "$PLUGIN_PARENT" || {
            log_error "Failed to cd to $PLUGIN_PARENT"
            exit 1
        }
        
        if ! npm install --silent 2>&1 | tee /tmp/claude-mem-install.log >&2; then
            log_error "npm install failed. Check /tmp/claude-mem-install.log for details"
            exit 1
        fi
        
        log_info "Dependencies installed successfully"
    else
        log_debug "node_modules found, skipping install"
    fi
    
    # Run the context hook
    CONTEXT_HOOK="$PLUGIN_ROOT/scripts/context-hook.js"
    log_debug "Running context hook: $CONTEXT_HOOK"
    
    if [[ ! -f "$CONTEXT_HOOK" ]]; then
        log_error "Context hook not found: $CONTEXT_HOOK"
        exit 1
    fi
    
    # Execute the context hook with node
    exec node "$CONTEXT_HOOK"
}

# Run main function
main "$@"
