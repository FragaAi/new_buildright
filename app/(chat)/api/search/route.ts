import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/app/(auth)/auth'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { multimodalEmbedding, documentPage, projectDocument } from '@/lib/db/schema'
import { eq, and, desc } from 'drizzle-orm'

// Database connection
// biome-ignore lint: Forbidden non-null assertion.
const client = postgres(process.env.POSTGRES_URL!)
const db = drizzle(client)

/**
 * NOTEBOOKLM-STYLE SEMANTIC SEARCH API 
 * Enhanced with similarity thresholds, chat-specific filtering, and contextual responses
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { query, chatId, contentType, limit = 10 } = await request.json()

    if (!query || typeof query !== 'string') {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 })
    }

    console.log(`🔍 SEMANTIC SEARCH: "${query}" in chat ${chatId || 'all chats'}`)

    // Import Google's official Generative AI SDK
    const { GoogleGenerativeAI } = await import('@google/generative-ai')
    
    // Initialize with API key
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!)
    const embeddingModel = genAI.getGenerativeModel({ model: 'text-embedding-004' })

    // 1. Generate embedding for the search query
    console.log(`📝 Generating query embedding for: "${query}"`)
    const queryEmbeddingResult = await embeddingModel.embedContent(query)
    const queryEmbedding = queryEmbeddingResult.embedding.values

    console.log(`✅ Query embedding generated: ${queryEmbedding.length} dimensions`)

    // 2. Enhanced database query with better filtering
    const whereConditions = []
    
    // Always filter by chat if provided - this is critical for security and relevance
    if (chatId) {
      whereConditions.push(eq(projectDocument.chatId, chatId))
      console.log(`🔒 Filtering by chatId: ${chatId}`)
    }
    
    // Filter by content type if specified (but more permissive)
    if (contentType && ['textual', 'visual', 'combined'].includes(contentType)) {
      whereConditions.push(eq(multimodalEmbedding.contentType, contentType))
      console.log(`📋 Filtering by contentType: ${contentType}`)
    }

    console.log(`📊 Retrieving stored embeddings with enhanced filtering for chat ${chatId}...`)
    
    const embeddingsWithContext = await db
      .select({
        // Embedding data
        id: multimodalEmbedding.id,
        pageId: multimodalEmbedding.pageId,
        contentType: multimodalEmbedding.contentType,
        chunkDescription: multimodalEmbedding.chunkDescription,
        embedding: multimodalEmbedding.embedding,
        boundingBox: multimodalEmbedding.boundingBox,
        metadata: multimodalEmbedding.metadata,
        createdAt: multimodalEmbedding.createdAt,
        // Page data for visual context
        pageNumber: documentPage.pageNumber,
        pageType: documentPage.pageType,
        imageUrl: documentPage.imageUrl,
        thumbnailUrl: documentPage.thumbnailUrl,
        pageDimensions: documentPage.dimensions,
        // Document data
        documentId: projectDocument.id,
        documentFilename: projectDocument.originalFilename,
        documentType: projectDocument.documentType,
        documentStatus: projectDocument.uploadStatus,
      })
      .from(multimodalEmbedding)
      .leftJoin(documentPage, eq(multimodalEmbedding.pageId, documentPage.id))
      .leftJoin(projectDocument, eq(documentPage.documentId, projectDocument.id))
      .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
      .orderBy(desc(multimodalEmbedding.createdAt))

    console.log(`📦 Found ${embeddingsWithContext.length} stored embeddings with context to compare`)

    // 3. Calculate cosine similarity with research-based filtering
    const results = []
    const SIMILARITY_THRESHOLD = 0.3 // Research-based threshold: OpenAI embeddings typically 0.68-1.0, lowering for architectural docs
    
    for (const stored of embeddingsWithContext) {
      try {
        const storedVector = JSON.parse(stored.embedding || '[]')
        if (!Array.isArray(storedVector) || storedVector.length === 0) {
          continue // Skip invalid embeddings
        }

        // Calculate cosine similarity
        const similarity = cosineSimilarity(queryEmbedding, storedVector)
        
        // Debug logging for similarity analysis
        console.log(`📊 Similarity: ${similarity.toFixed(4)} for "${stored.chunkDescription?.substring(0, 50)}..." from ${stored.documentFilename}`)
        
        // Apply research-based relevance threshold
        if (similarity >= SIMILARITY_THRESHOLD) {
          results.push({
            // Original embedding data
            id: stored.id,
            pageId: stored.pageId,
            contentType: stored.contentType,
            chunkDescription: stored.chunkDescription,
            boundingBox: stored.boundingBox,
            metadata: stored.metadata,
            similarity,
            createdAt: stored.createdAt,
            // Enhanced visual context
            pageInfo: {
              pageNumber: stored.pageNumber,
              pageType: stored.pageType,
              imageUrl: stored.imageUrl,
              thumbnailUrl: stored.thumbnailUrl,
              dimensions: stored.pageDimensions,
            },
            documentInfo: {
              id: stored.documentId,
              filename: stored.documentFilename,
              documentType: stored.documentType,
              status: stored.documentStatus,
            },
          })
        }
      } catch (parseError) {
        console.error(`Failed to parse embedding for ${stored.id}:`, parseError)
      }
    }

    // 4. Sort by similarity and return top results (NotebookLM-style ranking)
    const sortedResults = results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)

    console.log(`🎯 Found ${sortedResults.length} results for query "${query}"`)
    if (sortedResults.length > 0) {
      console.log(`Best match: ${sortedResults[0]?.similarity.toFixed(4)} similarity from ${sortedResults[0]?.documentInfo?.filename} page ${sortedResults[0]?.pageInfo?.pageNumber}`)
    } else {
      console.log(`❌ No results found for query "${query}" in chat ${chatId}`)
    }

    return NextResponse.json({
      query,
      results: sortedResults,
      totalFound: results.length,
      queryEmbeddingDimensions: queryEmbedding.length,
      searchComplete: true,
      similarityThreshold: SIMILARITY_THRESHOLD,
    })

  } catch (error) {
    console.error('Semantic search error:', error)
    return NextResponse.json(
      { error: 'Search failed', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

/**
 * Calculate cosine similarity between two vectors
 * Returns value between -1 and 1 (1 = identical, 0 = orthogonal, -1 = opposite)
 */
function cosineSimilarity(vectorA: number[], vectorB: number[]): number {
  if (vectorA.length !== vectorB.length) {
    throw new Error('Vectors must have the same length')
  }

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < vectorA.length; i++) {
    dotProduct += vectorA[i] * vectorB[i]
    normA += vectorA[i] * vectorA[i]
    normB += vectorB[i] * vectorB[i]
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB)
  
  if (magnitude === 0) {
    return 0 // Avoid division by zero
  }

  return dotProduct / magnitude
} 