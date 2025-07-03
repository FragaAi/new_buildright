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
  documentType: string;
  createdAt: string;
  updatedAt: string;
  pageCount: number;
  firstPageThumbnail: string | null;
  pages: DocumentPage[];
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

  // Fetch documents when sidebar opens or chatId changes
  React.useEffect(() => {
    if (open && chatId) {
      fetchDocuments();
    }
  }, [open, chatId]);

  const fetchDocuments = async () => {
    if (!chatId) return;
    
    setLoading(true);
    try {
      const response = await fetch(`/api/documents/upload?chatId=${chatId}`);
      if (response.ok) {
        const data = await response.json();
        setDocuments(data.documents || []);
      }
    } catch (error) {
      console.error('Failed to fetch documents:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !chatId) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('chatId', chatId);
    
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }

    try {
      const response = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        // Refresh the documents list
        await fetchDocuments();
      } else {
        console.error('Upload failed');
      }
    } catch (error) {
      console.error('Upload error:', error);
    } finally {
      setUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
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

        {/* Upload Section - Only show for documents tab */}
        {activeTab === 'documents' && (
          <div className="border-b p-4">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              multiple
              onChange={handleFileUpload}
              className="hidden"
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || !chatId}
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
            <p className="mt-2 text-xs text-muted-foreground">
              Upload architectural plans, specifications, and other project documents
            </p>
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
                              />
                              {doc.pageCount > 1 && (
                                <div className="absolute -bottom-1 -right-1 bg-blue-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                                  {doc.pageCount}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="w-16 h-20 rounded border bg-muted flex items-center justify-center">
                              {doc.uploadStatus === 'processing' ? (
                                <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                              ) : (
                                <FileText className="h-6 w-6 text-muted-foreground" />
                              )}
                            </div>
                          )}
                        </div>

                        {/* Document Info */}
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

/* Document Viewer Component */
interface DocumentViewerProps {
  document: DocumentStatus;
  isOpen: boolean;
  onClose: () => void;
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
        </div>
      </div>
    </div>
  );
} 