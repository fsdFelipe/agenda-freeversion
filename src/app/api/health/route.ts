import { connection } from "next/server";
export async function GET() {
  await connection();
  return Response.json(
    { application: "agenda-free", version: "1.0.0" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
