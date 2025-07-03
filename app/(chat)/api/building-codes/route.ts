import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/app/(auth)/auth';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, desc, and } from 'drizzle-orm';
import postgres from 'postgres';
import { 
  buildingCode, 
  buildingCodeVersion, 
  buildingCodeSection,
  buildingCodeEmbedding
} from '@/lib/db/schema';

// Database connection
// biome-ignore lint: Forbidden non-null assertion.
const client = postgres(process.env.POSTGRES_URL!);
const db = drizzle(client);

/**
 * BUILDING CODE MANAGEMENT API
 * Handles CRUD operations for building codes
 */

// GET - List all building codes with their versions
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const codeType = searchParams.get('codeType');
    const jurisdiction = searchParams.get('jurisdiction');
    const includeInactive = searchParams.get('includeInactive') === 'true';

    console.log('📋 BUILDING CODES: Fetching building codes list');

    // Build where conditions
    const whereConditions = [];
    if (codeType) {
      whereConditions.push(eq(buildingCode.codeType, codeType as any));
    }
    if (jurisdiction) {
      whereConditions.push(eq(buildingCode.jurisdiction, jurisdiction));
    }
    if (!includeInactive) {
      whereConditions.push(eq(buildingCode.isActive, true));
    }

    // Fetch building codes with their versions
    const codes = await db
      .select({
        id: buildingCode.id,
        codeName: buildingCode.codeName,
        codeAbbreviation: buildingCode.codeAbbreviation,
        jurisdiction: buildingCode.jurisdiction,
        codeType: buildingCode.codeType,
        isActive: buildingCode.isActive,
        description: buildingCode.description,
        officialUrl: buildingCode.officialUrl,
        createdAt: buildingCode.createdAt,
        updatedAt: buildingCode.updatedAt,
      })
      .from(buildingCode)
      .where(whereConditions.length > 0 ? and(...whereConditions) : undefined)
      .orderBy(desc(buildingCode.createdAt));

    // Fetch versions for each code
    const codesWithVersions = await Promise.all(
      codes.map(async (code) => {
        const versions = await db
          .select({
            id: buildingCodeVersion.id,
            version: buildingCodeVersion.version,
            effectiveDate: buildingCodeVersion.effectiveDate,
            supersededDate: buildingCodeVersion.supersededDate,
            isDefault: buildingCodeVersion.isDefault,
            processingStatus: buildingCodeVersion.processingStatus,
            createdAt: buildingCodeVersion.createdAt,
          })
          .from(buildingCodeVersion)
          .where(eq(buildingCodeVersion.buildingCodeId, code.id))
          .orderBy(desc(buildingCodeVersion.createdAt));

        // Get section count for each version
        const versionsWithStats = await Promise.all(
          versions.map(async (version) => {
            const sectionCount = await db
              .select({ count: buildingCodeSection.id })
              .from(buildingCodeSection)
              .where(eq(buildingCodeSection.buildingCodeVersionId, version.id));

            return {
              ...version,
              sectionCount: sectionCount.length,
            };
          })
        );

        return {
          ...code,
          versions: versionsWithStats,
        };
      })
    );

    // Get summary statistics
    const stats = {
      totalCodes: codes.length,
      activeCodesCount: codes.filter(c => c.isActive).length,
      codeTypes: [...new Set(codes.map(c => c.codeType))],
      jurisdictions: [...new Set(codes.map(c => c.jurisdiction).filter(Boolean))],
    };

    console.log(`📊 Building Codes: Found ${codes.length} codes`);

    return NextResponse.json({
      codes: codesWithVersions,
      stats,
      filters: {
        codeType,
        jurisdiction,
        includeInactive,
      },
    });

  } catch (error) {
    console.error('Building codes API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch building codes', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// POST - Create new building code
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { 
      codeName, 
      codeAbbreviation, 
      jurisdiction, 
      codeType, 
      description, 
      officialUrl,
      version,
      effectiveDate 
    } = body;

    // Validate required fields
    if (!codeName || !codeAbbreviation || !codeType) {
      return NextResponse.json(
        { error: 'Missing required fields: codeName, codeAbbreviation, codeType' },
        { status: 400 }
      );
    }

    // Validate code type
    const validCodeTypes = ['building', 'fire', 'plumbing', 'electrical', 'mechanical', 'energy', 'accessibility', 'zoning', 'local'];
    if (!validCodeTypes.includes(codeType)) {
      return NextResponse.json(
        { error: `Invalid codeType. Must be one of: ${validCodeTypes.join(', ')}` },
        { status: 400 }
      );
    }

    console.log(`➕ BUILDING CODES: Creating new code - ${codeName} (${codeAbbreviation})`);

    // Check if code already exists
    const existingCode = await db
      .select()
      .from(buildingCode)
      .where(eq(buildingCode.codeAbbreviation, codeAbbreviation))
      .limit(1);

    if (existingCode.length > 0) {
      return NextResponse.json(
        { error: `Building code with abbreviation '${codeAbbreviation}' already exists` },
        { status: 409 }
      );
    }

    // Create building code
    const newCode = await db
      .insert(buildingCode)
      .values({
        codeName,
        codeAbbreviation,
        jurisdiction,
        codeType,
        description,
        officialUrl,
        isActive: true,
      })
      .returning();

    // Create initial version if provided
    let newVersion = null;
    if (version) {
      newVersion = await db
        .insert(buildingCodeVersion)
        .values({
          buildingCodeId: newCode[0].id,
          version,
          effectiveDate: effectiveDate ? new Date(effectiveDate) : null,
          isDefault: true,
          processingStatus: 'pending',
        })
        .returning();
    }

    console.log(`✅ Building Code Created: ${newCode[0].id}`);

    return NextResponse.json({
      code: newCode[0],
      version: newVersion?.[0] || null,
      message: 'Building code created successfully',
    }, { status: 201 });

  } catch (error) {
    console.error('Building codes creation error:', error);
    return NextResponse.json(
      { error: 'Failed to create building code', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
} 