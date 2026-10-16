import type { ReactNode } from "react";
import "./globals.css";
export const metadata = {
  title: "Agenda Free · Seu tempo, bem cuidado",
  description: "Agendamento online simples para um profissional.",
  icons: { icon: "/icon.svg" },
};
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
