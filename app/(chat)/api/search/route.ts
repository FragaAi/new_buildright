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
 * PHASE 1: SEMANTIC SEARCH API WITH VISUAL CONTEXT
 * Enables queries like "find dimensions", "locate kitchen", "structural symbols"
 * Now includes page thumbnails and document information for visual context
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

    // 2. Get all stored embeddings with page and document information
    const whereConditions = []
    
    // Filter by content type if specified
    if (contentType && ['textual', 'visual', 'combined'].includes(contentType)) {
      whereConditions.push(eq(multimodalEmbedding.contentType, contentType))
    }

    console.log(`📊 Retrieving stored embeddings with page and document info for similarity search...`)
    
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

    // 3. Calculate cosine similarity for each stored embedding
    const results = []
    
    for (const stored of embeddingsWithContext) {
      try {
        // Filter by chatId at results level (since metadata is JSON)
        if (chatId && stored.metadata) {
          try {
            const metadata = typeof stored.metadata === 'string' ? JSON.parse(stored.metadata) : stored.metadata
            if (metadata.chatId !== chatId) {
              continue // Skip if doesn't match requested chat
            }
          } catch {
            continue // Skip if metadata parsing fails
          }
        }

        const storedVector = JSON.parse(stored.embedding || '[]')
        if (!Array.isArray(storedVector) || storedVector.length === 0) {
          continue // Skip invalid embeddings
        }

        // Calculate cosine similarity
        const similarity = cosineSimilarity(queryEmbedding, storedVector)
        
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
      } catch (parseError) {
        console.error(`Failed to parse embedding for ${stored.id}:`, parseError)
      }
    }

    // 4. Sort by similarity and return top results
    const sortedResults = results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)

    console.log(`🎯 Top ${sortedResults.length} semantic matches found with visual context`)
    if (sortedResults.length > 0) {
      console.log(`Best match: ${sortedResults[0]?.similarity.toFixed(4)} similarity from ${sortedResults[0]?.documentInfo?.filename} page ${sortedResults[0]?.pageInfo?.pageNumber}`)
    }

    return NextResponse.json({
      query,
      results: sortedResults,
      totalFound: results.length,
      queryEmbeddingDimensions: queryEmbedding.length,
      searchComplete: true,
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