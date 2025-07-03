import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/app/(auth)/auth';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, and, desc, count } from 'drizzle-orm';
import postgres from 'postgres';
import { 
  projectDocument, 
  documentPage, 
  visualElement, 
  measurement, 
  multimodalEmbedding,
  complianceCheck 
} from '@/lib/db/schema';

// Database connection
// biome-ignore lint: Forbidden non-null assertion.
const client = postgres(process.env.POSTGRES_URL!);
const db = drizzle(client);

/**
 * PHASE 3: DATA VERIFICATION & ANALYTICS API
 * Retrieves all extracted data for analytics dashboard
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const chatId = searchParams.get('chatId');
    const documentId = searchParams.get('documentId');

    if (!chatId) {
      return NextResponse.json({ error: 'Chat ID is required' }, { status: 400 });
    }

    console.log(`📊 ANALYTICS: Retrieving extracted data for chat ${chatId}`);

    // 1. Get document overview with processing status
    const baseDocumentQuery = db
      .select({
        id: projectDocument.id,
        filename: projectDocument.originalFilename,
        documentType: projectDocument.documentType,
        uploadStatus: projectDocument.uploadStatus,
        createdAt: projectDocument.createdAt,
        pageCount: count(documentPage.id),
      })
      .from(projectDocument)
      .leftJoin(documentPage, eq(projectDocument.id, documentPage.documentId))
      .groupBy(projectDocument.id);

    const documents = await baseDocumentQuery.where(
      documentId 
        ? and(eq(projectDocument.chatId, chatId), eq(projectDocument.id, documentId))
        : eq(projectDocument.chatId, chatId)
    );

    // 2. Get detailed page data with extracted elements
    const pagesWithData = await db
      .select({
        // Document info
        documentId: projectDocument.id,
        documentFilename: projectDocument.originalFilename,
        documentType: projectDocument.documentType,
        // Page info
        pageId: documentPage.id,
        pageNumber: documentPage.pageNumber,
        pageType: documentPage.pageType,
        imageUrl: documentPage.imageUrl,
        thumbnailUrl: documentPage.thumbnailUrl,
        dimensions: documentPage.dimensions,
        // Visual elements count
        visualElementCount: count(visualElement.id),
      })
      .from(projectDocument)
      .leftJoin(documentPage, eq(projectDocument.id, documentPage.documentId))
      .leftJoin(visualElement, eq(documentPage.id, visualElement.pageId))
      .where(documentId 
        ? and(eq(projectDocument.chatId, chatId), eq(projectDocument.id, documentId))
        : eq(projectDocument.chatId, chatId)
      )
      .groupBy(
        projectDocument.id,
        projectDocument.originalFilename,
        projectDocument.documentType,
        documentPage.id,
        documentPage.pageNumber,
        documentPage.pageType,
        documentPage.imageUrl,
        documentPage.thumbnailUrl
      )
      .orderBy(projectDocument.createdAt, documentPage.pageNumber);

    // 3. Get visual elements breakdown by type
    const visualElementStats = await db
      .select({
        elementType: visualElement.elementType,
        count: count(visualElement.id),
      })
      .from(visualElement)
      .leftJoin(documentPage, eq(visualElement.pageId, documentPage.id))
      .leftJoin(projectDocument, eq(documentPage.documentId, projectDocument.id))
      .where(documentId 
        ? and(eq(projectDocument.chatId, chatId), eq(projectDocument.id, documentId))
        : eq(projectDocument.chatId, chatId)
      )
      .groupBy(visualElement.elementType);

    // 4. Get measurements breakdown
    const measurementStats = await db
      .select({
        measurementType: measurement.measurementType,
        unit: measurement.unit,
        count: count(measurement.id),
      })
      .from(measurement)
      .leftJoin(documentPage, eq(measurement.pageId, documentPage.id))
      .leftJoin(projectDocument, eq(documentPage.documentId, projectDocument.id))
      .where(documentId 
        ? and(eq(projectDocument.chatId, chatId), eq(projectDocument.id, documentId))
        : eq(projectDocument.chatId, chatId)
      )
      .groupBy(measurement.measurementType, measurement.unit);

    // 5. Get embeddings stats for semantic search capability
    const embeddingStats = await db
      .select({
        contentType: multimodalEmbedding.contentType,
        count: count(multimodalEmbedding.id),
      })
      .from(multimodalEmbedding)
      .leftJoin(documentPage, eq(multimodalEmbedding.pageId, documentPage.id))
      .leftJoin(projectDocument, eq(documentPage.documentId, projectDocument.id))
      .where(documentId 
        ? and(eq(projectDocument.chatId, chatId), eq(projectDocument.id, documentId))
        : eq(projectDocument.chatId, chatId)
      )
      .groupBy(multimodalEmbedding.contentType);

    // 6. Get actual visual elements for detailed analysis
    const detailedVisualElements = await db
      .select({
        id: visualElement.id,
        pageId: visualElement.pageId,
        elementType: visualElement.elementType,
        boundingBox: visualElement.boundingBox,
        confidence: visualElement.confidence,
        textContent: visualElement.textContent,
        properties: visualElement.properties,
        // Page context
        pageNumber: documentPage.pageNumber,
        documentFilename: projectDocument.originalFilename,
        thumbnailUrl: documentPage.thumbnailUrl,
      })
      .from(visualElement)
      .leftJoin(documentPage, eq(visualElement.pageId, documentPage.id))
      .leftJoin(projectDocument, eq(documentPage.documentId, projectDocument.id))
      .where(documentId 
        ? and(eq(projectDocument.chatId, chatId), eq(projectDocument.id, documentId))
        : eq(projectDocument.chatId, chatId)
      )
      .orderBy(desc(visualElement.confidence), documentPage.pageNumber)
      .limit(50); // Limit for performance

    // 7. Calculate summary statistics
    const totalPages = pagesWithData.filter(p => p.pageId).length;
    const totalVisualElements = detailedVisualElements.length;
    const totalEmbeddings = embeddingStats.reduce((sum, stat) => sum + Number(stat.count), 0);
    const totalMeasurements = measurementStats.reduce((sum, stat) => sum + Number(stat.count), 0);

    const summary = {
      totalDocuments: documents.length,
      totalPages,
      totalVisualElements,
      totalMeasurements,
      totalEmbeddings,
      processingComplete: documents.every(d => d.uploadStatus === 'ready'),
      extractionQuality: totalVisualElements > 0 ? 'Good' : totalPages > 0 ? 'Partial' : 'None',
    };

    console.log(`📈 Analytics Summary: ${summary.totalDocuments} docs, ${summary.totalPages} pages, ${summary.totalVisualElements} elements`);

    return NextResponse.json({
      summary,
      documents,
      pages: pagesWithData,
      visualElementStats,
      measurementStats,
      embeddingStats,
      detailedVisualElements,
      chatId,
      documentId,
    });

  } catch (error) {
    console.error('Analytics API error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve analytics data', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
} 