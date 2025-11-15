// Simple Bun dev server for static one-page apps
// Usage: PORT=5173 bun run server.ts

const port = Number(process.env.PORT || 5173);
const root = process.cwd().replace(/\\/g, "/");

function sanitizePath(pathname: string) {
  // Remove leading slashes and normalize to prevent traversal
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

function fileResponse(path: string) {
  const file = Bun.file(path);
  // @ts-ignore - exists is available on Bun.file
  if ((file as any).exists?.() === false) return null;
  return new Response(file, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      ...noCacheHeaders(),
    },
  });
}

const server = Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);
    let pathname = decodeURIComponent(url.pathname);

    // default directory index handling
    if (pathname.endsWith("/")) pathname += "index.html";

    const fsPath = `${root}/${sanitizePath(pathname)}`;

    // Try exact file
    let resp = fileResponse(fsPath);

    // Try directory index if not found
    if (!resp) {
      const asDirIndex = `${fsPath}/index.html`;
      resp = fileResponse(asDirIndex);
    }

    // Fallback to root index.html (handy for SPA-style routes)
    if (!resp) {
      const fallback = `${root}/index.html`;
      resp = fileResponse(fallback);
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
