import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL
      ?? "http://127.0.0.1:3000",
  ),
  title: "Margen — lectura inteligente",
  description: "Lee, escucha, anota y estudia tus libros en un solo espacio privado.",
  openGraph: {
    title: "Margen",
    description: "Lectura inteligente, notas y estudio en un solo espacio privado.",
    type: "website",
    locale: "es_MX",
    images: [{ url: "/og.png", width: 1731, height: 909, alt: "Margen — lectura inteligente" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Margen",
    description: "Lectura inteligente, notas y estudio en un solo espacio privado.",
    images: ["/og.png"],
  },
  icons: {
    icon: "/og.png",
    shortcut: "/og.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
