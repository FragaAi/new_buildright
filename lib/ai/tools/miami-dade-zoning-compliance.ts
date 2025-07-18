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

interface MiamiDadeZoningComplianceProps {
  chatId?: string;
  session: Session;
}

export const miamiDadeZoningComplianceTool = ({ chatId, session }: MiamiDadeZoningComplianceProps) =>
  tool({
    description: '🏙️ MIAMI DADE COUNTY ZONING COMPLIANCE CHECKER: Analyze uploaded site plans and architectural documents for compliance with Miami Dade County Zoning Code (Chapter 33) requirements. This tool focuses on setbacks, lot coverage, building height, parking requirements, and land use restrictions to identify potential zoning violations.',
    parameters: z.object({
      analysisType: z.enum(['comprehensive', 'setbacks', 'height-limits', 'parking', 'lot-coverage', 'land-use']).optional().default('comprehensive').describe('Type of zoning analysis to perform'),
      propertyZoning: z.string().optional().describe('Specific zoning district if known (e.g., RU-1, RU-4M, BU-1)'),
    }),
    execute: async ({ analysisType = 'comprehensive', propertyZoning }) => {
      try {
        console.log(`🏙️ Miami Dade Zoning Compliance Check STARTING for chat ${chatId}`);
        console.log(`📋 Parameters:`, { analysisType, propertyZoning, chatId });
        
        // Check authentication
        if (!session?.user?.id) {
          throw new Error('Authentication required');
        }

        // Database connection
        const client = postgres(process.env.POSTGRES_URL!);
        const db = drizzle(client);

        console.log(`📊 Step 1: Retrieving uploaded document embeddings for zoning analysis...`);
        
        // Get all document embeddings from the current chat
        const documentEmbeddings = await db
          .select({
            id: multimodalEmbedding.id,
            chunkDescription: multimodalEmbedding.chunkDescription,
            embedding: multimodalEmbedding.embedding,
            contentType: multimodalEmbedding.contentType,
            pageNumber: documentPage.pageNumber,
            documentFilename: projectDocument.originalFilename,
            documentId: projectDocument.id,
          })
          .from(multimodalEmbedding)
          .leftJoin(documentPage, eq(multimodalEmbedding.pageId, documentPage.id))
          .leftJoin(projectDocument, eq(documentPage.documentId, projectDocument.id))
          .where(chatId ? eq(projectDocument.chatId, chatId) : undefined)
          .orderBy(desc(multimodalEmbedding.createdAt));

        console.log(`📦 Found ${documentEmbeddings.length} document embeddings to analyze`);

        if (documentEmbeddings.length === 0) {
          return {
            success: false,
            message: 'No documents found for zoning compliance checking. Please upload site plans and architectural documents first.',
            complianceStatus: 'no_documents',
            violations: [],
            recommendations: [],
          };
        }

        console.log(`📊 Step 2: Analyzing document content for Miami Dade zoning compliance...`);
        
        // Import Google's Generative AI for analysis
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' });

        // Extract content for analysis
        const documentContent = documentEmbeddings
          .map(doc => `Document: ${doc.documentFilename}, Page: ${doc.pageNumber}\nContent: ${doc.chunkDescription}`)
          .join('\n\n');

        // Create analysis prompt based on analysis type
        let analysisPrompt = `You are a Miami Dade County Zoning Code (Chapter 33) compliance expert. Analyze the following architectural and site plan documents for zoning violations.

DOCUMENT CONTENT:
${documentContent}

ANALYSIS TYPE: ${analysisType}
${propertyZoning ? `PROPERTY ZONING DISTRICT: ${propertyZoning}` : ''}

Please provide a detailed zoning compliance analysis in the following JSON format:
{
  "overallStatus": "compliant" | "needs_review" | "violations_found",
  "summary": "Brief summary of zoning compliance status",
  "detectedZoning": "Detected or inferred zoning district from documents",
  "violations": [
    {
      "category": "setbacks" | "height-limits" | "parking" | "lot-coverage" | "land-use" | "density" | "landscaping",
      "severity": "critical" | "moderate" | "minor",
      "description": "Description of the zoning violation",
      "codeSection": "Specific Miami Dade Chapter 33 section reference",
      "documentLocation": "Where in the documents this issue was found",
      "measuredValue": "Actual measurement found in documents",
      "requiredValue": "Required value per zoning code",
      "recommendation": "Specific corrective action",
      "requiresVariance": true | false
    }
  ],
  "recommendations": [
    "General recommendations for ensuring zoning compliance"
  ],
  "zoningRequirements": [
    {
      "category": "Category of requirement",
      "requirement": "Specific zoning requirement",
      "status": "compliant" | "non-compliant" | "unclear"
    }
  ]
}

Focus on these key Miami Dade County Zoning areas:
- SETBACKS: Front, rear, and side yard setbacks based on zoning district
- HEIGHT LIMITS: Maximum building height and story limitations
- LOT COVERAGE: Maximum building footprint and impervious surface coverage
- PARKING: Minimum parking spaces required based on use and square footage
- LAND USE: Permitted uses for the zoning district
- DENSITY: Maximum dwelling units per acre (for residential)
- LANDSCAPING: Required landscape buffers and tree preservation
- ACCESSORY STRUCTURES: Pool houses, gazebos, and other accessory buildings

Common Miami Dade Zoning Districts to consider:
- RU-1 (Single Family Residential): 25' front, 20' rear, 7.5' side setbacks typically
- RU-4M (Multi-Family Medium Density): 25' front, 20' rear, 10' side setbacks typically
- BU-1 (General Business): 20' front, 5' rear, 0' side setbacks typically
- EU-M (Estates Medium Density): 35' front, 25' rear, 15' side setbacks typically`;

        if (analysisType !== 'comprehensive') {
          analysisPrompt += `\n\nFOCUS SPECIFICALLY ON: ${analysisType.replace('-', ' ').toUpperCase()} requirements only.`;
        }

        if (propertyZoning) {
          analysisPrompt += `\n\nAPPLY ZONING REQUIREMENTS FOR: ${propertyZoning} district specifically.`;
        }

        const result = await model.generateContent(analysisPrompt);
        const responseText = result.response.text();
        
        console.log(`✅ Zoning analysis completed, parsing results...`);

        // Parse the JSON response
        let zoningAnalysis;
        try {
          // Extract JSON from the response (in case it's wrapped in markdown)
          const jsonMatch = responseText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            zoningAnalysis = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error('No JSON found in response');
          }
        } catch (parseError) {
          console.error('Failed to parse zoning analysis:', parseError);
          // Fallback to a basic analysis
          zoningAnalysis = {
            overallStatus: 'needs_review',
            summary: 'Zoning analysis completed, but detailed parsing failed. Manual review recommended.',
            detectedZoning: 'Unable to determine from documents',
            violations: [],
            recommendations: ['Manual review of zoning compliance recommended', 'Verify actual measurements with survey', 'Consult with zoning professional'],
            zoningRequirements: []
          };
        }

        // Close database connection
        await client.end();

        const violationCount = zoningAnalysis.violations?.length || 0;
        const criticalViolations = zoningAnalysis.violations?.filter((v: any) => v.severity === 'critical').length || 0;

        console.log(`🎯 Zoning analysis completed: ${violationCount} violations found (${criticalViolations} critical)`);

        // Create a natural language response for the user
        let response = `## Miami Dade County Zoning Compliance Analysis\n\n`;
        response += `**Analysis Status:** ${zoningAnalysis.overallStatus.replace('_', ' ').toUpperCase()}\n\n`;
        
        if (zoningAnalysis.detectedZoning) {
          response += `**Detected Zoning:** ${zoningAnalysis.detectedZoning}\n\n`;
        }

        if (zoningAnalysis.summary) {
          response += `**Summary:** ${zoningAnalysis.summary}\n\n`;
        }

        if (violationCount > 0) {
          response += `**Violations Found:** ${violationCount} potential issues identified`;
          if (criticalViolations > 0) {
            response += ` (${criticalViolations} critical)`;
          }
          response += `\n\n`;

          if (zoningAnalysis.violations && zoningAnalysis.violations.length > 0) {
            response += `### Issues Identified:\n\n`;
            zoningAnalysis.violations.forEach((violation: any, index: number) => {
              response += `**${index + 1}. ${violation.title || 'Zoning Violation'}** (${violation.severity})\n`;
              response += `- **Code Reference:** ${violation.codeSection}\n`;
              response += `- **Issue:** ${violation.description}\n`;
              if (violation.location) {
                response += `- **Location:** ${violation.location}\n`;
              }
              if (violation.recommendation) {
                response += `- **Recommendation:** ${violation.recommendation}\n`;
              }
              response += `\n`;
            });
          }
        } else {
          response += `**Violations Found:** No violations detected in the current analysis.\n\n`;
        }

        if (zoningAnalysis.recommendations && zoningAnalysis.recommendations.length > 0) {
          response += `### General Recommendations:\n\n`;
          zoningAnalysis.recommendations.forEach((rec: string, index: number) => {
            response += `${index + 1}. ${rec}\n`;
          });
          response += `\n`;
        }

        if (zoningAnalysis.zoningRequirements && zoningAnalysis.zoningRequirements.length > 0) {
          response += `### Applicable Zoning Requirements:\n\n`;
          zoningAnalysis.zoningRequirements.forEach((req: any) => {
            response += `- **${req.category}:** ${req.requirement}\n`;
            if (req.status) {
              response += `  - Status: ${req.status}\n`;
            }
          });
          response += `\n`;
        }

        const uniqueDocuments = [...new Set(documentEmbeddings.map(d => d.documentFilename))].length;
        response += `*Analysis performed on ${uniqueDocuments} document(s) with ${documentEmbeddings.length} content sections.*`;

        return response;

      } catch (error) {
        console.error('Miami Dade Zoning compliance tool error:', error);
        return `## Miami Dade County Zoning Compliance Analysis - Error\n\nUnable to complete zoning analysis: ${error instanceof Error ? error.message : 'Unknown error occurred'}. Please try again or contact support if the issue persists.`;
      }
    },
  }); 