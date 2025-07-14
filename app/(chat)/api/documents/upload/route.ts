import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/app/(auth)/auth';
import { put } from '@vercel/blob';
import { PDFProcessor } from '@/lib/pdf/processor';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { projectDocument, documentPage, multimodalEmbedding, documentClassifications, documentHierarchy } from '@/lib/db/schema';
import { generateUUID } from '@/lib/utils';
import { DocumentClassifier, type PDFPageForClassification } from '@/lib/document/classifier';
import { HierarchicalParser } from '@/lib/document/hierarchy-parser';

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
            error: 'Only PDF files are supported',
          });
          continue;
        }

        // Convert to buffer
        const fileBuffer = Buffer.from(await file.arrayBuffer());

        // Upload to Vercel Blob
        const timestamp = Date.now();
        const filename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const blobPath = `documents/${chatId}/${timestamp}_${filename}`;

        const { url } = await put(blobPath, fileBuffer, {
          access: 'public',
          contentType: file.type,
        });

        // Create document record
        const documentId = generateUUID();
        await db.insert(projectDocument).values({
          id: documentId,
          chatId,
          filename: filename,
          originalFilename: file.name,
          fileUrl: url,
          fileSize: fileBuffer.length.toString(),
          mimeType: file.type,
          uploadStatus: 'uploading',
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        console.log(`✅ Document uploaded: ${file.name} -> ${documentId}`);

        // Start background processing for NotebookLM-style document understanding
        processDocumentInBackground(documentId, fileBuffer, file.name, chatId);

        results.push({
          filename: file.name,
          status: 'uploaded',
          documentId,
          url,
        });
      } catch (error) {
        console.error(`Error uploading ${file.name}:`, error);
        results.push({
          filename: file.name,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload files' },
      { status: 500 }
    );
  }
}

/**
 * NOTEBOOKLM-STYLE DOCUMENT PROCESSING
 * Focuses on content understanding, classification, and embedding generation
 * No visual element extraction to avoid database conflicts
 */
async function processDocumentInBackground(
  documentId: string,
  fileBuffer: Buffer,
  filename: string,
  chatId: string
) {
  try {
    console.log(`🚀 Starting NotebookLM-style processing for document ${documentId} (${filename})`);
    
    // Update status to 'processing'
    await db
      .update(projectDocument)
      .set({ 
        uploadStatus: 'processing',
        updatedAt: new Date(),
      })
      .where(eq(projectDocument.id, documentId));

    console.log(`📊 Updated document ${documentId} status to 'processing'`);

    // Process the PDF for text and basic info only
    const processingResult = await PDFProcessor.processPDF(
      fileBuffer,
      filename,
      chatId
    );

    console.log(`📄 PDF processing completed for document ${documentId}. Pages: ${processingResult.pages.length}`);

    // Save processed pages to database (simplified - no visual elements)
    const pageInserts = processingResult.pages.map((page) => ({
      id: generateUUID(),
      documentId,
      pageNumber: page.pageNumber.toString(),
      pageType: 'other' as const, // Will be determined by classification
      imageUrl: page.imageUrl,
      thumbnailUrl: page.thumbnailUrl,
      dimensions: page.dimensions,
      scaleInfo: null,
    }));

    const insertedPages = await db.insert(documentPage).values(pageInserts).returning();
    console.log(`💾 Saved ${insertedPages.length} pages for document ${documentId}`);

    // NOTEBOOKLM WORKFLOW: Classification and Embedding Generation
    // Generate embeddings for semantic search (core NotebookLM functionality)
    for (let i = 0; i < processingResult.pages.length; i++) {
      const page = processingResult.pages[i];
      const dbPage = insertedPages[i];

      console.log(`🧠 Processing page ${page.pageNumber} for embeddings...`);
      await generateEmbeddingsForPage(dbPage.id, page, chatId);
    }

    // Classify the document using AI (NotebookLM-style intelligence)
    console.log(`🤖 Starting document classification for ${documentId}...`);
    await classifyDocument(documentId, processingResult.pages, insertedPages);

    // Update status to 'ready'
    await db
      .update(projectDocument)
      .set({ 
        uploadStatus: 'ready',
        updatedAt: new Date(),
      })
      .where(eq(projectDocument.id, documentId));

    console.log(`✅ NotebookLM processing completed for document ${documentId} (${filename}) - Status: READY`);

  } catch (error) {
    console.error(`❌ Error processing document ${documentId} (${filename}):`, error);
    console.error(`❌ Error stack:`, error instanceof Error ? error.stack : 'No stack trace');
    
    // Update status to 'failed'
    try {
      await db
        .update(projectDocument)
        .set({ 
          uploadStatus: 'failed',
          updatedAt: new Date(),
        })
        .where(eq(projectDocument.id, documentId));
      console.log(`📊 Updated document ${documentId} status to 'failed'`);
    } catch (updateError) {
      console.error(`❌ Failed to update document status to 'failed' for ${documentId}:`, updateError);
    }
  }
}

/**
 * Generate embeddings for semantic search (NotebookLM core feature)
 * Enhanced with AI-powered content analysis and meaningful descriptions
 */
async function generateEmbeddingsForPage(
  pageId: string,
  page: any, // PDFPageResult type  
  chatId: string
) {
  try {
    if (!page.textContent || page.textContent.trim().length === 0) {
      console.log(`⚠️ No text content for page ${page.pageNumber}, skipping embedding generation`);
      return;
    }

    // Import Google's official Generative AI SDK
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    
    // Initialize with API key
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!);
    const embeddingModel = genAI.getGenerativeModel({ model: 'text-embedding-004' });
    const analysisModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    console.log(`🧠 Processing page ${page.pageNumber} for NotebookLM-style embeddings...`);

    // Step 1: Analyze content and generate meaningful description
    const contentAnalysisPrompt = `Analyze this architectural document text and provide a concise, descriptive summary of its content in 2-3 sentences. Focus on what information this text contains that would be useful for construction and design queries.

Text content:
${page.textContent.substring(0, 1500)}...

Provide only the summary, no additional formatting:`;

    let chunkDescription = `Page ${page.pageNumber} content`;
    try {
      const analysisResult = await analysisModel.generateContent(contentAnalysisPrompt);
      const analysisText = analysisResult.response.text();
      
      if (analysisText && analysisText.trim().length > 10) {
        chunkDescription = analysisText.trim();
        console.log(`📋 Generated AI description for page ${page.pageNumber}: "${chunkDescription.substring(0, 100)}..."`);
      }
    } catch (analysisError) {
      console.warn(`⚠️ Content analysis failed for page ${page.pageNumber}, using fallback description`);
    }

    // Step 2: Semantic chunking for better embedding quality
    const chunks = semanticChunkText(page.textContent);
    console.log(`📄 Created ${chunks.length} semantic chunks for page ${page.pageNumber}`);

    // Step 3: Generate embeddings for each chunk
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      const chunk = chunks[chunkIndex];
      
      if (chunk.trim().length < 50) {
        console.log(`⚠️ Skipping short chunk ${chunkIndex + 1} for page ${page.pageNumber}`);
        continue;
      }

      try {
        // Generate embedding for chunk
        const embeddingResult = await embeddingModel.embedContent(chunk);
        const embedding = embeddingResult.embedding.values;

        // Create chunk-specific description
        const finalDescription = chunks.length > 1 
          ? `${chunkDescription} (Part ${chunkIndex + 1} of ${chunks.length})`
          : chunkDescription;

        // Save to database
        await db.insert(multimodalEmbedding).values({
          id: generateUUID(),
          pageId: pageId,
          contentType: 'textual',
          chunkDescription: finalDescription,
          embedding: JSON.stringify(embedding),
          metadata: {
            pageNumber: page.pageNumber,
            source: 'semantic_chunking',
            embeddingDimensions: embedding.length,
            chatId: chatId,
            chunkIndex: chunkIndex,
            totalChunks: chunks.length,
            chunkLength: chunk.length,
          },
        });

        console.log(`💾 Saved embedding for page ${page.pageNumber}, chunk ${chunkIndex + 1}/${chunks.length}`);

      } catch (embeddingError) {
        console.error(`❌ Failed to generate embedding for page ${page.pageNumber}, chunk ${chunkIndex + 1}:`, embeddingError);
      }
    }

    console.log(`✅ Completed embedding generation for page ${page.pageNumber} with ${chunks.length} chunks`);

  } catch (error) {
    console.error(`Failed to generate embeddings for page ${page.pageNumber}:`, error);
  }
}

/**
 * Semantic chunking for architectural documents
 */
function semanticChunkText(text: string): string[] {
  if (!text || text.length < 100) {
    return [text];
  }

  const chunks: string[] = [];
  const maxChunkSize = 800; // Optimal size for embeddings
  const minChunkSize = 100;
  const overlapSize = 100; // Overlap to maintain context
  
  // Split by architectural markers first
  const sections = text.split(/(?=(?:ROOM|FLOOR|PLAN|ELEVATION|SECTION|DETAIL|SCHEDULE|NOTES?|DRAWING|SCALE|DIMENSION))/i);
  
  for (const section of sections) {
    const trimmedSection = section.trim();
    
    if (trimmedSection.length <= maxChunkSize) {
      // Section fits in one chunk
      if (trimmedSection.length >= minChunkSize) {
        chunks.push(trimmedSection);
      } else if (chunks.length > 0) {
        // Merge small sections with previous chunk
        chunks[chunks.length - 1] += '\n\n' + trimmedSection;
      } else {
        chunks.push(trimmedSection);
      }
    } else {
      // Split large sections with overlap
      let start = 0;
      while (start < trimmedSection.length) {
        let end = Math.min(start + maxChunkSize, trimmedSection.length);
        
        // Try to break at sentence boundaries
        if (end < trimmedSection.length) {
          const lastSentence = trimmedSection.lastIndexOf('.', end);
          const lastNewline = trimmedSection.lastIndexOf('\n', end);
          const breakPoint = Math.max(lastSentence, lastNewline);
          
          if (breakPoint > start + minChunkSize) {
            end = breakPoint + 1;
          }
        }
        
        const chunk = trimmedSection.substring(start, end).trim();
        if (chunk.length >= minChunkSize) {
          chunks.push(chunk);
        }
        
        // Move start position with overlap
        start = Math.max(end - overlapSize, start + minChunkSize);
        if (start >= trimmedSection.length) break;
      }
    }
  }

  return chunks.filter(chunk => chunk.trim().length > 0);
}

/**
 * Classify document using AI (NotebookLM-style document understanding)
 */
async function classifyDocument(
  documentId: string, 
  processingPages: any[], 
  dbPages: any[]
): Promise<void> {
  try {
    console.log(`🤖 Starting AI classification for document ${documentId}`);

    // Prepare pages for classification
    const classificationPages: PDFPageForClassification[] = processingPages.map((page, index) => ({
      pageNumber: page.pageNumber,
      imageUrl: page.imageUrl,
      textContent: page.textContent || '',
      pageId: dbPages[index].id,
    }));

    // Classify the document
    const classifier = new DocumentClassifier();
    const classification = await classifier.classifyDocument(classificationPages);
    
    console.log(`📊 Document classified as: ${classification.primaryType}/${classification.subtype}`);

    // Save classification to database
    await db.insert(documentClassifications).values({
      id: generateUUID(),
      documentId: documentId,
      primaryType: classification.primaryType,
      subtype: classification.subtype,
      sheetNumber: classification.sheetNumber,
      discipline: classification.discipline,
      confidence: classification.confidence,
      aiAnalysis: classification.aiAnalysis,
    });

    console.log(`💾 Saved document classification for ${documentId}`);

  } catch (error) {
    console.error(`Failed to classify document ${documentId}:`, error);
  }
}

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

    console.log(`📋 PDF Sidebar - Fetching documents for chat: ${chatId}`);

    // Get all documents for this chat with page information
    const documentsWithPages = await db
      .select({
        id: projectDocument.id,
        originalFilename: projectDocument.originalFilename,
        uploadStatus: projectDocument.uploadStatus,
        createdAt: projectDocument.createdAt,
        fileUrl: projectDocument.fileUrl,
      })
      .from(projectDocument)
      .where(eq(projectDocument.chatId, chatId))
      .orderBy(projectDocument.createdAt);

    console.log(`📊 PDF Sidebar - Raw query returned ${documentsWithPages.length} rows`);

         // Get page information for each document
     const documentsWithPageInfo = await Promise.all(
       documentsWithPages.map(async (doc) => {
         try {
           // Get pages for this document
           const pages = await db
             .select()
             .from(documentPage)
             .where(eq(documentPage.documentId, doc.id));

           // Set thumbnail from first page if available
           let thumbnailUrl = '';
           if (pages.length > 0 && pages[0].thumbnailUrl) {
             thumbnailUrl = pages[0].thumbnailUrl;
             console.log(`🖼️ PDF Sidebar - Set thumbnail for ${doc.originalFilename}: ${thumbnailUrl}`);
           }

           return {
             id: doc.id,
             originalFilename: doc.originalFilename,
             uploadStatus: doc.uploadStatus,
             createdAt: doc.createdAt,
             fileUrl: doc.fileUrl,
             pageCount: pages.length,
             thumbnailUrl,
           };
         } catch (error) {
           console.error(`Error fetching pages for document ${doc.id}:`, error);
           return {
             id: doc.id,
             originalFilename: doc.originalFilename,
             uploadStatus: doc.uploadStatus,
             createdAt: doc.createdAt,
             fileUrl: doc.fileUrl,
             pageCount: 0,
             thumbnailUrl: '',
           };
         }
       })
     );

    console.log(`📋 PDF Sidebar - Received documents: ${documentsWithPageInfo.length}`);
    
    // Log document status for debugging
    documentsWithPageInfo.forEach(doc => {
      const hasThumb = doc.thumbnailUrl ? 'YES' : 'NO';
      console.log(`📄 ${doc.originalFilename} - Status: ${doc.uploadStatus}, Pages: ${doc.pageCount}, Thumbnail: ${hasThumb}`);
    });

    return NextResponse.json({ documents: documentsWithPageInfo });
  } catch (error) {
    console.error('Error fetching documents:', error);
    return NextResponse.json(
      { error: 'Failed to fetch documents' },
      { status: 500 }
    );
  }
} 