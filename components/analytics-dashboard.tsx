'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { 
  BarChart3, 
  FileText, 
  Layers, 
  Ruler, 
  Search, 
  AlertCircle, 
  CheckCircle2,
  Clock,
  Archive,
  Filter,
  Eye,
  Grid,
  RefreshCw
} from 'lucide-react';

interface AnalyticsData {
  summary: {
    totalDocuments: number;
    totalPages: number;
    totalVisualElements: number;
    totalMeasurements: number;
    totalEmbeddings: number;
    processingComplete: boolean;
    extractionQuality: 'Good' | 'Partial' | 'None';
  };
  documents: Array<{
    id: string;
    filename: string;
    documentType: string;
    uploadStatus: string;
    pageCount: number;
  }>;
  visualElementStats: Array<{
    elementType: string;
    count: number;
  }>;
  measurementStats: Array<{
    measurementType: string;
    unit: string;
    count: number;
  }>;
  embeddingStats: Array<{
    contentType: string;
    count: number;
  }>;
  detailedVisualElements: Array<{
    id: string;
    elementType: string;
    confidence: string;
    textContent: string;
    pageNumber: string;
    documentFilename: string;
    thumbnailUrl: string;
  }>;
}

interface AnalyticsDashboardProps {
  chatId: string;
  selectedDocumentId?: string;
}

/**
 * PHASE 3: ANALYTICS DASHBOARD COMPONENT
 * Displays comprehensive analysis of extracted document data
 */
export function AnalyticsDashboard({ chatId, selectedDocumentId }: AnalyticsDashboardProps) {
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'elements' | 'measurements' | 'search'>('overview');

  // Fetch analytics data
  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const params = new URLSearchParams({ chatId });
        if (selectedDocumentId) {
          params.append('documentId', selectedDocumentId);
        }
        
        const response = await fetch(`/api/documents/analytics?${params}`);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        setAnalyticsData(data);
        console.log('📊 Analytics data loaded:', data.summary);
        
      } catch (err) {
        console.error('Failed to fetch analytics:', err);
        setError(err instanceof Error ? err.message : 'Failed to load analytics');
      } finally {
        setLoading(false);
      }
    };

    if (chatId) {
      fetchAnalytics();
    }
  }, [chatId, selectedDocumentId]);

  const getQualityBadgeColor = (quality: string) => {
    switch (quality) {
      case 'Good': return 'bg-green-100 text-green-800 border-green-300';
      case 'Partial': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'None': return 'bg-red-100 text-red-800 border-red-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getElementTypeIcon = (elementType: string) => {
    switch (elementType) {
      case 'wall': return '🧱';
      case 'door': return '🚪';
      case 'window': return '🪟';
      case 'room': return '🏠';
      case 'dimension': return '📏';
      case 'text_annotation': return '📝';
      case 'symbol': return '🔣';
      default: return '⚪';
    }
  };

  if (loading) {
    return (
      <div className="p-4 space-y-4 animate-pulse">
        <div className="h-8 bg-gray-200 rounded"></div>
        <div className="space-y-2">
          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4">
        <Card className="border-red-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-red-600 mb-2">
              <AlertCircle className="h-4 w-4" />
              <span className="font-medium">Analytics Error</span>
            </div>
            <p className="text-sm text-red-700">{error}</p>
            <Button 
              variant="outline" 
              size="sm" 
              className="mt-3"
              onClick={() => window.location.reload()}
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!analyticsData) {
    return (
      <div className="p-4 text-center text-gray-500">
        <Archive className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>No analytics data available</p>
      </div>
    );
  }

  const { summary, documents, visualElementStats, measurementStats, embeddingStats, detailedVisualElements } = analyticsData;

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <BarChart3 className="h-5 w-5" />
          Document Analytics
        </h2>
        {selectedDocumentId && (
          <Badge variant="outline" className="text-xs">
            Single Document View
          </Badge>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
        {[
          { key: 'overview', label: 'Overview', icon: Grid },
          { key: 'elements', label: 'Elements', icon: Layers },
          { key: 'measurements', label: 'Measurements', icon: Ruler },
          { key: 'search', label: 'Search Data', icon: Search },
        ].map((tab) => (
          <Button
            key={tab.key}
            variant={activeTab === tab.key ? 'default' : 'ghost'}
            size="sm"
            className="flex-1 h-8"
            onClick={() => setActiveTab(tab.key as typeof activeTab)}
          >
            <tab.icon className="h-3 w-3 mr-1" />
            {tab.label}
          </Button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {/* Summary Stats */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Processing Summary</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-2 gap-3">
                <div className="text-center">
                  <div className="text-xl font-bold text-blue-600">{summary.totalDocuments}</div>
                  <div className="text-xs text-gray-600">Documents</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-bold text-green-600">{summary.totalPages}</div>
                  <div className="text-xs text-gray-600">Pages</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-bold text-purple-600">{summary.totalVisualElements}</div>
                  <div className="text-xs text-gray-600">Elements</div>
                </div>
                <div className="text-center">
                  <div className="text-xl font-bold text-orange-600">{summary.totalMeasurements}</div>
                  <div className="text-xs text-gray-600">Measurements</div>
                </div>
              </div>

              <Separator className="my-3" />

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {summary.processingComplete ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <Clock className="h-4 w-4 text-yellow-600" />
                  )}
                  <span className="text-sm font-medium">
                    {summary.processingComplete ? 'Complete' : 'Processing'}
                  </span>
                </div>
                <Badge className={getQualityBadgeColor(summary.extractionQuality)}>
                  {summary.extractionQuality} Quality
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Document List */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Documents</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {documents.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{doc.filename}</div>
                      <div className="text-xs text-gray-600">
                        {doc.documentType} • {doc.pageCount} pages
                      </div>
                    </div>
                    <Badge 
                      variant={doc.uploadStatus === 'ready' ? 'default' : 'outline'}
                      className="text-xs"
                    >
                      {doc.uploadStatus}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Elements Tab */}
      {activeTab === 'elements' && (
        <div className="space-y-4">
          {/* Visual Elements Stats */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Visual Elements Detected</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="space-y-2">
                {visualElementStats.map((stat) => (
                  <div key={stat.elementType} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{getElementTypeIcon(stat.elementType)}</span>
                      <span className="text-sm font-medium capitalize">
                        {stat.elementType.replace('_', ' ')}
                      </span>
                    </div>
                    <Badge variant="outline">{stat.count}</Badge>
                  </div>
                ))}
              </div>
              {visualElementStats.length === 0 && (
                <div className="text-center py-4 text-gray-500 text-sm">
                  No visual elements detected yet
                </div>
              )}
            </CardContent>
          </Card>

          {/* Detailed Elements Preview */}
          {detailedVisualElements.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Recent Detections</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {detailedVisualElements.slice(0, 10).map((element) => (
                    <div key={element.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded text-xs">
                      <span>{getElementTypeIcon(element.elementType)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">
                          {element.elementType.replace('_', ' ')}
                        </div>
                        <div className="text-gray-600 truncate">
                          Page {element.pageNumber} • {element.documentFilename}
                        </div>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {Math.round(parseFloat(element.confidence || '0') * 100)}%
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Measurements Tab */}
      {activeTab === 'measurements' && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Measurements & Dimensions</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {measurementStats.map((stat, index) => (
                <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Ruler className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-medium capitalize">
                      {stat.measurementType}
                    </span>
                    {stat.unit && (
                      <Badge variant="outline" className="text-xs">
                        {stat.unit}
                      </Badge>
                    )}
                  </div>
                  <Badge variant="outline">{stat.count}</Badge>
                </div>
              ))}
            </div>
            {measurementStats.length === 0 && (
              <div className="text-center py-4 text-gray-500 text-sm">
                No measurements extracted yet
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Search Data Tab */}
      {activeTab === 'search' && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Semantic Search Data</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-3">
              <div className="text-sm text-gray-600">
                Embeddings enable AI-powered semantic search across your documents.
              </div>
              
              <div className="space-y-2">
                {embeddingStats.map((stat) => (
                  <div key={stat.contentType} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Search className="h-4 w-4 text-green-600" />
                      <span className="text-sm font-medium capitalize">
                        {stat.contentType} Content
                      </span>
                    </div>
                    <Badge variant="outline">{stat.count} chunks</Badge>
                  </div>
                ))}
              </div>

              {summary.totalEmbeddings > 0 && (
                <div className="mt-3 p-3 bg-green-50 rounded-lg border border-green-200">
                  <div className="flex items-center gap-2 text-green-800 text-sm font-medium">
                    <CheckCircle2 className="h-4 w-4" />
                    Search Ready
                  </div>
                  <div className="text-xs text-green-700 mt-1">
                    {summary.totalEmbeddings} searchable content chunks generated
                  </div>
                </div>
              )}

              {embeddingStats.length === 0 && (
                <div className="text-center py-4 text-gray-500 text-sm">
                  No embeddings generated yet
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
} 