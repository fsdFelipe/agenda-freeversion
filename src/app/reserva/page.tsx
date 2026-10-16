import { PrivateBooking } from "../../components/private-booking";
export const metadata = {
  title: "Minha reserva · Agenda Free",
  robots: { index: false, follow: false },
};
export default function Page() {
  return <PrivateBooking />;
}
