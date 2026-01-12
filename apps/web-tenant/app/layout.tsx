import type { ReactNode } from "react";

import "./globals.css";

export const metadata = {
  title: "Presence360 Tenant",
  description: "Presence360 Tenant App",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
