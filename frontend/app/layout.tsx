import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CoreMentor | AI-Powered Learning",
  description: "Local agentic learning platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col bg-slate-50" suppressHydrationWarning>{children}</body>
    </html>
  );
}
