import type { Metadata, Viewport } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: "Simulizer",
  description: "Visual physics simulation with block programming",
  metadataBase: new URL(process.env.NEXT_PUBLIC_FRONTEND_URL || "https://www.simulizer.net/"),
  openGraph: {
    images: ["/meta/opengraph.png"],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/meta/opengraph.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={` ${jetbrainsMono.variable} h-full`}
      
      data-theme="light"
      suppressHydrationWarning
    >
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css"
        />
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){
            try {
              var m = document.cookie.match(/(?:^|;\\s*)theme=([^;]+)/);
              if (m) document.documentElement.setAttribute('data-theme', m[1]);
            } catch(e) {}
          })();
        `.trim() }} />
      </head>
      <body className="min-h-full flex flex-col antialiased">{children}</body>
    </html>
  );
}
