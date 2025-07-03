'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { 
  BookOpen, 
  Upload, 
  Plus, 
  Search, 
  Filter, 
  FileText, 
  Calendar,
  MapPin,
  Settings,
  CheckCircle,
  Clock,
  XCircle,
  AlertCircle,
  ExternalLink,
  RefreshCw
} from 'lucide-react';
import { BuildingCodeCreateForm } from '@/components/building-code-create-form';
import { BuildingCodeUploadForm } from '@/components/building-code-upload-form';

interface BuildingCode {
  id: string;
  codeName: string;
  codeAbbreviation: string;
  jurisdiction: string;
  codeType: string;
  isActive: boolean;
  description: string;
  officialUrl: string;
  createdAt: string;
  updatedAt: string;
  versions: Array<{
    id: string;
    version: string;
    effectiveDate: string;
    isDefault: boolean;
    processingStatus: string;
    sectionCount: number;
  }>;
}

interface BuildingCodeStats {
  totalCodes: number;
  activeCodesCount: number;
  codeTypes: string[];
  jurisdictions: string[];
}

/**
 * BUILDING CODE MANAGEMENT PAGE
 * Comprehensive interface for managing building codes and compliance
 */
export default function BuildingCodesPage() {
  const [codes, setCodes] = useState<BuildingCode[]>([]);
  const [stats, setStats] = useState<BuildingCodeStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filters
  const [filters, setFilters] = useState({
    codeType: '',
    jurisdiction: '',
    includeInactive: false,
    search: '',
  });

  // Modals
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [selectedCode, setSelectedCode] = useState<BuildingCode | null>(null);

  // Fetch building codes
  useEffect(() => {
    fetchBuildingCodes();
  }, [filters.codeType, filters.jurisdiction, filters.includeInactive]);

  const fetchBuildingCodes = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (filters.codeType) params.append('codeType', filters.codeType);
      if (filters.jurisdiction) params.append('jurisdiction', filters.jurisdiction);
      if (filters.includeInactive) params.append('includeInactive', 'true');

      const response = await fetch(`/api/building-codes?${params}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      setCodes(data.codes || []);
      setStats(data.stats || null);
      console.log('📋 Building codes loaded:', data.stats);

    } catch (err) {
      console.error('Failed to fetch building codes:', err);
      setError(err instanceof Error ? err.message : 'Failed to load building codes');
    } finally {
      setLoading(false);
    }
  };

  const filteredCodes = codes.filter(code =>
    code.codeName.toLowerCase().includes(filters.search.toLowerCase()) ||
    code.codeAbbreviation.toLowerCase().includes(filters.search.toLowerCase()) ||
    code.description?.toLowerCase().includes(filters.search.toLowerCase())
  );

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'processing':
        return <Clock className="h-4 w-4 text-blue-600" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'pending':
        return <AlertCircle className="h-4 w-4 text-yellow-600" />;
      default:
        return <Clock className="h-4 w-4 text-gray-600" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed': return 'Ready';
      case 'processing': return 'Processing';
      case 'failed': return 'Failed';
      case 'pending': return 'Pending';
      default: return 'Unknown';
    }
  };

  const getCodeTypeIcon = (codeType: string) => {
    switch (codeType) {
      case 'building': return '🏗️';
      case 'fire': return '🔥';
      case 'plumbing': return '🚰';
      case 'electrical': return '⚡';
      case 'mechanical': return '🔧';
      case 'energy': return '⚡';
      case 'accessibility': return '♿';
      case 'zoning': return '🗺️';
      case 'local': return '🏛️';
      default: return '📋';
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
          <div className="space-y-2">
            <div className="h-20 bg-gray-200 rounded"></div>
            <div className="h-20 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Card className="border-red-200">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 text-red-600 mb-2">
              <AlertCircle className="h-5 w-5" />
              <span className="font-medium">Error Loading Building Codes</span>
            </div>
            <p className="text-red-700 mb-4">{error}</p>
            <Button 
              variant="outline" 
              onClick={fetchBuildingCodes}
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <BookOpen className="h-8 w-8" />
            Building Code Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage building codes for compliance checking and analysis
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => setShowUploadForm(true)}
            variant="outline"
            className="gap-2"
          >
            <Upload className="h-4 w-4" />
            Upload Code
          </Button>
          <Button
            onClick={() => setShowCreateForm(true)}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Code
          </Button>
        </div>
      </div>

      {/* Statistics */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-blue-600">{stats.totalCodes}</div>
              <div className="text-sm text-muted-foreground">Total Codes</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-green-600">{stats.activeCodesCount}</div>
              <div className="text-sm text-muted-foreground">Active Codes</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-purple-600">{stats.codeTypes.length}</div>
              <div className="text-sm text-muted-foreground">Code Types</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-orange-600">{stats.jurisdictions.length}</div>
              <div className="text-sm text-muted-foreground">Jurisdictions</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-64">
              <Label htmlFor="search">Search Codes</Label>
              <Input
                id="search"
                placeholder="Search by name, abbreviation, or description..."
                value={filters.search}
                onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                className="mt-1"
              />
            </div>
            <div className="min-w-40">
              <Label>Code Type</Label>
              <Select
                value={filters.codeType || 'all'}
                onValueChange={(value) => setFilters(prev => ({ ...prev, codeType: value === 'all' ? '' : value }))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {stats?.codeTypes.map(type => (
                    <SelectItem key={type} value={type}>
                      {getCodeTypeIcon(type)} {type.charAt(0).toUpperCase() + type.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-40">
              <Label>Jurisdiction</Label>
              <Select
                value={filters.jurisdiction || 'all'}
                onValueChange={(value) => setFilters(prev => ({ ...prev, jurisdiction: value === 'all' ? '' : value }))}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="All Jurisdictions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Jurisdictions</SelectItem>
                  {stats?.jurisdictions.map(jurisdiction => (
                    <SelectItem key={jurisdiction} value={jurisdiction}>
                      <MapPin className="h-3 w-3 mr-1" />
                      {jurisdiction}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              onClick={() => setFilters(prev => ({ ...prev, includeInactive: !prev.includeInactive }))}
              className={filters.includeInactive ? 'bg-blue-50' : ''}
            >
              <Filter className="h-4 w-4 mr-1" />
              {filters.includeInactive ? 'Hide Inactive' : 'Show Inactive'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Building Codes List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">
            Building Codes ({filteredCodes.length})
          </h2>
          {filteredCodes.length !== codes.length && (
            <Badge variant="outline">
              Filtered from {codes.length} total
            </Badge>
          )}
        </div>

        {filteredCodes.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <BookOpen className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-medium mb-2">No Building Codes Found</h3>
              <p className="text-muted-foreground mb-4">
                {codes.length === 0
                  ? 'Get started by adding your first building code.'
                  : 'No codes match your current filters.'}
              </p>
              {codes.length === 0 ? (
                <Button onClick={() => setShowCreateForm(true)} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Add First Code
                </Button>
              ) : (
                <Button 
                  variant="outline" 
                  onClick={() => setFilters({ codeType: '', jurisdiction: '', includeInactive: false, search: '' })}
                >
                  Clear Filters
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {filteredCodes.map((code) => (
              <Card key={code.id} className={`transition-colors ${!code.isActive ? 'opacity-60' : ''}`}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-2xl">{getCodeTypeIcon(code.codeType)}</span>
                        <div>
                          <h3 className="text-lg font-semibold">{code.codeName}</h3>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Badge variant="outline">{code.codeAbbreviation}</Badge>
                            {code.jurisdiction && (
                              <>
                                <MapPin className="h-3 w-3" />
                                {code.jurisdiction}
                              </>
                            )}
                            <Calendar className="h-3 w-3" />
                            Added {new Date(code.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                      
                      {code.description && (
                        <p className="text-muted-foreground mb-3">{code.description}</p>
                      )}

                      {/* Versions */}
                      <div className="space-y-2">
                        <h4 className="font-medium text-sm">Versions ({code.versions.length})</h4>
                        <div className="grid gap-2">
                          {code.versions.map((version) => (
                            <div key={version.id} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                              <div className="flex items-center gap-2">
                                <Badge variant={version.isDefault ? 'default' : 'outline'}>
                                  v{version.version}
                                </Badge>
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  {getStatusIcon(version.processingStatus)}
                                  {getStatusText(version.processingStatus)}
                                </div>
                                <span className="text-xs text-muted-foreground">
                                  {version.sectionCount} sections
                                </span>
                              </div>
                              {version.effectiveDate && (
                                <span className="text-xs text-muted-foreground">
                                  Effective: {new Date(version.effectiveDate).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 ml-4">
                      {!code.isActive && (
                        <Badge variant="outline" className="text-red-600 border-red-200">
                          Inactive
                        </Badge>
                      )}
                      {code.officialUrl && (
                        <Button variant="outline" size="sm" asChild>
                          <a href={code.officialUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-3 w-3 mr-1" />
                            Official
                          </a>
                        </Button>
                      )}
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => {
                          setSelectedCode(code);
                          setShowUploadForm(true);
                        }}
                      >
                        <Upload className="h-3 w-3 mr-1" />
                        Upload
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Form Modals */}
      <BuildingCodeCreateForm 
        isOpen={showCreateForm}
        onClose={() => setShowCreateForm(false)}
        onSuccess={fetchBuildingCodes}
      />

      <BuildingCodeUploadForm 
        isOpen={showUploadForm}
        onClose={() => {
          setShowUploadForm(false);
          setSelectedCode(null);
        }}
        onSuccess={fetchBuildingCodes}
        codes={codes}
        selectedCode={selectedCode}
      />
    </div>
  );
} 