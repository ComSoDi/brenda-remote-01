# iaBrenda API Module

## Request Validation
- Use [Zod / Pydantic] for all input schemas
- Validate before hitting the service layer
- Return 400 with field-level error details

## Response Envelope (mandatory — never deviate without updating Engram)
```json
{
  "success": true,
  "data": {},
  "timestamp": "ISO8601",
  "version": "1.0"
}
```

## Error Codes
- 400 Validation | 401 Unauthenticated | 403 Unauthorized
- 404 Not found | 429 Rate limited | 500 Internal (never expose stack traces)

## Pagination
- Cursor-based (not offset)
- Max page size: 100 | Default: 20 | Include `hasMore`

## Auth
- All routes require JWT unless decorated @public
- Refresh: POST /auth/refresh

## API Contract Stability Rules ⚠️
- Any change to the response envelope, pagination contract, or error codes
  MUST be stored in Engram as a [decision] before implementation
- If Engram shows a contract as [accepted], do not modify it without 
  explicit user confirmation — even for "improvements"
- Breaking changes require a version bump (/v2/) — never silently break /v1/
- Before adding a new endpoint: query Engram to check if a similar one exists
  or was previously rejected (avoid re-inventing or re-breaking things)

## Engram checks for API work:
- On starting API work: load accepted endpoint registry from Engram
- On completing an endpoint: mark it [accepted] in Engram with its contract
- On fixing a bug: store the fix in Engram tagged [bugfix] with root cause