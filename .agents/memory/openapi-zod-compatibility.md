---
name: OpenAPI integer compatibility
description: A workspace-specific generator/version constraint for numeric API schemas.
---

OpenAPI `integer` fields currently generate `zod.int()` in this workspace, but the installed Zod runtime is Zod 3 and does not provide that helper. Use numeric schemas without the integer format unless the generator/runtime versions are upgraded together.

**Why:** A valid OpenAPI schema can still fail the workspace typecheck when Orval emits helpers from a newer Zod API than the installed dependency.

**How to apply:** When extending `lib/api-spec/openapi.yaml`, prefer `type: number` for generated numeric fields until the Zod version is intentionally aligned with the generator.