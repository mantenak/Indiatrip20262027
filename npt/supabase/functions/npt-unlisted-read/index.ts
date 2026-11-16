// Public capability-link endpoint; the secret stays in Supabase Edge environment.
// No credentials or private data are embedded in the GitHub Pages application.
const ALLOWED_ORIGIN = "https://mantenak.github.io";
const headers = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Cache-Control": "no-store",
  "Vary": "Origin",
  "Content-Type": "application/json; charset=utf-8",
};
const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers });
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  const origin = req.headers.get("origin");
  if (origin && origin !== ALLOWED_ORIGIN) return reply({ error: "Origin not permitted" }, 403);
  let body: { token?: string };
  try { body = await req.json(); } catch { return reply({ error: "Invalid request" }, 400); }
  const token = body?.token || "";
  if (!/^[a-f0-9-]{36}$/i.test(token)) return reply({ error: "Invalid link" }, 404);
  const base = Deno.env.get("SUPABASE_URL");
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!base || !secret) return reply({ error: "Service unavailable" }, 503);
  const apiHeaders = { apikey: secret, Authorization: "Bearer " + secret };
  try {
    const accessUrl = new URL(base + "/rest/v1/npt_trip_links");
    accessUrl.searchParams.set("token", "eq." + token);
    accessUrl.searchParams.set("revoked_at", "is.null");
    accessUrl.searchParams.set("select", "trip_id,expires_at");
    accessUrl.searchParams.set("limit", "1");
    const accessResponse = await fetch(accessUrl, { headers: apiHeaders, cache: "no-store" });
    if (!accessResponse.ok) return reply({ error: "Link unavailable" }, 404);
    const links = await accessResponse.json();
    const link = links?.[0];
    if (!link || (link.expires_at && new Date(link.expires_at).getTime() < Date.now())) return reply({ error: "Link unavailable" }, 404);
    const tripUrl = new URL(base + "/rest/v1/npt_trips");
    tripUrl.searchParams.set("id", "eq." + link.trip_id);
    tripUrl.searchParams.set("visibility", "eq.unlisted");
    tripUrl.searchParams.set("select", "id,name,start_date,length_days,start_location,end_location,vehicle,preferences,parks,itinerary,route_segments,campgrounds,visibility,allow_copy");
    tripUrl.searchParams.set("limit", "1");
    const tripResponse = await fetch(tripUrl, { headers: apiHeaders, cache: "no-store" });
    if (!tripResponse.ok) return reply({ error: "Trip unavailable" }, 404);
    const trips = await tripResponse.json();
    if (!trips?.length) return reply({ error: "Trip unavailable" }, 404);
    return reply(trips[0]);
  } catch { return reply({ error: "Temporarily unavailable" }, 503); }
});
