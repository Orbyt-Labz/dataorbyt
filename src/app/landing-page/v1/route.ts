import { serveLandingHtml } from "../../../../landing-page/serve";

// Archived first version of the landing page (Oct 16), kept for comparison.
export function GET(request: Request) {
  return serveLandingHtml(request, "v1/index.html");
}
