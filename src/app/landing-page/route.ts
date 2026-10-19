import { serveLandingHtml } from "../../../landing-page/serve";

// Serves the current marketing page (landing-page/index.html) at /landing-page.
// The HTML file is the single source of truth: it also opens directly from disk.
export function GET(request: Request) {
  return serveLandingHtml(request, "index.html");
}
