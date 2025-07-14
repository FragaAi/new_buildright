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
    description: '🚨 REQUIRED TOOL: Search through uploaded documents using semantic search. You MUST use this tool FIRST for ANY document-related questions. This is MANDATORY when users ask about their documents, files, or content. Use for general questions like "what can you tell me about the documents uploaded?", "what\'s in my documents?", "tell me about uploaded files", "summarize my documents", as well as specific searches like "find dimensions", "locate kitchen", "structural elements", "building specifications". ALWAYS call this tool before responding to document questions. \n\n🔍 FOR COMPREHENSIVE ANALYSIS: When users ask about specific documents (e.g., "What\'s in A-100 Zoning?") or project-wide questions, consider using multiple targeted searches with different keywords to ensure complete coverage (e.g., search for "A-100 zoning setbacks dimensions", then "A-100 property site information", then "A-100 building requirements").',
    parameters: z.object({
      query: z.string().describe('The search query to find relevant content in uploaded documents'),
      contentType: z.enum(['textual', 'visual', 'combined']).optional().default('textual').describe('Type of content to search - textual (text content), visual (architectural elements), or combined. Defaults to textual for PDF documents.'),
      limit: z.number().optional().default(15).describe('Maximum number of results to return - increased default for comprehensive analysis'),
    }),
    execute: async ({ query, contentType = 'textual', limit = 15 }) => {
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

        // Build where conditions for enhanced filtering
        const whereConditions = [];
        
        // Always filter by chat if provided - this is critical for security and relevance
        if (chatId) {
          whereConditions.push(eq(projectDocument.chatId, chatId));
          console.log(`🔒 AI Tool: Filtering by chatId: ${chatId}`);
        }
        
        // Filter by content type if specified (but more permissive)
        if (contentType && ['textual', 'visual', 'combined'].includes(contentType)) {
          whereConditions.push(eq(multimodalEmbedding.contentType, contentType));
          console.log(`📋 AI Tool: Filtering by contentType: ${contentType}`);
        }

        console.log(`📊 Retrieving stored embeddings with enhanced filtering for chat ${chatId}...`);
        
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

        // Calculate cosine similarity with research-based filtering
        const results = [];
        const SIMILARITY_THRESHOLD = 0.3; // Research-based threshold: OpenAI embeddings typically 0.68-1.0, lowering for architectural docs
        
        for (const stored of embeddingsWithContext) {
          try {
            const storedVector = JSON.parse(stored.embedding || '[]');
            if (!Array.isArray(storedVector) || storedVector.length === 0) {
              continue; // Skip invalid embeddings
            }

            // Calculate cosine similarity
            const similarity = cosineSimilarity(queryEmbedding, storedVector);
            
            // Debug logging for similarity analysis
            console.log(`📊 AI Tool Similarity: ${similarity.toFixed(4)} for "${stored.chunkDescription?.substring(0, 50)}..." from ${stored.documentFilename}`);
            
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
              });
            }
          } catch (parseError) {
            console.error(`Failed to parse embedding for ${stored.id}:`, parseError);
          }
        }

        // Sort by similarity and return top results (NotebookLM-style ranking)
        const sortedResults = results
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, limit);

        console.log(`🎯 Found ${sortedResults.length} results for query "${query}"`);
        if (sortedResults.length > 0) {
          console.log(`Best match: ${sortedResults[0]?.similarity.toFixed(4)} similarity from ${sortedResults[0]?.documentInfo?.filename} page ${sortedResults[0]?.pageInfo?.pageNumber}`);
        } else {
          console.log(`❌ No results found for query "${query}" in chat ${chatId}`);
        }
        
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

        // **CRITICAL FOR AI UNDERSTANDING**: Extract and present the actual content
        let contentSummary = '';
        if (sortedResults.length > 0) {
          contentSummary = '\n\n=== DOCUMENT CONTENT FOUND ===\n';
          contentSummary += `Found ${sortedResults.length} relevant pieces of information. Here are the most relevant results:\n`;
          
          // Present MORE results with their actual content for comprehensive analysis
          const maxResults = Math.min(sortedResults.length, 10); // Show up to 10 results for comprehensive coverage
          sortedResults.slice(0, maxResults).forEach((result: any, index: number) => {
            const similarity = (result.similarity * 100).toFixed(1);
            const filename = result.documentInfo?.filename || 'Unknown document';
            const pageNum = result.pageInfo?.pageNumber || 'Unknown page';
            const content = result.chunkDescription || 'No content description';
            
            contentSummary += `\n${index + 1}. [${similarity}% match] From ${filename}, page ${pageNum}:\n`;
            contentSummary += `   ${content}\n`;
          });
          
          if (sortedResults.length > maxResults) {
            contentSummary += `\n... and ${sortedResults.length - maxResults} additional results available.\n`;
          }
          
          contentSummary += '\n=== END DOCUMENT CONTENT ===\n';
          contentSummary += '\n🚨 IMPORTANT: Use ALL the above document content to provide a COMPREHENSIVE, DETAILED response. Extract specific measurements, names, addresses, specifications, and technical details. DO NOT provide brief summaries - give complete information that would eliminate the need for follow-up questions.';
        }

        return {
          success: true,
          message: summary + contentSummary,
          results: formattedResults,
          visualContext,
          totalFound: sortedResults.length,
          searchQuery: query,
          // Add the extracted content directly for AI consumption (more comprehensive)
          extractedContent: sortedResults.slice(0, 10).map((r: any) => ({
            content: r.chunkDescription,
            document: r.documentInfo?.filename,
            page: r.pageInfo?.pageNumber,
            similarity: r.similarity,
          })),
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