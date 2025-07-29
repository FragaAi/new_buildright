import { 
  ServicePrincipalCredentials,
  PDFServices,
  MimeType,
  ExtractPDFParams,
  ExtractElementType,
  ExtractPDFJob,
  ExtractPDFResult,
  ExtractRenditionsElementType,
  SDKError,
  ServiceUsageError,
  ServiceApiError
} from '@adobe/pdfservices-node-sdk';
import { put } from '@vercel/blob';
import AdmZip from 'adm-zip';
import { Readable } from 'stream';

export interface AdobeExtractionResult {
  structuredData: any;
  tables: ExtractedTable[];
  figures: ExtractedFigure[];
  textElements: EnhancedTextElement[];
  documentStructure: DocumentNode[];
}

export interface ExtractedTable {
  tableIndex: number;
  bounds: Rectangle;
  csvData: string;
  renditionUrl?: string;
  xlsxUrl?: string;
  pngUrl?: string;
  cells: TableCell[];
  pageNumber: number;
  filePaths?: string[];
}

export interface ExtractedFigure {
  figureIndex: number;
  bounds: Rectangle;
  imageUrl: string;
  caption?: string;
  type: 'chart' | 'diagram' | 'image' | 'other';
  pageNumber: number;
  filePath?: string;
}

export interface EnhancedTextElement {
  text: string;
  coordinates: Rectangle;
  fontSize: number;
  fontFamily?: string;
  confidence?: number;
  pageNumber: number;
  path?: string;
  attributes?: {
    lineHeight?: number;
    textAlign?: string;
    isBold?: boolean;
    isItalic?: boolean;
  };
}

export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TableCell {
  rowIndex: number;
  colIndex: number;
  text: string;
  bounds: Rectangle;
}

export interface DocumentNode {
  type: string;
  path: string;
  children?: DocumentNode[];
  bounds?: Rectangle;
  pageNumber: number;
  text?: string;
}

export class AdobePDFExtractor {
  /**
   * Extract structured data from PDF using Adobe PDF Extract API
   */
  static async extractStructuredData(
    fileBuffer: Buffer,
    filename: string,
    chatId: string
  ): Promise<AdobeExtractionResult> {
    try {
      console.log(`🚀 Starting Adobe PDF Extract for ${filename}`);
      
      // Check if Adobe credentials are configured
      if (!this.isAvailable()) {
        throw new Error('Adobe PDF Services credentials not configured. Please set ADOBE_PDF_SERVICES_CLIENT_ID and ADOBE_PDF_SERVICES_CLIENT_SECRET environment variables.');
      }

      // Initialize Adobe PDF Services
      const credentials = new ServicePrincipalCredentials({
        clientId: process.env.ADOBE_PDF_SERVICES_CLIENT_ID!,
        clientSecret: process.env.ADOBE_PDF_SERVICES_CLIENT_SECRET!
      });

      const pdfServices = new PDFServices({ credentials });

      // Upload PDF to Adobe
      console.log(`📤 Uploading PDF to Adobe PDF Services...`);
      
      // Convert Buffer to ReadableStream for Adobe SDK
      const readableStream = new Readable({
        read() {
          this.push(fileBuffer);
          this.push(null); // End the stream
        }
      });
      
      const inputAsset = await pdfServices.upload({
        readStream: readableStream,
        mimeType: MimeType.PDF
      });

      // Configure extraction parameters for comprehensive extraction
      const params = new ExtractPDFParams({
        elementsToExtract: [
          ExtractElementType.TEXT,
          ExtractElementType.TABLES
        ],
        elementsToExtractRenditions: [
          ExtractRenditionsElementType.TABLES,
          ExtractRenditionsElementType.FIGURES
        ],
        addCharInfo: true,
        getStylingInfo: true
      });

      // Create and submit extraction job
      console.log(`⚙️ Creating Adobe extraction job...`);
      const job = new ExtractPDFJob({ inputAsset, params });
      const pollingURL = await pdfServices.submit({ job });

      // Wait for job completion
      console.log(`⏳ Waiting for Adobe extraction to complete...`);
      const pdfServicesResponse = await pdfServices.getJobResult({
        pollingURL,
        resultType: ExtractPDFResult
      });

      // Download and process results
      console.log(`📥 Processing Adobe extraction results...`);
      const result = pdfServicesResponse.result;
      if (!result) {
        throw new Error('No result received from Adobe PDF Services');
      }
      
      const resultAsset = result.resource;
      const streamAsset = await pdfServices.getContent({ asset: resultAsset });

      // Read the ZIP file stream
      const chunks: Buffer[] = [];
      const reader = streamAsset.readStream;
      
      for await (const chunk of reader) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      
      const zipBuffer = Buffer.concat(chunks);
      console.log(`📦 Received ZIP file: ${zipBuffer.length} bytes`);

      // Process the ZIP file
      const zip = new AdmZip(zipBuffer);
      const zipEntries = zip.getEntries();

      // Find and parse structured data
      const structuredDataEntry = zipEntries.find(entry => 
        entry.entryName === 'structuredData.json'
      );

      if (!structuredDataEntry) {
        throw new Error('structuredData.json not found in Adobe response');
      }

      const structuredData = JSON.parse(structuredDataEntry.getData().toString('utf8'));
      console.log(`📊 Parsed structured data: ${structuredData.elements?.length || 0} elements`);

      // Process elements and extract data
      const tables: ExtractedTable[] = [];
      const figures: ExtractedFigure[] = [];
      const textElements: EnhancedTextElement[] = [];
      const documentStructure: DocumentNode[] = [];

      // Process each element from Adobe extraction
      for (const element of structuredData.elements || []) {
        const pageNumber = this.extractPageNumber(element.Path || '');

        if (element.Path?.includes('Table')) {
          const table = await this.processTable(element, zip, filename, chatId, pageNumber);
          if (table) tables.push(table);
        } else if (element.Path?.includes('Figure')) {
          const figure = await this.processFigure(element, zip, filename, chatId, pageNumber);
          if (figure) figures.push(figure);
        } else if (element.Text) {
          const textElement = this.processTextElement(element, pageNumber);
          if (textElement) textElements.push(textElement);
        }

        // Build document structure
        if (element.Path) {
          const structureNode = this.processStructureElement(element, pageNumber);
          if (structureNode) documentStructure.push(structureNode);
        }
      }

      console.log(`✅ Adobe extraction complete: ${tables.length} tables, ${figures.length} figures, ${textElements.length} text elements`);

      return {
        structuredData,
        tables,
        figures,
        textElements,
        documentStructure
      };

    } catch (error) {
      console.error('❌ Adobe PDF extraction error:', error);
      if (error instanceof SDKError || error instanceof ServiceUsageError || error instanceof ServiceApiError) {
        throw new Error(`Adobe PDF Services error: ${error.message}`);
      }
      throw new Error(`Adobe PDF extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Process table element and upload renditions
   */
  private static async processTable(
    element: any,
    zip: AdmZip,
    filename: string,
    chatId: string,
    pageNumber: number
  ): Promise<ExtractedTable | null> {
    try {
      const tableIndex = element.TableIndex || Math.floor(Math.random() * 1000);
      const bounds = this.convertBounds(element.Bounds);

      // Find table files in ZIP
      const tableFiles = zip.getEntries().filter(entry => 
        entry.entryName.includes(`table_${tableIndex}`) ||
        entry.entryName.includes(`tables/table-${tableIndex}`)
      );

      let csvData = '';
      let xlsxUrl = '';
      let pngUrl = '';

      // Process each table file
      for (const file of tableFiles) {
        const fileData = file.getData();
        const fileName = file.entryName;

        if (fileName.endsWith('.csv')) {
          csvData = fileData.toString('utf8');
        } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.png')) {
          // Upload to Vercel Blob
          const extension = fileName.split('.').pop();
          const blobPath = `documents/${chatId}/${filename}/tables/table-${tableIndex}.${extension}`;
          
          const blob = await put(blobPath, fileData, {
            access: 'public',
            contentType: extension === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'image/png'
          });

          if (extension === 'xlsx') {
            xlsxUrl = blob.url;
          } else if (extension === 'png') {
            pngUrl = blob.url;
          }
        }
      }

      return {
        tableIndex,
        bounds,
        csvData,
        xlsxUrl,
        pngUrl,
        cells: [], // Would need additional processing to extract individual cells
        pageNumber,
        filePaths: tableFiles.map(f => f.entryName)
      };

    } catch (error) {
      console.warn(`⚠️ Failed to process table:`, error);
      return null;
    }
  }

  /**
   * Process figure element and upload rendition
   */
  private static async processFigure(
    element: any,
    zip: AdmZip,
    filename: string,
    chatId: string,
    pageNumber: number
  ): Promise<ExtractedFigure | null> {
    try {
      const figureIndex = element.FigureIndex || Math.floor(Math.random() * 1000);
      const bounds = this.convertBounds(element.Bounds);

      // Find figure files in ZIP
      const figureFiles = zip.getEntries().filter(entry => 
        entry.entryName.includes(`figure_${figureIndex}`) ||
        entry.entryName.includes(`figures/figure-${figureIndex}`)
      );

      let imageUrl = '';

      if (figureFiles.length > 0) {
        const figureFile = figureFiles[0];
        const fileData = figureFile.getData();
        
        // Upload to Vercel Blob
        const blobPath = `documents/${chatId}/${filename}/figures/figure-${figureIndex}.png`;
        
        const blob = await put(blobPath, fileData, {
          access: 'public',
          contentType: 'image/png'
        });

        imageUrl = blob.url;
      }

      return {
        figureIndex,
        bounds,
        imageUrl,
        caption: element.Title || element.AltText,
        type: this.determineFigureType(element),
        pageNumber,
        filePath: figureFiles[0]?.entryName
      };

    } catch (error) {
      console.warn(`⚠️ Failed to process figure:`, error);
      return null;
    }
  }

  /**
   * Process text element with enhanced information
   */
  private static processTextElement(element: any, pageNumber: number): EnhancedTextElement | null {
    try {
      if (!element.Text || !element.Bounds) return null;

      return {
        text: element.Text,
        coordinates: this.convertBounds(element.Bounds),
        fontSize: element.TextSize || 12,
        fontFamily: element.Font?.name,
        pageNumber,
        path: element.Path,
        attributes: {
          lineHeight: element.Attributes?.LineHeight,
          textAlign: element.Attributes?.TextAlign,
          isBold: element.Font?.weight === 'bold',
          isItalic: element.Font?.style === 'italic'
        }
      };
    } catch (error) {
      console.warn(`⚠️ Failed to process text element:`, error);
      return null;
    }
  }

  /**
   * Process document structure element
   */
  private static processStructureElement(element: any, pageNumber: number): DocumentNode | null {
    try {
      return {
        type: element.Path?.split('/').pop() || 'unknown',
        path: element.Path,
        bounds: element.Bounds ? this.convertBounds(element.Bounds) : undefined,
        pageNumber,
        text: element.Text
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Convert Adobe bounds format to our Rectangle format
   */
  private static convertBounds(bounds: any): Rectangle {
    if (!bounds || !Array.isArray(bounds) || bounds.length < 4) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    // Adobe uses [left, bottom, right, top] format
    const [left, bottom, right, top] = bounds;
    
    return {
      x: left,
      y: bottom,
      width: right - left,
      height: top - bottom
    };
  }

  /**
   * Extract page number from Adobe path
   */
  private static extractPageNumber(path: string): number {
    if (!path) return 1;
    
    const pageMatch = path.match(/Page\[(\d+)\]/);
    return pageMatch ? parseInt(pageMatch[1], 10) + 1 : 1; // Adobe uses 0-based indexing
  }

  /**
   * Determine figure type based on element properties
   */
  private static determineFigureType(element: any): 'chart' | 'diagram' | 'image' | 'other' {
    const text = (element.Text || '').toLowerCase();
    const altText = (element.AltText || '').toLowerCase();
    
    if (text.includes('chart') || text.includes('graph') || altText.includes('chart')) {
      return 'chart';
    }
    if (text.includes('diagram') || text.includes('plan') || altText.includes('diagram')) {
      return 'diagram';
    }
    if (text.includes('image') || text.includes('photo') || altText.includes('image')) {
      return 'image';
    }
    
    return 'other';
  }

  /**
   * Check if Adobe PDF Extract is available
   */
  static isAvailable(): boolean {
    return !!(process.env.ADOBE_PDF_SERVICES_CLIENT_ID && process.env.ADOBE_PDF_SERVICES_CLIENT_SECRET);
  }

  /**
   * Get configuration status for Adobe PDF Extract
   */
  static getConfigurationStatus(): {
    available: boolean;
    clientIdConfigured: boolean;
    clientSecretConfigured: boolean;
    message: string;
  } {
    const clientIdConfigured = !!process.env.ADOBE_PDF_SERVICES_CLIENT_ID;
    const clientSecretConfigured = !!process.env.ADOBE_PDF_SERVICES_CLIENT_SECRET;
    const available = clientIdConfigured && clientSecretConfigured;

    let message = '';
    if (!available) {
      const missing = [];
      if (!clientIdConfigured) missing.push('ADOBE_PDF_SERVICES_CLIENT_ID');
      if (!clientSecretConfigured) missing.push('ADOBE_PDF_SERVICES_CLIENT_SECRET');
      message = `Missing environment variables: ${missing.join(', ')}`;
    } else {
      message = 'Adobe PDF Services configured and ready';
    }

    return {
      available,
      clientIdConfigured,
      clientSecretConfigured,
      message
    };
  }
}

// end of file