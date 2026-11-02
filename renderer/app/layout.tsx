import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ChatUI Renderer · 文字、公式与交互图解",
  description: "统一呈现正文、公式、SVG 图形与本地交互。十组参考样例仅用于开发预览，不是独立聊天产品。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
