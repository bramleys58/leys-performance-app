/**
 * Where links in emails point to. On the live site always the real domain, so a link never
 * lands on the vercel.app address just because the coach happened to use that one.
 */
export function siteOrigin(requestOrigin: string | null | undefined): string {
  if (process.env.VERCEL_ENV === "production") return "https://app.leysperformance.be";
  return requestOrigin ?? "";
}
