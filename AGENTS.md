# Brenda specific AGENTS.md
# Goes in D:\00_AI\Brenda\{PROYECTO}\{proyecto}

## Repository priorities

- Preserve a single codebase that works both locally and on Vercel unless explicitly requested otherwise.
- Prefer fixing configuration, routing, runtime, model, or environment mismatches before modifying application logic.
- Keep chat, voice, and realtime session flows consistent across local and production environments.
- Do not break working local behavior when addressing deployment issues unless required.

## Editing rules

- Prefer minimal, localized changes.
- Reuse existing patterns before introducing new abstractions.
- Do not refactor unrelated code.
- Avoid changing public interfaces unless necessary.
- Maintain compatibility between local and deployed environments.

## Brenda debugging order

When troubleshooting issues, follow this sequence:

1. Verify endpoint path and HTTP method
2. Verify environment variables (names + presence)
3. Verify local vs Vercel runtime differences
4. Verify model name, endpoint, and API version compatibility
5. Only then inspect application logic

Prefer root cause fixes over surface-level patches.

## Common failure patterns (Brenda-specific)

- Vercel route not found (missing /api prefix or wrong path)
- Function runtime mismatch or missing config
- Environment variables not set in Vercel
- Local works but deployed version fails
- Realtime session version mismatch (GA vs preview)
- Incorrect model string or endpoint usage
- Timeouts caused by wrong execution context

Always check these before deeper refactoring.

## Verification

- After endpoint changes, verify the exact route involved.
- After realtime/session changes, verify session creation and compatibility.
- After deployment changes, verify behavior on Vercel, not only locally.
- Clearly state:
  - what was tested locally
  - what was tested in production
  - what remains unverified

Do not assume production is fixed based on local success.

## Memory notes (project-specific)

Save only durable, reusable findings such as:
- confirmed Vercel routing or runtime fixes
- realtime auth or API version mismatch root causes
- working deployment configurations
- local vs production parity decisions
- recurring integration issues and their confirmed fixes

Do NOT save:
- transient logs
- raw tokens, API keys, or secrets
- full request/response payloads
- one-off errors without confirmed root cause

## Security

- Never expose or store API keys, tokens, or secrets
- Avoid logging or saving sensitive request/response data
- Redact sensitive values in any output or summaries

## Communication

- Be concise and technically precise
- Distinguish clearly between:
  - observed issue
  - root cause
  - change made
  - verification performed
  - remaining uncertainty