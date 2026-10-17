import { connection } from "next/server";
import { handleAgenda } from "../../../modules/agenda/runtime";
export async function GET(request: Request) {
  await connection();
  return handleAgenda(request);
}
export const POST = handleAgenda;
