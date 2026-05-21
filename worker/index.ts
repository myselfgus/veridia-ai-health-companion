// Making changes to this file is **STRICTLY** forbidden. Please add your routes in `userRoutes.ts` file.

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { Env } from "./core-utils";
import { API_RESPONSES } from "./config";
import { ChatAgent } from "./agent";
import { AppController } from "./app-controller";
import { processDocumentJob, writeAuditEvent } from "./cell-store";
import type { DocumentJobMessage } from "./types";
export { ChatAgent, AppController };
export { DocumentProcessingWorkflow } from "./workflows";
export interface ClientErrorReport {
  message: string;
  url: string;
  userAgent: string;
  timestamp: string;
  stack?: string;
  componentStack?: string;
  errorBoundary?: boolean;
  errorBoundaryProps?: Record<string, unknown>;
  source?: string;
  lineno?: number;
  colno?: number;
  error?: unknown;
}

type UserRoutesModule = {
  userRoutes: (app: Hono<{ Bindings: Env }>) => void;
  coreRoutes: (app: Hono<{ Bindings: Env }>) => void;
};

let userRoutesLoaded = false;
let userRoutesLoadError: string | null = null;

const RETRY_MS = 750;
let nextRetryAt = 0;

const safeLoadUserRoutes = async (app: Hono<{ Bindings: Env }>) => {
  if (userRoutesLoaded) return;

  const now = Date.now();
  const shouldRetry = userRoutesLoadError !== null;
  if (shouldRetry && now < nextRetryAt) return;
  nextRetryAt = now + RETRY_MS;

  try {
    const mod = (await import("./userRoutes")) as UserRoutesModule;
    mod.userRoutes(app);
    mod.coreRoutes(app);
    userRoutesLoaded = true;
    userRoutesLoadError = null;
  } catch (e) {
    userRoutesLoadError = e instanceof Error ? e.message : String(e);
  }
};

const app = new Hono<{ Bindings: Env }>();

/** DO NOT TOUCH THE CODE BELOW THIS LINE */
// Middleware
app.use("*", logger());

app.use(
  "/api/*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Veridia-Patient-Id", "X-Patient-Id"],
  })
);


app.get("/api/health", (c) =>
  c.json({
    success: true,
    data: {
      status: "healthy",
      timestamp: new Date().toISOString(),
    },
  })
);

app.post("/api/client-errors", async (c) => {
  try {
    const errorReport = await c.req.json<ClientErrorReport>();
    console.error("[CLIENT ERROR]", {
      ...errorReport,
    });
    return c.json({ success: true });
  } catch (error) {
    console.error("[CLIENT ERROR HANDLER] Failed:", error);
    return c.json(
      {
        success: false,
        error: "Failed to process error report",
      },
      { status: 500 }
    );
  }
});

await safeLoadUserRoutes(app);

app.notFound((c) =>
  c.json(
    {
      success: false,
      error: API_RESPONSES.NOT_FOUND,
    },
    { status: 404 }
  )
);

export default {
  async fetch(request, env, ctx) {
    const pathname = new URL(request.url).pathname;

    if (
      !userRoutesLoaded &&
      pathname.startsWith("/api/") &&
      pathname !== "/api/health" &&
      pathname !== "/api/client-errors"
    ) {
      await safeLoadUserRoutes(app);
      if (userRoutesLoadError) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "Worker routes failed to load",
            detail: userRoutesLoadError,
          }),
          { status: 500, headers: { "content-type": "application/json" } },
        );
      }
    }

    return app.fetch(request, env, ctx);
  },
  async queue(batch, env) {
    for (const message of batch.messages) {
      const payload = message.body as DocumentJobMessage;
      try {
        if (env.DOCUMENT_WORKFLOW) {
          await env.DOCUMENT_WORKFLOW.create({
            id: `document-${payload.jobId}`,
            params: payload,
          });
        } else {
          await processDocumentJob(env, payload);
        }
        await writeAuditEvent(env, payload.patientId, 'document.queue', 'DOCUMENT_QUEUE', 'ok', {
          documentId: payload.documentId,
          jobId: payload.jobId,
        });
        message.ack();
      } catch (error) {
        await writeAuditEvent(env, payload.patientId, 'document.queue', 'DOCUMENT_QUEUE', 'failed', {
          documentId: payload.documentId,
          jobId: payload.jobId,
          error: error instanceof Error ? error.message : String(error),
        }).catch(() => undefined);
        message.retry();
      }
    }
  },
} satisfies ExportedHandler<Env, DocumentJobMessage>;
