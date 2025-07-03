'use client';

import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { usePDFSidebar } from '@/hooks/use-pdf-sidebar';

export function PDFSidebarToggle() {
  const { toggle, open } = usePDFSidebar();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="default"
          onClick={toggle}
          className="bg-zinc-900 dark:bg-zinc-100 hover:bg-zinc-800 dark:hover:bg-zinc-200 text-zinc-50 dark:text-zinc-900 hidden md:flex py-1.5 px-2 h-fit md:h-[34px] order-4 md:ml-auto"
          data-testid="pdf-sidebar-toggle"
        >
          <FileText size={16} />
          <span className="ml-1">
            {open ? 'HIDE DOCS' : 'VIEW DOCS'}
          </span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {open ? 'Hide PDF Documents' : 'View PDF Documents'}
      </TooltipContent>
    </Tooltip>
  );
} 