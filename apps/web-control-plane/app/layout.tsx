import type { ReactNode } from "react";

import "./globals.css";

export const metadata = {
  title: "Presence360 Control Plane",
  description: "Presence360 Control Plane",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
