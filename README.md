# Veridia Health

[cloudflarebutton]

A production-ready AI-powered chat application built on Cloudflare Workers, Durable Objects, and OpenAI. Features real-time streaming responses, intelligent tool integration, session management, and MCP server connectivity.

## Features

- Real-time AI chat with multiple model support (Gemini 2.5 Flash/Pro, Gemini 2.0)
- Streaming responses with live token updates
- Built-in tools: weather lookup and Google web search
- Model Context Protocol (MCP) integration for external tool servers
- Persistent chat sessions with activity tracking and custom titles
- Full session management (create, list, delete, rename)
- Modern React UI with Tailwind CSS, shadcn components, and dark mode
- Error reporting, boundary handling, and production-ready logging
- Cloudflare Workers + Durable Objects for scalable agent architecture

## Technology Stack

**Frontend**
- React 18 + TypeScript
- Vite
- Tailwind CSS + shadcn/ui
- React Router, TanStack Query, Immer, Framer Motion
- Sonner for toast notifications

**Backend**
- Cloudflare Workers
- Hono framework
- Cloudflare Durable Objects (ChatAgent, AppController)
- OpenAI SDK via Cloudflare AI Gateway
- MCP Client support

**Other**
- Bun (package manager and runtime)
- Wrangler for deployment

## Getting Started

### Prerequisites
- Node.js 18+
- Bun (recommended)
- Cloudflare account
- OpenAI-compatible API key (or Cloudflare AI Gateway credentials)

### Installation

```bash
bun install
```

### Local Development

```bash
bun run dev
```

The application will start at `http://localhost:3000`. The worker API runs at `/api/*`.

### Available Scripts

- `bun run dev` – Start local development server
- `bun run build` – Build production assets
- `bun run deploy` – Build and deploy to Cloudflare
- `bun run cf-typegen` – Generate Cloudflare types

## Usage

1. Open the application and start a new chat session.
2. Select different AI models from the available options.
3. Ask questions that trigger tools (e.g., "What's the weather in London?" or "Search for latest AI news").
4. Sessions are automatically saved and can be managed from the sidebar or API.

Example API routes:

- `GET /api/sessions` – List all sessions
- `POST /api/sessions` – Create a new session
- `DELETE /api/sessions/:id` – Delete a session
- Chat happens via `/api/chat/:sessionId/chat`

## Development

The project uses a strict separation between frontend (`src/`) and worker (`worker/`).

- Add new UI components to `src/components/`
- Extend AI capabilities in `worker/agent.ts`, `worker/chat.ts`, or `worker/tools.ts`
- Register new routes in `worker/userRoutes.ts`
- Customize session logic in `worker/app-controller.ts`

All TypeScript is strictly typed with path aliases (`@/*` and `@shared/*`).

## Deployment

Deploy to Cloudflare Workers with a single command:

```bash
bun run deploy
```

Before first deploy, update `wrangler.jsonc` with your Cloudflare AI Gateway credentials:

```json
"vars": {
  "CF_AI_BASE_URL": "https://gateway.ai.cloudflare.com/v1/YOUR_ACCOUNT_ID/YOUR_GATEWAY_ID/openai",
  "CF_AI_API_KEY": "your-cloudflare-api-key"
}
```

[cloudflarebutton]

After deployment, your application will be available at `https://your-worker.your-subdomain.workers.dev`.