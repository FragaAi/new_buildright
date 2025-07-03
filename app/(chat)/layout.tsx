import { cookies } from 'next/headers';

import { AppSidebar } from '@/components/app-sidebar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { PDFSidebarProvider } from '@/hooks/use-pdf-sidebar';
import { PDFSidebarWrapper } from '@/components/pdf-sidebar-wrapper';
import { PDFSidebarContentWrapper } from '@/components/pdf-sidebar-content-wrapper';
import { auth } from '../(auth)/auth';
import Script from 'next/script';

export const experimental_ppr = true;

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, cookieStore] = await Promise.all([auth(), cookies()]);
  const isCollapsed = cookieStore.get('sidebar:state')?.value !== 'true';
  const isPDFSidebarOpen = cookieStore.get('pdf-sidebar:state')?.value === 'true';

  return (
    <>
      <Script
        src="https://cdn.jsdelivr.net/pyodide/v0.23.4/full/pyodide.js"
        strategy="beforeInteractive"
      />
      <PDFSidebarProvider defaultOpen={isPDFSidebarOpen}>
        <SidebarProvider defaultOpen={!isCollapsed}>
          <AppSidebar user={session?.user} />
          <SidebarInset>
            <PDFSidebarContentWrapper>
              {children}
            </PDFSidebarContentWrapper>
          </SidebarInset>
        </SidebarProvider>
        <PDFSidebarWrapper />
      </PDFSidebarProvider>
    </>
  );
}
