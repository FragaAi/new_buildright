-- Enhanced Document Management System for BuildRight
-- Multi-modal PDF processing with visual understanding

-- Install pgvector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Project Documents (tied to chats/projects)
CREATE TABLE IF NOT EXISTS "project_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "chat_id" uuid NOT NULL REFERENCES "Chat"("id") ON DELETE CASCADE,
  "filename" text NOT NULL,
  "original_filename" text NOT NULL,
  "file_url" text NOT NULL,
  "file_size" bigint NOT NULL,
  "mime_type" text NOT NULL,
  "document_type" varchar(20) NOT NULL DEFAULT 'other' CHECK (document_type IN ('architectural', 'structural', 'electrical', 'plumbing', 'site_plan', 'specs', 'other')),
  "upload_status" varchar(20) NOT NULL DEFAULT 'uploading' CHECK (upload_status IN ('uploading', 'processing', 'ready', 'failed')),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- Document Pages (image-centric approach)
CREATE TABLE IF NOT EXISTS "document_pages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "document_id" uuid NOT NULL REFERENCES "project_documents"("id") ON DELETE CASCADE,
  "page_number" integer NOT NULL,
  "page_type" varchar(20) DEFAULT 'other' CHECK (page_type IN ('plan', 'elevation', 'section', 'detail', 'schedule', 'specs', 'cover', 'other')),
  "image_url" text NOT NULL,
  "thumbnail_url" text NOT NULL,
  "dimensions" json,
  "scale_info" json,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE("document_id", "page_number")
);

-- Visual Elements Detected
CREATE TABLE IF NOT EXISTS "visual_elements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "page_id" uuid NOT NULL REFERENCES "document_pages"("id") ON DELETE CASCADE,
  "element_type" varchar(30) NOT NULL CHECK (element_type IN ('dimension', 'wall', 'door', 'window', 'room', 'symbol', 'text_annotation', 'callout', 'grid_line', 'other')),
  "bounding_box" json NOT NULL,
  "confidence" real DEFAULT 0.0 CHECK (confidence >= 0.0 AND confidence <= 1.0),
  "properties" json,
  "text_content" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- Measurements and Dimensions
CREATE TABLE IF NOT EXISTS "measurements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "page_id" uuid NOT NULL REFERENCES "document_pages"("id") ON DELETE CASCADE,
  "element_id" uuid REFERENCES "visual_elements"("id") ON DELETE SET NULL,
  "measurement_type" varchar(20) NOT NULL CHECK (measurement_type IN ('length', 'width', 'height', 'area', 'angle', 'radius')),
  "value" decimal(10,3),
  "unit" varchar(10) CHECK (unit IN ('ft', 'in', 'mm', 'cm', 'm', 'sq_ft', 'sq_m', 'degrees')),
  "from_coordinates" json,
  "to_coordinates" json,
  "annotation_text" text,
  "confidence" real DEFAULT 0.0 CHECK (confidence >= 0.0 AND confidence <= 1.0),
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- Spatial Relationships
CREATE TABLE IF NOT EXISTS "spatial_relationships" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "page_id" uuid NOT NULL REFERENCES "document_pages"("id") ON DELETE CASCADE,
  "element_1_id" uuid NOT NULL REFERENCES "visual_elements"("id") ON DELETE CASCADE,
  "element_2_id" uuid NOT NULL REFERENCES "visual_elements"("id") ON DELETE CASCADE,
  "relationship_type" varchar(20) NOT NULL CHECK (relationship_type IN ('adjacent', 'contains', 'distance', 'aligned', 'parallel', 'perpendicular')),
  "distance" decimal(10,3),
  "properties" json,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- Multi-Modal Embeddings
CREATE TABLE IF NOT EXISTS "multimodal_embeddings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "page_id" uuid NOT NULL REFERENCES "document_pages"("id") ON DELETE CASCADE,
  "content_type" varchar(20) NOT NULL CHECK (content_type IN ('visual', 'textual', 'combined')),
  "chunk_description" text NOT NULL,
  "embedding" vector(1536),
  "bounding_box" json,
  "metadata" json,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- Room/Space Analysis
CREATE TABLE IF NOT EXISTS "spaces" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "page_id" uuid NOT NULL REFERENCES "document_pages"("id") ON DELETE CASCADE,
  "space_name" text,
  "space_type" varchar(20) CHECK (space_type IN ('living', 'bedroom', 'bathroom', 'kitchen', 'utility', 'garage', 'commercial', 'other')),
  "area" decimal(10,2),
  "boundary_coordinates" json,
  "required_clearances" json,
  "detected_elements" uuid[],
  "compliance_notes" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- Florida Building Code Knowledge Base
CREATE TABLE IF NOT EXISTS "building_code_sections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "code_type" varchar(10) NOT NULL CHECK (code_type IN ('fbc', 'zoning', 'local')),
  "section_number" text NOT NULL,
  "title" text NOT NULL,
  "content" text NOT NULL,
  "parent_section_id" uuid REFERENCES "building_code_sections"("id"),
  "applicable_occupancy" text[],
  "effective_date" date,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- Code Embeddings for Semantic Search
CREATE TABLE IF NOT EXISTS "code_embeddings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "section_id" uuid NOT NULL REFERENCES "building_code_sections"("id") ON DELETE CASCADE,
  "chunk_text" text NOT NULL,
  "embedding" vector(1536),
  "metadata" json,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- Compliance Check Results
CREATE TABLE IF NOT EXISTS "compliance_checks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "chat_id" uuid NOT NULL REFERENCES "Chat"("id") ON DELETE CASCADE,
  "document_id" uuid REFERENCES "project_documents"("id") ON DELETE SET NULL,
  "check_type" varchar(20) NOT NULL CHECK (check_type IN ('automated', 'manual', 'ai_assisted')),
  "status" varchar(20) NOT NULL CHECK (status IN ('compliant', 'non_compliant', 'requires_review', 'incomplete')),
  "code_sections_referenced" uuid[],
  "findings" json,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS "idx_project_documents_chat_id" ON "project_documents"("chat_id");
CREATE INDEX IF NOT EXISTS "idx_document_pages_document_id" ON "document_pages"("document_id");
CREATE INDEX IF NOT EXISTS "idx_visual_elements_page_id" ON "visual_elements"("page_id");
CREATE INDEX IF NOT EXISTS "idx_visual_elements_type" ON "visual_elements"("element_type");
CREATE INDEX IF NOT EXISTS "idx_measurements_page_id" ON "measurements"("page_id");
CREATE INDEX IF NOT EXISTS "idx_multimodal_embeddings_page_id" ON "multimodal_embeddings"("page_id");
CREATE INDEX IF NOT EXISTS "idx_multimodal_embeddings_vector" ON "multimodal_embeddings" USING ivfflat ("embedding" vector_cosine_ops);
CREATE INDEX IF NOT EXISTS "idx_code_embeddings_vector" ON "code_embeddings" USING ivfflat ("embedding" vector_cosine_ops);
CREATE INDEX IF NOT EXISTS "idx_building_code_sections_type" ON "building_code_sections"("code_type");
CREATE INDEX IF NOT EXISTS "idx_compliance_checks_chat_id" ON "compliance_checks"("chat_id"); 