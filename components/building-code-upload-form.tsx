'use client';

import React, { useState, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  X, 
  Upload, 
  File, 
  FileText, 
  CheckCircle, 
  AlertCircle,
  Loader2,
  Calendar,
  HardDrive,
  Clock
} from 'lucide-react';

interface BuildingCode {
  id: string;
  codeName: string;
  codeAbbreviation: string;
  jurisdiction: string;
  codeType: string;
  versions: Array<{
    id: string;
    version: string;
    processingStatus: string;
  }>;
}

interface UploadFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  codes: BuildingCode[];
  selectedCode?: BuildingCode | null;
}

interface UploadFormData {
  buildingCodeId: string;
  version: string;
  effectiveDate: string;
  file: File | null;
}

/**
 * BUILDING CODE UPLOAD FORM
 * Form for uploading building code documents
 */
export function BuildingCodeUploadForm({ 
  isOpen, 
  onClose, 
  onSuccess, 
  codes, 
  selectedCode 
}: UploadFormProps) {
  const [formData, setFormData] = useState<UploadFormData>({
    buildingCodeId: selectedCode?.id || '',
    version: '',
    effectiveDate: '',
    file: null,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const allowedTypes = [
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];

  const getFileIcon = (type: string) => {
    if (type === 'application/pdf') return '📄';
    if (type === 'text/plain') return '📝';
    if (type.includes('word')) return '📋';
    return '📎';
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleInputChange = (field: keyof UploadFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError(null);
  };

  const handleFileSelect = (file: File) => {
    if (!allowedTypes.includes(file.type)) {
      setError(`Invalid file type. Please upload: PDF, TXT, DOC, or DOCX files.`);
      return;
    }

    if (file.size > 50 * 1024 * 1024) { // 50MB limit
      setError('File size must be less than 50MB');
      return;
    }

    setFormData(prev => ({ ...prev, file }));
    setError(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const validateForm = (): string[] => {
    const errors: string[] = [];
    
    if (!formData.buildingCodeId) errors.push('Building code is required');
    if (!formData.version.trim()) errors.push('Version is required');
    if (!formData.file) errors.push('File is required');
    
    return errors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const validationErrors = validateForm();
    if (validationErrors.length > 0) {
      setError(validationErrors.join(', '));
      return;
    }

    setLoading(true);
    setError(null);
    setUploadProgress(0);

    try {
      const formDataToSend = new FormData();
      formDataToSend.append('file', formData.file!);
      formDataToSend.append('buildingCodeId', formData.buildingCodeId);
      formDataToSend.append('version', formData.version);
      if (formData.effectiveDate) {
        formDataToSend.append('effectiveDate', formData.effectiveDate);
      }

      console.log('📁 Uploading building code document:', {
        buildingCodeId: formData.buildingCodeId,
        version: formData.version,
        fileName: formData.file!.name,
        fileSize: formData.file!.size,
      });

      // Simulate progress (since we don't have real upload progress)
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + 10;
        });
      }, 200);

      const response = await fetch('/api/building-codes/upload', {
        method: 'POST',
        body: formDataToSend,
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const result = await response.json();
      console.log('✅ Building code uploaded:', result);

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onSuccess();
        onClose();
        resetForm();
      }, 2000);

    } catch (err) {
      console.error('Failed to upload building code:', err);
      setError(err instanceof Error ? err.message : 'Failed to upload building code');
      setUploadProgress(0);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      buildingCodeId: selectedCode?.id || '',
      version: '',
      effectiveDate: '',
      file: null,
    });
    setError(null);
    setSuccess(false);
    setUploadProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClose = () => {
    if (!loading) {
      resetForm();
      onClose();
    }
  };

  const selectedCodeData = codes.find(code => code.id === formData.buildingCodeId);

  if (!isOpen) return null;

  if (success) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="p-6 text-center">
            <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-green-800 mb-2">
              Upload Complete!
            </h3>
            <p className="text-green-700 mb-2">
              {formData.file?.name} has been successfully uploaded.
            </p>
            <p className="text-sm text-green-600">
              Processing will begin shortly...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload Building Code
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClose}
            disabled={loading}
          >
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>
        
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Building Code Selection */}
            <div className="space-y-4">
              <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                Code Information
              </h4>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="buildingCodeId">Building Code *</Label>
                  <Select
                    value={formData.buildingCodeId}
                    onValueChange={(value) => handleInputChange('buildingCodeId', value)}
                    disabled={loading}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select building code" />
                    </SelectTrigger>
                    <SelectContent>
                      {codes.map((code) => (
                        <SelectItem key={code.id} value={code.id}>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{code.codeAbbreviation}</Badge>
                            <span>{code.codeName}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="version">Version *</Label>
                  <Input
                    id="version"
                    placeholder="e.g., 2023, 2021"
                    value={formData.version}
                    onChange={(e) => handleInputChange('version', e.target.value)}
                    disabled={loading}
                    className="mt-1"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="effectiveDate">Effective Date</Label>
                <Input
                  id="effectiveDate"
                  type="date"
                  value={formData.effectiveDate}
                  onChange={(e) => handleInputChange('effectiveDate', e.target.value)}
                  disabled={loading}
                  className="mt-1"
                />
              </div>

              {/* Show existing versions if code is selected */}
              {selectedCodeData && selectedCodeData.versions.length > 0 && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                  <p className="text-sm font-medium text-blue-800 mb-2">
                    Existing Versions for {selectedCodeData.codeName}:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {selectedCodeData.versions.map((version) => (
                      <Badge key={version.id} variant="outline" className="text-xs">
                        v{version.version}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* File Upload */}
            <div className="space-y-4">
              <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                Document Upload
              </h4>
              
              <div
                className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                  dragOver
                    ? 'border-blue-500 bg-blue-50'
                    : formData.file
                    ? 'border-green-500 bg-green-50'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={allowedTypes.join(',')}
                  onChange={handleFileInputChange}
                  className="hidden"
                  disabled={loading}
                />
                
                {formData.file ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-2xl">{getFileIcon(formData.file.type)}</span>
                      <CheckCircle className="h-6 w-6 text-green-600" />
                    </div>
                    <p className="font-medium text-green-800">{formData.file.name}</p>
                    <p className="text-sm text-green-600">{formatFileSize(formData.file.size)}</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFormData(prev => ({ ...prev, file: null }));
                        if (fileInputRef.current) fileInputRef.current.value = '';
                      }}
                      disabled={loading}
                    >
                      Change File
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="h-12 w-12 mx-auto text-gray-400" />
                    <p className="text-gray-600 font-medium">
                      Drop your building code document here, or click to browse
                    </p>
                    <p className="text-sm text-gray-500">
                      Supports PDF, TXT, DOC, DOCX (max 50MB)
                    </p>
                  </div>
                )}
              </div>

              {loading && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Uploading...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <Progress value={uploadProgress} className="h-2" />
                </div>
              )}
            </div>

            {/* Error Display */}
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              </div>
            )}

            {/* Form Actions */}
            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading || !formData.file}
                className="gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    Upload Document
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
} 