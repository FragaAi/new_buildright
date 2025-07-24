# Adobe PDF Extract API Integration Guide

## Overview

This guide explains how to integrate Adobe PDF Extract API with the BuildRight application for enhanced PDF processing capabilities.

## Benefits of Adobe PDF Extract API

### Current vs. Adobe Approach

| Feature | Current Implementation | With Adobe PDF Extract |
|---------|----------------------|-------------------------|
| Text Extraction | Basic text via pdf-parse | Precise text with coordinates |
| Table Detection | None | Professional table extraction + CSV |
| Figure Extraction | None | Automatic figure/diagram extraction |
| Document Structure | Limited | Complete document hierarchy |
| Coordinate Accuracy | Estimated | Exact PDF coordinates |
| Font Information | None | Full font and styling data |

### Specific Benefits for Building Code Compliance

1. **Enhanced Table Processing**: Extract complex zoning tables, compliance checklists, and regulatory requirements with cell-level precision
2. **Structured Data**: Get proper document hierarchy for better AI analysis of building codes
3. **Figure Extraction**: Automatically extract architectural diagrams, charts, and visual compliance elements
4. **Precise Positioning**: Exact coordinates for dimension callouts and regulatory annotations

## Setup Instructions

### 1. Adobe PDF Services Account

1. Visit [Adobe Developer Console](https://developer.adobe.com/document-services/)
2. Create a free account or sign in
3. Create a new project
4. Add "PDF Extract API" to your project
5. Generate credentials (Client ID and Client Secret)

### 2. Environment Configuration

Add these environment variables to your `.env.local` file:

```env
# Adobe PDF Services Configuration
ADOBE_PDF_SERVICES_CLIENT_ID=your_client_id_here
ADOBE_PDF_SERVICES_CLIENT_SECRET=your_client_secret_here

# Feature Flag (set to true to enable Adobe integration)
USE_ADOBE_EXTRACT=false
```

### 3. Cost Considerations

- Adobe PDF Extract API is usage-based
- Typical cost: $0.10-$0.50 per document depending on complexity
- Free tier available for testing (500 document transactions/month)
- Recommended: Start with feature flag `USE_ADOBE_EXTRACT=false` for testing

## Usage

### Basic Usage

```typescript
import { PDFProcessor } from '@/lib/pdf/processor';

// Process PDF with Adobe Extract (if enabled)
const result = await PDFProcessor.processPDF(
  fileBuffer,
  filename,
  chatId,
  true // Enable Adobe Extract
);

// Access enhanced data
if (result.pages[0].tables) {
  console.log('Tables found:', result.pages[0].tables.length);
}

if (result.pages[0].figures) {
  console.log('Figures found:', result.pages[0].figures.length);
}
```

### Configuration Check

```typescript
import { AdobePDFExtractor } from '@/lib/pdf/adobe-extractor';

// Check if Adobe PDF Extract is properly configured
const status = AdobePDFExtractor.getConfigurationStatus();
console.log(status.message);

if (status.available) {
  console.log('Adobe PDF Extract is ready to use');
} else {
  console.log('Missing credentials:', status);
}
```

## Enhanced Data Structures

### Tables
```typescript
interface ExtractedTable {
  tableIndex: number;
  bounds: Rectangle;
  csvData: string;        // Table as CSV format
  renditionUrl?: string;  // Table as image
  cells: TableCell[];     // Individual cell data
  pageNumber: number;
}
```

### Figures
```typescript
interface ExtractedFigure {
  figureIndex: number;
  bounds: Rectangle;
  imageUrl: string;       // Extracted figure image
  caption?: string;       // Figure caption if detected
  type: 'chart' | 'diagram' | 'image' | 'other';
  pageNumber: number;
}
```

### Enhanced Text Elements
```typescript
interface EnhancedTextElement {
  text: string;
  coordinates: Rectangle; // Precise PDF coordinates
  fontSize: number;
  fontFamily?: string;
  pageNumber: number;
  path?: string;         // Document structure path
  attributes?: {
    lineHeight?: number;
    textAlign?: string;
  };
}
```

## Implementation Status

### ✅ Completed
- Adobe PDF Services SDK installation
- Basic integration framework
- Enhanced data type definitions
- Configuration management
- Fallback to existing extraction

### 🚧 In Progress (Current Implementation)
- Placeholder Adobe extractor (returns empty results)
- Basic configuration checking
- Integration with existing PDF processor

### 📋 TODO (Full Implementation)
- Complete Adobe SDK integration
- ZIP file processing for renditions
- Error handling and retry logic
- Performance optimization
- Cost monitoring and usage tracking

## Testing Strategy

### Phase 1: Configuration Testing
1. Set up Adobe credentials
2. Enable `USE_ADOBE_EXTRACT=true`
3. Test configuration status endpoint
4. Verify placeholder response

### Phase 2: Full Integration Testing
1. Process sample building code documents
2. Compare extraction quality vs. current method
3. Validate table and figure extraction
4. Test with complex architectural drawings

### Phase 3: Production Rollout
1. Enable for select users/documents
2. Monitor API usage and costs
3. A/B test accuracy improvements
4. Gradual rollout based on results

## API Limits and Best Practices

### Rate Limits
- Standard tier: 6 requests per minute
- Check your tier limits in Adobe Developer Console

### File Size Limits
- Maximum file size: 100 MB
- Recommended: Optimize PDFs before processing

### Best Practices
1. **Caching**: Cache Adobe results to minimize repeat API calls
2. **Fallback**: Always have fallback to current extraction method
3. **Monitoring**: Track API usage and costs
4. **Error Handling**: Implement retry logic for transient failures

## Cost Optimization

### Strategies
1. **Selective Processing**: Only use Adobe API for complex documents
2. **Document Classification**: Identify documents that benefit most from enhanced extraction
3. **Caching**: Store extraction results to avoid reprocessing
4. **Batch Processing**: Process multiple documents together when possible

### ROI Considerations
For building code compliance applications:
- Enhanced accuracy reduces manual review time
- Better table extraction improves compliance checking
- Structured data reduces AI hallucination
- Professional-grade extraction justifies cost for critical documents

## Troubleshooting

### Common Issues

#### "Adobe PDF Services credentials not configured"
- Check environment variables are set correctly
- Verify client ID and secret are valid
- Ensure no trailing spaces in credentials

#### "Adobe PDF extraction failed"
- Check API rate limits
- Verify file is valid PDF
- Check file size limits
- Review Adobe Developer Console for quota

#### "No structured data found"
- Document may be scanned/image-based
- File may be corrupted
- Check Adobe API response format

### Debug Commands

```bash
# Check environment configuration
node -e "console.log('Client ID:', !!process.env.ADOBE_PDF_SERVICES_CLIENT_ID)"
node -e "console.log('Client Secret:', !!process.env.ADOBE_PDF_SERVICES_CLIENT_SECRET)"

# Test Adobe configuration
curl -X POST https://ims-na1.adobelogin.com/ims/token/v2 \
  -d "client_id=${ADOBE_PDF_SERVICES_CLIENT_ID}" \
  -d "client_secret=${ADOBE_PDF_SERVICES_CLIENT_SECRET}" \
  -d "grant_type=client_credentials"
```

## Support

- Adobe PDF Services Documentation: [https://developer.adobe.com/document-services/docs/](https://developer.adobe.com/document-services/docs/)
- Adobe Developer Support: [https://developer.adobe.com/support/](https://developer.adobe.com/support/)
- Community Forums: [https://community.adobe.com/](https://community.adobe.com/)

## Next Steps

1. **Set up Adobe Developer account** and get credentials
2. **Add environment variables** to your `.env.local` file
3. **Test configuration** using the status check endpoint
4. **Process sample documents** to see the enhanced data structure
5. **Plan gradual rollout** based on your application's needs

The integration is designed to enhance your existing PDF processing without breaking current functionality. You can enable/disable Adobe extraction per request or globally via environment variables. 