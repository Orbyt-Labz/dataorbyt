import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Serve one of the landing-page HTML files from a Next.js route handler.
 * Route handlers don't render the app layout, so these pages have no app shell.
 */
export async function serveLandingHtml(request: Request, relativeFile: string) {
  const html = await readFile(path.join(process.cwd(), "landing-page", relativeFile), "utf8");
  // Social previews need an absolute image URL; the files ship a relative one.
  const origin = process.env.DATAORBYT_SITE_URL ?? new URL(request.url).origin;
  const body = html.replace('content="/landing-page/opengraph-image"', `content="${origin}/landing-page/opengraph-image"`);
  return new Response(body, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" },
  });
}
