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
  complianceCheck,
  adobeExtractedTables,
  extractedFigures,
  adobeTextElements,
  tableEmbeddings,
  figureEmbeddings
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

    // 7. ADOBE EXTRACTION ANALYTICS
    console.log(`📊 ADOBE: Querying Adobe extraction data for chat ${chatId}`);
    
    // Adobe Tables Analytics
    const adobeTableStats = await db
      .select({
        count: count(adobeExtractedTables.id),
        withCsvData: count(adobeExtractedTables.csvData),
      })
      .from(adobeExtractedTables)
      .leftJoin(documentPage, eq(adobeExtractedTables.pageId, documentPage.id))
      .leftJoin(projectDocument, eq(documentPage.documentId, projectDocument.id))
      .where(documentId 
        ? and(eq(projectDocument.chatId, chatId), eq(projectDocument.id, documentId))
        : eq(projectDocument.chatId, chatId)
      );

    // Adobe Figures Analytics  
    const adobeFigureStats = await db
      .select({
        count: count(extractedFigures.id),
        withCaptions: count(extractedFigures.caption),
        byType: extractedFigures.figureType,
        typeCount: count(extractedFigures.figureType),
      })
      .from(extractedFigures)
      .leftJoin(documentPage, eq(extractedFigures.pageId, documentPage.id))
      .leftJoin(projectDocument, eq(documentPage.documentId, projectDocument.id))
      .where(documentId 
        ? and(eq(projectDocument.chatId, chatId), eq(projectDocument.id, documentId))
        : eq(projectDocument.chatId, chatId)
      )
      .groupBy(extractedFigures.figureType);

    // Adobe Text Elements Analytics
    const adobeTextStats = await db
      .select({
        count: count(adobeTextElements.id),
        withCoordinates: count(adobeTextElements.coordinates),
        avgTextLength: count(adobeTextElements.textContent), // Could be improved with actual length calc
      })
      .from(adobeTextElements)
      .leftJoin(documentPage, eq(adobeTextElements.pageId, documentPage.id))
      .leftJoin(projectDocument, eq(documentPage.documentId, projectDocument.id))
      .where(documentId 
        ? and(eq(projectDocument.chatId, chatId), eq(projectDocument.id, documentId))
        : eq(projectDocument.chatId, chatId)
      );

    // Adobe Embeddings Analytics
    const tableEmbeddingCount = await db
      .select({
        count: count(tableEmbeddings.id),
      })
      .from(tableEmbeddings);

    const figureEmbeddingCount = await db
      .select({
        count: count(figureEmbeddings.id),
      })
      .from(figureEmbeddings);

    const adobeEmbeddingStats = {
      tableEmbeddings: Number(tableEmbeddingCount[0]?.count) || 0,
      figureEmbeddings: Number(figureEmbeddingCount[0]?.count) || 0,
    };

    // Enhanced Multimodal Embeddings (Adobe vs Standard)
    const enhancedEmbeddingStats = await db
      .select({
        totalEmbeddings: count(multimodalEmbedding.id),
      })
      .from(multimodalEmbedding)
      .leftJoin(documentPage, eq(multimodalEmbedding.pageId, documentPage.id))
      .leftJoin(projectDocument, eq(documentPage.documentId, projectDocument.id))
      .where(documentId 
        ? and(eq(projectDocument.chatId, chatId), eq(projectDocument.id, documentId))
        : eq(projectDocument.chatId, chatId)
      );

    // Extract measurements from Adobe text elements (count numeric patterns)
    const adobeMeasurements = await db
      .select({
        textContent: adobeTextElements.textContent,
        pathInfo: adobeTextElements.pathInfo,
      })
      .from(adobeTextElements)
      .leftJoin(documentPage, eq(adobeTextElements.pageId, documentPage.id))
      .leftJoin(projectDocument, eq(documentPage.documentId, projectDocument.id))
      .where(documentId 
        ? and(eq(projectDocument.chatId, chatId), eq(projectDocument.id, documentId))
        : eq(projectDocument.chatId, chatId)
      );

    // Count measurements from extracted text
    const measurementPatterns = /(\d+[\.\-\']?\d*)\s*(sf|sq\.?ft\.?|ft\.?|'|"|inches?|feet|meters?|m\.?)/gi;
    const extractedMeasurements = adobeMeasurements.flatMap(item => {
      if (!item.textContent) return [];
      const matches = item.textContent.match(measurementPatterns) || [];
      return matches.map(match => ({
        measurement: match,
        context: item.textContent.substring(0, 100),
        path: item.pathInfo
      }));
    });

    console.log(`📊 ADOBE: Found ${adobeTableStats[0]?.count || 0} tables, ${adobeFigureStats.reduce((sum, stat) => sum + Number(stat.typeCount), 0)} figures, ${adobeTextStats[0]?.count || 0} text elements`);

    // 8. Calculate enhanced summary statistics
    const totalPages = pagesWithData.filter(p => p.pageId).length;
    const totalVisualElements = detailedVisualElements.length;
    const totalEmbeddings = embeddingStats.reduce((sum, stat) => sum + Number(stat.count), 0);
    const totalMeasurements = measurementStats.reduce((sum, stat) => sum + Number(stat.count), 0);

    // Adobe data totals
    const totalAdobeTables = Number(adobeTableStats[0]?.count) || 0;
    const totalAdobeFigures = adobeFigureStats.reduce((sum, stat) => sum + Number(stat.typeCount), 0);
    const totalAdobeTextElements = Number(adobeTextStats[0]?.count) || 0;
    const totalAdobeElements = totalAdobeTables + totalAdobeFigures + totalAdobeTextElements;
    const totalExtractedMeasurements = extractedMeasurements.length;

    // Processing quality assessment
    const hasAdobeData = totalAdobeElements > 0;
    const adobeDataQuality = hasAdobeData ? 
      (totalAdobeTables > 0 ? 'Excellent' : 'Good') : 
      (totalVisualElements > 0 ? 'Partial' : 'Basic');

    const summary = {
      totalDocuments: documents.length,
      totalPages,
      totalVisualElements,
      totalMeasurements: totalMeasurements + totalExtractedMeasurements,
      totalEmbeddings,
      // Adobe-specific metrics
      totalAdobeElements,
      totalAdobeTables,
      totalAdobeFigures, 
      totalAdobeTextElements,
      totalExtractedMeasurements,
      processingComplete: documents.every(d => d.uploadStatus === 'ready'),
      extractionQuality: adobeDataQuality,
      processingMethod: hasAdobeData ? 'Adobe Enhanced' : 'Standard',
      dataRichness: totalAdobeElements > (totalVisualElements * 2) ? 'High' : 'Standard'
    };

    console.log(`📈 Analytics Summary: ${summary.totalDocuments} docs, ${summary.totalPages} pages, ${summary.totalAdobeElements} Adobe elements`);

    return NextResponse.json({
      summary,
      documents,
      pages: pagesWithData,
      visualElementStats,
      measurementStats,
      embeddingStats,
      detailedVisualElements,
      // Adobe analytics data
      adobeTableStats: adobeTableStats[0] || { count: 0, withCsvData: 0 },
      adobeFigureStats,
      adobeTextStats: adobeTextStats[0] || { count: 0, withCoordinates: 0 },
      adobeEmbeddingStats,
      enhancedEmbeddingStats: enhancedEmbeddingStats[0] || { totalEmbeddings: 0 },
      extractedMeasurements: extractedMeasurements.slice(0, 20), // First 20 for preview
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

// end of file