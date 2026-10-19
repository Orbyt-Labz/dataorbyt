import { serveLandingHtml } from "../../../../landing-page/serve";

// Side-by-side comparison of the archived v1 page and the current page.
export function GET(request: Request) {
  return serveLandingHtml(request, "compare.html");
}
