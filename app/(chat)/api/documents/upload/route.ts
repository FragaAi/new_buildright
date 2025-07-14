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

    console.log(`🧠 Processing page ${page.pageNumber} for NotebookLM-style detailed content extraction...`);

    // Step 1: Extract detailed, specific information from the full text content
    const detailedExtractionPrompt = `Extract specific, detailed information from this architectural document text. Instead of generic summaries, identify and extract concrete facts, data, and details that would be useful for answering specific questions.

Focus on extracting:
- Specific addresses, locations, property details
- Exact measurements, dimensions, areas, square footage
- Room names, spaces, and their specifications
- Material specifications and building components
- Code references, compliance information
- Project details, dates, names, titles
- Technical specifications and requirements
- Any other specific factual information

Format your response as specific, searchable facts rather than generic descriptions. Each fact should be detailed and complete.

Full document text:
${page.textContent}

Extract the key facts and details:`;

    let extractedFacts: string[] = [];
    try {
      const extractionResult = await analysisModel.generateContent(detailedExtractionPrompt);
      const extractionText = extractionResult.response.text();
      
      if (extractionText && extractionText.trim().length > 10) {
        // Split the extracted facts into individual chunks
        extractedFacts = extractionText
          .split('\n')
          .map(fact => fact.trim())
          .filter(fact => fact.length > 20 && !fact.startsWith('-') && !fact.startsWith('•'))
          .map(fact => fact.replace(/^[\d\.\-\•\*\+]\s*/, '').trim());
        
        console.log(`📋 Extracted ${extractedFacts.length} specific facts from page ${page.pageNumber}`);
      }
    } catch (analysisError) {
      console.warn(`⚠️ Detailed content extraction failed for page ${page.pageNumber}, falling back to chunking`);
    }

    // Step 2: If fact extraction worked, create embeddings for each fact
    if (extractedFacts.length > 0) {
      for (let factIndex = 0; factIndex < extractedFacts.length; factIndex++) {
        const fact = extractedFacts[factIndex];
        
        if (fact.trim().length < 30) {
          continue; // Skip very short facts
        }

        try {
          // Generate embedding for this specific fact
          const embeddingResult = await embeddingModel.embedContent(fact);
          const embedding = embeddingResult.embedding.values;

          // Save to database with the specific fact as description
          await db.insert(multimodalEmbedding).values({
            id: generateUUID(),
            pageId: pageId,
            contentType: 'textual',
            chunkDescription: fact,
            embedding: JSON.stringify(embedding),
            metadata: {
              pageNumber: page.pageNumber,
              source: 'detailed_fact_extraction',
              embeddingDimensions: embedding.length,
              chatId: chatId,
              factIndex: factIndex,
              totalFacts: extractedFacts.length,
              factLength: fact.length,
              extractionMethod: 'specific_facts'
            },
          });

          console.log(`💾 Saved embedding for specific fact ${factIndex + 1}/${extractedFacts.length}: "${fact.substring(0, 80)}..."`);

        } catch (embeddingError) {
          console.error(`❌ Failed to generate embedding for fact ${factIndex + 1}:`, embeddingError);
        }
      }
    } else {
      // Step 3: Fallback to enhanced semantic chunking if fact extraction fails
      console.log(`📄 Falling back to enhanced semantic chunking for page ${page.pageNumber}`);
      
      const chunks = enhancedSemanticChunkText(page.textContent);
      console.log(`📄 Created ${chunks.length} enhanced semantic chunks for page ${page.pageNumber}`);

      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        const chunk = chunks[chunkIndex];
        
        if (chunk.trim().length < 50) {
          continue;
        }

        try {
          // Generate more detailed description for this chunk
          const chunkAnalysisPrompt = `Analyze this text chunk and create a specific, detailed description of what information it contains. Focus on concrete facts, data, and details rather than generic descriptions.

Text chunk:
${chunk}

Provide a specific, factual description (not a generic summary):`;

          let chunkDescription = `Page ${page.pageNumber}, section ${chunkIndex + 1} content`;
          try {
            const chunkAnalysisResult = await analysisModel.generateContent(chunkAnalysisPrompt);
            const analysisText = chunkAnalysisResult.response.text();
            
            if (analysisText && analysisText.trim().length > 10) {
              chunkDescription = analysisText.trim();
            }
          } catch (chunkAnalysisError) {
            console.warn(`⚠️ Chunk analysis failed for chunk ${chunkIndex + 1}`);
          }

          // Generate embedding for chunk
          const embeddingResult = await embeddingModel.embedContent(chunk);
          const embedding = embeddingResult.embedding.values;

          // Save to database
          await db.insert(multimodalEmbedding).values({
            id: generateUUID(),
            pageId: pageId,
            contentType: 'textual',
            chunkDescription: chunkDescription,
            embedding: JSON.stringify(embedding),
            metadata: {
              pageNumber: page.pageNumber,
              source: 'enhanced_semantic_chunking',
              embeddingDimensions: embedding.length,
              chatId: chatId,
              chunkIndex: chunkIndex,
              totalChunks: chunks.length,
              chunkLength: chunk.length,
              extractionMethod: 'enhanced_chunks'
            },
          });

          console.log(`💾 Saved embedding for enhanced chunk ${chunkIndex + 1}/${chunks.length}: "${chunkDescription.substring(0, 80)}..."`);

        } catch (embeddingError) {
          console.error(`❌ Failed to generate embedding for chunk ${chunkIndex + 1}:`, embeddingError);
        }
      }
    }

    console.log(`✅ Completed NotebookLM-style embedding generation for page ${page.pageNumber}`);

  } catch (error) {
    console.error(`❌ Failed to generate embeddings for page ${page.pageNumber}:`, error);
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
 * Enhanced semantic chunking for architectural documents
 * This function is a more sophisticated version that attempts to break down text
 * into smaller, more semantically meaningful chunks, especially for complex documents.
 */
function enhancedSemanticChunkText(text: string): string[] {
  if (!text || text.length < 100) {
    return [text];
  }

  const chunks: string[] = [];
  const maxChunkSize = 1000; // Increased max chunk size for more detailed extraction
  const minChunkSize = 150; // Increased to ensure meaningful content
  const overlapSize = 100;

  // Enhanced architectural markers for better semantic separation
  const sections = text.split(/(?=(?:PROPERTY|ADDRESS|LOCATION|PROJECT|ARCHITECT|OWNER|ROOM|FLOOR|PLAN|ELEVATION|SECTION|DETAIL|SCHEDULE|NOTES?|DRAWING|SCALE|DIMENSION|SPECIFICATION|MATERIAL|CODE|COMPLIANCE|AREA|SQUARE|FEET|SIZE))/i);
  
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

  return chunks.filter(chunk => chunk.trim().length >= minChunkSize);
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