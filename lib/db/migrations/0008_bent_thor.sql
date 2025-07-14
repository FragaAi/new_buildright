-- New tables for hierarchical document system
CREATE TABLE IF NOT EXISTS "document_classifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"primary_type" varchar(50) NOT NULL,
	"subtype" varchar(50),
	"sheet_number" varchar(20),
	"discipline" varchar(20),
	"confidence" real DEFAULT 0,
	"ai_analysis" json,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "document_hierarchy" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"hierarchy_data" json NOT NULL,
	"document_relationships" json,
	"cross_references" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "document_relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_document_id" uuid NOT NULL,
	"target_document_id" uuid NOT NULL,
	"relationship_type" varchar(50) NOT NULL,
	"confidence" real DEFAULT 0,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hierarchical_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chunk_id" uuid NOT NULL,
	"embedding_level" varchar NOT NULL,
	"embedding" text NOT NULL,
	"context_summary" text,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"summary_type" varchar NOT NULL,
	"structured_content" json NOT NULL,
	"generated_summary" text,
	"source_documents" json,
	"confidence" real DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "query_context" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar(100),
	"query" text NOT NULL,
	"query_type" varchar(50),
	"context_used" json,
	"results_returned" json,
	"user_feedback" json,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "semantic_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"parent_chunk_id" uuid,
	"level" varchar NOT NULL,
	"content" text NOT NULL,
	"context" json,
	"metadata" json,
	"embedding" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_classifications" ADD CONSTRAINT "document_classifications_document_id_project_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."project_documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_relationships" ADD CONSTRAINT "document_relationships_source_document_id_project_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."project_documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_relationships" ADD CONSTRAINT "document_relationships_target_document_id_project_documents_id_fk" FOREIGN KEY ("target_document_id") REFERENCES "public"."project_documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "hierarchical_embeddings" ADD CONSTRAINT "hierarchical_embeddings_chunk_id_semantic_chunks_id_fk" FOREIGN KEY ("chunk_id") REFERENCES "public"."semantic_chunks"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "semantic_chunks" ADD CONSTRAINT "semantic_chunks_document_id_project_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."project_documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;