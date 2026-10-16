import type { Sql, Settings, Service, Booking, Block } from "./types.ts";
export async function getSettings(sql: Sql): Promise<Settings> {
  const row = (
    await sql.all<{ payload: string }>(
      "SELECT payload FROM agenda_settings WHERE id=1",
    )
  )[0];
  return JSON.parse(row.payload);
}
export async function getServices(sql: Sql): Promise<Service[]> {
  return (
    await sql.all<{ payload: string }>("SELECT payload FROM agenda_services")
  )
    .map((r) => JSON.parse(r.payload) as Service)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}
export async function getBookings(
  sql: Sql,
  from: string,
  to: string,
): Promise<Booking[]> {
  return (
    await sql.all<{ payload: string }>(
      "SELECT payload FROM agenda_bookings WHERE starts_at<? AND ends_at>? ORDER BY starts_at",
      [to, from],
    )
  ).map((r) => JSON.parse(r.payload));
}
export async function getBlocks(
  sql: Sql,
  from: string,
  to: string,
): Promise<Block[]> {
  return (
    await sql.all<{ payload: string }>(
      "SELECT payload FROM agenda_blocks WHERE starts_at<? AND ends_at>? ORDER BY starts_at",
      [to, from],
    )
  ).map((r) => JSON.parse(r.payload));
}
export async function getBooking(
  sql: Sql,
  id: string,
): Promise<Booking | null> {
  const row = (
    await sql.all<{ payload: string }>(
      "SELECT payload FROM agenda_bookings WHERE id=?",
      [id],
    )
  )[0];
  return row ? JSON.parse(row.payload) : null;
}
export async function updateBooking(sql: Sql, booking: Booking) {
  await sql.run(
    "UPDATE agenda_bookings SET starts_at=?,ends_at=?,status=?,payload=? WHERE id=?",
    [
      booking.startsAt,
      booking.endsAt,
      booking.status,
      JSON.stringify(booking),
      booking.id,
    ],
  );
}
