CREATE TABLE IF NOT EXISTS "building_code_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code_type" varchar NOT NULL,
	"section_number" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"parent_section_id" uuid,
	"applicable_occupancy" json,
	"effective_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "compliance_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_id" uuid NOT NULL,
	"document_id" uuid,
	"check_type" varchar NOT NULL,
	"status" varchar NOT NULL,
	"code_sections_referenced" json,
	"findings" json,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "document_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"page_number" text NOT NULL,
	"page_type" varchar DEFAULT 'other',
	"image_url" text NOT NULL,
	"thumbnail_url" text NOT NULL,
	"dimensions" json,
	"scale_info" json,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "measurements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"element_id" uuid,
	"measurement_type" varchar NOT NULL,
	"value" text,
	"unit" varchar,
	"from_coordinates" json,
	"to_coordinates" json,
	"annotation_text" text,
	"confidence" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "multimodal_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"content_type" varchar NOT NULL,
	"chunk_description" text NOT NULL,
	"embedding" text,
	"bounding_box" json,
	"metadata" json,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"original_filename" text NOT NULL,
	"file_url" text NOT NULL,
	"file_size" text NOT NULL,
	"mime_type" text NOT NULL,
	"document_type" varchar DEFAULT 'other' NOT NULL,
	"upload_status" varchar DEFAULT 'uploading' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "visual_elements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"element_type" varchar NOT NULL,
	"bounding_box" json NOT NULL,
	"confidence" text,
	"properties" json,
	"text_content" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "compliance_checks" ADD CONSTRAINT "compliance_checks_chat_id_Chat_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."Chat"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "compliance_checks" ADD CONSTRAINT "compliance_checks_document_id_project_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."project_documents"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_pages" ADD CONSTRAINT "document_pages_document_id_project_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."project_documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "measurements" ADD CONSTRAINT "measurements_page_id_document_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."document_pages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "measurements" ADD CONSTRAINT "measurements_element_id_visual_elements_id_fk" FOREIGN KEY ("element_id") REFERENCES "public"."visual_elements"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "multimodal_embeddings" ADD CONSTRAINT "multimodal_embeddings_page_id_document_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."document_pages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_chat_id_Chat_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."Chat"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "visual_elements" ADD CONSTRAINT "visual_elements_page_id_document_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."document_pages"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
