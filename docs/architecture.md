# Architecture

## Core principle

Keep the shared MCP server generic.

That means:
- auth is config-driven
- business selection is config-driven
- tool behavior is generic
- no private defaults in the core layer

## Layers

### 1. Core Plutio client
- OAuth token retrieval
- request wrapper
- endpoint helpers

### 2. MCP transport layer
- stdio server
- tool registration
- JSON schema inputs
- error shaping

### 3. Optional policy layer
Private or workspace-specific behavior should live outside the shared core, for example:
- default followers
- preferred project routing
- custom task drafting prompts
- workflow-specific confirmation rules

## Why this split matters

Without this separation, the MCP becomes tied to one company’s habits and stops being shareable.

With this separation:
- the public server stays portable
- the private workflow layer stays small and easy to swap out
