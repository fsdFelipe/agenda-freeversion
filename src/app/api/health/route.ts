export const dynamic = "force-dynamic";
export function GET() {
  return Response.json(
    { application: "agenda-free", version: "1.0.0" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
