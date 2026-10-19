import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

// Content checks for the standalone landing page. They guard the page's
// accuracy rules: working links, honest labels, and no unsupported claims.

const root = path.resolve(import.meta.dirname, "..");
const html = readFileSync(path.join(root, "landing-page", "index.html"), "utf8");
const text = html
  .replace(/<script[\s\S]*?<\/script>/g, "")
  .replace(/<style[\s\S]*?<\/style>/g, "")
  .replace(/<[^>]+>/g, " ")
  .replace(/\s+/g, " ");

describe("landing page links", () => {
  it("every in-page anchor points at an element that exists", () => {
    const targets = [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
    expect(targets.length).toBeGreaterThan(5);
    for (const t of new Set(targets)) expect(html, `missing id="${t}"`).toContain(`id="${t}"`);
  });

  it("every link into the app points at a route that exists", () => {
    const appLinks = [...html.matchAll(/href="(\/[^"]*)" data-app-link/g)].map((m) => m[1]);
    expect(appLinks.length).toBeGreaterThan(3);
    for (const href of new Set(appLinks)) {
      const segs = href.split("/").filter(Boolean);
      // Dynamic segments in the app router: /dashboards/[id]
      const candidates = [
        path.join(root, "src/app", ...segs, "page.tsx"),
        path.join(root, "src/app", ...segs.slice(0, -1), "[id]", "page.tsx"),
      ];
      expect(candidates.some(existsSync), `no route for ${href}`).toBe(true);
    }
  });
});

describe("landing page accuracy rules", () => {
  it("explains MCP in plain language the first time it appears", () => {
    const first = text.indexOf("MCP");
    expect(first).toBeGreaterThan(-1);
    expect(text.slice(first, first + 120)).toMatch(/standard way for AI assistants to access approved tools/);
  });

  it("labels illustrative and demo content", () => {
    expect((text.match(/Demo data/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(text).toMatch(/Illustrative/);
    expect(text).toMatch(/in development/i);
    expect(text).toMatch(/simulated/i);
  });

  it("does not promise things that aren't implemented", () => {
    expect(text).not.toMatch(/Get started/i);
    expect(text).not.toMatch(/live dashboard/i);
    expect(text).not.toMatch(/\b(GDPR|CCPA|SOC ?2|ISO ?27001|HIPAA)\b/);
    expect(text).not.toMatch(/\d+\s*(hours|hrs|x faster|% (cheaper|less|saved))/i);
    expect(text).not.toMatch(/testimonial|trusted by/i);
  });

  it("says plainly that the early-access form does not send anything", () => {
    expect(text).toMatch(/nothing is sent or stored/);
    expect(html).toMatch(/Your request was not sent/);
  });
});
