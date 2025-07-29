'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { usePDFSidebar } from '@/hooks/use-pdf-sidebar';
import { FileText, X, Upload, Loader2, CheckCircle, AlertCircle, Image, Eye, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AnalyticsDashboard } from '@/components/analytics-dashboard';

interface DocumentPage {
  id: string;
  pageNumber: number;
  pageType: string;
  imageUrl: string;
  thumbnailUrl: string;
  dimensions: {
    width: number;
    height: number;
    dpi: number;
  };
}

interface DocumentStatus {
  id: string;
  filename: string;
  originalFilename: string;
  uploadStatus: 'uploading' | 'processing' | 'ready' | 'failed';
  createdAt: string;
  pageCount: number;
  firstPageThumbnail?: string;
  pages?: DocumentPage[];
}

interface DocumentViewerProps {
  document: DocumentStatus;
  isOpen: boolean;
  onClose: () => void;
}

interface PDFSidebarProps {
  chatId?: string;
}

export function PDFSidebar({ chatId }: PDFSidebarProps) {
  const { open, toggle } = usePDFSidebar();
  const [documents, setDocuments] = React.useState<DocumentStatus[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [selectedDocument, setSelectedDocument] = React.useState<DocumentStatus | null>(null);
  const [activeTab, setActiveTab] = React.useState<'documents' | 'analytics'>('documents');
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Drag and drop state
  const [isDragOver, setIsDragOver] = React.useState(false);
  const [dragCounter, setDragCounter] = React.useState(0);

  // Polling state
  const [isPolling, setIsPolling] = React.useState(false);
  const pollingIntervalRef = React.useRef<NodeJS.Timeout | null>(null);

  // Track previous chatId to detect changes
  const prevChatIdRef = React.useRef<string | undefined>(chatId);

  // Reset documents state when chatId changes or becomes undefined
  React.useEffect(() => {
    const prevChatId = prevChatIdRef.current;
    
    // If chatId has changed (including from undefined to defined or vice versa)
    if (prevChatId !== chatId) {
      console.log('📄 PDF Sidebar - ChatId changed:', { from: prevChatId, to: chatId });
      
      // Reset state immediately
      setDocuments([]);
      setSelectedDocument(null);
      setLoading(false);
      
      // Stop any existing polling
      stopPolling();
      
      // Update the ref
      prevChatIdRef.current = chatId;
    }
  }, [chatId]);

  // Fetch documents when sidebar opens or chatId changes (and chatId exists)
  React.useEffect(() => {
    if (open && chatId) {
      console.log('📄 PDF Sidebar - Fetching documents for chat:', chatId);
      fetchDocuments();
    } else if (open && !chatId) {
      console.log('📄 PDF Sidebar - No chatId, showing empty state');
      // Ensure we show empty state when no chatId
      setDocuments([]);
    }
  }, [open, chatId]);

  // Polling effect - starts polling when there are processing documents
  React.useEffect(() => {
    const hasProcessingDocuments = documents.some(doc => 
      doc.uploadStatus === 'uploading' || doc.uploadStatus === 'processing'
    );

    // Only start polling if we have processing documents and we're not already polling
    if (hasProcessingDocuments && open && chatId && !isPolling) {
      console.log('📄 PDF Sidebar - Starting polling for processing documents');
      startPolling();
    }
    // Stop polling if no processing documents and we are currently polling
    else if (!hasProcessingDocuments && isPolling) {
      console.log('📄 PDF Sidebar - All documents processed, stopping polling');
      stopPolling();
    }
  }, [documents, open, chatId]); // Removed isPolling to avoid circular dependency

  // Cleanup polling on unmount
  React.useEffect(() => {
    return () => {
      stopPolling();
    };
  }, []);

  const startPolling = () => {
    if (pollingIntervalRef.current) return; // Already polling
    
    setIsPolling(true);
    pollingIntervalRef.current = setInterval(async () => {
      console.log('📄 PDF Sidebar - Polling for document status updates');
      await fetchDocuments(true); // Silent fetch without loading state
    }, 3000); // Poll every 3 seconds
  };

  const stopPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    setIsPolling(false);
  };

  const fetchDocuments = async (silentFetch = false) => {
    if (!chatId) return;
    
    try {
      if (!silentFetch) {
        setLoading(true);
      }
      
      const response = await fetch(`/api/documents/upload?chatId=${chatId}`);
        const data = await response.json();
      
      console.log('📋 Frontend - API Response:', data);
      console.log('📋 Frontend - Documents received:', data.documents?.length || 0);
      
      if (data.documents) {
        // Debug each document
        data.documents.forEach((doc: DocumentStatus, index: number) => {
          console.log(`📄 Frontend - Document ${index + 1}:`, {
            filename: doc.originalFilename,
            status: doc.uploadStatus,
            hasFirstPageThumbnail: !!doc.firstPageThumbnail,
            thumbnailUrl: doc.firstPageThumbnail,
            pageCount: doc.pageCount
          });
        });
        
        setDocuments(data.documents);
        
        // Only manage polling if this is not a silent fetch (i.e., not called from polling)
        if (!silentFetch) {
          // Check if we need to start polling
          const processingDocs = data.documents.filter((doc: DocumentStatus) => 
            doc.uploadStatus === 'uploading' || doc.uploadStatus === 'processing'
          );
          
          if (processingDocs.length > 0) {
            console.log(`🔄 Frontend - Starting polling for ${processingDocs.length} processing documents`);
            startPolling();
      } else {
            console.log('✅ Frontend - All documents ready, stopping polling');
            stopPolling();
          }
        }
      }
    } catch (error) {
      console.error('Error fetching documents:', error);
    } finally {
      if (!silentFetch) {
      setLoading(false);
    }
    }
  };

  // File processing function that handles both input change and drop
  const processFiles = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;

    // Convert FileList to Array if needed
    const fileArray = Array.from(files);
    
    // Validate file types (PDF only)
    const invalidFiles = fileArray.filter(file => file.type !== 'application/pdf');
    if (invalidFiles.length > 0) {
      alert(`Please select only PDF files. ${invalidFiles.length} invalid file(s) were ignored.`);
      // Filter out invalid files
      const validFiles = fileArray.filter(file => file.type === 'application/pdf');
      if (validFiles.length === 0) return;
    }

    // If no chatId, redirect to create new chat
    if (!chatId) {
      console.log('📄 PDF Sidebar - No chatId for upload, redirecting to create new chat first');
      window.location.href = '/';
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('chatId', chatId);
    
    // Enable Adobe PDF Extract API for enhanced processing
    // This will use Adobe extraction if credentials are configured
    formData.append('useAdobeExtract', 'true');
    
    // Add valid PDF files only
    const validFiles = fileArray.filter(file => file.type === 'application/pdf');
    for (const file of validFiles) {
      formData.append('files', file);
    }

    try {
      console.log('📄 PDF Sidebar - Starting upload for chat:', chatId);
      const response = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        console.log('📄 PDF Sidebar - Upload successful, refreshing documents');
        // Refresh the documents list immediately after upload
        await fetchDocuments();
        // Polling will automatically start if there are processing documents
      } else {
        console.error('📄 PDF Sidebar - Upload failed:', response.status);
      }
    } catch (error) {
      console.error('📄 PDF Sidebar - Upload error:', error);
    } finally {
      setUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      await processFiles(files);
    }
  };

  // Drag and drop event handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCounter(prev => prev + 1);
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragOver(true);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Show copy cursor to indicate drop is allowed
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCounter(prev => {
      const newCounter = prev - 1;
      if (newCounter === 0) {
        setIsDragOver(false);
      }
      return newCounter;
    });
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Reset drag state
    setIsDragOver(false);
    setDragCounter(0);

    // Get dropped files
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      await processFiles(files);
    }
  };

  const getStatusIcon = (status: DocumentStatus['uploadStatus']) => {
    switch (status) {
      case 'uploading':
      case 'processing':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      case 'ready':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <FileText className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusText = (status: DocumentStatus['uploadStatus']) => {
    switch (status) {
      case 'uploading':
        return 'Uploading...';
      case 'processing':
        return 'Processing...';
      case 'ready':
        return 'Ready';
      case 'failed':
        return 'Failed';
      default:
        return 'Unknown';
    }
  };

  const openDocumentViewer = (doc: DocumentStatus) => {
    setSelectedDocument(doc);
  };

  if (!open) return null;

  return (
    <>
    <div className={cn(
      'fixed inset-y-0 right-0 z-50 flex h-full w-80 flex-col border-l bg-background transition-transform duration-200 ease-in-out',
      open ? 'translate-x-0' : 'translate-x-full'
    )}>
      {/* Header */}
        <div className="border-b">
          <div className="flex h-14 items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <FileText size={16} />
              <span className="font-medium">Project Analysis</span>
              {/* Show polling indicator */}
              {isPolling && (
                <Loader2 className="h-3 w-3 animate-spin text-blue-500" />
              )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={toggle}
          className="h-8 w-8 p-0"
        >
          <X size={16} />
        </Button>
      </div>

          {/* Tab Navigation */}
          <div className="flex">
            <Button
              variant={activeTab === 'documents' ? 'secondary' : 'ghost'}
              className="flex-1 rounded-none border-r"
              onClick={() => setActiveTab('documents')}
            >
              <FileText className="mr-2 h-4 w-4" />
              Documents
            </Button>
            <Button
              variant={activeTab === 'analytics' ? 'secondary' : 'ghost'}
              className="flex-1 rounded-none"
              onClick={() => setActiveTab('analytics')}
            >
              <BarChart3 className="mr-2 h-4 w-4" />
              Analytics
            </Button>
          </div>
        </div>

        {/* Upload Section with Drag & Drop - Only show for documents tab */}
        {activeTab === 'documents' && (
          <div 
            className={cn(
              'border-b p-4 transition-all duration-200 ease-in-out',
              isDragOver && 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
            )}
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          multiple
          onChange={handleFileUpload}
          className="hidden"
        />
            
            {/* Drop Zone Visual */}
            <div className={cn(
              'rounded-lg border-2 border-dashed p-4 text-center transition-all duration-200',
              isDragOver 
                ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20' 
                : 'border-muted-foreground/25'
            )}>
              {isDragOver ? (
                <div className="space-y-2">
                  <Upload className="mx-auto h-8 w-8 text-blue-500" />
                  <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
                    Drop PDF files here
                  </p>
                  <p className="text-xs text-blue-500">
                    {!chatId ? "Start a conversation first" : "Multiple files supported"}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
        <Button
          onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
          className="w-full"
          variant="outline"
        >
          {uploading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Uploading...
            </>
          ) : (
            <>
              <Upload className="mr-2 h-4 w-4" />
              Upload PDFs
            </>
          )}
        </Button>
                  <p className="text-xs text-muted-foreground">
                    {!chatId 
                      ? "💬 Send a message first, then upload your documents"
                      : "📐 Drag & drop PDFs here or click to browse"
                    }
                  </p>
                  {isPolling && (
                    <p className="text-xs text-blue-500 flex items-center justify-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Processing documents...
                    </p>
                  )}
                </div>
              )}
            </div>
      </div>
        )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
          {activeTab === 'documents' ? (
        <div className="p-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
              ) : !chatId ? (
                <div className="space-y-4">
                  <div className="rounded-lg border-2 border-dashed border-muted-foreground/25 p-8 text-center">
                    <FileText className="mx-auto h-12 w-12 text-muted-foreground/50" />
                    <h3 className="mt-4 text-lg font-medium">No chat session</h3>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Start a new conversation to upload and analyze documents
                    </p>
                  </div>
                </div>
          ) : documents.length === 0 ? (
            <div className="space-y-4">
              <div className="rounded-lg border-2 border-dashed border-muted-foreground/25 p-8 text-center">
                <FileText className="mx-auto h-12 w-12 text-muted-foreground/50" />
                <h3 className="mt-4 text-lg font-medium">No documents uploaded</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Upload PDF documents to analyze architectural drawings and check building code compliance
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-muted-foreground">
                Uploaded Documents ({documents.length})
                    {isPolling && (
                      <span className="ml-2 text-xs text-blue-500">
                        • Processing...
                      </span>
                    )}
              </h4>
              {documents.map((doc) => (
                <div
                  key={doc.id}
                      className="rounded-lg border p-3 hover:bg-muted/50 transition-colors"
                >
                      <div className="flex items-start gap-3">
                        {/* Thumbnail */}
                        <div className="flex-shrink-0">
                          {doc.firstPageThumbnail && doc.uploadStatus === 'ready' ? (
                            <div className="relative">
                              <img
                                src={doc.firstPageThumbnail}
                                alt={`${doc.originalFilename} preview`}
                                className="w-16 h-20 object-cover rounded border bg-white"
                                loading="lazy"
                                onLoad={() => {
                                  console.log(`✅ Thumbnail loaded successfully: ${doc.originalFilename}`);
                                }}
                                onError={(e) => {
                                  console.error(`❌ Thumbnail failed to load: ${doc.originalFilename}`, e);
                                }}
                              />
                            </div>
                          ) : (
                            <div className="w-16 h-20 bg-gray-100 rounded border flex items-center justify-center">
                              <FileText className="w-8 h-8 text-gray-400" />
                            </div>
                          )}
                  </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                                {doc.originalFilename}
                    </p>
                              <div className="flex items-center gap-2 mt-1">
                                {getStatusIcon(doc.uploadStatus)}
                                <span className="text-xs text-muted-foreground">
                      {getStatusText(doc.uploadStatus)}
                                </span>
                              </div>
                              {doc.uploadStatus === 'ready' && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  {doc.pageCount} page{doc.pageCount !== 1 ? 's' : ''}
                    </p>
                              )}
                    <p className="text-xs text-muted-foreground">
                      {new Date(doc.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                            
                            {/* View Button */}
                            {doc.uploadStatus === 'ready' && doc.pageCount > 0 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openDocumentViewer(doc)}
                                className="h-6 w-6 p-0 ml-2"
                              >
                                <Eye className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Analytics Tab Content */
            chatId ? (
              <AnalyticsDashboard chatId={chatId} />
            ) : (
              <div className="p-4 text-center text-muted-foreground">
                <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No chat session available for analytics</p>
              </div>
            )
          )}
        </div>
      </div>

      {/* Document Viewer Modal */}
      {selectedDocument && (
        <DocumentViewer
          document={selectedDocument}
          isOpen={!!selectedDocument}
          onClose={() => setSelectedDocument(null)}
        />
      )}
    </>
  );
}

function DocumentViewer({ document, isOpen, onClose }: DocumentViewerProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50" 
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-background border rounded-lg shadow-lg max-w-4xl max-h-[90vh] w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h2 className="text-lg font-semibold truncate">
              {document.originalFilename}
            </h2>
            <p className="text-sm text-muted-foreground">
              {document.pageCount} page{document.pageCount !== 1 ? 's' : ''}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-8 w-8 p-0"
          >
            <X size={16} />
          </Button>
        </div>
        
        {/* Content */}
        <div className="p-4 overflow-y-auto max-h-[calc(90vh-100px)]">
          {document.pages && document.pages.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {document.pages.map((page) => (
              <div key={page.id} className="space-y-2">
                <div className="relative">
                  <img
                    src={page.imageUrl}
                    alt={`Page ${page.pageNumber}`}
                    className="w-full h-auto border rounded bg-white"
                    loading="lazy"
                  />
                  <div className="absolute top-2 left-2 bg-black/75 text-white text-xs px-2 py-1 rounded">
                    Page {page.pageNumber}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  {page.dimensions.width} × {page.dimensions.height}
                </p>
              </div>
            ))}
          </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No pages available for viewing</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 

// end of file