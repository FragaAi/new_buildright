import { tool } from 'ai';
import { z } from 'zod';
import { Session } from 'next-auth';
import { semanticSearchTool } from './semantic-search';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { complianceCheck, projectDocument } from '@/lib/db/schema';
import { generateUUID } from '@/lib/utils';
import { eq } from 'drizzle-orm';

interface StandardsChecklistComplianceProps {
  chatId?: string;
  session: Session;
}

// Enhanced checklist with targeted search terms based on actual document content
const checklist = [
  // A-100 — Zoning Legend
  {
    id: 'A-100-01',
    sheet: 'A-100',
    title: 'Zoning Legend',
    description: 'Legend & status indicators',
    searchTerms: [
      'zoning legend',
      'status indicators',
      'legend',
      'RU-1 Single Family Residential District'
    ],
    priority: 'high',
    category: 'zoning',
    expectedValueTypes: ['zoning district', 'legend items', 'status indicators']
  },
  {
    id: 'A-100-02',
    sheet: 'A-100',
    title: 'Show Allowed, Existing, and Proposed zoning data',
    description: 'Zoning data comparison table',
    searchTerms: [
      'setback',
      'setbacks',
      'building setbacks',
      'Right Side Interior',
      'Left Side Interior',
      'front setback',
      'rear setback'
    ],
    priority: 'high',
    category: 'zoning',
    expectedValueTypes: ['setback dimensions', 'building requirements', 'zoning compliance data']
  },
  {
    id: 'A-100-03',
    sheet: 'A-100',
    title: 'Diagrams (if applicable)',
    description: 'Required zoning diagrams',
    searchTerms: [
      'diagram',
      'site diagram',
      'zoning diagram',
      'Not To Scale',
      'N.T.S.'
    ],
    priority: 'medium',
    category: 'zoning',
    expectedValueTypes: ['diagram references', 'scale information', 'drawing notes']
  },
  {
    id: 'A-100-04',
    sheet: 'A-100',
    title: 'Lot / Ground Coverage',
    description: 'Lot coverage calculations and requirements',
    searchTerms: [
      'Total Lot Coverage',
      'lot coverage',
      'Proposed lot coverage',
      'Existing lot coverage',
      'Total Site Area'
    ],
    priority: 'high',
    category: 'zoning',
    expectedValueTypes: ['lot coverage percentages', 'coverage calculations', 'site area measurements']
  },
  {
    id: 'A-100-05',
    sheet: 'A-100',
    title: 'Open Space',
    description: 'Open space requirements and calculations',
    searchTerms: [
      'Green Area',
      'green space',
      'Proposed Green Space',
      'Existing Green Space',
      'open space'
    ],
    priority: 'high',
    category: 'zoning',
    expectedValueTypes: ['green space percentages', 'open space calculations']
  },
  {
    id: 'A-100-06',
    sheet: 'A-100',
    title: 'Floor-Area Ratio (FAR)',
    description: 'FAR calculations and requirements',
    searchTerms: [
      'Total Floor Area',
      'Floor Area Ratio',
      'FAR',
      'Proposed Floor Area',
      'Existing Non-Conforming'
    ],
    priority: 'high',
    category: 'zoning',
    expectedValueTypes: ['FAR values', 'floor area calculations', 'building area measurements']
  },
  {
    id: 'A-100-07',
    sheet: 'A-100',
    title: 'Green Area',
    description: 'Green area requirements and landscaping',
    searchTerms: [
      'Green Area',
      'green space',
      'Proposed Green Space',
      'Existing Green Space',
      'landscaping'
    ],
    priority: 'medium',
    category: 'zoning',
    expectedValueTypes: ['green area percentages', 'landscaping requirements']
  },
  {
    id: 'A-100-08',
    sheet: 'A-100',
    title: 'Impervious Area',
    description: 'Impervious surface calculations',
    searchTerms: [
      'Impervious Area',
      'Proposed Impervious Area',
      'Existing Impervious Area',
      'Minimum Impervious Area'
    ],
    priority: 'medium',
    category: 'zoning',
    expectedValueTypes: ['impervious percentages', 'surface calculations']
  },
  // A-101 — Site Plan
  {
    id: 'A-101-01',
    sheet: 'A-101',
    title: 'General notes & tables',
    description: 'Site plan general notes and reference tables',
    searchTerms: [
      'general notes',
      'site plan notes',
      'project notes',
      'notes table'
    ],
    priority: 'high',
    category: 'site_plan',
    expectedValueTypes: ['note content', 'table data', 'reference information']
  },
  {
    id: 'A-101-02',
    sheet: 'A-101',
    title: 'Site-plan project notes (use N-# call-outs)',
    description: 'Numbered project notes with call-outs',
    searchTerms: [
      'N-1',
      'N-2', 
      'N-3',
      'project notes',
      'callout',
      'site plan notes'
    ],
    priority: 'high',
    category: 'site_plan',
    expectedValueTypes: ['numbered notes', 'callout references']
  },
  {
    id: 'A-101-03',
    sheet: 'A-101',
    title: 'Building-elevation table',
    description: 'Building elevation reference table',
    searchTerms: [
      'elevation',
      'building elevation',
      'NGVD',
      'NAVD',
      'elevation table',
      'datum'
    ],
    priority: 'high',
    category: 'site_plan',
    expectedValueTypes: ['elevation values', 'datum references', 'benchmark data']
  },
  {
    id: 'A-101-04',
    sheet: 'A-101',
    title: 'Vertical control',
    description: 'Vertical control and datum information',
    searchTerms: [
      'vertical control',
      'control elevation',
      'datum',
      'benchmark',
      'NGVD',
      'NAVD'
    ],
    priority: 'high',
    category: 'site_plan',
    expectedValueTypes: ['control points', 'elevation references', 'datum information']
  },
  {
    id: 'A-101-05',
    sheet: 'A-101',
    title: 'Existing crown-of-road elevation (NGVD or NAVD datum)',
    description: 'Road elevation reference',
    searchTerms: [
      'crown of road',
      'road elevation',
      'Existing Crown of Road Elevation',
      'NGVD',
      'NAVD'
    ],
    priority: 'high',
    category: 'site_plan',
    expectedValueTypes: ['road elevation values', 'datum type', 'centerline elevation']
  },
  {
    id: 'A-101-06',
    sheet: 'A-101',
    title: 'Finished-floor elevations: garage & house',
    description: 'Finished floor elevation specifications',
    searchTerms: [
      'finished floor elevation',
      'New House Finished Floor Elevation',
      'garage elevation',
      'house elevation',
      'FFE',
      'FFF'
    ],
    priority: 'high',
    category: 'site_plan',
    expectedValueTypes: ['garage elevation', 'house elevation', 'floor elevation values']
  }
];

// Enhanced value extraction function that looks for specific patterns
function extractSpecificValues(content: string, item: any, docRef: string): string[] {
  const findings: string[] = [];
  
  if (!content) return findings;
  
  // Enhanced patterns based on actual document content
  const valuePatterns = {
    // Coverage patterns: "Total Lot Coverage (Proposed): 1,983 sq ft (18.03%)"
    coverage: /([^:]*(?:coverage|Coverage)[^:]*):?\s*([0-9,]+(?:\.\d+)?)\s*sq\s*ft\s*\(([0-9.]+)%\)/gi,
    
    // Area patterns: "Green Area: 1,409 sq ft (13.94%)"
    area: /([^:]*(?:Area|area|Space|space)[^:]*):?\s*([0-9,]+(?:\.\d+)?)\s*sq\s*ft\s*\(([0-9.]+)%\)/gi,
    
    // Floor area patterns: "Total Floor Area: 1,190 sq ft"
    floorArea: /([^:]*(?:Floor\s+Area|floor\s+area)[^:]*):?\s*([0-9,]+(?:\.\d+)?)\s*sq\s*ft/gi,
    
    // Elevation patterns: "New House Finished Floor Elevation: 9.90'-0\" NGVD"
    elevation: /([^:]*(?:elevation|Elevation)[^:]*):?\s*([0-9.]+[''-]+[0-9]*[""]?)\s*(NGVD|NAVD)?/gi,
    
    // Setback patterns: "Right Side (Interior): 7.5'-0\""
    setback: /([^:]*(?:Side|setback|Setback)[^:]*):?\s*([0-9.]+[''-]+[0-9]*[""]?)/gi,
    
    // Site area patterns: "Total Site Area: 10,111 sq ft"
    siteArea: /([^:]*(?:Site\s+Area|site\s+area)[^:]*):?\s*([0-9,]+(?:\.\d+)?)\s*sq\s*ft/gi,
    
    // General measurement patterns
    measurement: /([^:]*):?\s*([0-9,]+(?:\.\d+)?)\s*(?:sq\s*ft|ft|feet|'|")/gi
  };
  
  // Apply patterns based on item type
  Object.entries(valuePatterns).forEach(([patternName, pattern]) => {
    let matches;
    const regex = new RegExp(pattern.source, pattern.flags);
    
    while ((matches = regex.exec(content)) !== null) {
      if (matches.length >= 3) {
        const label = matches[1]?.trim();
        const value = matches[2]?.trim();
        const unit = matches[3]?.trim();
        
        if (label && value && label.length > 2 && value.length > 0) {
          let formattedValue = `${label}: ${value}`;
          if (unit) {
            formattedValue += ` (${unit})`;
          }
          if (matches[4]) { // Additional info like sq ft
            formattedValue += ` sq ft`;
          }
          formattedValue += ` (from ${docRef})`;
          findings.push(formattedValue);
        }
      }
    }
  });
  
  // Special handling for specific item types
  switch (item.id) {
    case 'A-100-04': // Lot Coverage
      const coverageMatches = content.match(/lot\s+coverage[^.]*?(\d+[,\d]*\.?\d*)\s*sq\s*ft[^.]*?(\d+\.?\d*)%/gi);
      if (coverageMatches) {
        coverageMatches.forEach(match => findings.push(`${match} (from ${docRef})`));
      }
      break;
      
    case 'A-100-06': // FAR
      const farMatches = content.match(/floor\s+area[^.]*?(\d+[,\d]*\.?\d*)\s*sq\s*ft/gi);
      if (farMatches) {
        farMatches.forEach(match => findings.push(`${match} (from ${docRef})`));
      }
      break;
      
    case 'A-101-05': // Road elevation
      const roadMatches = content.match(/crown[^.]*?(\d+\.?\d*[''-]*[0-9]*[""]?)[^.]*?NGVD/gi);
      if (roadMatches) {
        roadMatches.forEach(match => findings.push(`${match} (from ${docRef})`));
      }
      break;
  }
  
  return [...new Set(findings)]; // Remove duplicates
}

export const standardsChecklistComplianceTool = ({ chatId, session }: StandardsChecklistComplianceProps) =>
  tool({
    description: '📋 STANDARDS CHECKLIST COMPLIANCE CHECKER: Analyze uploaded architectural plans for A-100 and A-101 checklist compliance. Provides detailed findings with specific values, measurements, and document references for each required element.',
    parameters: z.object({
      analysisType: z.enum(['comprehensive']).optional().default('comprehensive').describe('Type of checklist analysis to perform'),
      saveResults: z.boolean().optional().default(true).describe('Whether to save compliance results to database'),
    }),
    execute: async ({ analysisType = 'comprehensive', saveResults = true }) => {
      try {
        // Database connection using Neon project details
        const client = postgres(process.env.POSTGRES_URL!);
        const db = drizzle(client);

        console.log(`🔍 Starting comprehensive checklist analysis for chat ${chatId}`);

        // Enhanced analysis for each checklist item
        const detailedResults = await Promise.all(
          checklist.map(async (item) => {
            const search = semanticSearchTool({ chatId, session });
            
            let status = 'NOT EXPLICITLY FOUND';
            let confidence = 0.0;
            let detailedFindings: string[] = [];
            let documentReferences: string[] = [];
            
            // Search for each term individually for better precision
            for (const searchTerm of item.searchTerms) {
              try {
                const searchResult = await search.execute({
                  query: searchTerm,
                  contentType: 'textual',
                  limit: 5,
                }, {
                  toolCallId: '',
                  messages: [],
                });

                if (searchResult.success && searchResult.results && searchResult.results.length > 0) {
                  searchResult.results.forEach((result: any) => {
                    if (result.description && result.document) {
                      const content = result.description;
                      const docRef = `${result.document?.filename}, page ${result.document?.page}`;
                      const similarity = parseFloat(result.similarity?.replace('%', '') || '0') / 100;
                      
                      if (similarity >= 0.25) { // Lower threshold for more results
                        status = 'FOUND';
                        confidence = Math.max(confidence, similarity);
                        
                        // Extract specific values using enhanced patterns
                        const extractedValues = extractSpecificValues(content, item, docRef);
                        detailedFindings.push(...extractedValues);
                        
                        // If no specific values extracted, include the raw content
                        if (extractedValues.length === 0 && content.length > 30) {
                          // Look for any measurements or values in the content
                          const hasNumbers = /\d+(?:[,.]?\d+)*\s*(?:sq\s*ft|ft|feet|'|"|%)/i.test(content);
                          if (hasNumbers || content.toLowerCase().includes(searchTerm.toLowerCase())) {
                            const excerpt = content.length > 150 ? content.substring(0, 150) + '...' : content;
                            detailedFindings.push(`"${excerpt}" (from ${docRef})`);
                          }
                        }
                        
                        // Track document references
                        if (!documentReferences.includes(docRef)) {
                          documentReferences.push(docRef);
                        }
                      }
                    }
                  });
                }
              } catch (error) {
                console.error(`Error searching for term "${searchTerm}":`, error);
              }
            }
            
            // Additional targeted search for this specific item type
            const combinedQuery = `${item.sheet} ${item.title} ${item.searchTerms.join(' ')}`;
            try {
              const combinedSearch = await search.execute({
                query: combinedQuery,
                contentType: 'textual',
                limit: 8,
              }, {
                toolCallId: '',
                messages: [],
              });

              if (combinedSearch.success && combinedSearch.results) {
                combinedSearch.results.forEach((result: any) => {
                  if (result.description && result.document) {
                    const content = result.description;
                    const docRef = `${result.document?.filename}, page ${result.document?.page}`;
                    const similarity = parseFloat(result.similarity?.replace('%', '') || '0') / 100;
                    
                    if (similarity >= 0.2) {
                      status = 'FOUND';
                      confidence = Math.max(confidence, similarity);
                      
                      const extractedValues = extractSpecificValues(content, item, docRef);
                      detailedFindings.push(...extractedValues);
                      
                      if (!documentReferences.includes(docRef)) {
                        documentReferences.push(docRef);
                      }
                    }
                  }
                });
              }
            } catch (error) {
              console.error(`Error in combined search for ${item.id}:`, error);
            }
            
            // Remove duplicate findings
            detailedFindings = [...new Set(detailedFindings)];
            
            // If no detailed findings but documents found, provide context
            if (detailedFindings.length === 0 && documentReferences.length > 0) {
              detailedFindings.push(`Found references in ${documentReferences.join(', ')} but specific ${item.title.toLowerCase()} details require manual review.`);
            }
            
            return {
              id: item.id,
              sheet: item.sheet,
              title: item.title,
              status,
              confidence,
              details: detailedFindings,
              documentReferences,
              searchedTerms: item.searchTerms,
              category: item.category
            };
          })
        );

        // Calculate overall compliance
        const totalItems = detailedResults.length;
        const foundItems = detailedResults.filter(r => r.status.includes('FOUND')).length;
        const overallScore = (foundItems / totalItems) * 100;

        // Save to database if requested
        let complianceCheckId = null;
        if (saveResults && chatId) {
          try {
            // Use postgres client directly for raw queries since schema uses snake_case naming
            const documentsResult = await client`
              SELECT id FROM project_documents WHERE chat_id = ${chatId} LIMIT 1
            `;

            const documentId = documentsResult.length > 0 ? documentsResult[0].id : null;

            const complianceResult = await client`
              INSERT INTO compliance_checks (id, chat_id, document_id, check_type, status, code_sections_referenced, findings, created_at, updated_at) 
              VALUES (${generateUUID()}, ${chatId}, ${documentId}, ${'ai_assisted'}, ${overallScore >= 80 ? 'compliant' : overallScore >= 50 ? 'requires_review' : 'non_compliant'}, ${JSON.stringify(['A-100', 'A-101'])}, ${JSON.stringify({
                overallScore: overallScore,
                totalItems: totalItems,
                foundItems: foundItems,
                analysisType: analysisType,
                detailedResults: detailedResults,
                analysisDate: new Date().toISOString()
              })}, ${new Date().toISOString()}, ${new Date().toISOString()}) 
              RETURNING id
            `;

            complianceCheckId = complianceResult.length > 0 ? complianceResult[0].id : null;
            console.log(`💾 Saved compliance check to database: ${complianceCheckId}`);
          } catch (dbError) {
            console.error('Failed to save compliance check to database:', dbError);
          }
        }

        await client.end();

        // Create formatted response for chat display
        let formattedResponse = `# Standards Checklist Compliance Check\n\n`;
        formattedResponse += `## A-100 — Zoning Document Checklist\n\n`;

        // Group by sheet and display results
        const a100Items = detailedResults.filter(item => item.sheet === 'A-100');
        const a101Items = detailedResults.filter(item => item.sheet === 'A-101');

        a100Items.forEach((item, index) => {
          formattedResponse += `${index + 1}. **${item.title}:** ${item.status}`;
          if (item.status.includes('FOUND')) {
            formattedResponse += ` (${item.documentReferences.length} reference${item.documentReferences.length > 1 ? 's' : ''})`;
          }
          formattedResponse += `\n`;
          
          if (item.details.length > 0) {
            item.details.forEach((detail, detailIndex) => {
              formattedResponse += `   - ${detail}\n`;
            });
          } else {
            formattedResponse += `   - The search results did not explicitly mention "${item.title}" in relation to the ${item.sheet} document.\n`;
          }
          formattedResponse += `\n`;
        });

        if (a101Items.length > 0) {
          formattedResponse += `## A-101 — Site Plan Document Checklist\n\n`;
          
          a101Items.forEach((item, index) => {
            formattedResponse += `${index + 1}. **${item.title}:** ${item.status}`;
            if (item.status.includes('FOUND')) {
              formattedResponse += ` (${item.documentReferences.length} reference${item.documentReferences.length > 1 ? 's' : ''})`;
            }
            formattedResponse += `\n`;
            
            if (item.details.length > 0) {
              item.details.forEach((detail, detailIndex) => {
                formattedResponse += `   - ${detail}\n`;
              });
            } else {
              formattedResponse += `   - The search results did not explicitly mention "${item.title}" in relation to the ${item.sheet} document.\n`;
            }
            formattedResponse += `\n`;
          });
        }

        formattedResponse += `---\n\n`;
        formattedResponse += `**Overall Compliance:** ${foundItems}/${totalItems} items found (${overallScore.toFixed(1)}%)\n`;
        if (complianceCheckId) {
          formattedResponse += `**Analysis ID:** ${complianceCheckId}\n`;
        }

        return {
          success: true,
          message: formattedResponse,
          results: detailedResults,
          summary: {
            totalItems,
            foundItems,
            overallScore: parseFloat(overallScore.toFixed(1)),
            complianceCheckId,
            analysisDate: new Date().toISOString()
          },
        };
      } catch (error) {
        return {
          success: false,
          message: `Error running checklist compliance analysis: ${error instanceof Error ? error.message : 'Unknown error'}`,
          results: [],
        };
      }
    },
  }); 