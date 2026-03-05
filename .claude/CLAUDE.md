# Project conventions

## Stack
NestJS, TypeScript, PostgreSQL with raw pg (no ORM), pnpm monorepo.

## Code patterns
- All DB access through repository classes, never in services directly
- Raw SQL with pg PoolClient, follow existing patterns in apps/api/src and apps/worker/src
- Transactions: BEGIN/COMMIT/ROLLBACK with client.release() in finally
- Error handling: selective catch by error.code, never catch-all
- Logging: logger from @pkg/shared, always include { service: 'api'|'worker' }
- Types: TypeScript interfaces for internal types, Zod schemas only for external input validation
- No decorators-based validation (class-validator) — use Zod + parseOrThrow pattern

## File structure
- Repository: DB queries only
- Service: business logic only, calls repository
- Controller: HTTP layer only, calls service
- Errors: domain errors in errors.ts per module, isUniqueViolation() utility

## Reference implementations
- Transaction pattern: apps/api/src/ingest.controller.ts
- Idempotency pattern: apps/worker/src/handlers/subscription-activation.service.ts
- Job claiming: apps/worker/src/jobs/job.repository.ts

## Function design
- Single responsibility: each function does one thing only
- Keep functions small and focused — if a function exceeds ~20 lines,
  treat it as a signal to consider splitting, not as a hard rule
- No mixed concerns in a single function
  (e.g. no validation + DB write + logging in the same block)
- Compose behavior by calling smaller functions,
  not by growing existing ones
- One level of abstraction per function: high-level orchestration
  functions call low-level operations, never mix the two