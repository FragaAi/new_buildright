import { tool } from 'ai';
import { z } from 'zod';
import { Session } from 'next-auth';
import { semanticSearchTool } from './semantic-search';

interface StandardsChecklistComplianceProps {
  chatId?: string;
  session: Session;
}

// Hardcoded checklist JSON for prototype
const checklist = [
  // A-100 — Zoning Legend
  {
    id: 'A-100-01',
    sheet: 'A-100',
    description: 'Legend & status indicators',
    keywords: ['zoning legend', 'status indicators', 'legend'],
    status: '',
    comment: ''
  },
  {
    id: 'A-100-02',
    sheet: 'A-100',
    description: 'Show Allowed, Existing, and Proposed zoning data',
    keywords: ['allowed zoning', 'existing zoning', 'proposed zoning', 'zoning data'],
    status: '',
    comment: ''
  },
  {
    id: 'A-100-03',
    sheet: 'A-100',
    description: 'Required zoning diagrams (if applicable)',
    keywords: ['zoning diagram', 'zoning diagrams', 'required diagrams'],
    status: '',
    comment: ''
  },
  {
    id: 'A-100-04',
    sheet: 'A-100',
    description: 'Lot / Ground Coverage',
    keywords: ['lot coverage', 'ground coverage', 'coverage'],
    status: '',
    comment: ''
  },
  {
    id: 'A-100-05',
    sheet: 'A-100',
    description: 'Open Space',
    keywords: ['open space', 'open area', 'green area'],
    status: '',
    comment: ''
  },
  {
    id: 'A-100-06',
    sheet: 'A-100',
    description: 'Floor-Area Ratio (FAR)',
    keywords: ['floor area ratio', 'FAR'],
    status: '',
    comment: ''
  },
  {
    id: 'A-100-07',
    sheet: 'A-100',
    description: 'Green Area',
    keywords: ['green area', 'landscaped area'],
    status: '',
    comment: ''
  },
  {
    id: 'A-100-08',
    sheet: 'A-100',
    description: 'Impervious Area',
    keywords: ['impervious area', 'impervious'],
    status: '',
    comment: ''
  },
  // A-101 — Site Plan
  {
    id: 'A-101-01',
    sheet: 'A-101',
    description: 'General notes & tables',
    keywords: ['general notes', 'site plan notes', 'tables'],
    status: '',
    comment: ''
  },
  {
    id: 'A-101-02',
    sheet: 'A-101',
    description: 'Site-plan project notes (use N-# call-outs)',
    keywords: ['site-plan notes', 'N-#', 'project notes', '^N-\\d+'],
    status: '',
    comment: ''
  },
  {
    id: 'A-101-03',
    sheet: 'A-101',
    description: 'Building-elevation table',
    keywords: ['building-elevation table', 'elevation table', 'Elevation', 'NGVD', 'NAVD'],
    status: '',
    comment: ''
  },
  {
    id: 'A-101-04',
    sheet: 'A-101',
    description: 'Vertical control',
    keywords: ['vertical control', 'control elevation', 'datum'],
    status: '',
    comment: ''
  },
  {
    id: 'A-101-05',
    sheet: 'A-101',
    description: 'Existing crown-of-road elevation (NGVD or NAVD datum)',
    keywords: ['crown-of-road', 'crown elevation', 'road centerline', 'NGVD', 'NAVD'],
    status: '',
    comment: ''
  },
  {
    id: 'A-101-06',
    sheet: 'A-101',
    description: 'Finished-floor elevations: garage & house',
    keywords: ['finished floor elevation', 'garage elevation', 'house elevation', 'FFF'],
    status: '',
    comment: ''
  },
  // Legal & administrative
  {
    id: 'A-101-07',
    sheet: 'A-101',
    description: 'Full legal description',
    keywords: ['legal description', 'parcel description', 'lot', 'block'],
    status: '',
    comment: ''
  },
  {
    id: 'A-101-08',
    sheet: 'A-101',
    description: 'Flood-insurance information',
    keywords: ['flood insurance', 'flood zone', 'insurance'],
    status: '',
    comment: ''
  },
  {
    id: 'A-101-09',
    sheet: 'A-101',
    description: 'Folio number',
    keywords: ['folio number', 'folio'],
    status: '',
    comment: ''
  },
  {
    id: 'A-101-10',
    sheet: 'A-101',
    description: '“Certify to: ______” line',
    keywords: ['certify to', 'certification'],
    status: '',
    comment: ''
  },
  {
    id: 'A-101-11',
    sheet: 'A-101',
    description: 'Scope of work statement',
    keywords: ['scope of work', 'scope', 'work statement'],
    status: '',
    comment: ''
  },
  {
    id: 'A-101-12',
    sheet: 'A-101',
    description: 'Applicable code list',
    keywords: ['applicable code', 'code list', 'FBC', 'NFPA', 'IBC'],
    status: '',
    comment: ''
  },
  // Driveway / sewer
  {
    id: 'A-101-13',
    sheet: 'A-101',
    description: 'Driveway detail (if needed)',
    keywords: ['driveway detail', 'driveway', 'enlarged section', 'spec', 'call-out'],
    status: '',
    comment: ''
  },
  {
    id: 'A-101-14',
    sheet: 'A-101',
    description: 'Sewer connection: show one — septic (tank + drain field) or municipal sewer',
    keywords: ['sewer connection', 'septic', 'municipal sewer', 'drain field', 'tank'],
    status: '',
    comment: ''
  }
];

export const standardsChecklistComplianceTool = ({ chatId, session }: StandardsChecklistComplianceProps) =>
  tool({
    description: '📋 STANDARDS CHECKLIST COMPLIANCE CHECKER: Analyze uploaded plans/projects for presence of required checklist items (A-100, A-101, A-200, etc.). Returns a structured checklist with status for each item.',
    parameters: z.object({
      analysisType: z.enum(['comprehensive']).optional().default('comprehensive').describe('Type of checklist analysis to perform'),
    }),
    execute: async ({ analysisType = 'comprehensive' }) => {
      try {
        // For each checklist item, use keywords to query semantic search
        const results = await Promise.all(
          checklist.map(async (item) => {
            // Only pass one argument to semanticSearchTool
            const search = semanticSearchTool({ chatId, session });
            const searchResult = await search.execute({
              query: item.keywords.join(' '),
              contentType: 'textual',
              limit: 5,
            }, {
              toolCallId: '',
              messages: [],
            });
            const found = searchResult.success && searchResult.results && searchResult.results.length > 0;
            return {
              ...item,
              status: found ? 'Present' : 'N/A',
              comment: '',
              context: found ? searchResult.results[0] : undefined,
            };
          })
        );
        return {
          success: true,
          message: 'Checklist compliance analysis complete.',
          results,
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