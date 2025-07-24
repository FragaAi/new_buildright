/**
 * Document Classification System
 * Uses Gemini Vision API to intelligently classify architectural/engineering documents
 * Identifies document types, subtypes, sheet numbers, and disciplines
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import pRetry from 'p-retry';

export interface DocumentClassificationResult {
  primaryType: 'architectural' | 'structural' | 'electrical' | 'plumbing' | 'mechanical' | 'civil' | 'specifications' | 'other';
  subtype: 'plan' | 'elevation' | 'section' | 'detail' | 'schedule' | 'cover' | 'index' | 'notes' | 'specifications' | 'other';
  sheetNumber?: string;
  discipline?: string;
  confidence: number;
  aiAnalysis: {
    titleBlockInfo?: {
      projectName?: string;
      sheetTitle?: string;
      drawingNumber?: string;
      revisionInfo?: string;
    };
    detectedElements: string[];
    drawingType: string;
    scaleFactor?: string;
    reasoning: string;
  };
}

export interface PDFPageForClassification {
  pageNumber: number;
  imageUrl: string;
  textElements?: Array<{
    text: string;
    coordinates: { x: number; y: number; width: number; height: number };
  }>;
}

export class DocumentClassifier {
  private genAI: GoogleGenerativeAI;
  private model: any;

  constructor() {
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      throw new Error('GOOGLE_GENERATIVE_AI_API_KEY is required for document classification');
    }
    
    this.genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-pro' });
  }

  /**
   * Classify a document based on its pages (typically analyze first 2-3 pages)
   */
  async classifyDocument(pages: PDFPageForClassification[]): Promise<DocumentClassificationResult> {
    try {
      console.log(`🔍 Classifying document with ${pages.length} pages`);
      
      // Analyze the first few pages (title block usually on first page)
      const pagesToAnalyze = pages.slice(0, Math.min(3, pages.length));
      
      // Get the first page image for analysis
      const firstPage = pagesToAnalyze[0];
      if (!firstPage) {
        throw new Error('No pages available for classification');
      }

      // Fetch the image data
      const imageResponse = await fetch(firstPage.imageUrl);
      if (!imageResponse.ok) {
        throw new Error(`Failed to fetch image: ${imageResponse.status}`);
      }
      
      const imageBuffer = await imageResponse.arrayBuffer();
      const imageBase64 = Buffer.from(imageBuffer).toString('base64');

      // Create the classification prompt
      const prompt = this.createClassificationPrompt(pagesToAnalyze);

      console.log('📝 Sending classification request to Gemini Vision API...');

      // Analyze with Gemini Vision with retry logic
      const analysisText = await pRetry(
        async () => {
          console.log('🔄 Attempting document classification...');
      const result = await this.model.generateContent([
        {
          text: prompt
        },
        {
          inlineData: {
            mimeType: 'image/png',
            data: imageBase64
          }
        }
      ]);

      const response = await result.response;
          return response.text();
        },
        {
          retries: 2,
          minTimeout: 1000,
          maxTimeout: 4000,
          factor: 2,
          onFailedAttempt: (error) => {
            console.warn(`⚠️ Classification attempt ${error.attemptNumber} failed: ${error.message}`);
          },
        }
      );

      console.log('🤖 Gemini Vision Analysis:', analysisText);

      // Parse the AI response
      let classification = this.parseClassificationResponse(analysisText);
      
      // If confidence is low, try re-classification with enhanced prompt
      if (classification.confidence < 0.7) {
        console.log(`⚠️ Low confidence (${classification.confidence}), attempting re-classification with enhanced prompt...`);
        
        try {
          const enhancedPrompt = this.createEnhancedClassificationPrompt(pagesToAnalyze, classification);
          
          const enhancedAnalysisText = await pRetry(
            async () => {
              const result = await this.model.generateContent([
                {
                  text: enhancedPrompt
                },
                {
                  inlineData: {
                    mimeType: 'image/png',
                    data: imageBase64
                  }
                }
              ]);

              const response = await result.response;
              return response.text();
            },
            {
              retries: 1,
              minTimeout: 1500,
              onFailedAttempt: (error) => {
                console.warn(`⚠️ Enhanced classification attempt failed: ${error.message}`);
              },
            }
          );
          
          const enhancedClassification = this.parseClassificationResponse(enhancedAnalysisText);
          
          // Use enhanced result if confidence improved
          if (enhancedClassification.confidence > classification.confidence) {
            console.log(`✅ Enhanced classification improved confidence from ${classification.confidence} to ${enhancedClassification.confidence}`);
            classification = enhancedClassification;
          }
        } catch (enhancedError) {
          console.warn('Enhanced classification failed, using original result:', enhancedError);
        }
      }
      
      console.log('✅ Document classification completed:', classification);
      
      return classification;

    } catch (error) {
      console.error('❌ Document classification failed:', error);
      
      // Return a fallback classification
      return {
        primaryType: 'other',
        subtype: 'other',
        confidence: 0.1,
        aiAnalysis: {
          detectedElements: [],
          drawingType: 'unknown',
          reasoning: `Classification failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
      };
    }
  }

  /**
   * Create a detailed prompt for document classification
   */
  private createClassificationPrompt(pages: PDFPageForClassification[]): string {
    const textContent = pages
      .map(page => page.textElements?.map(el => el.text).join(' ') || '')
      .join(' ');

    return `
You are an expert architectural and engineering document classifier. Analyze this construction document page and provide a detailed classification.

CONTEXT:
- This is page ${pages[0].pageNumber} of a construction document set
- Text content extracted: "${textContent.substring(0, 500)}..."

ANALYSIS REQUIRED:
1. **Primary Type**: Identify the main discipline
   - architectural: Floor plans, elevations, sections, details
   - structural: Structural plans, framing, foundations
   - electrical: Electrical layouts, panel schedules, details
   - plumbing: Plumbing layouts, risers, details  
   - mechanical: HVAC layouts, equipment schedules
   - civil: Site plans, grading, utilities
   - specifications: Written specifications, notes
   - other: Cover sheets, indexes, general notes

2. **Subtype**: Identify the specific drawing type
   - plan: Floor plans, site plans, roof plans
   - elevation: Building elevations, interior elevations
   - section: Building sections, wall sections
   - detail: Construction details, enlarged views
   - schedule: Door/window schedules, equipment schedules
   - cover: Title page, cover sheet
   - index: Drawing index, sheet list
   - notes: General notes, specifications
   - other: Mixed or unclear content

3. **Sheet Information**: Extract from title block
   - Sheet number (e.g., "A-101", "S-200", "E-300")
   - Discipline code (A=Architectural, S=Structural, E=Electrical, etc.)

4. **Title Block Analysis**: Look for standard title block elements
   - Project name
   - Sheet title
   - Drawing number
   - Revision information
   - Scale information

5. **Visual Elements**: Identify key drawing elements
   - Architectural symbols (doors, windows, fixtures)
   - Structural elements (beams, columns, foundations)
   - MEP symbols (outlets, fixtures, equipment)
   - Dimensions and annotations
   - North arrows, scales, legends

RESPONSE FORMAT (JSON):
{
  "primaryType": "architectural|structural|electrical|plumbing|mechanical|civil|specifications|other",
  "subtype": "plan|elevation|section|detail|schedule|cover|index|notes|other",
  "sheetNumber": "extracted sheet number or null",
  "discipline": "A|S|E|P|M|C|G or extracted discipline code",
  "confidence": 0.0-1.0,
  "titleBlockInfo": {
    "projectName": "extracted project name or null",
    "sheetTitle": "extracted sheet title or null", 
    "drawingNumber": "extracted drawing number or null",
    "revisionInfo": "extracted revision info or null"
  },
  "detectedElements": ["list of visual elements detected"],
  "drawingType": "descriptive type like 'First Floor Plan' or 'Building Elevations'",
  "scaleFactor": "extracted scale info or null",
  "reasoning": "explanation of classification decision"
}

Focus on accuracy - if uncertain, choose the most likely option and indicate lower confidence.
`;
  }

  /**
   * Create an enhanced prompt for re-classification when confidence is low
   */
  private createEnhancedClassificationPrompt(pages: PDFPageForClassification[], previousClassification: DocumentClassificationResult): string {
    const textContent = pages
      .map(page => page.textElements?.map(el => el.text).join(' ') || '')
      .join(' ');

    return `
You are an expert architectural document classifier performing a detailed re-analysis. The initial classification had low confidence (${previousClassification.confidence}), so please provide a more detailed analysis.

CONTEXT:
- This is page ${pages[0].pageNumber} of a construction document set
- Previous classification: ${previousClassification.primaryType}/${previousClassification.subtype}
- Previous reasoning: ${previousClassification.aiAnalysis.reasoning}
- Text content: "${textContent.substring(0, 800)}..."

ENHANCED ANALYSIS REQUIRED:

1. **Visual Content Analysis**: Look carefully at:
   - Title blocks and headers
   - Drawing content and symbols
   - Text annotations and labels
   - Scale indicators and north arrows
   - Dimension lines and measurements
   - Room layouts and spaces
   - Technical symbols (electrical, plumbing, structural)

2. **Document Type Indicators**: Focus on these specific clues:
   - ARCHITECTURAL: Floor plans, room layouts, door/window schedules, elevations
     - Look for: room names, furniture layouts, door swings, window symbols
   - STRUCTURAL: Beam layouts, column grids, foundation plans, framing
     - Look for: beam callouts, column symbols, structural grid lines
   - ELECTRICAL: Panel schedules, lighting layouts, power plans
     - Look for: outlet symbols, light fixtures, electrical panels
   - PLUMBING: Fixture layouts, piping diagrams, water/waste lines
     - Look for: toilet/sink symbols, pipe runs, plumbing fixtures
   - MECHANICAL: HVAC layouts, equipment schedules, ductwork
     - Look for: air handlers, ductwork, HVAC equipment

3. **Sheet Number Analysis**: Look for standard format:
   - A-### (Architectural), S-### (Structural), E-### (Electrical)
   - P-### (Plumbing), M-### (Mechanical), C-### (Civil)

4. **Drawing Type Classification**:
   - PLAN: Top-down view showing layouts
   - ELEVATION: Side view showing building facades
   - SECTION: Cut-through view showing interior details
   - DETAIL: Enlarged view of specific construction elements
   - SCHEDULE: Tables listing doors, windows, or equipment

RESPONSE FORMAT (JSON):
{
  "primaryType": "architectural|structural|electrical|plumbing|mechanical|civil|specifications|other",
  "subtype": "plan|elevation|section|detail|schedule|cover|index|notes|other",
  "sheetNumber": "extracted sheet number or null",
  "discipline": "A|S|E|P|M|C|G or extracted discipline code",
  "confidence": 0.0-1.0,
  "titleBlockInfo": {
    "projectName": "extracted project name or null",
    "sheetTitle": "extracted sheet title or null", 
    "drawingNumber": "extracted drawing number or null",
    "revisionInfo": "extracted revision info or null"
  },
  "detectedElements": ["specific visual elements you can clearly identify"],
  "drawingType": "specific description like 'First Floor Plan' or 'Electrical Panel Schedule'",
  "scaleFactor": "extracted scale info or null",
  "reasoning": "detailed explanation of why you chose this classification based on visual evidence"
}

Provide higher confidence (0.8+) only if you can clearly identify multiple supporting visual elements.
`;
  }

  /**
   * Parse the AI response and extract classification data
   */
  private parseClassificationResponse(response: string): DocumentClassificationResult {
    try {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      return {
        primaryType: this.validatePrimaryType(parsed.primaryType),
        subtype: this.validateSubtype(parsed.subtype),
        sheetNumber: parsed.sheetNumber || undefined,
        discipline: parsed.discipline || undefined,
        confidence: Math.min(Math.max(parsed.confidence || 0.5, 0), 1),
        aiAnalysis: {
          titleBlockInfo: parsed.titleBlockInfo || {},
          detectedElements: Array.isArray(parsed.detectedElements) ? parsed.detectedElements : [],
          drawingType: parsed.drawingType || 'unknown',
          scaleFactor: parsed.scaleFactor || undefined,
          reasoning: parsed.reasoning || 'No reasoning provided'
        }
      };

    } catch (error) {
      console.error('Failed to parse classification response:', error);
      
      // Fallback parsing - try to extract information manually
      return this.fallbackParsing(response);
    }
  }

  /**
   * Validate and normalize primary type values
   */
  private validatePrimaryType(type: string): DocumentClassificationResult['primaryType'] {
    const validTypes: DocumentClassificationResult['primaryType'][] = [
      'architectural', 'structural', 'electrical', 'plumbing', 'mechanical', 'civil', 'specifications', 'other'
    ];
    
    if (validTypes.includes(type as any)) {
      return type as DocumentClassificationResult['primaryType'];
    }
    
    // Try to map common variations
    const normalized = type.toLowerCase();
    if (normalized.includes('arch')) return 'architectural';
    if (normalized.includes('struct')) return 'structural';
    if (normalized.includes('elec')) return 'electrical';
    if (normalized.includes('plumb')) return 'plumbing';
    if (normalized.includes('mech') || normalized.includes('hvac')) return 'mechanical';
    if (normalized.includes('civil') || normalized.includes('site')) return 'civil';
    if (normalized.includes('spec')) return 'specifications';
    
    return 'other';
  }

  /**
   * Validate and normalize subtype values
   */
  private validateSubtype(subtype: string): DocumentClassificationResult['subtype'] {
    const validSubtypes: DocumentClassificationResult['subtype'][] = [
      'plan', 'elevation', 'section', 'detail', 'schedule', 'cover', 'index', 'notes', 'specifications', 'other'
    ];
    
    if (validSubtypes.includes(subtype as any)) {
      return subtype as DocumentClassificationResult['subtype'];
    }
    
    return 'other';
  }

  /**
   * Fallback parsing when JSON parsing fails
   */
  private fallbackParsing(response: string): DocumentClassificationResult {
    const lowerResponse = response.toLowerCase();
    
    // Try to detect primary type from keywords
    let primaryType: DocumentClassificationResult['primaryType'] = 'other';
    if (lowerResponse.includes('architectural') || lowerResponse.includes('floor plan')) {
      primaryType = 'architectural';
    } else if (lowerResponse.includes('structural') || lowerResponse.includes('beam')) {
      primaryType = 'structural';
    } else if (lowerResponse.includes('electrical') || lowerResponse.includes('outlet')) {
      primaryType = 'electrical';
    }

    // Try to detect subtype
    let subtype: DocumentClassificationResult['subtype'] = 'other';
    if (lowerResponse.includes('plan')) subtype = 'plan';
    else if (lowerResponse.includes('elevation')) subtype = 'elevation';
    else if (lowerResponse.includes('section')) subtype = 'section';
    else if (lowerResponse.includes('detail')) subtype = 'detail';
    else if (lowerResponse.includes('schedule')) subtype = 'schedule';
    else if (lowerResponse.includes('cover')) subtype = 'cover';

    return {
      primaryType,
      subtype,
      confidence: 0.3, // Lower confidence for fallback parsing
      aiAnalysis: {
        detectedElements: [],
        drawingType: 'unknown',
        reasoning: 'Fallback parsing used due to response parsing error'
      }
    };
  }

  /**
   * Classify multiple documents and establish relationships
   */
  async classifyDocumentSet(documentPages: Array<{
    documentId: string;
    pages: PDFPageForClassification[];
  }>): Promise<Array<{
    documentId: string;
    classification: DocumentClassificationResult;
  }>> {
    const results = [];
    
    for (const doc of documentPages) {
      console.log(`🔍 Classifying document ${doc.documentId}...`);
      const classification = await this.classifyDocument(doc.pages);
      results.push({
        documentId: doc.documentId,
        classification
      });
    }
    
    return results;
  }
} 