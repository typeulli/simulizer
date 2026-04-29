import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Simulizer",
  description: "Visual physics simulation with block programming",
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
