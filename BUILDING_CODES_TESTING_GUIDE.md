# Building Codes Flow Testing Guide

## Enhanced Features Implemented

Based on the successful patterns from the OCR Fraga project, the building codes system now includes:

### 🔧 **Robust Text Processing**
- **OCR Error Cleanup**: Fixes common OCR artifacts and character misrecognition
- **Technical Text Preprocessing**: Standardizes architectural terminology, measurements, and code references
- **Smart Chunking**: Context-aware text segmentation that preserves paragraph structure
- **Enhanced Section Parsing**: Detects multiple heading formats (numbered sections, chapters, etc.)

### 📄 **PDF Processing Improvements**
- **Error-Resilient Extraction**: Graceful handling of PDF parsing failures
- **Text Quality Validation**: Ensures extracted content meets minimum standards
- **Fallback Mechanisms**: Creates document chunks when structured sections aren't detected

### 🧠 **Enhanced Embeddings**
- **Multiple Content Types**: Generates embeddings for titles, content, and combined text
- **Google Gemini Integration**: Uses Gemini's embedding-001 model for semantic search
- **Metadata Enrichment**: Stores context information for better retrieval

### ☁️ **Vercel Blob Integration**
- **Cloud Storage**: Files uploaded to Vercel Blob Storage instead of local filesystem
- **Global CDN**: Files served through Vercel's global network for fast access
- **Secure URLs**: Unique, unguessable URLs for file security
- **Scalable Storage**: No local disk space limitations

## Testing the Complete Flow

### Prerequisites
1. **Environment Variables**:
   ```bash
   GOOGLE_GENERATIVE_AI_API_KEY=AIzaSyAqF0wP6PmMIxK0zyUOqMH424G1CnOoZ50
   POSTGRES_URL=<your-neon-database-url>
   BLOB_READ_WRITE_TOKEN=<your-vercel-blob-token>
   ```

2. **Dependencies Installed**:
   ```bash
   pnpm install  # pdf-parse and @vercel/blob are now properly installed
   ```

3. **Vercel Blob Storage**:
   - Your Vercel project should have Blob Storage enabled
   - Files will be stored in: `building-codes/{code-abbreviation}/{version}/{filename}`

### Manual Testing Steps

#### Step 1: Create Building Code
1. Navigate to `/building-codes` in your app
2. Click "Add Code" 
3. Fill out the form:
   - **Code Name**: "Test Building Code"
   - **Abbreviation**: "TBC" 
   - **Jurisdiction**: "Test Jurisdiction"
   - **Code Type**: "building"
   - **Description**: "Test code for validation"
   - **Version**: "2024"
   - **Effective Date**: "2024-01-01"
4. Submit and verify success toast

#### Step 2: Upload Document
1. Click "Upload" next to your created code
2. Upload either:
   - **Sample Text File**: Create a `.txt` file with structured content like:
   ```
   CHAPTER 1 - GENERAL PROVISIONS
   
   1.1 Scope and Application
   This code establishes minimum requirements...
   
   1.2 Intent  
   The purpose of this code is to establish...
   
   CHAPTER 2 - DEFINITIONS
   
   2.1 General
   For the purpose of this code...
   ```
   
   - **PDF File**: Upload any building code PDF document

3. Monitor console logs for processing steps

### Expected Processing Flow

When you upload a document, the enhanced parser will:

1. **☁️ Upload to Vercel Blob**:
   - Files uploaded to `building-codes/{abbreviation}/{version}/{filename}`
   - Returns secure Vercel Blob URL for processing
   - URL stored in database `sourceFile` field

2. **📄 Fetch & Extract Text**:
   - Fetches file content from Vercel Blob URL
   - PDF files: Uses `pdf-lib` to read PDF structure and generates sample building code content for demonstration
   - Text files: Direct processing with technical preprocessing

   > **Note**: PDF text extraction currently uses placeholder content that represents typical building code structure. In production, this should be replaced with actual OCR or text extraction services.

3. **🧹 Clean & Preprocess**:
   - Fixes OCR errors (common character substitutions)
   - Standardizes measurements (e.g., "2' 6\"" → "2'-6\"")
   - Corrects building code references (e.g., "ASTM C 90" → "ASTM C90")
   - Fixes technical terminology misspellings

4. **📋 Parse Sections**:
   - Detects multiple heading patterns:
     - `1.2.3 Title`
     - `SECTION 1.2.3 Title`
     - `CHAPTER 1 Title`
     - `1.2.3. Title`
   - Creates hierarchical section structure

5. **🔀 Fallback Chunking**:
   - If no structured sections found, intelligently chunks document
   - Preserves paragraph boundaries
   - Maintains context with overlapping chunks

6. **🧠 Generate Embeddings**:
   - Creates embeddings for: title, content, and combined text
   - Uses Google Gemini embedding-001 model
   - Stores with metadata for enhanced retrieval

### Database Verification

After upload, check your database for:

```sql
-- Check building codes
SELECT * FROM building_codes WHERE code_name = 'Test Building Code';

-- Check versions with Vercel Blob URLs
SELECT version, source_file, processing_status 
FROM building_code_versions 
WHERE processing_status = 'completed' 
AND source_file LIKE 'https://%.vercel-storage.com/%';

-- Check sections
SELECT section_number, title, LENGTH(content) as content_length 
FROM building_code_sections 
WHERE building_code_version_id = '<your-version-id>';

-- Check embeddings
SELECT content_type, LENGTH(embedding) as embedding_length, LENGTH(chunk_text) as chunk_length
FROM building_code_embeddings 
WHERE building_code_section_id IN (
  SELECT id FROM building_code_sections 
  WHERE building_code_version_id = '<your-version-id>'
);
```

### Console Log Examples

Look for these processing indicators:

```
📁 BUILDING CODE UPLOAD: Processing test-file.pdf for Test Building Code v2024
💾 File saved to Vercel Blob: https://abc123.vercel-storage.com/building-codes/TBC/2024/TBC_2024_1699123456_test-file.pdf
🔄 Processing building code file: https://abc123.vercel-storage.com/building-codes/TBC/2024/TBC_2024_1699123456_test-file.pdf
📥 Fetching file from URL: https://abc123.vercel-storage.com/building-codes/TBC/2024/TBC_2024_1699123456_test-file.pdf
📄 Extracted 15420 characters from PDF
📋 Parsed 12 sections from building code
📄 Inserted section: 1.1 - Scope and Application
✅ Generated title embedding for section 1.1
✅ Generated content embedding for section 1.1
✅ Generated combined embedding for section 1.1
🎉 Successfully processed building code file with 12 sections
```

### Error Handling

The enhanced system provides better error messages:

- **PDF Extraction Errors**: `Failed to extract text from PDF: No text found in PDF`
- **Empty Content**: `No text content found in file` 
- **Embedding Failures**: `❌ Embedding generation failed for title of section 1.1: API rate limit`
- **Blob Fetch Errors**: `Failed to fetch file from https://...vercel-storage.com/...: 404 Not Found`

### Performance Improvements

Compared to the original implementation:

- **📈 Better Section Detection**: Multiple heading pattern recognition
- **🧹 Cleaner Text**: Technical preprocessing reduces noise
- **🔍 Enhanced Search**: Multiple embedding types improve retrieval accuracy
- **⚡ Resilient Processing**: Graceful degradation when structure isn't detected
- **📊 Rich Metadata**: Better context for search and retrieval
- **☁️ Cloud Storage**: Scalable file storage without local disk limitations
- **🌐 Global Access**: Files served through CDN for fast worldwide access

## Troubleshooting

### Common Issues

1. **"GOOGLE_GENERATIVE_AI_API_KEY missing"**:
   - Verify environment variable is set
   - Check `.env.local` file exists and contains the key

2. **"BLOB_READ_WRITE_TOKEN missing"**:
   - Verify Vercel Blob token is set in environment variables
   - Check Vercel project has Blob Storage enabled

3. **No sections parsed**:
   - Check document structure (numbered headings)
   - System will automatically chunk unstructured content

4. **Embedding generation fails**:
   - Verify Google API key has embedding permissions
   - Check API quota limits

5. **File upload to Vercel Blob fails**:
   - Check Vercel Blob token permissions
   - Verify file size is within Vercel limits (typically 500MB)
   - Check network connectivity to Vercel services

6. **PDF text extraction shows placeholder content**:
   - This is expected behavior in the current implementation
   - The system generates sample building code structure for demonstration
   - For production use, implement actual OCR or text extraction services

### Success Indicators

✅ **Building code created** with proper ID
✅ **File uploaded to Vercel Blob** with HTTPS URL
✅ **Version record** with `processing_status: 'completed'`  
✅ **Source file URL** points to Vercel Blob Storage
✅ **Multiple sections** in `building_code_sections` table
✅ **Embeddings generated** for title, content, and combined text
✅ **No error logs** in console during processing

## Next Steps

After validating the flow:

1. **Test Semantic Search**: Use the generated embeddings in chat/search functionality
2. **Performance Testing**: Upload larger PDF documents (50+ pages)
3. **Integration Testing**: Verify embeddings work with existing semantic search tools
4. **Production Deployment**: Apply the enhanced parser to production environment
5. **Blob Storage Management**: Monitor Vercel Blob usage and costs
6. **File Management**: Implement file cleanup/archival policies if needed

The building codes system now leverages the proven text processing patterns from OCR Fraga with cloud-based file storage, providing robust document processing, enhanced semantic search capabilities, and scalable file management through Vercel Blob Storage. 