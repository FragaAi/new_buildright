import { tool } from 'ai';
import { z } from 'zod';

interface SemanticSearchProps {
  chatId?: string;
}

export const semanticSearchTool = ({ chatId }: SemanticSearchProps) =>
  tool({
    description: 'Search through uploaded architectural documents using semantic search. Use this tool when users ask about finding specific elements, dimensions, rooms, or features in their uploaded plans and blueprints.',
    parameters: z.object({
      query: z.string().describe('The search query (e.g., "find dimensions", "locate kitchen", "structural symbols", "building measurements")'),
      contentType: z.enum(['textual', 'visual', 'combined']).optional().describe('Type of content to search - textual (text content), visual (architectural elements), or combined'),
      limit: z.number().optional().default(10).describe('Maximum number of results to return'),
    }),
    execute: async ({ query, contentType, limit = 10 }) => {
      try {
        console.log(`🔍 AI Tool: Semantic search for "${query}" in chat ${chatId}`);
        
        // Call the enhanced search API
        const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/search`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query,
            chatId,
            contentType,
            limit,
          }),
        });

        if (!response.ok) {
          throw new Error(`Search failed: ${response.statusText}`);
        }

        const data = await response.json();
        const results = data.results || [];
        
        if (results.length === 0) {
          return {
            success: false,
            message: `No results found for "${query}". Try uploading architectural documents first or using different search terms.`,
            results: [],
            visualContext: [],
          };
        }

        // Format results with enhanced visual context for chat display
        const formattedResults = results.map((result: any, index: number) => {
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
        const visualContext = results
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
        const uniqueDocuments = [...new Set(results.map((r: any) => r.documentInfo?.filename).filter(Boolean))];
        const uniquePages = [...new Set(results.map((r: any) => r.pageInfo?.pageNumber).filter(Boolean))];
        
        let summary = `Found ${results.length} matches for "${query}"`;
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
          totalFound: data.totalFound,
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