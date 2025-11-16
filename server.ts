// @ts-nocheck
// Simple Bun dev server for static one-page apps with live reload
// Usage: PORT=5173 bun run server.ts

const port = Number(process.env.PORT || 5173);
const root = process.cwd().replace(/\\/g, "/");
const encoder = new TextEncoder();
const liveReloadClients = new Set<ReadableStreamDefaultController<Uint8Array>>();

function sanitizePath(pathname: string) {
  const clean = pathname.replace(/^\/+/, "");
  return clean;
}

function noCacheHeaders() {
  return {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  } as Record<string, string>;
}

async function fileResponse(path: string) {
  try {
    const file = Bun.file(path);
    const exists = typeof file.exists === "function" ? await file.exists() : true;
    if (!exists) return null;
    return new Response(file, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        ...noCacheHeaders(),
      },
    });
  } catch (err) {
    console.warn(`Skipping missing file: ${path}`, err?.message || err);
    return null;
  }
}

function livereloadResponse() {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      liveReloadClients.add(controller);
      controller.enqueue(encoder.encode(": connected\n\n"));
    },
    cancel(controller) {
      liveReloadClients.delete(controller);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function broadcastLiveReload(reason = "change") {
  if (!liveReloadClients.size) return;
  const payload = encoder.encode(`data: reload\nid: ${Date.now()}\ncomment: ${reason}\n\n`);
  for (const controller of [...liveReloadClients]) {
    try {
      controller.enqueue(payload);
    } catch (err) {
      console.warn("Live reload enqueue failed", err);
      liveReloadClients.delete(controller);
    }
  }
}

const server = Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);
    let pathname = decodeURIComponent(url.pathname);

    if (pathname === "/__livereload") {
      return livereloadResponse();
    }

    if (pathname.endsWith("/")) pathname += "index.html";

    const fsPath = `${root}/${sanitizePath(pathname)}`;

    let resp = await fileResponse(fsPath);

    if (!resp) {
      const asDirIndex = `${fsPath}/index.html`;
      resp = await fileResponse(asDirIndex);
    }

    if (!resp) {
      const fallback = `${root}/index.html`;
      resp = await fileResponse(fallback);
    }

    return (
      resp ||
      new Response("Not found", {
        status: 404,
        headers: { "Content-Type": "text/plain", ...noCacheHeaders() },
      })
    );
  },
});

console.log(`🔧 Bun dev server running at http://localhost:${server.port}`);

if (typeof Bun.watch === "function") {
  Bun.watch({
    cwd: root,
    debounce: 150,
    ignore: [".git", "node_modules", ".output", "dist", "build", "bun.lockb"],
    async onChange(event) {
      if (!event) return;
      const relative = event.path
        ?.replace(root, "")
        .replace(/^\\+/g, "")
        .replace(/^\/+/, "") ?? "file";
      console.log(`♻️  Change detected in ${relative}, notifying browsers...`);
      broadcastLiveReload(relative);
    },
  });
} else {
  console.warn("Bun.watch is unavailable; live reload disabled.");
}
