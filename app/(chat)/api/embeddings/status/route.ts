import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/app/(auth)/auth'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { multimodalEmbedding } from '@/lib/db/schema'
import { count, eq } from 'drizzle-orm'

// Database connection
// biome-ignore lint: Forbidden non-null assertion.
const client = postgres(process.env.POSTGRES_URL!)
const db = drizzle(client)

/**
 * Get embedding status for a chat
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const chatId = searchParams.get('chatId')

    if (!chatId) {
      return NextResponse.json({ error: 'chatId parameter is required' }, { status: 400 })
    }

    console.log(`📊 Checking embedding status for chat: ${chatId}`)

    // Count embeddings by type for this chat
    const allEmbeddings = await db
      .select()
      .from(multimodalEmbedding)

    // Filter in memory since metadata filtering is complex
    const chatEmbeddings = allEmbeddings.filter(embedding => {
      try {
        const metadata = typeof embedding.metadata === 'string' 
          ? JSON.parse(embedding.metadata) 
          : embedding.metadata
        return metadata?.chatId === chatId
      } catch {
        return false
      }
    })

    const textualCount = chatEmbeddings.filter(e => e.contentType === 'textual').length
    const visualCount = chatEmbeddings.filter(e => e.contentType === 'visual').length
    const combinedCount = chatEmbeddings.filter(e => e.contentType === 'combined').length

    return NextResponse.json({
      chatId,
      embeddingsAvailable: chatEmbeddings.length > 0,
      summary: {
        total: chatEmbeddings.length,
        textual: textualCount,
        visual: visualCount,
        combined: combinedCount,
      },
      message: chatEmbeddings.length > 0 
        ? `${chatEmbeddings.length} embeddings ready for semantic search`
        : 'No embeddings found. Upload a PDF to generate embeddings.',
      searchReady: chatEmbeddings.length > 0,
    })

  } catch (error) {
    console.error('Status check error:', error)
    return NextResponse.json(
      { error: 'Status check failed', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
} 