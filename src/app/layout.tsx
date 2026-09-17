import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "婚礼宾客登记与抽奖",
  description: "现场扫码登记、自动分组与仪式抽奖",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
