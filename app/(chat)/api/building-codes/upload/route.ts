import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/app/(auth)/auth';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, and } from 'drizzle-orm';
import postgres from 'postgres';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { 
  buildingCode, 
  buildingCodeVersion, 
  buildingCodeSection 
} from '@/lib/db/schema';

// Database connection
// biome-ignore lint: Forbidden non-null assertion.
const client = postgres(process.env.POSTGRES_URL!);
const db = drizzle(client);

/**
 * BUILDING CODE UPLOAD API
 * Handles uploading and processing building code documents
 */

// POST - Upload building code document
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const buildingCodeId = formData.get('buildingCodeId') as string;
    const version = formData.get('version') as string;
    const effectiveDate = formData.get('effectiveDate') as string;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!buildingCodeId) {
      return NextResponse.json({ error: 'Building code ID is required' }, { status: 400 });
    }

    if (!version) {
      return NextResponse.json({ error: 'Version is required' }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = ['application/pdf', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: `Invalid file type. Allowed types: ${allowedTypes.join(', ')}` },
        { status: 400 }
      );
    }

    // Check if building code exists
    const existingCode = await db
      .select()
      .from(buildingCode)
      .where(eq(buildingCode.id, buildingCodeId))
      .limit(1);

    if (existingCode.length === 0) {
      return NextResponse.json({ error: 'Building code not found' }, { status: 404 });
    }

    console.log(`📁 BUILDING CODE UPLOAD: Processing ${file.name} for ${existingCode[0].codeName} v${version}`);

    // Create upload directory if it doesn't exist
    const uploadDir = join(process.cwd(), 'uploads', 'building-codes');
    await mkdir(uploadDir, { recursive: true });

    // Generate unique filename
    const timestamp = Date.now();
    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileName = `${existingCode[0].codeAbbreviation}_${version}_${timestamp}_${sanitizedFileName}`;
    const filePath = join(uploadDir, fileName);

    // Save file
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filePath, buffer);

    console.log(`💾 File saved: ${filePath}`);

    // Check if version already exists
    const existingVersion = await db
      .select()
      .from(buildingCodeVersion)
      .where(and(
        eq(buildingCodeVersion.buildingCodeId, buildingCodeId),
        eq(buildingCodeVersion.version, version)
      ))
      .limit(1);

    let codeVersion;
    if (existingVersion.length > 0) {
      // Update existing version
      codeVersion = await db
        .update(buildingCodeVersion)
        .set({
          sourceFile: filePath,
          effectiveDate: effectiveDate ? new Date(effectiveDate) : null,
          processingStatus: 'processing',
        })
        .where(eq(buildingCodeVersion.id, existingVersion[0].id))
        .returning();
    } else {
      // Create new version
      codeVersion = await db
        .insert(buildingCodeVersion)
        .values({
          buildingCodeId,
          version,
          effectiveDate: effectiveDate ? new Date(effectiveDate) : null,
          sourceFile: filePath,
          processingStatus: 'processing',
          isDefault: false, // User can set default later
        })
        .returning();
    }

    // Start processing the file (simplified for now)
    console.log(`🔄 Starting processing for version: ${codeVersion[0].id}`);

    // TODO: Implement actual file processing logic
    // This would involve:
    // 1. OCR/text extraction for PDFs
    // 2. Parsing code structure (chapters, sections)
    // 3. Creating building_code_sections entries
    // 4. Generating embeddings for semantic search

    // For now, create a placeholder section to show the system works
    if (file.type === 'text/plain') {
      const textContent = buffer.toString('utf-8');
      const previewContent = textContent.substring(0, 500) + (textContent.length > 500 ? '...' : '');
      
      await db
        .insert(buildingCodeSection)
        .values({
          buildingCodeVersionId: codeVersion[0].id,
          sectionNumber: '1.0',
          title: `${existingCode[0].codeName} v${version} - Uploaded Content`,
          content: previewContent,
          chapter: '1',
          hierarchy: JSON.stringify(['Chapter 1', 'Section 1.0']),
          keywords: JSON.stringify(['uploaded', 'content', existingCode[0].codeAbbreviation.toLowerCase()]),
        });

      // Update processing status to completed for text files
      await db
        .update(buildingCodeVersion)
        .set({ processingStatus: 'completed' })
        .where(eq(buildingCodeVersion.id, codeVersion[0].id));
    }

    console.log(`✅ Building Code Upload Complete: ${codeVersion[0].id}`);

    return NextResponse.json({
      message: 'Building code uploaded successfully',
      version: codeVersion[0],
      buildingCode: existingCode[0],
      fileName,
      fileSize: file.size,
      processingStatus: file.type === 'text/plain' ? 'completed' : 'processing',
    });

  } catch (error) {
    console.error('Building code upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload building code', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// GET - Get upload status and processing information
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const versionId = searchParams.get('versionId');

    if (!versionId) {
      return NextResponse.json({ error: 'Version ID is required' }, { status: 400 });
    }

    // Get version with processing status
    const version = await db
      .select({
        id: buildingCodeVersion.id,
        version: buildingCodeVersion.version,
        effectiveDate: buildingCodeVersion.effectiveDate,
        sourceFile: buildingCodeVersion.sourceFile,
        processingStatus: buildingCodeVersion.processingStatus,
        createdAt: buildingCodeVersion.createdAt,
        // Building code details
        codeName: buildingCode.codeName,
        codeAbbreviation: buildingCode.codeAbbreviation,
      })
      .from(buildingCodeVersion)
      .leftJoin(buildingCode, eq(buildingCodeVersion.buildingCodeId, buildingCode.id))
      .where(eq(buildingCodeVersion.id, versionId))
      .limit(1);

    if (version.length === 0) {
      return NextResponse.json({ error: 'Version not found' }, { status: 404 });
    }

    // Get section count for this version
    const sections = await db
      .select({ id: buildingCodeSection.id })
      .from(buildingCodeSection)
      .where(eq(buildingCodeSection.buildingCodeVersionId, versionId));

    const versionData = {
      ...version[0],
      sectionCount: sections.length,
    };

    return NextResponse.json({
      version: versionData,
    });

  } catch (error) {
    console.error('Building code upload status error:', error);
    return NextResponse.json(
      { error: 'Failed to get upload status', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
} 