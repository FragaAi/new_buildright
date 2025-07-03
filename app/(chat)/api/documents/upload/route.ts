import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/app/(auth)/auth';
import { put } from '@vercel/blob';
import { PDFProcessor } from '@/lib/pdf/processor';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { projectDocument, documentPage, visualElement, measurement, multimodalEmbedding } from '@/lib/db/schema';
import { generateUUID } from '@/lib/utils';

// Database connection
// biome-ignore lint: Forbidden non-null assertion.
const client = postgres(process.env.POSTGRES_URL!);
const db = drizzle(client);

export const maxDuration = 60; // Allow up to 60 seconds for processing

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse form data
    const formData = await request.formData();
    const files = formData.getAll('files') as File[];
    const chatId = formData.get('chatId') as string;

    if (!chatId) {
      return NextResponse.json({ error: 'Chat ID is required' }, { status: 400 });
    }

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files uploaded' }, { status: 400 });
    }

    const results = [];

    // Process each uploaded file
    for (const file of files) {
      try {
        // Validate file
        if (!file.type.includes('pdf')) {
          results.push({
            filename: file.name,
            status: 'error',
            error: 'Only PDF files are allowed',
          });
          continue;
        }

        // Convert file to buffer
        const fileBuffer = Buffer.from(await file.arrayBuffer());

        // Validate PDF format
        if (!PDFProcessor.validatePDF(fileBuffer)) {
          results.push({
            filename: file.name,
            status: 'error',
            error: 'Invalid PDF file format',
          });
          continue;
        }

        // Check file size (limit to 50MB)
        const maxSize = 50 * 1024 * 1024; // 50MB
        if (fileBuffer.length > maxSize) {
          results.push({
            filename: file.name,
            status: 'error',
            error: 'File size exceeds 50MB limit',
          });
          continue;
        }

        // Generate unique filename
        const timestamp = Date.now();
        const cleanFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const uniqueFilename = `${timestamp}_${cleanFilename}`;

        // Upload original PDF to Vercel Blob
        const pdfBlob = await put(
          `documents/${chatId}/originals/${uniqueFilename}`,
          fileBuffer,
          {
            access: 'public',
            contentType: 'application/pdf',
          }
        );

        // Create database record with 'uploading' status
        const [documentRecord] = await db
          .insert(projectDocument)
          .values({
            id: generateUUID(),
            chatId,
            filename: uniqueFilename,
            originalFilename: file.name,
            fileUrl: pdfBlob.url,
            fileSize: fileBuffer.length.toString(),
            mimeType: file.type,
            documentType: 'other', // Will be determined during processing
            uploadStatus: 'uploading',
          })
          .returning();

        // Start processing in the background
        processDocumentInBackground(documentRecord.id, fileBuffer, uniqueFilename, chatId);

        results.push({
          filename: file.name,
          documentId: documentRecord.id,
          status: 'processing',
          message: 'File uploaded successfully, processing started',
        });
      } catch (error) {
        console.error(`Error processing file ${file.name}:`, error);
        results.push({
          filename: file.name,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return NextResponse.json({
      message: 'Upload completed',
      results,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Process document in the background (non-blocking)
 */
async function processDocumentInBackground(
  documentId: string,
  fileBuffer: Buffer,
  filename: string,
  chatId: string
) {
  try {
            // Update status to 'processing'
        await db
          .update(projectDocument)
          .set({ 
            uploadStatus: 'processing',
            updatedAt: new Date(),
          })
          .where(eq(projectDocument.id, documentId));

    console.log(`Starting PDF processing for document ${documentId}`);

    // Process the PDF
    const processingResult = await PDFProcessor.processPDF(
      fileBuffer,
      filename,
      chatId
    );

    console.log(`PDF processing completed for document ${documentId}. Pages: ${processingResult.pages.length}`);

    // Save processed pages to database
    const pageInserts = processingResult.pages.map((page) => ({
      id: generateUUID(),
      documentId,
      pageNumber: page.pageNumber.toString(),
      pageType: 'other' as const, // Will be determined by AI later
      imageUrl: page.imageUrl,
      thumbnailUrl: page.thumbnailUrl,
      dimensions: page.dimensions,
      scaleInfo: null, // Will be determined by AI later
    }));

    const insertedPages = await db.insert(documentPage).values(pageInserts).returning();

    // Save all extracted data from Phase 1 processing
    for (let i = 0; i < processingResult.pages.length; i++) {
      const page = processingResult.pages[i];
      const dbPage = insertedPages[i];

      // Save visual elements (detected by Gemini Vision)
      if (page.visualElements && page.visualElements.length > 0) {
        const visualElementInserts = page.visualElements.map((element) => ({
          id: generateUUID(),
          pageId: dbPage.id,
          elementType: element.type,
          boundingBox: element.boundingBox,
          confidence: element.confidence.toString(), // Convert to string
          properties: element.properties || {},
          textContent: element.textContent || null,
        }));
        
        await db.insert(visualElement).values(visualElementInserts);
        console.log(`📐 Saved ${visualElementInserts.length} visual elements for page ${page.pageNumber}`);
      }

      // Save text elements with coordinates
      if (page.textElements && page.textElements.length > 0) {
        // For now, store text elements as visual elements with type 'text_annotation'
        const textElementInserts = page.textElements.map((textEl) => ({
          id: generateUUID(),
          pageId: dbPage.id,
          elementType: 'text_annotation' as const,
          boundingBox: {
            x: textEl.x,
            y: textEl.y,
            width: textEl.width,
            height: textEl.height,
          },
          confidence: '0.95', // High confidence for extracted text
          properties: {
            fontSize: textEl.fontSize,
            fontName: textEl.fontName,
            source: 'text_extraction',
          },
          textContent: textEl.text,
        }));
        
        await db.insert(visualElement).values(textElementInserts);
        console.log(`📝 Saved ${textElementInserts.length} text elements for page ${page.pageNumber}`);
      }

      // Extract and save measurements from visual elements
      if (page.visualElements) {
        const measurementInserts = [];
        
        for (const element of page.visualElements) {
          if (element.type === 'dimension' && element.textContent) {
            // Parse dimension text like "12'-6"" or "8'-0""
            const dimensionMatch = element.textContent.match(/(\d+)'?-?(\d+)"?/);
            if (dimensionMatch) {
              const feet = parseInt(dimensionMatch[1]);
              const inches = dimensionMatch[2] ? parseInt(dimensionMatch[2]) : 0;
              const totalInches = feet * 12 + inches;
              
              measurementInserts.push({
                id: generateUUID(),
                pageId: dbPage.id,
                elementId: null, // Will link to visual element after insertion
                measurementType: 'length' as const,
                value: (totalInches / 12).toString(), // Convert to feet
                unit: 'ft' as const,
                fromCoordinates: { x: element.boundingBox.x, y: element.boundingBox.y },
                toCoordinates: { 
                  x: element.boundingBox.x + element.boundingBox.width, 
                  y: element.boundingBox.y 
                },
                annotationText: element.textContent,
                confidence: element.confidence.toString(),
              });
            }
          }
        }
        
        if (measurementInserts.length > 0) {
          await db.insert(measurement).values(measurementInserts);
          console.log(`📏 Saved ${measurementInserts.length} measurements for page ${page.pageNumber}`);
        }
      }

      // Generate embeddings for RAG and chat functionality
      await generateEmbeddingsForPage(dbPage.id, page, chatId);
    }

    // Update document status to 'ready'
    await db
      .update(projectDocument)
      .set({ 
        uploadStatus: 'ready',
        updatedAt: new Date(),
      })
      .where(eq(projectDocument.id, documentId));

    console.log(`Document ${documentId} processing completed successfully`);
  } catch (error) {
    console.error(`Error processing document ${documentId}:`, error);
    
    // Update status to 'failed'
    await db
      .update(projectDocument)
      .set({ 
        uploadStatus: 'failed',
        updatedAt: new Date(),
      })
      .where(eq(projectDocument.id, documentId));
  }
}

/**
 * Generate REAL embeddings for RAG and chat functionality using Google's Text Embedding API
 */
async function generateEmbeddingsForPage(
  pageId: string,
  page: any, // PDFPageResult type  
  chatId: string
) {
  try {
    console.log(`🧠 Generating REAL embeddings for page ${page.pageNumber}`);
    
    // Import Google's official Generative AI SDK
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    
    // Initialize with your API key
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!);
    
    // Get the embedding model
    const embeddingModel = genAI.getGenerativeModel({ model: 'text-embedding-004' });
    
    const embeddingInserts = [];

    // 1. Generate TEXT EMBEDDINGS for extracted text content
    if (page.textElements && page.textElements.length > 0) {
      const pageTextContent = page.textElements.map((el: any) => el.text).join(' ');
      
      if (pageTextContent.trim()) {
        console.log(`📝 Generating text embedding for: "${pageTextContent.substring(0, 100)}..."`);
        
        try {
          const textEmbeddingResult = await embeddingModel.embedContent(pageTextContent);
          const textEmbedding = textEmbeddingResult.embedding.values;
          
          embeddingInserts.push({
            id: generateUUID(),
            pageId,
            contentType: 'textual' as const,
            chunkDescription: `Text content from page ${page.pageNumber}: ${pageTextContent.substring(0, 100)}...`,
            embedding: JSON.stringify(textEmbedding), // Store actual vector
            boundingBox: null,
            metadata: {
              pageNumber: page.pageNumber,
              elementCount: page.textElements.length,
              source: 'text_extraction',
              chatId,
              fullText: pageTextContent,
              embeddingDimensions: textEmbedding.length,
            },
          });
          
          console.log(`✅ Text embedding generated: ${textEmbedding.length} dimensions`);
        } catch (textEmbedError) {
          console.error('Failed to generate text embedding:', textEmbedError);
        }
      }
    }

    // 2. Generate VISUAL EMBEDDINGS for detected architectural elements
    if (page.visualElements && page.visualElements.length > 0) {
      for (const element of page.visualElements) {
        if (element.textContent || element.type) {
          const elementDescription = element.textContent 
            ? `Architectural ${element.type}: ${element.textContent} at coordinates ${element.boundingBox.x},${element.boundingBox.y}`
            : `Architectural ${element.type} element detected at coordinates ${element.boundingBox.x},${element.boundingBox.y}`;

          console.log(`🏗️ Generating visual embedding for: "${elementDescription}"`);
          
          try {
            const visualEmbeddingResult = await embeddingModel.embedContent(elementDescription);
            const visualEmbedding = visualEmbeddingResult.embedding.values;
            
            embeddingInserts.push({
              id: generateUUID(),
              pageId,
              contentType: 'visual' as const,
              chunkDescription: elementDescription,
              embedding: JSON.stringify(visualEmbedding), // Store actual vector
              boundingBox: element.boundingBox,
              metadata: {
                pageNumber: page.pageNumber,
                elementType: element.type,
                confidence: element.confidence,
                properties: element.properties,
                source: 'gemini_vision',
                chatId,
                searchableText: elementDescription,
                embeddingDimensions: visualEmbedding.length,
              },
            });
            
            console.log(`✅ Visual embedding generated for ${element.type}: ${visualEmbedding.length} dimensions`);
          } catch (visualEmbedError) {
            console.error(`Failed to generate visual embedding for ${element.type}:`, visualEmbedError);
          }
        }
      }
    }

    // 3. Generate COMBINED MULTIMODAL EMBEDDING for the entire page
    const visualElementsText = page.visualElements?.map((el: any) => 
      `${el.type}${el.textContent ? ': ' + el.textContent : ''}`
    ).join(', ') || 'None';
    
    const pageDescription = `
      Architectural drawing page ${page.pageNumber} contains:
      Text annotations: ${page.textElements?.map((el: any) => el.text).join(', ') || 'None'}
      Detected elements: ${visualElementsText}
      Document dimensions: ${page.dimensions.width}x${page.dimensions.height} pixels at ${page.dimensions.dpi} DPI
      This page contains architectural/engineering information suitable for building code compliance analysis.
    `.trim();

    console.log(`🔄 Generating combined page embedding`);
    
    try {
      const combinedEmbeddingResult = await embeddingModel.embedContent(pageDescription);
      const combinedEmbedding = combinedEmbeddingResult.embedding.values;
      
      embeddingInserts.push({
        id: generateUUID(),
        pageId,
        contentType: 'combined' as const,
        chunkDescription: `Complete architectural analysis of page ${page.pageNumber}`,
        embedding: JSON.stringify(combinedEmbedding), // Store actual vector
        boundingBox: null,
        metadata: {
          pageNumber: page.pageNumber,
          totalTextElements: page.textElements?.length || 0,
          totalVisualElements: page.visualElements?.length || 0,
          source: 'multimodal_analysis',
          chatId,
          fullDescription: pageDescription,
          embeddingDimensions: combinedEmbedding.length,
        },
      });
      
      console.log(`✅ Combined page embedding generated: ${combinedEmbedding.length} dimensions`);
    } catch (combinedEmbedError) {
      console.error('Failed to generate combined page embedding:', combinedEmbedError);
    }

    // Store all REAL embeddings in database
    if (embeddingInserts.length > 0) {
      await db.insert(multimodalEmbedding).values(embeddingInserts);
      console.log(`🧠 Stored ${embeddingInserts.length} REAL vector embeddings for page ${page.pageNumber}`);
      console.log(`🔍 RAG search now enabled for: "find dimensions", "locate kitchen", "structural symbols", etc.`);
    }

  } catch (error) {
    console.error(`Error generating embeddings for page ${page.pageNumber}:`, error);
    // Don't fail the entire process if embeddings fail
  }
}

// GET endpoint to check processing status and return document details with thumbnails
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const chatId = searchParams.get('chatId');

    if (!chatId) {
      return NextResponse.json({ error: 'Chat ID is required' }, { status: 400 });
    }

    // Get all documents for this chat with their processing status and page thumbnails
    const documentsWithPages = await db
      .select({
        id: projectDocument.id,
        chatId: projectDocument.chatId,
        filename: projectDocument.filename,
        originalFilename: projectDocument.originalFilename,
        fileUrl: projectDocument.fileUrl,
        fileSize: projectDocument.fileSize,
        mimeType: projectDocument.mimeType,
        documentType: projectDocument.documentType,
        uploadStatus: projectDocument.uploadStatus,
        createdAt: projectDocument.createdAt,
        updatedAt: projectDocument.updatedAt,
        // Page information
        pageId: documentPage.id,
        pageNumber: documentPage.pageNumber,
        pageType: documentPage.pageType,
        imageUrl: documentPage.imageUrl,
        thumbnailUrl: documentPage.thumbnailUrl,
        dimensions: documentPage.dimensions,
      })
      .from(projectDocument)
      .leftJoin(documentPage, eq(projectDocument.id, documentPage.documentId))
      .where(eq(projectDocument.chatId, chatId))
      .orderBy(projectDocument.createdAt, documentPage.pageNumber);

    // Group the results by document
    const documentsMap = new Map();
    
    for (const row of documentsWithPages) {
      const docId = row.id;
      
      if (!documentsMap.has(docId)) {
        documentsMap.set(docId, {
          id: row.id,
          chatId: row.chatId,
          filename: row.filename,
          originalFilename: row.originalFilename,
          fileUrl: row.fileUrl,
          fileSize: row.fileSize,
          mimeType: row.mimeType,
          documentType: row.documentType,
          uploadStatus: row.uploadStatus,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          pages: [],
          pageCount: 0,
          firstPageThumbnail: null,
        });
      }
      
      const doc = documentsMap.get(docId);
      
      // Add page information if it exists
      if (row.pageId) {
        doc.pages.push({
          id: row.pageId,
          pageNumber: parseInt(row.pageNumber || '0'),
          pageType: row.pageType,
          imageUrl: row.imageUrl,
          thumbnailUrl: row.thumbnailUrl,
          dimensions: row.dimensions,
        });
        
        // Use first page thumbnail as document thumbnail
        if (!doc.firstPageThumbnail && row.thumbnailUrl) {
          doc.firstPageThumbnail = row.thumbnailUrl;
        }
      }
    }
    
    // Convert map to array and calculate page counts
    const documents = Array.from(documentsMap.values()).map(doc => ({
      ...doc,
      pageCount: doc.pages.length,
      // Sort pages by page number
      pages: doc.pages.sort((a: any, b: any) => a.pageNumber - b.pageNumber),
    }));

    return NextResponse.json({
      documents,
    });
  } catch (error) {
    console.error('Status check error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 