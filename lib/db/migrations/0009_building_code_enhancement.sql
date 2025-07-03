-- Migration: Enhanced Building Code Management System
-- Creates tables for multi-code support, version management, and semantic search

-- Create building codes master table
CREATE TABLE IF NOT EXISTS "building_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "code_name" text NOT NULL,
  "code_abbreviation" text NOT NULL,
  "jurisdiction" text,
  "code_type" varchar NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "description" text,
  "official_url" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Create building code versions table
CREATE TABLE IF NOT EXISTS "building_code_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "building_code_id" uuid NOT NULL,
  "version" text NOT NULL,
  "effective_date" timestamp,
  "superseded_date" timestamp,
  "is_default" boolean DEFAULT false NOT NULL,
  "source_file" text,
  "processing_status" varchar DEFAULT 'pending' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Create building code embeddings table
CREATE TABLE IF NOT EXISTS "building_code_embeddings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "building_code_section_id" uuid NOT NULL,
  "content_type" varchar NOT NULL,
  "embedding" text,
  "chunk_text" text NOT NULL,
  "metadata" json,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Update existing building_code_sections table structure
-- First, add new columns
ALTER TABLE "building_code_sections" ADD COLUMN IF NOT EXISTS "building_code_version_id" uuid;
ALTER TABLE "building_code_sections" ADD COLUMN IF NOT EXISTS "chapter" text;
ALTER TABLE "building_code_sections" ADD COLUMN IF NOT EXISTS "hierarchy" json;
ALTER TABLE "building_code_sections" ADD COLUMN IF NOT EXISTS "keywords" json;

-- Create constraints and foreign keys
ALTER TABLE "building_code_versions" ADD CONSTRAINT "building_code_versions_building_code_id_building_codes_id_fk" 
  FOREIGN KEY ("building_code_id") REFERENCES "building_codes"("id") ON DELETE CASCADE;

ALTER TABLE "building_code_embeddings" ADD CONSTRAINT "building_code_embeddings_building_code_section_id_building_code_sections_id_fk" 
  FOREIGN KEY ("building_code_section_id") REFERENCES "building_code_sections"("id") ON DELETE CASCADE;

-- Add foreign key for building_code_sections once we have data
-- (This will be handled in the application migration logic)

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS "idx_building_codes_code_type" ON "building_codes" ("code_type");
CREATE INDEX IF NOT EXISTS "idx_building_codes_is_active" ON "building_codes" ("is_active");
CREATE INDEX IF NOT EXISTS "idx_building_code_versions_building_code_id" ON "building_code_versions" ("building_code_id");
CREATE INDEX IF NOT EXISTS "idx_building_code_versions_is_default" ON "building_code_versions" ("is_default");
CREATE INDEX IF NOT EXISTS "idx_building_code_sections_version_id" ON "building_code_sections" ("building_code_version_id");
CREATE INDEX IF NOT EXISTS "idx_building_code_sections_chapter" ON "building_code_sections" ("chapter");
CREATE INDEX IF NOT EXISTS "idx_building_code_embeddings_section_id" ON "building_code_embeddings" ("building_code_section_id");
CREATE INDEX IF NOT EXISTS "idx_building_code_embeddings_content_type" ON "building_code_embeddings" ("content_type");

-- Add check constraints for enums
ALTER TABLE "building_codes" ADD CONSTRAINT "building_codes_code_type_check" 
  CHECK ("code_type" IN ('building', 'fire', 'plumbing', 'electrical', 'mechanical', 'energy', 'accessibility', 'zoning', 'local'));

ALTER TABLE "building_code_versions" ADD CONSTRAINT "building_code_versions_processing_status_check" 
  CHECK ("processing_status" IN ('pending', 'processing', 'completed', 'failed'));

ALTER TABLE "building_code_embeddings" ADD CONSTRAINT "building_code_embeddings_content_type_check" 
  CHECK ("content_type" IN ('title', 'content', 'combined'));

-- Insert default Florida Building Code entry
INSERT INTO "building_codes" ("code_name", "code_abbreviation", "jurisdiction", "code_type", "description", "official_url", "is_active")
VALUES 
  ('Florida Building Code', 'FBC', 'Florida', 'building', 'Florida Building Code for building construction and safety', 'https://www.floridabuilding.org/', true),
  ('International Building Code', 'IBC', 'International', 'building', 'International Building Code - model building code', 'https://www.iccsafe.org/', true),
  ('International Fire Code', 'IFC', 'International', 'fire', 'International Fire Code for fire prevention and safety', 'https://www.iccsafe.org/', true),
  ('International Plumbing Code', 'IPC', 'International', 'plumbing', 'International Plumbing Code for plumbing systems', 'https://www.iccsafe.org/', true),
  ('International Mechanical Code', 'IMC', 'International', 'mechanical', 'International Mechanical Code for HVAC systems', 'https://www.iccsafe.org/', true)
ON CONFLICT DO NOTHING;

-- Insert default versions for the codes
INSERT INTO "building_code_versions" ("building_code_id", "version", "effective_date", "is_default", "processing_status")
SELECT 
  bc.id,
  '2023',
  '2023-01-01'::timestamp,
  true,
  'pending'
FROM "building_codes" bc
WHERE bc.code_abbreviation IN ('FBC', 'IBC', 'IFC', 'IPC', 'IMC')
ON CONFLICT DO NOTHING;

-- Add comments for documentation
COMMENT ON TABLE "building_codes" IS 'Master table for different building codes (FBC, IBC, etc.)';
COMMENT ON TABLE "building_code_versions" IS 'Version tracking for building codes';
COMMENT ON TABLE "building_code_embeddings" IS 'Semantic search embeddings for building code sections';
COMMENT ON COLUMN "building_code_sections"."building_code_version_id" IS 'Links to specific version of building code';
COMMENT ON COLUMN "building_code_sections"."hierarchy" IS 'Full hierarchy path as JSON array';
COMMENT ON COLUMN "building_code_sections"."keywords" IS 'Extracted keywords for search as JSON array'; 