import fs from 'fs/promises';
import path from 'path';
import { PDFDocument } from 'pdf-lib';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { buildingCodeSection, buildingCodeEmbedding } from '@/lib/db/schema';

// Setup a lightweight DB client once per invocation
// biome-ignore lint: Forbidden non-null assertion.
const client = postgres(process.env.POSTGRES_URL!);
const db = drizzle(client);

interface Section {
  number: string;
  title: string;
  content: string;
  chapter?: string;
  hierarchy: string[];
}

/**
 * Clean up common OCR errors and formatting issues - adapted from OCR Fraga
 */
function cleanOcrText(text: string): string {
  if (!text) return "";
  
  // Replace multiple newlines with a single one
  text = text.replace(/\n\s*\n/g, '\n\n');
  
  // Remove isolated single characters (likely OCR errors)
  text = text.replace(/(?<!\w)([a-zA-Z])(?!\w)/g, ' ');
  
  // Fix common OCR errors
  text = text.replace(/\|/g, 'I').replace(/0/g, 'O');
  
  // Normalize whitespace
  text = text.replace(/\s+/g, ' ');
  
  // Fix broken sentences (period followed by lowercase)
  text = text.replace(/(\.)([a-z])/g, '$1 $2');
  
  return text.trim();
}

/**
 * Apply specialized pre-processing for technical architectural/engineering text - adapted from OCR Fraga
 */
function preprocessTechnicalText(text: string): string {
  if (!text) return "";
  
  let processed = text;
  
  // Standardize units of measurement
  processed = standardizeMeasurements(processed);
  
  // Fix common building code references
  processed = standardizeCodeReferences(processed);
  
  // Improve technical terminology
  processed = fixTechnicalTerminology(processed);
  
  // Format lists and specifications consistently
  processed = formatSpecifications(processed);
  
  return processed;
}

/**
 * Standardize and fix common measurement formats in architectural text
 */
function standardizeMeasurements(text: string): string {
  if (!text) return "";
  
  // Convert fraction notations to decimal (e.g., 1-1/2" → 1.5")
  text = text.replace(/(\d+)-(\d+)\/(\d+)"/g, (_, whole, num, den) => {
    const decimal = parseInt(whole) + parseInt(num) / parseInt(den);
    return `${decimal}"`;
  });
  
  // Fix spacing in dimensions (e.g., 2' 6" → 2'-6")
  text = text.replace(/(\d+)'\s*(\d+)"/g, "$1'-$2\"");
  
  // Standardize unit spacing (e.g., "50 mm" → "50mm", "20 psf" → "20psf")
  const units = ['mm', 'cm', 'in', 'ft', 'psf', 'psi', 'ksi', 'pcf', 'sq ft', 'kg'];
  for (const unit of units) {
    const regex = new RegExp(`(\\d+)\\s+${unit}`, 'g');
    text = text.replace(regex, `$1${unit}`);
  }
  
  return text;
}

/**
 * Standardize building code references
 */
function standardizeCodeReferences(text: string): string {
  if (!text) return "";
  
  // Standardize code references (e.g., "ASTM C 90" → "ASTM C90")
  text = text.replace(/(ASTM|ANSI|ACI|AISI|IBC|IPC)\s+([A-Z])\s+(\d+)/g, '$1 $2$3');
  
  // Standardize section references (e.g., "Sec. 4.2.1" → "Section 4.2.1")
  text = text.replace(/(?:sec|sect)\.?\s+(\d+\.\d+)/gi, 'Section $1');
  
  return text;
}

/**
 * Fix common technical terms that might be misspelled by OCR
 */
function fixTechnicalTerminology(text: string): string {
  if (!text) return "";
  
  // Dictionary of common OCR errors in technical terms
  const corrections: Record<string, string> = {
    "relnforced": "reinforced",
    "concreie": "concrete",
    "concrele": "concrete",
    "structurai": "structural",
    "sieel": "steel",
    "steei": "steel",
    "specificaiions": "specifications",
    "lnsulation": "insulation",
    "lnstallation": "installation",
    "fastenlng": "fastening"
  };
  
  for (const [error, correction] of Object.entries(corrections)) {
    const regex = new RegExp(`\\b${error}\\b`, 'gi');
    text = text.replace(regex, correction);
  }
  
  return text;
}

/**
 * Format specification lists and numbered items consistently
 */
function formatSpecifications(text: string): string {
  if (!text) return "";
  
  // Format numbered specifications (e.g., "1 Steel shall..." → "1. Steel shall...")
  text = text.replace(/(?<!\d)(\d+)(?!\d|\.)(\s+[A-Z])/g, '$1.$2');
  
  // Format bullet points consistently
  text = text.replace(/(?<=\n)[\*\-•⦁◦] ?/g, '• ');
  
  return text;
}

/**
 * Split text into overlapping chunks with improved context preservation - adapted from OCR Fraga
 */
function chunkTextWithContext(text: string, chunkSize = 1500, overlap = 300): string[] {
  if (!text) return [];
  
  // Split by paragraphs first (preserve paragraph structure)
  const paragraphs = text.split(/\n\s*\n/);
  
  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentSize = 0;
  
  // Process paragraphs, preserving whole paragraphs when possible
  for (const paragraph of paragraphs) {
    const paragraphWords = paragraph.split(/\s+/);
    const paragraphSize = paragraphWords.length;
    
    // If a single paragraph is too large, we need to split it
    if (paragraphSize > chunkSize) {
      // If we have content in the current chunk, finish it first
      if (currentSize > 0) {
        chunks.push(currentChunk.join(' '));
        // Keep overlap with previous chunk for context
        const overlapStart = Math.max(0, currentChunk.length - overlap);
        currentChunk = currentChunk.slice(overlapStart);
        currentSize = currentChunk.length;
      }
      
      // Now split the large paragraph by sentences
      const sentences = paragraph.split(/(?<=[.!?])\s+/);
      for (const sentence of sentences) {
        const sentenceWords = sentence.split(/\s+/);
        const sentenceSize = sentenceWords.length;
        
        // If adding this sentence exceeds the chunk size
        if (currentSize + sentenceSize > chunkSize && currentSize > 0) {
          chunks.push(currentChunk.join(' '));
          // Keep overlap with previous chunk for context
          const overlapStart = Math.max(0, currentChunk.length - overlap);
          currentChunk = currentChunk.slice(overlapStart);
          currentSize = currentChunk.length;
        }
        
        // Add sentence to current chunk
        currentChunk.push(...sentenceWords);
        currentSize += sentenceSize;
      }
    } else {
      // If adding this paragraph exceeds the chunk size
      if (currentSize + paragraphSize > chunkSize && currentSize > 0) {
        chunks.push(currentChunk.join(' '));
        // Keep overlap with previous chunk for context
        const overlapStart = Math.max(0, currentChunk.length - overlap);
        currentChunk = currentChunk.slice(overlapStart);
        currentSize = currentChunk.length;
      }
      
      // Add paragraph to current chunk
      currentChunk.push(...paragraphWords);
      currentSize += paragraphSize;
    }
  }
  
  // Add the last chunk if it has content
  if (currentSize > 0) {
    chunks.push(currentChunk.join(' '));
  }
  
  // Filter out very short chunks
  return chunks.filter(chunk => chunk.split(/\s+/).length > 30);
}

/**
 * Generate an embedding using Google Gemini Embeddings API and return it as a comma-separated string.
 * Docs: https://ai.google.dev/api/embeddings
 */
async function generateEmbedding(text: string): Promise<string> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_GENERATIVE_AI_API_KEY missing – embeddings disabled');

  // Use the current text-embedding-004 model with embedContent API
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'models/text-embedding-004',
      content: {
        parts: [{ text: text.slice(0, 2048) }], // keep well under 2k tokens roughly
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini embedding API error ${response.status}: ${await response.text()}`);
  }

  const data: any = await response.json();
  const embeddingArr: number[] = data?.embedding?.values ?? [];
  return embeddingArr.join(',');
}

/** Enhanced regex-driven parser to split raw text into code sections with better detection */
function parseSections(raw: string): Section[] {
  const lines = raw.split(/\r?\n/);
  const sections: Section[] = [];
  let current: Section | null = null;

  // More comprehensive heading regex patterns
  const patterns = [
    /^(\d+(?:\.\d+)*)\s+(.*)$/, // e.g. 1.2.3 Title
    /^(SECTION\s+\d+(?:\.\d+)*)\s+(.*)$/i, // e.g. SECTION 1.2.3 Title
    /^(CHAPTER\s+\d+)\s+(.*)$/i, // e.g. CHAPTER 1 Title
    /^(\d+(?:\.\d+)*)\.\s+(.*)$/, // e.g. 1.2.3. Title (with period)
  ];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let match: RegExpMatchArray | null = null;
    let matchedPattern = false;

    // Try each pattern
    for (const pattern of patterns) {
      match = pattern.exec(trimmed);
      if (match) {
        matchedPattern = true;
        break;
      }
    }

    if (matchedPattern && match) {
      // flush previous section
      if (current) sections.push(current);

      const number = match[1];
      const title = match[2];
      // Extract numeric part for hierarchy
      const numericPart = number.match(/(\d+(?:\.\d+)*)/)?.[1] || number;
      const hierarchy = numericPart.split('.');
      const chapter = hierarchy[0];

      current = {
        number,
        title,
        content: '',
        chapter,
        hierarchy,
      };
    } else if (current) {
      current.content += (current.content ? '\n' : '') + trimmed;
    }
  }

  if (current) sections.push(current);
  return sections;
}

/**
 * Extract text from PDF with robust error handling and preprocessing
 * NOTE: This is currently a placeholder implementation that generates sample building code content.
 * In production, this should be replaced with actual OCR/text extraction using tools like:
 * - Tesseract.js for OCR
 * - pdf2json for text extraction
 * - Google Document AI API for advanced document processing
 * - Adobe PDF Services API for professional-grade extraction
 */
async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  try {
    // Use pdf-lib to load and analyze the PDF
    const pdfDoc = await PDFDocument.load(buffer);
    const pageCount = pdfDoc.getPageCount();
    
    console.log(`📄 PDF loaded with ${pageCount} pages`);
    
    // For building codes, we'll extract a placeholder text structure
    // In a production environment, you might want to use a more sophisticated OCR solution
    let rawText = '';
    
    // Extract basic structure information
    for (let i = 0; i < pageCount; i++) {
      const page = pdfDoc.getPage(i);
      const { width, height } = page.getSize();
      
      // Add basic page structure information
      rawText += `PAGE ${i + 1}\n\n`;
      
      // Add placeholder content that represents typical building code structure
      // This would be replaced with actual OCR in production
      if (i === 0) {
        rawText += `CHAPTER 1 - SCOPE AND ADMINISTRATION\n\n`;
        rawText += `101.1 Title\nThis code shall be known as the Building Code.\n\n`;
        rawText += `101.2 Scope\nThis code establishes minimum requirements to safeguard public health, safety and general welfare.\n\n`;
      } else if (i === 1) {
        rawText += `CHAPTER 2 - DEFINITIONS\n\n`;
        rawText += `201.1 Scope\nUnless otherwise expressly stated, the following words and terms shall have the meanings indicated in this chapter.\n\n`;
        rawText += `201.2 General definitions\nBuilding: Any structure used or intended for supporting or sheltering any use or occupancy.\n\n`;
      } else {
        rawText += `CHAPTER ${i + 1} - GENERAL PROVISIONS\n\n`;
        rawText += `${i + 1}01.1 General\nThe provisions of this chapter shall apply to all buildings and structures.\n\n`;
        rawText += `${i + 1}01.2 Requirements\nAll buildings shall comply with the applicable provisions of this code.\n\n`;
      }
      
      rawText += `\n`;
    }
    
    console.log(`📝 Generated ${rawText.length} characters of structured text from ${pageCount} pages`);
     
    if (!rawText.trim()) {
      throw new Error('No content could be generated from PDF');
    }
    
    // Apply OCR-style cleaning first
    rawText = cleanOcrText(rawText);
    
    // Apply technical preprocessing
    rawText = preprocessTechnicalText(rawText);
    
    return rawText;
  } catch (error) {
    console.error('PDF text extraction error:', error);
    throw new Error(`Failed to extract text from PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Fetch file content from Vercel Blob URL or local path
 */
async function fetchFileContent(filePathOrUrl: string): Promise<Buffer> {
  if (filePathOrUrl.startsWith('http://') || filePathOrUrl.startsWith('https://')) {
    // It's a URL (Vercel Blob), fetch it
    console.log(`📥 Fetching file from URL: ${filePathOrUrl}`);
    const response = await fetch(filePathOrUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch file from ${filePathOrUrl}: ${response.status} ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } else {
    // It's a local file path, read from filesystem
    console.log(`📁 Reading file from local path: ${filePathOrUrl}`);
    return await fs.readFile(filePathOrUrl);
  }
}

/**
 * Main entry: process a saved building code file and populate sections + embeddings.
 * Enhanced with better text processing and chunking strategies.
 */
export async function processBuildingCodeFile(
  filePathOrUrl: string,
  buildingCodeVersionId: string,
) {
  try {
    console.log(`🔄 Processing building code file: ${filePathOrUrl}`);
    
    // Read file
    const buffer = await fetchFileContent(filePathOrUrl);
    
    // Extract file extension from URL or path
    let ext = '';
    if (filePathOrUrl.includes('.')) {
      const parts = filePathOrUrl.split('.');
      ext = '.' + parts[parts.length - 1].toLowerCase().split('?')[0]; // Remove query params
    }
    
    let rawText = '';

    if (ext === '.pdf') {
      rawText = await extractTextFromPDF(buffer);
      console.log(`📄 Extracted ${rawText.length} characters from PDF`);
    } else {
      rawText = buffer.toString('utf-8');
      // Still apply preprocessing for plain text files
      rawText = preprocessTechnicalText(rawText);
      console.log(`📝 Processed ${rawText.length} characters from text file`);
    }

    if (!rawText.trim()) {
      throw new Error('No text content found in file');
    }

    const sections = parseSections(rawText);
    console.log(`📋 Parsed ${sections.length} sections from building code`);

    if (sections.length === 0) {
      console.warn('⚠️ No sections found - creating full document as single section');
      // Create a single section with the full content if no structured sections found
      const chunks = chunkTextWithContext(rawText, 1000, 200);
      
      for (let i = 0; i < chunks.length; i++) {
        const [inserted] = await db
          .insert(buildingCodeSection)
          .values({
            buildingCodeVersionId,
            codeType: 'fbc', // Florida Building Code
            sectionNumber: `chunk-${i + 1}`,
            title: `Document Chunk ${i + 1}`,
            content: chunks[i],
            chapter: '1',
            hierarchy: JSON.stringify(['1', `${i + 1}`]),
            keywords: JSON.stringify([]),
          })
          .returning();

        // Generate embedding for the chunk
        try {
          const embedding = await generateEmbedding(chunks[i]);
          await db.insert(buildingCodeEmbedding).values({
            buildingCodeSectionId: inserted.id,
            contentType: 'content',
            embedding,
            chunkText: chunks[i].slice(0, 2000),
            metadata: JSON.stringify({ chunkIndex: i }),
          });
          console.log(`✅ Generated embedding for chunk ${i + 1}`);
        } catch (err) {
          console.error(`❌ Embedding generation failed for chunk ${i + 1}:`, err);
        }
      }
    } else {
      // Process structured sections
      for (const section of sections) {
        const [inserted] = await db
          .insert(buildingCodeSection)
          .values({
            buildingCodeVersionId,
            codeType: 'fbc', // Florida Building Code
            sectionNumber: section.number,
            title: section.title,
            content: section.content,
            chapter: section.chapter,
            hierarchy: JSON.stringify(section.hierarchy),
            keywords: JSON.stringify([]),
          })
          .returning();

        console.log(`📄 Inserted section: ${section.number} - ${section.title}`);

        // Generate embeddings for different content types
        const contentCombinations = [
          { type: 'title', text: section.title },
          { type: 'content', text: section.content },
          { type: 'combined', text: `${section.title}\n${section.content}` }
        ];

        for (const combo of contentCombinations) {
          if (!combo.text.trim()) continue;
          
          try {
            const embedding = await generateEmbedding(combo.text);
            await db.insert(buildingCodeEmbedding).values({
              buildingCodeSectionId: inserted.id,
              contentType: combo.type as 'title' | 'content' | 'combined',
              embedding,
              chunkText: combo.text.slice(0, 2000),
              metadata: JSON.stringify({ sectionNumber: section.number }),
            });
            console.log(`✅ Generated ${combo.type} embedding for section ${section.number}`);
          } catch (err) {
            console.error(`❌ Embedding generation failed for ${combo.type} of section ${section.number}:`, err);
          }
        }
      }
    }

    console.log(`🎉 Successfully processed building code file with ${sections.length} sections`);
  } catch (error) {
    console.error('❌ Failed to process building code file:', error);
    throw error;
  }
} 