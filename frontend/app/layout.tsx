import './globals.css';
import type { Metadata } from 'next';
import { TopNav } from '@/components/TopNav';
import { ThemeScript } from '@/components/ThemeScript';
import { Providers } from '@/components/Providers';

export const metadata: Metadata = {
  title: '百叙成章 · 需求文档 AI 协作系统',
  description: '让 AI 像资深产品经理一样主动问诊，把业务人员的大白话实时翻译成 PRD',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>
        <Providers>
          <TopNav />
          <main className="pt-12 min-h-screen">{children}</main>
        </Providers>
      </body>
    </html>
  );
}