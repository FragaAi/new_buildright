'use client';

import { usePDFSidebar } from '@/hooks/use-pdf-sidebar';
import { cn } from '@/lib/utils';

export function PDFSidebarContentWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  const { open } = usePDFSidebar();

  return (
    <div className={cn(
      'transition-all duration-200 ease-in-out',
      open ? 'mr-80' : 'mr-0'
    )}>
      {children}
    </div>
  );
} 