'use client';

import * as React from 'react';

const PDF_SIDEBAR_COOKIE_NAME = 'pdf-sidebar:state';
const PDF_SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

type PDFSidebarContext = {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
};

const PDFSidebarContext = React.createContext<PDFSidebarContext | null>(null);

export function usePDFSidebar() {
  const context = React.useContext(PDFSidebarContext);
  if (!context) {
    throw new Error('usePDFSidebar must be used within a PDFSidebarProvider.');
  }
  return context;
}

export function PDFSidebarProvider({
  children,
  defaultOpen = false,
}: {
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpenState] = React.useState(defaultOpen);

  const setOpen = React.useCallback((value: boolean) => {
    setOpenState(value);
    // Save state to cookie
    document.cookie = `${PDF_SIDEBAR_COOKIE_NAME}=${value}; path=/; max-age=${PDF_SIDEBAR_COOKIE_MAX_AGE}`;
  }, []);

  const toggle = React.useCallback(() => {
    setOpen(!open);
  }, [open, setOpen]);

  const contextValue = React.useMemo<PDFSidebarContext>(
    () => ({
      open,
      setOpen,
      toggle,
    }),
    [open, setOpen, toggle],
  );

  return (
    <PDFSidebarContext.Provider value={contextValue}>
      {children}
    </PDFSidebarContext.Provider>
  );
} 