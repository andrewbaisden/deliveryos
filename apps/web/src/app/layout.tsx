import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "DeliveryOS", template: "%s · DeliveryOS" },
  description: "Real-time last-mile delivery operations.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
