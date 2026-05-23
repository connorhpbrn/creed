import "server-only";

// Structured logging shim. Today this writes JSON to stdout (Vercel/Supabase
// logs auto-pick those up). The interface is shaped so we can swap in Sentry,
// DataDog, or OpenTelemetry by changing one file.

export type LogLevel = "info" | "warn" | "error";

export type LogContext = {
  requestId?: string;
  userId?: string;
  route?: string;
  method?: string;
  durationMs?: number;
  [key: string]: unknown;
};

function emit(level: LogLevel, message: string, context?: LogContext, error?: unknown) {
  const payload: Record<string, unknown> = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...context,
  };

  if (error instanceof Error) {
    payload.error = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  } else if (error !== undefined) {
    payload.error = error;
  }

  const line = JSON.stringify(payload);

  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const log = {
  info(message: string, context?: LogContext) {
    emit("info", message, context);
  },
  warn(message: string, context?: LogContext, error?: unknown) {
    emit("warn", message, context, error);
  },
  error(message: string, context?: LogContext, error?: unknown) {
    emit("error", message, context, error);
  },
};

export type RouteHandler<T extends Request = Request> = (
  request: T,
  ...args: unknown[]
) => Promise<Response> | Response;

/**
 * Wrap an API route handler so unhandled errors are logged with request
 * metadata and a 500 response is returned. Pair with the request-id middleware
 * so log lines correlate across services.
 */
export function withErrorLogging<T extends Request = Request>(
  routeName: string,
  handler: RouteHandler<T>
): RouteHandler<T> {
  return async (request, ...args) => {
    const requestId = request.headers.get("x-request-id") ?? undefined;
    const start = Date.now();

    try {
      const response = await handler(request, ...args);
      log.info("route", {
        route: routeName,
        method: request.method,
        requestId,
        status: response.status,
        durationMs: Date.now() - start,
      });
      return response;
    } catch (error) {
      log.error(
        "route_unhandled_error",
        {
          route: routeName,
          method: request.method,
          requestId,
          durationMs: Date.now() - start,
        },
        error
      );

      return new Response(
        JSON.stringify({
          error: "Internal Server Error",
          requestId,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }
  };
}
