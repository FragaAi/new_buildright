-- Fix Vector Dimensions for Google Text Embedding Model
-- Google text-embedding-004 returns 768 dimensions, not 1536

-- Drop existing vector indexes
DROP INDEX IF EXISTS "idx_multimodal_embeddings_vector";
DROP INDEX IF EXISTS "idx_code_embeddings_vector";

-- Alter multimodal_embeddings table to use 768 dimensions
ALTER TABLE "multimodal_embeddings" 
ALTER COLUMN "embedding" TYPE vector(768);

-- Alter code_embeddings table to use 768 dimensions  
ALTER TABLE "code_embeddings" 
ALTER COLUMN "embedding" TYPE vector(768);

-- Recreate vector indexes with correct dimensions
CREATE INDEX IF NOT EXISTS "idx_multimodal_embeddings_vector" 
ON "multimodal_embeddings" USING ivfflat ("embedding" vector_cosine_ops);

CREATE INDEX IF NOT EXISTS "idx_code_embeddings_vector" 
ON "code_embeddings" USING ivfflat ("embedding" vector_cosine_ops);

-- Add comment for future reference
COMMENT ON COLUMN "multimodal_embeddings"."embedding" IS 'Vector embedding using Google text-embedding-004 (768 dimensions)';
COMMENT ON COLUMN "code_embeddings"."embedding" IS 'Vector embedding using Google text-embedding-004 (768 dimensions)'; 