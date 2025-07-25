import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/app/(auth)/auth';
import { put } from '@vercel/blob';
import { PDFProcessor } from '@/lib/pdf/processor';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { projectDocument, documentPage, multimodalEmbedding, documentClassifications, documentHierarchy, semanticChunks, tableEmbeddings, figureEmbeddings, hierarchicalEmbeddings, adobeExtractedTables, adobeTextElements, adobeDocumentStructure, extractedFigures } from '@/lib/db/schema';
import { generateUUID } from '@/lib/utils';
import { DocumentClassifier, type PDFPageForClassification } from '@/lib/document/classifier';
import { HierarchicalParser } from '@/lib/document/hierarchy-parser';
import { AdobeEmbeddingProcessor } from '@/lib/pdf/adobe-embedding-processor';
import { AdobePDFExtractor } from '@/lib/pdf/adobe-extractor';

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
    const useAdobeExtract = formData.get('useAdobeExtract') === 'true'; // Allow enabling Adobe extraction

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

        // Process document in background with Adobe enhancement
        processDocumentInBackground(documentId, fileBuffer, filename, chatId, useAdobeExtract);

        results.push({
          documentId,
          filename: file.name,
          status: 'uploaded',
          url,
          useAdobeExtract: useAdobeExtract && AdobePDFExtractor.isAvailable(),
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

    return NextResponse.json({ results });

  } catch (error) {
    console.error('Upload API error:', error);
    return NextResponse.json(
      { error: 'Failed to upload files' },
      { status: 500 }
    );
  }
}

/**
 * ENHANCED DOCUMENT PROCESSING WITH ADOBE INTEGRATION
 * Combines existing NotebookLM-style processing with Adobe PDF Extract API
 * for superior information extraction and embedding generation
 */
async function processDocumentInBackground(
  documentId: string,
  fileBuffer: Buffer,
  filename: string,
  chatId: string,
  useAdobeExtract: boolean = false
) {
  try {
    console.log(`🚀 Starting enhanced document processing for ${documentId} (${filename})`);
    console.log(`📊 Adobe Extract enabled: ${useAdobeExtract && AdobePDFExtractor.isAvailable()}`);
    
    // Update status to 'processing'
    await db
      .update(projectDocument)
      .set({ 
        uploadStatus: 'processing',
        updatedAt: new Date(),
      })
      .where(eq(projectDocument.id, documentId));

    console.log(`📊 Updated document ${documentId} status to 'processing'`);

    // Process the PDF with Adobe extraction if enabled
    const processingResult = await PDFProcessor.processPDF(
      fileBuffer,
      filename,
      chatId,
      useAdobeExtract && AdobePDFExtractor.isAvailable() // Pass Adobe flag
    );

    console.log(`📄 PDF processing completed for document ${documentId}. Pages: ${processingResult.pages.length}`);

    // Save processed pages to database
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

    // ENHANCED EMBEDDING GENERATION with Adobe Integration
    for (let i = 0; i < processingResult.pages.length; i++) {
      const page = processingResult.pages[i];
      const dbPage = insertedPages[i];

      console.log(`🧠 Processing page ${page.pageNumber} for enhanced embeddings...`);
      
      // Check if this page has Adobe extracted data
      const hasAdobeData = page.tables || page.figures || page.documentStructure;
      
      if (hasAdobeData && useAdobeExtract) {
        console.log(`🚀 Using Adobe-enhanced embedding generation for page ${page.pageNumber}`);
        await generateAdobeEnhancedEmbeddings(dbPage.id, page, chatId, documentId);
      } else {
        console.log(`📄 Using standard embedding generation for page ${page.pageNumber}`);
        await generateEmbeddingsForPage(dbPage.id, page, chatId);
      }
    }

    // Document classification and hierarchy processing
    await classifyDocument(documentId, processingResult.pages, insertedPages);
    await processDocumentHierarchy(documentId, processingResult);

    // Mark document as ready
    await db
      .update(projectDocument)
      .set({ 
        uploadStatus: 'ready',
        updatedAt: new Date(),
      })
      .where(eq(projectDocument.id, documentId));

    console.log(`✅ Document processing completed for ${documentId}`);

  } catch (error) {
    console.error(`❌ Document processing failed for ${documentId}:`, error);
    
    // Mark document as failed
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
    const analysisModel = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' });

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

/**
 * Process document hierarchy (e.g., tables, figures, sections)
 * This function is a placeholder and would require a more robust implementation
 * based on the actual document structure and embedding types.
 */
async function processDocumentHierarchy(
  documentId: string,
  processingResult: any
) {
  try {
    console.log(`🔗 Processing document hierarchy for ${documentId}`);

    // Placeholder for hierarchy processing logic
    // This would involve iterating through the processed pages and their embeddings
    // to identify and group related information (e.g., tables, figures, sections)
    // based on their metadata and embeddings.
    // For now, we'll just log the hierarchy.

    // Example: Grouping tables by page and embedding type
    const groupedTables: { [key: string]: any[] } = {};
    for (const page of processingResult.pages) {
      if (page.tables && page.tables.length > 0) {
        groupedTables[page.pageNumber] = page.tables.map(table => ({
          pageNumber: page.pageNumber,
          tableIndex: table.tableIndex,
          csvData: table.csvData,
          bounds: table.bounds,
          embeddingType: 'table'
        }));
      }
    }
    console.log(`📊 Grouped ${Object.values(groupedTables).flat().length} tables by page.`);

    // Example: Grouping figures by page and embedding type
    const groupedFigures: { [key: string]: any[] } = {};
    for (const page of processingResult.pages) {
      if (page.figures && page.figures.length > 0) {
        groupedFigures[page.pageNumber] = page.figures.map(figure => ({
          pageNumber: page.pageNumber,
          figureIndex: figure.figureIndex,
          type: figure.type,
          caption: figure.caption,
          bounds: figure.bounds,
          embeddingType: 'figure'
        }));
      }
    }
    console.log(`🖼️ Grouped ${Object.values(groupedFigures).flat().length} figures by page.`);

    // Example: Grouping text chunks by page and embedding type
    const groupedTextChunks: { [key: string]: any[] } = {};
    for (const page of processingResult.pages) {
      if (page.documentStructure && page.documentStructure.length > 0) {
        groupedTextChunks[page.pageNumber] = page.documentStructure.map(node => ({
          pageNumber: page.pageNumber,
          path: node.path,
          text: node.text,
          bounds: node.bounds,
          embeddingType: 'text'
        }));
      }
    }
    console.log(`📝 Grouped ${Object.values(groupedTextChunks).flat().length} text chunks by page.`);

    // In a real application, you would save these hierarchies to the database
    // using the schema defined in @/lib/db/schema.ts
    // For example:
    // await db.insert(documentHierarchy).values({
    //   id: generateUUID(),
    //   documentId: documentId,
    //   type: 'table',
    //   pageNumber: 1,
    //   embeddingId: 'some_embedding_id', // This would be the ID of the multimodal embedding
    //   parentId: null, // For hierarchical structure
    //   metadata: {
    //     tableIndex: 0,
    //     csvData: '...',
    //     bounds: { x: 0, y: 0, width: 100, height: 50 }
    //   }
    // });

  } catch (error) {
    console.error(`❌ Failed to process document hierarchy for ${documentId}:`, error);
  }
}

/**
 * Generate enhanced embeddings using Adobe extracted data
 * This function saves Adobe data to dedicated tables and creates enriched embeddings
 */
async function generateAdobeEnhancedEmbeddings(
  pageId: string, 
  page: any, 
  chatId: string, 
  documentId: string
): Promise<void> {
  console.log(`🚀 Starting Adobe-enhanced embedding generation for page ${page.pageNumber}`);
  
  try {
    // Import Google's Generative AI SDK
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!);
    const embeddingModel = genAI.getGenerativeModel({ model: 'text-embedding-004' });

    // First, save Adobe extracted data to dedicated tables
    if (page.tables && page.tables.length > 0) {
      console.log(`📊 Saving ${page.tables.length} Adobe tables to database`);
      
      for (const table of page.tables as any[]) {
        // Save table to adobe_extracted_tables
        const tableId = generateUUID();
        await db.insert(adobeExtractedTables).values({
          id: tableId,
          pageId: pageId,
          tableIndex: table.tableIndex || 0,
          bounds: table.bounds || null,
          csvData: table.csvData || null,
          xlsxUrl: table.xlsxUrl || null,
          pngUrl: table.pngUrl || null,
          metadata: table.metadata || null,
          createdAt: new Date()
        });

        // Process table data for embeddings
        if (table.csvData) {
          const rows = table.csvData.split('\n').filter((row: string) => row.trim());
          if (rows.length > 1) {
            const headers = rows[0].split(',').map((h: string) => h.trim().replace(/"/g, ''));
            
            // Create embeddings for each data row
            for (let i = 1; i < rows.length; i++) {
              const cells = rows[i].split(',').map((c: string) => c.trim().replace(/"/g, ''));
              
              // Create natural language description
              const rowDescription = `Table data: ${headers.map((header: string, j: number) => `${header}: ${cells[j] || 'N/A'}`).join(', ')} (Page ${page.pageNumber})`;
              
              try {
                // Generate embedding for this table row
                const embeddingResult = await embeddingModel.embedContent(rowDescription);
                const embedding = embeddingResult.embedding.values;

                // Store table embedding in dedicated table
                await db.insert(tableEmbeddings).values({
                  id: generateUUID(),
                  adobeTableId: tableId,
                  rowIndex: i - 1,
                  columnName: headers.join(','),
                  cellValue: cells.join(','),
                  rowDescription: rowDescription,
                  embedding: JSON.stringify(embedding),
                  createdAt: new Date()
                });

                // Also store in multimodal embeddings for unified search
                await db.insert(multimodalEmbedding).values({
                  id: generateUUID(),
                  pageId: pageId,
                  contentType: 'textual',
                  chunkDescription: rowDescription,
                  embedding: JSON.stringify(embedding),
                  boundingBox: table.bounds,
                  metadata: {
                    pageNumber: page.pageNumber,
                    source: 'adobe_table_extraction',
                    tableIndex: table.tableIndex,
                    rowIndex: i - 1,
                    headers: headers,
                    embeddingDimensions: embedding.length,
                    chatId: chatId,
                    extractionMethod: 'adobe_pdf_extract'
                  }
                });

                console.log(`💾 Saved Adobe table embedding: Row ${i}/${rows.length} - "${rowDescription.substring(0, 80)}..."`);

              } catch (embeddingError) {
                console.error(`❌ Failed to generate table embedding for row ${i}:`, embeddingError);
              }
            }
          }
        }
      }
    }

    // Process figures
    if (page.figures && page.figures.length > 0) {
      console.log(`🖼️ Saving ${page.figures.length} Adobe figures to database`);
      
      for (const figure of page.figures as any[]) {
        // Save figure to extracted_figures table
        const figureId = generateUUID();
        await db.insert(extractedFigures).values({
          id: figureId,
          pageId: pageId,
          figureType: figure.type || 'other',
          imageUrl: figure.imageUrl || null,
          thumbnailUrl: figure.thumbnailUrl || null,
          bounds: figure.bounds || null,
          caption: figure.caption || null,
          confidence: figure.confidence || null,
          adobeMetadata: figure.metadata || null,
          createdAt: new Date()
        });

        // Create embedding for figure
        const figureDescription = `Figure: ${figure.caption || 'No caption'} (Type: ${figure.type || 'unknown'}, Page ${page.pageNumber})`;
        
        try {
          const embeddingResult = await embeddingModel.embedContent(figureDescription);
          const embedding = embeddingResult.embedding.values;

          // Store figure embedding in dedicated table
          await db.insert(figureEmbeddings).values({
            id: generateUUID(),
            adobeFigureId: figureId,
            caption: figure.caption || null,
            description: figureDescription,
            spatialElements: figure.spatialElements || null,
            embedding: JSON.stringify(embedding),
            createdAt: new Date()
          });

          // Also store in multimodal embeddings for unified search
          await db.insert(multimodalEmbedding).values({
            id: generateUUID(),
            pageId: pageId,
            contentType: 'visual',
            chunkDescription: figureDescription,
            embedding: JSON.stringify(embedding),
            boundingBox: figure.bounds,
            metadata: {
              pageNumber: page.pageNumber,
              source: 'adobe_figure_extraction',
              figureType: figure.type,
              embeddingDimensions: embedding.length,
              chatId: chatId,
              extractionMethod: 'adobe_pdf_extract'
            }
          });

          console.log(`💾 Saved Adobe figure embedding: "${figureDescription.substring(0, 80)}..."`);

        } catch (embeddingError) {
          console.error(`❌ Failed to generate figure embedding:`, embeddingError);
        }
      }
    }

    // Process document structure and text elements
    if (page.documentStructure && page.documentStructure.length > 0) {
      console.log(`📝 Saving ${page.documentStructure.length} Adobe text elements to database`);
      
      for (const node of page.documentStructure) {
        if (node.text && node.text.trim()) {
          // Save text element to adobe_text_elements
          await db.insert(adobeTextElements).values({
            id: generateUUID(),
            pageId: pageId,
            textContent: node.text,
            coordinates: node.bounds || {}, // Required field, using empty object as fallback
            fontInfo: node.fontInfo || null,
            stylingInfo: node.stylingInfo || null,
            pathInfo: node.path || null,
            createdAt: new Date()
          });

          // Save document structure to adobe_document_structure
          await db.insert(adobeDocumentStructure).values({
            id: generateUUID(),
            documentId: documentId,
            elementType: node.elementType || 'text',
            path: node.path || null,
            bounds: node.bounds || null,
            pageNumber: page.pageNumber,
            hierarchyLevel: node.hierarchyLevel || 0,
            parentId: null, // Would need to implement hierarchy tracking
            textContent: node.text,
            createdAt: new Date()
          });

          // Create enhanced text embedding
          const enhancedDescription = `${node.elementType || 'Text'}: ${node.text} (Page ${page.pageNumber}, Path: ${node.path || 'unknown'})`;
          
          try {
            const embeddingResult = await embeddingModel.embedContent(enhancedDescription);
            const embedding = embeddingResult.embedding.values;

            await db.insert(multimodalEmbedding).values({
              id: generateUUID(),
              pageId: pageId,
              contentType: 'textual',
              chunkDescription: enhancedDescription,
              embedding: JSON.stringify(embedding),
              boundingBox: node.bounds,
              metadata: {
                pageNumber: page.pageNumber,
                source: 'adobe_text_extraction',
                elementType: node.elementType,
                path: node.path,
                embeddingDimensions: embedding.length,
                chatId: chatId,
                extractionMethod: 'adobe_pdf_extract'
              }
            });

            console.log(`💾 Saved Adobe text embedding: "${enhancedDescription.substring(0, 80)}..."`);

          } catch (embeddingError) {
            console.error(`❌ Failed to generate text embedding:`, embeddingError);
          }
        }
      }
    }

    console.log(`✅ Completed Adobe-enhanced embedding generation for page ${page.pageNumber}`);

  } catch (error) {
    console.error(`❌ Failed Adobe-enhanced embedding generation for page ${page.pageNumber}:`, error);
    // Fallback to standard embedding generation
    console.log(`🔄 Falling back to standard embedding generation for page ${page.pageNumber}`);
    await generateEmbeddingsForPage(pageId, page, chatId);
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