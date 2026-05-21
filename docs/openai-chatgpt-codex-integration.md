# OpenAI / ChatGPT / Codex Integration Notes

This app now has a patient-facing `Conectar ChatGPT` entry point, but it does not pretend to hold a real ChatGPT account token in browser storage.

## What is safe to ship now

- Keep the Veridia patient UI usable without ChatGPT account linking.
- Present ChatGPT linking as an optional enhancement.
- Keep tokens out of localStorage/sessionStorage.
- Route real authenticated access through a server-side OAuth or Codex App Server flow.

## ChatGPT Apps / MCP path

For a ChatGPT App, Veridia should expose an MCP server with tools such as:

- `search`: read-only patient knowledge search with patient authorization.
- `fetch`: read-only source/document fetch with canonical URLs for citations.
- `show_patient_day`: render the patient-facing widget state.
- `upload_health_document`: mutating tool, auth required, non-destructive.
- `save_checkin`: mutating tool, auth required, non-destructive.

Best-practice requirements from the OpenAI Apps SDK docs:

- The MCP server defines tools, enforces auth, returns structured data, and points tools at UI templates.
- Widgets communicate through the MCP Apps bridge; `window.openai` is for ChatGPT-specific extensions.
- Tool descriptors should include accurate annotations like `readOnlyHint`, `destructiveHint`, and `openWorldHint`.
- For user-specific data or write actions, implement OAuth 2.1 and verify tokens on every request.
- ChatGPT only shows OAuth linking when the MCP server publishes auth metadata and returns `mcp/www_authenticate` challenges when auth is needed.

## Codex App Server path

The Codex App Server docs include a ChatGPT device-code login flow where the app server returns:

- `verificationUrl`
- `userCode`
- `loginId`

The frontend can show that device-code UX, then wait for `account/login/completed` and `account/updated` notifications. This is not the same as a normal web OAuth button inside Veridia; it requires a Codex App Server-style integration and should not be simulated as a real login until the server exists.

## Current product decision

The current UI exposes a truthful `Conectar ChatGPT` card that prepares the user journey without claiming a real linked session. The next implementation step is to choose one real route:

1. Build a Veridia ChatGPT App / MCP server with OAuth 2.1, or
2. Add a Codex App Server bridge for ChatGPT device-code login and agent sessions.

## Sources

- OpenAI Apps SDK MCP server docs: https://developers.openai.com/apps-sdk/build/mcp-server
- OpenAI Apps SDK authentication docs: https://developers.openai.com/apps-sdk/build/auth
- OpenAI Codex App Server ChatGPT device-code flow: https://developers.openai.com/codex/app-server#3b-log-in-with-chatgpt-device-code-flow
