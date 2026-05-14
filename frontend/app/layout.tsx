// frontend/app/layout.tsx
import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google'; // Using a clean font for our minimalist design

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'CoreMentor | AI-Powered Learning',
  description: 'Agentic educational ecosystem',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // Add suppressHydrationWarning here
    <html lang="en" suppressHydrationWarning> 
      {/* And add it here on the body */}
      <body className={`${inter.className} min-h-full flex flex-col bg-slate-50`} suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}