'use client';

import { PDFSidebar } from './pdf-sidebar';
import { useParams } from 'next/navigation';

export function PDFSidebarWrapper() {
  const params = useParams();
  const chatId = params.id as string || undefined;
  
  return <PDFSidebar chatId={chatId} />;
} 