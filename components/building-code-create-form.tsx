'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { X, Plus, Loader2, CheckCircle } from 'lucide-react';

interface CreateCodeFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface FormData {
  codeName: string;
  codeAbbreviation: string;
  jurisdiction: string;
  codeType: string;
  description: string;
  officialUrl: string;
  version: string;
  effectiveDate: string;
}

/**
 * BUILDING CODE CREATE FORM
 * Form for creating new building codes
 */
export function BuildingCodeCreateForm({ isOpen, onClose, onSuccess }: CreateCodeFormProps) {
  const [formData, setFormData] = useState<FormData>({
    codeName: '',
    codeAbbreviation: '',
    jurisdiction: '',
    codeType: '',
    description: '',
    officialUrl: '',
    version: '',
    effectiveDate: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const codeTypes = [
    { value: 'building', label: '🏗️ Building', description: 'General building construction' },
    { value: 'fire', label: '🔥 Fire', description: 'Fire safety and prevention' },
    { value: 'plumbing', label: '🚰 Plumbing', description: 'Plumbing systems' },
    { value: 'electrical', label: '⚡ Electrical', description: 'Electrical systems' },
    { value: 'mechanical', label: '🔧 Mechanical', description: 'HVAC and mechanical systems' },
    { value: 'energy', label: '⚡ Energy', description: 'Energy efficiency' },
    { value: 'accessibility', label: '♿ Accessibility', description: 'ADA compliance' },
    { value: 'zoning', label: '🗺️ Zoning', description: 'Land use and zoning' },
    { value: 'local', label: '🏛️ Local', description: 'Local municipality codes' },
  ];

  const handleInputChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError(null);
  };

  const validateForm = (): string[] => {
    const errors: string[] = [];
    
    if (!formData.codeName.trim()) errors.push('Code name is required');
    if (!formData.codeAbbreviation.trim()) errors.push('Code abbreviation is required');
    if (!formData.codeType) errors.push('Code type is required');
    
    if (formData.codeAbbreviation.length > 10) {
      errors.push('Code abbreviation must be 10 characters or less');
    }
    
    if (formData.officialUrl && !formData.officialUrl.startsWith('http')) {
      errors.push('Official URL must start with http:// or https://');
    }

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

    try {
      console.log('📝 Creating building code:', formData);

      const response = await fetch('/api/building-codes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const result = await response.json();
      console.log('✅ Building code created:', result);

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onSuccess();
        onClose();
        resetForm();
      }, 1500);

    } catch (err) {
      console.error('Failed to create building code:', err);
      setError(err instanceof Error ? err.message : 'Failed to create building code');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      codeName: '',
      codeAbbreviation: '',
      jurisdiction: '',
      codeType: '',
      description: '',
      officialUrl: '',
      version: '',
      effectiveDate: '',
    });
    setError(null);
    setSuccess(false);
  };

  const handleClose = () => {
    if (!loading) {
      resetForm();
      onClose();
    }
  };

  if (!isOpen) return null;

  if (success) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="p-6 text-center">
            <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-green-800 mb-2">
              Building Code Created!
            </h3>
            <p className="text-green-700">
              {formData.codeName} has been successfully added to the system.
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
            <Plus className="h-5 w-5" />
            Create Building Code
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
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Basic Information */}
            <div className="space-y-4">
              <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                Basic Information
              </h4>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="codeName">Code Name *</Label>
                  <Input
                    id="codeName"
                    placeholder="e.g., Florida Building Code"
                    value={formData.codeName}
                    onChange={(e) => handleInputChange('codeName', e.target.value)}
                    disabled={loading}
                    className="mt-1"
                  />
                </div>
                
                <div>
                  <Label htmlFor="codeAbbreviation">Abbreviation *</Label>
                  <Input
                    id="codeAbbreviation"
                    placeholder="e.g., FBC"
                    value={formData.codeAbbreviation}
                    onChange={(e) => handleInputChange('codeAbbreviation', e.target.value.toUpperCase())}
                    disabled={loading}
                    maxLength={10}
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="codeType">Code Type *</Label>
                  <Select
                    value={formData.codeType}
                    onValueChange={(value) => handleInputChange('codeType', value)}
                    disabled={loading}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select code type" />
                    </SelectTrigger>
                    <SelectContent>
                      {codeTypes.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          <div>
                            <div>{type.label}</div>
                            <div className="text-xs text-muted-foreground">{type.description}</div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="jurisdiction">Jurisdiction</Label>
                  <Input
                    id="jurisdiction"
                    placeholder="e.g., Florida, California"
                    value={formData.jurisdiction}
                    onChange={(e) => handleInputChange('jurisdiction', e.target.value)}
                    disabled={loading}
                    className="mt-1"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Brief description of this building code..."
                  value={formData.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  disabled={loading}
                  rows={3}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="officialUrl">Official URL</Label>
                <Input
                  id="officialUrl"
                  type="url"
                  placeholder="https://example.com/building-code"
                  value={formData.officialUrl}
                  onChange={(e) => handleInputChange('officialUrl', e.target.value)}
                  disabled={loading}
                  className="mt-1"
                />
              </div>
            </div>

            {/* Initial Version (Optional) */}
            <div className="space-y-4">
              <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
                Initial Version (Optional)
              </h4>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="version">Version</Label>
                  <Input
                    id="version"
                    placeholder="e.g., 2023, 2021"
                    value={formData.version}
                    onChange={(e) => handleInputChange('version', e.target.value)}
                    disabled={loading}
                    className="mt-1"
                  />
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
              </div>
            </div>

            {/* Error Display */}
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-700">{error}</p>
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
                disabled={loading}
                className="gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    Create Code
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