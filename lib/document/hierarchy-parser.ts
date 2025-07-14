/**
 * Document Hierarchy Parser
 * Understands relationships between architectural/engineering documents
 * Builds project structure and document relationships for NotebookLM-style understanding
 */

import type { DocumentClassificationResult } from './classifier';

export interface ProjectHierarchy {
  projectInfo: {
    name?: string;
    location?: string;
    permitInfo?: {
      permitNumber?: string;
      permitDate?: string;
      jurisdiction?: string;
    };
    architects?: string[];
    engineers?: string[];
  };
  documentSets: DocumentSet[];
  crossReferences: CrossReference[];
  buildingInfo?: {
    occupancyType?: string;
    constructionType?: string;
    stories?: number;
    area?: string;
    zoneInfo?: {
      district?: string;
      landUse?: string;
      allowableUses?: string[];
    };
  };
}

export interface DocumentSet {
  discipline: string; // A, S, E, P, M, C, etc.
  disciplineName: string; // Architectural, Structural, etc.
  documents: DocumentInHierarchy[];
  relationships: DocumentRelationship[];
  coordinationNotes?: string[];
}

export interface DocumentInHierarchy {
  documentId: string;
  sheetNumber: string;
  title: string;
  documentType: string;
  subtype: string;
  orderIndex: number; // For sorting (A-000, A-001, A-100, A-101, etc.)
  references: string[]; // Other sheets this document references
  referencedBy: string[]; // Other sheets that reference this document
  classification: DocumentClassificationResult;
}

export interface DocumentRelationship {
  type: 'references' | 'coordinates_with' | 'details_from' | 'elevation_of' | 'section_of' | 'schedule_for';
  sourceDocumentId: string;
  targetDocumentId: string;
  description: string;
  confidence: number;
}

export interface CrossReference {
  fromSheet: string;
  toSheet: string;
  referenceType: string;
  location?: string; // Where in the document the reference occurs
  description?: string;
}

export class HierarchicalParser {
  
  /**
   * Parse document structure and build project hierarchy
   */
  async parseDocumentStructure(
    documents: Array<{
      documentId: string;
      filename: string;
      classification: DocumentClassificationResult;
      pages?: Array<{
        pageNumber: number;
        textElements?: Array<{ text: string; coordinates: any }>;
      }>;
    }>
  ): Promise<ProjectHierarchy> {
    console.log('🏗️ Building document hierarchy from classified documents...');

    // Step 1: Extract project information
    const projectInfo = await this.extractProjectInfo(documents);

    // Step 2: Group documents by discipline
    const documentSets = this.groupDocumentsByDiscipline(documents);

    // Step 3: Analyze cross-references
    const crossReferences = await this.analyzeCrossReferences(documents);

    // Step 4: Build relationships
    this.buildDocumentRelationships(documentSets, crossReferences);

    // Step 5: Extract building information
    const buildingInfo = await this.extractBuildingInfo(documents);

    const hierarchy: ProjectHierarchy = {
      projectInfo,
      documentSets,
      crossReferences,
      buildingInfo
    };

    console.log('✅ Document hierarchy built:', {
      documentSets: documentSets.length,
      totalDocuments: documentSets.reduce((sum, set) => sum + set.documents.length, 0),
      crossReferences: crossReferences.length
    });

    return hierarchy;
  }

  /**
   * Extract project information from documents (especially cover sheets)
   */
  private async extractProjectInfo(documents: any[]): Promise<ProjectHierarchy['projectInfo']> {
    // Look for cover sheets or title pages
    const coverSheets = documents.filter(doc => 
      doc.classification.subtype === 'cover' || 
      doc.classification.sheetNumber?.includes('000') ||
      doc.filename.toLowerCase().includes('cover')
    );

    let projectInfo: ProjectHierarchy['projectInfo'] = {};

    for (const coverSheet of coverSheets) {
      const titleBlockInfo = coverSheet.classification.aiAnalysis.titleBlockInfo;
      
      if (titleBlockInfo?.projectName) {
        projectInfo.name = titleBlockInfo.projectName;
      }

      // Extract additional info from text elements
      const allText = coverSheet.pages?.[0]?.textElements
        ?.map((el: any) => el.text)
        .join(' ') || '';

      // Extract location
      const locationMatch = allText.match(/(?:located at|address:|location:)\s*([^,\n]+)/i);
      if (locationMatch) {
        projectInfo.location = locationMatch[1].trim();
      }

      // Extract permit information
      const permitMatch = allText.match(/permit\s*(?:no|number|#):?\s*([A-Z0-9-]+)/i);
      if (permitMatch) {
        projectInfo.permitInfo = {
          permitNumber: permitMatch[1]
        };
      }

      // Extract architect/engineer info
      const architectMatch = allText.match(/architect:?\s*([^,\n]+)/i);
      if (architectMatch) {
        projectInfo.architects = [architectMatch[1].trim()];
      }
    }

    return projectInfo;
  }

  /**
   * Group documents by discipline and create document sets
   */
  private groupDocumentsByDiscipline(documents: any[]): DocumentSet[] {
    const disciplineMap = new Map<string, DocumentInHierarchy[]>();
    const disciplineNames: Record<string, string> = {
      'A': 'Architectural',
      'S': 'Structural', 
      'E': 'Electrical',
      'P': 'Plumbing',
      'M': 'Mechanical',
      'C': 'Civil',
      'G': 'General',
      'L': 'Landscape',
      'T': 'Telecommunications'
    };

    // Group documents
    for (const doc of documents) {
      const discipline = this.extractDiscipline(doc);
      
      const docInHierarchy: DocumentInHierarchy = {
        documentId: doc.documentId,
        sheetNumber: doc.classification.sheetNumber || 'Unknown',
        title: doc.classification.aiAnalysis.titleBlockInfo?.sheetTitle || doc.filename,
        documentType: doc.classification.primaryType,
        subtype: doc.classification.subtype,
        orderIndex: this.calculateOrderIndex(doc.classification.sheetNumber || ''),
        references: [],
        referencedBy: [],
        classification: doc.classification
      };

      if (!disciplineMap.has(discipline)) {
        disciplineMap.set(discipline, []);
      }
      disciplineMap.get(discipline)!.push(docInHierarchy);
    }

    // Create document sets
    const documentSets: DocumentSet[] = [];
    for (const [discipline, docs] of disciplineMap.entries()) {
      // Sort documents by order index
      docs.sort((a, b) => a.orderIndex - b.orderIndex);

      const documentSet: DocumentSet = {
        discipline,
        disciplineName: disciplineNames[discipline] || 'Other',
        documents: docs,
        relationships: []
      };

      documentSets.push(documentSet);
    }

    return documentSets;
  }

  /**
   * Extract discipline code from document
   */
  private extractDiscipline(doc: any): string {
    // Try from sheet number first
    if (doc.classification.sheetNumber) {
      const match = doc.classification.sheetNumber.match(/^([A-Z])/);
      if (match) return match[1];
    }

    // Try from discipline field
    if (doc.classification.discipline) {
      return doc.classification.discipline.charAt(0).toUpperCase();
    }

    // Fallback based on primary type
    const typeMap: Record<string, string> = {
      'architectural': 'A',
      'structural': 'S',
      'electrical': 'E',
      'plumbing': 'P',
      'mechanical': 'M',
      'civil': 'C'
    };

    return typeMap[doc.classification.primaryType] || 'G';
  }

  /**
   * Calculate order index for sorting sheets
   */
  private calculateOrderIndex(sheetNumber: string): number {
    if (!sheetNumber) return 9999;

    // Extract discipline and number (e.g., "A-101" -> "A" + 101)
    const match = sheetNumber.match(/^([A-Z])[-_]?(\d+)(?:\.(\d+))?/);
    if (match) {
      const discipline = match[1];
      const mainNumber = parseInt(match[2], 10);
      const subNumber = match[3] ? parseInt(match[3], 10) : 0;

      // Create a sortable index: discipline priority + main number + sub number
      const disciplinePriority: Record<string, number> = {
        'G': 0, // General first
        'A': 100000, // Architectural
        'S': 200000, // Structural
        'C': 300000, // Civil
        'L': 350000, // Landscape
        'E': 400000, // Electrical
        'P': 500000, // Plumbing
        'M': 600000, // Mechanical
        'T': 700000  // Telecommunications
      };

      const basePriority = disciplinePriority[discipline] || 800000;
      return basePriority + (mainNumber * 100) + subNumber;
    }

    return 9999;
  }

  /**
   * Analyze cross-references between documents
   */
  private async analyzeCrossReferences(documents: any[]): Promise<CrossReference[]> {
    const crossReferences: CrossReference[] = [];

    for (const doc of documents) {
      const allText = doc.pages?.[0]?.textElements
        ?.map((el: any) => el.text)
        .join(' ') || '';

      // Look for sheet references (e.g., "SEE A-201", "DETAIL 1/A-501")
      const sheetRefs = allText.match(/(?:see|detail|refer to|typ\.?)\s+(?:sheet\s+)?([A-Z]-?\d+)/gi);
      
      if (sheetRefs) {
        for (const ref of sheetRefs) {
          const sheetMatch = ref.match(/([A-Z]-?\d+)/i);
          if (sheetMatch) {
            crossReferences.push({
              fromSheet: doc.classification.sheetNumber || doc.filename,
              toSheet: sheetMatch[1].toUpperCase(),
              referenceType: 'explicit_reference',
              description: ref.trim()
            });
          }
        }
      }

      // Look for detail markers (e.g., "1/A-501", "DETAIL A")
      const detailRefs = allText.match(/(\d+)\/([A-Z]-?\d+)/g);
      if (detailRefs) {
        for (const ref of detailRefs) {
          const match = ref.match(/(\d+)\/([A-Z]-?\d+)/);
          if (match) {
            crossReferences.push({
              fromSheet: doc.classification.sheetNumber || doc.filename,
              toSheet: match[2],
              referenceType: 'detail_reference',
              description: `Detail ${match[1]} on sheet ${match[2]}`
            });
          }
        }
      }
    }

    return crossReferences;
  }

  /**
   * Build relationships between documents based on their types and references
   */
  private buildDocumentRelationships(documentSets: DocumentSet[], crossReferences: CrossReference[]): void {
    // Add explicit references from cross-reference analysis
    for (const ref of crossReferences) {
      const sourceDoc = this.findDocumentBySheetNumber(documentSets, ref.fromSheet);
      const targetDoc = this.findDocumentBySheetNumber(documentSets, ref.toSheet);

      if (sourceDoc && targetDoc) {
        sourceDoc.references.push(targetDoc.documentId);
        targetDoc.referencedBy.push(sourceDoc.documentId);

        // Add relationship to the appropriate document set
        const sourceSet = documentSets.find(set => 
          set.documents.some(doc => doc.documentId === sourceDoc.documentId)
        );
        
        if (sourceSet) {
          sourceSet.relationships.push({
            type: ref.referenceType as any,
            sourceDocumentId: sourceDoc.documentId,
            targetDocumentId: targetDoc.documentId,
            description: ref.description || '',
            confidence: 0.8
          });
        }
      }
    }

    // Add implicit relationships based on document types
    for (const set of documentSets) {
      this.addImplicitRelationships(set);
    }
  }

  /**
   * Add implicit relationships based on document hierarchy and types
   */
  private addImplicitRelationships(documentSet: DocumentSet): void {
    const docs = documentSet.documents;

    // Plans typically coordinate with elevations and sections
    const plans = docs.filter(doc => doc.subtype === 'plan');
    const elevations = docs.filter(doc => doc.subtype === 'elevation');
    const sections = docs.filter(doc => doc.subtype === 'section');
    const details = docs.filter(doc => doc.subtype === 'detail');

    // Plans coordinate with elevations
    for (const plan of plans) {
      for (const elevation of elevations) {
        documentSet.relationships.push({
          type: 'coordinates_with',
          sourceDocumentId: plan.documentId,
          targetDocumentId: elevation.documentId,
          description: `${plan.title} coordinates with ${elevation.title}`,
          confidence: 0.6
        });
      }
    }

    // Details typically come from plans or elevations
    for (const detail of details) {
      for (const plan of plans) {
        documentSet.relationships.push({
          type: 'details_from',
          sourceDocumentId: detail.documentId,
          targetDocumentId: plan.documentId,
          description: `${detail.title} shows details from ${plan.title}`,
          confidence: 0.5
        });
      }
    }
  }

  /**
   * Find document by sheet number across all sets
   */
  private findDocumentBySheetNumber(documentSets: DocumentSet[], sheetNumber: string): DocumentInHierarchy | null {
    for (const set of documentSets) {
      for (const doc of set.documents) {
        if (doc.sheetNumber === sheetNumber) {
          return doc;
        }
      }
    }
    return null;
  }

  /**
   * Extract building information from architectural documents
   */
  private async extractBuildingInfo(documents: any[]): Promise<ProjectHierarchy['buildingInfo']> {
    // Look for zoning or site plan documents
    const zoningDocs = documents.filter(doc => 
      doc.classification.aiAnalysis.drawingType?.toLowerCase().includes('zoning') ||
      doc.classification.sheetNumber?.includes('100') ||
      doc.classification.subtype === 'plan' && doc.classification.primaryType === 'architectural'
    );

    const buildingInfo: ProjectHierarchy['buildingInfo'] = {};

    for (const doc of zoningDocs) {
      const allText = doc.pages?.[0]?.textElements
        ?.map((el: any) => el.text)
        .join(' ') || '';

      // Extract occupancy type
      const occupancyMatch = allText.match(/occupancy\s*(?:type|classification):?\s*([A-Z0-9-]+)/i);
      if (occupancyMatch) {
        buildingInfo.occupancyType = occupancyMatch[1];
      }

      // Extract construction type
      const constructionMatch = allText.match(/construction\s*type:?\s*([A-Z0-9-]+)/i);
      if (constructionMatch) {
        buildingInfo.constructionType = constructionMatch[1];
      }

      // Extract zoning information
      const zoneMatch = allText.match(/zone?(?:ing)?:?\s*([A-Z0-9-]+)/i);
      if (zoneMatch) {
        buildingInfo.zoneInfo = {
          district: zoneMatch[1]
        };
      }
    }

    return buildingInfo;
  }
} 