import { tool } from 'ai';
import { z } from 'zod';
import { Session } from 'next-auth';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { multimodalEmbedding, documentPage, projectDocument } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';

// Cosine similarity calculation
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
  const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
  const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
  return dotProduct / (magnitudeA * magnitudeB);
}

interface SemanticSearchProps {
  chatId?: string;
  session: Session;
}

export const semanticSearchTool = ({ chatId, session }: SemanticSearchProps) =>
  tool({
    description: '🚨 REQUIRED TOOL: Search through uploaded documents using semantic search. You MUST use this tool FIRST for ANY document-related questions. This is MANDATORY when users ask about their documents, files, or content. Use for general questions like "what can you tell me about the documents uploaded?", "what\'s in my documents?", "tell me about uploaded files", "summarize my documents", as well as specific searches like "find dimensions", "locate kitchen", "structural elements", "building specifications". ALWAYS call this tool before responding to document questions.',
    parameters: z.object({
      query: z.string().describe('The search query to find relevant content in uploaded documents'),
      contentType: z.enum(['textual', 'visual', 'combined']).optional().describe('Type of content to search - textual (text content), visual (architectural elements), or combined'),
      limit: z.number().optional().default(10).describe('Maximum number of results to return'),
    }),
    execute: async ({ query, contentType, limit = 10 }) => {
      try {
        console.log(`🔍 AI Tool: Semantic search STARTING for "${query}" in chat ${chatId}`);
        console.log(`📋 Parameters:`, { query, contentType, limit, chatId });
        
        // Check authentication
        if (!session?.user?.id) {
          throw new Error('Authentication required');
        }

        // Database connection
        const client = postgres(process.env.POSTGRES_URL!);
        const db = drizzle(client);

        // Import Google's official Generative AI SDK and generate query embedding
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!);
        const embeddingModel = genAI.getGenerativeModel({ model: 'text-embedding-004' });

        console.log(`📝 Generating query embedding for: "${query}"`);
        const queryEmbeddingResult = await embeddingModel.embedContent(query);
        const queryEmbedding = queryEmbeddingResult.embedding.values;
        console.log(`✅ Query embedding generated: ${queryEmbedding.length} dimensions`);

        // Build where conditions
        const whereConditions = [];
        if (contentType && ['textual', 'visual', 'combined'].includes(contentType)) {
          whereConditions.push(eq(multimodalEmbedding.contentType, contentType));
        }

        console.log(`📊 Retrieving stored embeddings with page and document info for similarity search...`);
        
        // Get all stored embeddings with page and document information
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
          .orderBy(desc(multimodalEmbedding.createdAt));

        console.log(`📦 Found ${embeddingsWithContext.length} stored embeddings with context to compare`);

        // Calculate cosine similarity for each stored embedding
        const results = [];
        
        for (const stored of embeddingsWithContext) {
          try {
            // Filter by chatId at results level (since metadata is JSON)
            if (chatId && stored.metadata) {
              try {
                const metadata = typeof stored.metadata === 'string' ? JSON.parse(stored.metadata) : stored.metadata;
                if (metadata.chatId !== chatId) {
                  continue; // Skip if doesn't match requested chat
                }
              } catch {
                continue; // Skip if metadata parsing fails
              }
            }

            const storedVector = JSON.parse(stored.embedding || '[]');
            if (!Array.isArray(storedVector) || storedVector.length === 0) {
              continue; // Skip invalid embeddings
            }

            // Calculate cosine similarity
            const similarity = cosineSimilarity(queryEmbedding, storedVector);
            
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
            });
          } catch (parseError) {
            console.error(`Failed to parse embedding for ${stored.id}:`, parseError);
          }
        }

        // Sort by similarity and return top results
        const sortedResults = results
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, limit);

        console.log(`🎯 Found ${sortedResults.length} results for query "${query}"`);
        
        // Close database connection
        await client.end();
        
        if (sortedResults.length === 0) {
          console.log(`❌ No results found for query "${query}" in chat ${chatId}`);
          
          // Check if there are any documents at all in this chat
          const hasAnyDocuments = embeddingsWithContext.length > 0;
          
          const message = hasAnyDocuments 
            ? `I found documents in this chat, but no specific content matched "${query}". Try asking about general document information or use different search terms.`
            : `No documents found in this chat. Please upload PDF documents first using the "Upload PDFs" button in the sidebar, then I can analyze their content for you.`;
          
          return {
            success: false,
            message,
            results: [],
            visualContext: [],
            debugInfo: {
              chatId,
              query,
              totalEmbeddings: embeddingsWithContext.length,
              hasAnyDocuments,
            }
          };
        }

        // Format results with enhanced visual context for chat display
        const formattedResults = sortedResults.map((result: any, index: number) => {
          const similarity = (result.similarity * 100).toFixed(1);
          const pageInfo = result.pageInfo || {};
          const documentInfo = result.documentInfo || {};
          
          return {
            rank: index + 1,
            similarity: `${similarity}%`,
            description: result.chunkDescription,
            contentType: result.contentType,
            location: result.boundingBox ? 
              `(${result.boundingBox.x}, ${result.boundingBox.y})` : 
              'No location data',
            // Enhanced with document and page context
            document: {
              filename: documentInfo.filename || 'Unknown document',
              page: pageInfo.pageNumber || 'Unknown page',
              thumbnailUrl: pageInfo.thumbnailUrl,
              imageUrl: pageInfo.imageUrl,
            },
            metadata: result.metadata,
          };
        });

        // Create visual context summary for display
        const visualContext = sortedResults
          .filter((result: any) => result.pageInfo?.thumbnailUrl)
          .slice(0, 3) // Limit to top 3 visual results
          .map((result: any, index: number) => ({
            rank: index + 1,
            similarity: `${(result.similarity * 100).toFixed(1)}%`,
            document: result.documentInfo?.filename || 'Unknown document',
            page: result.pageInfo?.pageNumber || 'Unknown page',
            thumbnailUrl: result.pageInfo.thumbnailUrl,
            imageUrl: result.pageInfo.imageUrl,
            description: result.chunkDescription,
            boundingBox: result.boundingBox,
          }));

        // Create a user-friendly summary
        const uniqueDocuments = [...new Set(sortedResults.map((r: any) => r.documentInfo?.filename).filter(Boolean))];
        const uniquePages = [...new Set(sortedResults.map((r: any) => r.pageInfo?.pageNumber).filter(Boolean))];
        
        let summary = `Found ${sortedResults.length} matches for "${query}"`;
        if (uniqueDocuments.length > 0) {
          summary += ` across ${uniqueDocuments.length} document${uniqueDocuments.length > 1 ? 's' : ''}`;
          if (uniquePages.length > 0) {
            summary += ` and ${uniquePages.length} page${uniquePages.length > 1 ? 's' : ''}`;
          }
        }

        // Add document context if available
        if (uniqueDocuments.length > 0) {
          summary += `\n\nDocuments searched: ${uniqueDocuments.slice(0, 3).join(', ')}`;
          if (uniqueDocuments.length > 3) {
            summary += ` and ${uniqueDocuments.length - 3} more`;
          }
        }

        return {
          success: true,
          message: summary,
          results: formattedResults,
          visualContext,
          totalFound: sortedResults.length,
          searchQuery: query,
        };
      } catch (error) {
        console.error('Semantic search tool error:', error);
        return {
          success: false,
          message: `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          results: [],
          visualContext: [],
        };
      }
    },
  }); 