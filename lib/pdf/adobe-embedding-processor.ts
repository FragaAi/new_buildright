import { AdobeExtractionResult, ExtractedTable, ExtractedFigure, EnhancedTextElement, DocumentNode } from './adobe-extractor';

/**
 * Enhanced embedding processor that integrates Adobe PDF Extract results
 * with the existing embedding pipeline for optimal information extraction
 */
export class AdobeEmbeddingProcessor {
  
  /**
   * Process Adobe extraction results and create enhanced embeddings
   */
  static async processAdobeResultsForEmbeddings(
    adobeResult: AdobeExtractionResult,
    documentId: string,
    pageId: string
  ): Promise<EmbeddingProcessingResult> {
    console.log(`🔄 Processing Adobe results for enhanced embeddings...`);

    const result: EmbeddingProcessingResult = {
      semanticChunks: [],
      multimodalEmbeddings: [],
      tableEmbeddings: [],
      figureEmbeddings: [],
      hierarchicalEmbeddings: []
    };

    // Process document structure for hierarchical chunking
    result.semanticChunks = await this.createSemanticChunksFromStructure(
      adobeResult.documentStructure,
      documentId
    );

    // Process tables for specialized table embeddings
    result.tableEmbeddings = await this.createTableEmbeddings(
      adobeResult.tables,
      pageId
    );

    // Process figures for enhanced visual embeddings
    result.figureEmbeddings = await this.createFigureEmbeddings(
      adobeResult.figures,
      pageId
    );

    // Process enhanced text elements for precise multimodal embeddings
    result.multimodalEmbeddings = await this.createEnhancedTextEmbeddings(
      adobeResult.textElements,
      pageId
    );

    // Create hierarchical embeddings from document structure
    result.hierarchicalEmbeddings = await this.createHierarchicalEmbeddings(
      result.semanticChunks
    );

    console.log(`✅ Adobe embedding processing complete:
      - ${result.semanticChunks.length} semantic chunks
      - ${result.tableEmbeddings.length} table embeddings  
      - ${result.figureEmbeddings.length} figure embeddings
      - ${result.multimodalEmbeddings.length} multimodal embeddings`);

    return result;
  }

  /**
   * Create semantic chunks from Adobe document structure
   */
  private static async createSemanticChunksFromStructure(
    documentStructure: DocumentNode[],
    documentId: string
  ): Promise<SemanticChunkData[]> {
    const chunks: SemanticChunkData[] = [];
    let parentChunkMap = new Map<string, string>(); // path -> chunk_id

    // Sort by hierarchy and reading order
    const sortedStructure = documentStructure.sort((a, b) => {
      // Sort by page first, then by y-coordinate (reading order)
      if (a.pageNumber !== b.pageNumber) {
        return a.pageNumber - b.pageNumber;
      }
      if (a.bounds && b.bounds) {
        return b.bounds.y - a.bounds.y; // Higher y = earlier in reading order
      }
      return 0;
    });

    for (const node of sortedStructure) {
      if (!node.text || node.text.trim().length < 10) continue;

      const hierarchyLevel = this.getHierarchyLevel(node.type, node.path);
      const parentPath = this.getParentPath(node.path);
      const parentChunkId = parentChunkMap.get(parentPath);

      const chunkData: SemanticChunkData = {
        document_id: documentId,
        parent_chunk_id: parentChunkId,
        level: node.type.toLowerCase(),
        content: node.text,
        context: {
          page_number: node.pageNumber,
          adobe_path: node.path,
          reading_order: chunks.length
        },
        metadata: {
          bounds: node.bounds,
          element_type: node.type,
          hierarchy_level: hierarchyLevel
        },
        adobe_element_type: node.type,
        adobe_path: node.path,
        adobe_bounds: node.bounds,
        hierarchy_level: hierarchyLevel
      };

      chunks.push(chunkData);
      
      // Store this chunk for potential children
      const chunkId = `chunk_${chunks.length}`;
      parentChunkMap.set(node.path, chunkId);
    }

    return chunks;
  }

  /**
   * Create specialized embeddings for extracted tables
   */
  private static async createTableEmbeddings(
    tables: ExtractedTable[],
    pageId: string
  ): Promise<TableEmbeddingData[]> {
    const embeddings: TableEmbeddingData[] = [];

    for (const table of tables) {
      if (!table.csvData) continue;

      // Parse CSV data
      const rows = table.csvData.split('\\n').filter(row => row.trim());
      if (rows.length < 2) continue; // Need header + at least one data row

      const headers = rows[0].split(',').map(h => h.trim().replace(/"/g, ''));
      
      // Create embeddings for each data row
      for (let i = 1; i < rows.length; i++) {
        const cells = rows[i].split(',').map(c => c.trim().replace(/"/g, ''));
        
        // Create natural language description of the row
        const rowDescription = this.createTableRowDescription(headers, cells, table.pageNumber);
        
        for (let j = 0; j < cells.length; j++) {
          if (cells[j] && headers[j]) {
            embeddings.push({
              adobe_table_id: `table_${table.tableIndex}`, // Will need to map to actual table ID
              row_index: i - 1,
              column_name: headers[j],
              cell_value: cells[j],
              row_description: rowDescription,
              // embedding will be generated separately
            });
          }
        }
      }
    }

    return embeddings;
  }

  /**
   * Create enhanced embeddings for extracted figures
   */
  private static async createFigureEmbeddings(
    figures: ExtractedFigure[],
    pageId: string
  ): Promise<FigureEmbeddingData[]> {
    const embeddings: FigureEmbeddingData[] = [];

    for (const figure of figures) {
      // Generate enhanced description based on figure type and context
      const enhancedDescription = this.createFigureDescription(figure);
      
      // Extract spatial elements (this would typically use AI vision analysis)
      const spatialElements = this.extractSpatialElements(figure);

      embeddings.push({
        adobe_figure_id: `figure_${figure.figureIndex}`, // Will need to map to actual figure ID
        caption: figure.caption || '',
        description: enhancedDescription,
        spatial_elements: spatialElements,
        // embedding will be generated separately
      });
    }

    return embeddings;
  }

  /**
   * Create enhanced multimodal embeddings from Adobe text elements
   */
  private static async createEnhancedTextEmbeddings(
    textElements: EnhancedTextElement[],
    pageId: string
  ): Promise<MultimodalEmbeddingData[]> {
    const embeddings: MultimodalEmbeddingData[] = [];

    // Group text elements by semantic proximity and type
    const groupedElements = this.groupTextElementsByProximity(textElements);

    for (const group of groupedElements) {
      const combinedText = group.map(el => el.text).join(' ');
      const averageBounds = this.calculateAverageBounds(group.map(el => el.coordinates));
      
      // Determine content type based on text characteristics and styling
      const contentType = this.determineContentType(group);
      
      embeddings.push({
        page_id: pageId,
        content_type: contentType,
        chunk_description: combinedText,
        bounding_box: averageBounds,
        metadata: {
          font_info: group[0].fontFamily ? { fontFamily: group[0].fontFamily } : undefined,
          styling: group[0].attributes,
          element_count: group.length,
          page_number: group[0].pageNumber
        },
        adobe_source_type: 'text',
        adobe_path_info: group[0].path,
        adobe_figure_bounds: averageBounds
      });
    }

    return embeddings;
  }

  /**
   * Create hierarchical embeddings for better context propagation
   */
  private static async createHierarchicalEmbeddings(
    semanticChunks: SemanticChunkData[]
  ): Promise<HierarchicalEmbeddingData[]> {
    const hierarchicalEmbeddings: HierarchicalEmbeddingData[] = [];

    // Create different levels of abstraction
    const levels = ['section', 'subsection', 'paragraph'];
    
    for (const level of levels) {
      const chunksAtLevel = semanticChunks.filter(chunk => 
        this.isChunkAtHierarchyLevel(chunk, level)
      );

      for (const chunk of chunksAtLevel) {
        // Create context summary by combining with child elements
        const contextSummary = this.createContextSummary(chunk, semanticChunks);

        hierarchicalEmbeddings.push({
          chunk_id: `chunk_${chunk.adobe_path}`, // Will need to map to actual chunk ID
          embedding_level: level,
          context_summary: contextSummary,
          metadata: {
            adobe_path: chunk.adobe_path,
            hierarchy_level: chunk.hierarchy_level,
            element_type: chunk.adobe_element_type
          },
          // embedding will be generated separately
        });
      }
    }

    return hierarchicalEmbeddings;
  }

  // Helper methods for processing

  private static getHierarchyLevel(elementType: string, path: string): number {
    if (elementType.startsWith('H')) {
      const level = parseInt(elementType.substring(1)) || 1;
      return level;
    }
    if (elementType === 'Title') return 0;
    if (elementType === 'Sect') return 2;
    if (elementType === 'P') return 4;
    if (elementType === 'Table') return 3;
    if (elementType === 'Figure') return 3;
    return 5; // Default for other elements
  }

  private static getParentPath(path: string): string {
    const parts = path.split('/');
    return parts.slice(0, -1).join('/');
  }

  private static createTableRowDescription(headers: string[], cells: string[], pageNumber: number): string {
    const pairs = headers.map((header, i) => `${header}: ${cells[i] || 'N/A'}`);
    return `Table row data: ${pairs.join(', ')} (Page ${pageNumber})`;
  }

  private static createFigureDescription(figure: ExtractedFigure): string {
    const typeDescriptions = {
      'chart': 'Data visualization chart',
      'diagram': 'Technical diagram or schematic',
      'image': 'Photographic or illustrated content',
      'other': 'Visual element'
    };

    const baseDescription = typeDescriptions[figure.type] || 'Visual element';
    const caption = figure.caption ? ` with caption: "${figure.caption}"` : '';
    const location = ` located on page ${figure.pageNumber}`;
    
    return `${baseDescription}${caption}${location}`;
  }

  private static extractSpatialElements(figure: ExtractedFigure): any {
    // This would typically use AI vision analysis to detect spatial elements
    // For now, return basic structure based on figure type
    return {
      type: figure.type,
      bounds: figure.bounds,
      detected_elements: [], // Would be populated by vision AI
      spatial_relationships: [] // Would be populated by spatial analysis
    };
  }

  private static groupTextElementsByProximity(elements: EnhancedTextElement[]): EnhancedTextElement[][] {
    // Group elements that are close to each other spatially
    const groups: EnhancedTextElement[][] = [];
    const proximityThreshold = 50; // pixels

    for (const element of elements) {
      let addedToGroup = false;
      
      for (const group of groups) {
        const lastInGroup = group[group.length - 1];
        const distance = Math.abs(element.coordinates.y - lastInGroup.coordinates.y);
        
        if (distance <= proximityThreshold) {
          group.push(element);
          addedToGroup = true;
          break;
        }
      }
      
      if (!addedToGroup) {
        groups.push([element]);
      }
    }

    return groups;
  }

  private static calculateAverageBounds(bounds: any[]): any {
    if (bounds.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
    
    const minX = Math.min(...bounds.map(b => b.x));
    const minY = Math.min(...bounds.map(b => b.y));
    const maxX = Math.max(...bounds.map(b => b.x + b.width));
    const maxY = Math.max(...bounds.map(b => b.y + b.height));
    
    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    };
  }

  private static determineContentType(elements: EnhancedTextElement[]): 'visual' | 'textual' | 'combined' {
    // Determine content type based on styling and context
    const hasVisualElements = elements.some(el => 
      el.attributes?.isBold || 
      el.fontSize > 14 ||
      el.path?.includes('Figure') ||
      el.path?.includes('Table')
    );
    
    return hasVisualElements ? 'combined' : 'textual';
  }

  private static isChunkAtHierarchyLevel(chunk: SemanticChunkData, level: string): boolean {
    switch (level) {
      case 'section': return chunk.hierarchy_level <= 2;
      case 'subsection': return chunk.hierarchy_level === 3;
      case 'paragraph': return chunk.hierarchy_level >= 4;
      default: return false;
    }
  }

  private static createContextSummary(chunk: SemanticChunkData, allChunks: SemanticChunkData[]): string {
    // Create summary by combining chunk content with related elements
    const relatedChunks = allChunks.filter(c => 
      c.adobe_path?.startsWith(chunk.adobe_path || '') && c !== chunk
    );
    
    const summary = chunk.content.substring(0, 200);
    const childCount = relatedChunks.length;
    
    return `${summary}${childCount > 0 ? ` (contains ${childCount} sub-elements)` : ''}`;
  }
}

// Type definitions for enhanced embedding data

export interface EmbeddingProcessingResult {
  semanticChunks: SemanticChunkData[];
  multimodalEmbeddings: MultimodalEmbeddingData[];
  tableEmbeddings: TableEmbeddingData[];
  figureEmbeddings: FigureEmbeddingData[];
  hierarchicalEmbeddings: HierarchicalEmbeddingData[];
}

export interface SemanticChunkData {
  document_id: string;
  parent_chunk_id?: string;
  level: string;
  content: string;
  context: any;
  metadata: any;
  adobe_element_type: string;
  adobe_path: string;
  adobe_bounds: any;
  hierarchy_level: number;
}

export interface MultimodalEmbeddingData {
  page_id: string;
  content_type: 'visual' | 'textual' | 'combined';
  chunk_description: string;
  bounding_box: any;
  metadata: any;
  adobe_source_type: string;
  adobe_path_info?: string;
  adobe_figure_bounds: any;
}

export interface TableEmbeddingData {
  adobe_table_id: string;
  row_index: number;
  column_name: string;
  cell_value: string;
  row_description: string;
}

export interface FigureEmbeddingData {
  adobe_figure_id: string;
  caption: string;
  description: string;
  spatial_elements: any;
}

export interface HierarchicalEmbeddingData {
  chunk_id: string;
  embedding_level: string;
  context_summary: string;
  metadata: any;
} 