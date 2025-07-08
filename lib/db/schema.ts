import type { InferSelectModel } from 'drizzle-orm';
import {
  pgTable,
  varchar,
  timestamp,
  json,
  uuid,
  text,
  primaryKey,
  foreignKey,
  boolean,
} from 'drizzle-orm/pg-core';

export const user = pgTable('User', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  email: varchar('email', { length: 64 }).notNull(),
  password: varchar('password', { length: 64 }),
});

export type User = InferSelectModel<typeof user>;

export const chat = pgTable('Chat', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  createdAt: timestamp('createdAt').notNull(),
  title: text('title').notNull(),
  userId: uuid('userId')
    .notNull()
    .references(() => user.id),
  visibility: varchar('visibility', { enum: ['public', 'private'] })
    .notNull()
    .default('private'),
});

export type Chat = InferSelectModel<typeof chat>;

// DEPRECATED: The following schema is deprecated and will be removed in the future.
// Read the migration guide at https://chat-sdk.dev/docs/migration-guides/message-parts
export const messageDeprecated = pgTable('Message', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  chatId: uuid('chatId')
    .notNull()
    .references(() => chat.id),
  role: varchar('role').notNull(),
  content: json('content').notNull(),
  createdAt: timestamp('createdAt').notNull(),
});

export type MessageDeprecated = InferSelectModel<typeof messageDeprecated>;

export const message = pgTable('Message_v2', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  chatId: uuid('chatId')
    .notNull()
    .references(() => chat.id),
  role: varchar('role').notNull(),
  parts: json('parts').notNull(),
  attachments: json('attachments').notNull(),
  createdAt: timestamp('createdAt').notNull(),
});

export type DBMessage = InferSelectModel<typeof message>;

// DEPRECATED: The following schema is deprecated and will be removed in the future.
// Read the migration guide at https://chat-sdk.dev/docs/migration-guides/message-parts
export const voteDeprecated = pgTable(
  'Vote',
  {
    chatId: uuid('chatId')
      .notNull()
      .references(() => chat.id),
    messageId: uuid('messageId')
      .notNull()
      .references(() => messageDeprecated.id),
    isUpvoted: boolean('isUpvoted').notNull(),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.chatId, table.messageId] }),
    };
  },
);

export type VoteDeprecated = InferSelectModel<typeof voteDeprecated>;

export const vote = pgTable(
  'Vote_v2',
  {
    chatId: uuid('chatId')
      .notNull()
      .references(() => chat.id),
    messageId: uuid('messageId')
      .notNull()
      .references(() => message.id),
    isUpvoted: boolean('isUpvoted').notNull(),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.chatId, table.messageId] }),
    };
  },
);

export type Vote = InferSelectModel<typeof vote>;

export const document = pgTable(
  'Document',
  {
    id: uuid('id').notNull().defaultRandom(),
    createdAt: timestamp('createdAt').notNull(),
    title: text('title').notNull(),
    content: text('content'),
    kind: varchar('text', { enum: ['text', 'code', 'image', 'sheet'] })
      .notNull()
      .default('text'),
    userId: uuid('userId')
      .notNull()
      .references(() => user.id),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.id, table.createdAt] }),
    };
  },
);

export type Document = InferSelectModel<typeof document>;

export const suggestion = pgTable(
  'Suggestion',
  {
    id: uuid('id').notNull().defaultRandom(),
    documentId: uuid('documentId').notNull(),
    documentCreatedAt: timestamp('documentCreatedAt').notNull(),
    originalText: text('originalText').notNull(),
    suggestedText: text('suggestedText').notNull(),
    description: text('description'),
    isResolved: boolean('isResolved').notNull().default(false),
    userId: uuid('userId')
      .notNull()
      .references(() => user.id),
    createdAt: timestamp('createdAt').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id] }),
    documentRef: foreignKey({
      columns: [table.documentId, table.documentCreatedAt],
      foreignColumns: [document.id, document.createdAt],
    }),
  }),
);

export type Suggestion = InferSelectModel<typeof suggestion>;

export const stream = pgTable(
  'Stream',
  {
    id: uuid('id').notNull().defaultRandom(),
    chatId: uuid('chatId').notNull(),
    createdAt: timestamp('createdAt').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id] }),
    chatRef: foreignKey({
      columns: [table.chatId],
      foreignColumns: [chat.id],
    }),
  }),
);

export type Stream = InferSelectModel<typeof stream>;

// Enhanced Document Management System

export const projectDocument = pgTable('project_documents', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  chatId: uuid('chat_id')
    .notNull()
    .references(() => chat.id, { onDelete: 'cascade' }),
  filename: text('filename').notNull(),
  originalFilename: text('original_filename').notNull(),
  fileUrl: text('file_url').notNull(),
  fileSize: text('file_size').notNull(), // Using text for bigint compatibility
  mimeType: text('mime_type').notNull(),
  documentType: varchar('document_type', { 
    enum: ['architectural', 'structural', 'electrical', 'plumbing', 'site_plan', 'specs', 'other'] 
  }).notNull().default('other'),
  uploadStatus: varchar('upload_status', { 
    enum: ['uploading', 'processing', 'ready', 'failed'] 
  }).notNull().default('uploading'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type ProjectDocument = InferSelectModel<typeof projectDocument>;

export const documentPage = pgTable('document_pages', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  documentId: uuid('document_id')
    .notNull()
    .references(() => projectDocument.id, { onDelete: 'cascade' }),
  pageNumber: text('page_number').notNull(), // Using text for integer compatibility
  pageType: varchar('page_type', { 
    enum: ['plan', 'elevation', 'section', 'detail', 'schedule', 'specs', 'cover', 'other'] 
  }).default('other'),
  imageUrl: text('image_url').notNull(),
  thumbnailUrl: text('thumbnail_url').notNull(),
  dimensions: json('dimensions'),
  scaleInfo: json('scale_info'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type DocumentPage = InferSelectModel<typeof documentPage>;

export const visualElement = pgTable('visual_elements', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  pageId: uuid('page_id')
    .notNull()
    .references(() => documentPage.id, { onDelete: 'cascade' }),
  elementType: varchar('element_type', { 
    enum: ['dimension', 'wall', 'door', 'window', 'room', 'symbol', 'text_annotation', 'callout', 'grid_line', 'other'] 
  }).notNull(),
  boundingBox: json('bounding_box').notNull(),
  confidence: text('confidence'), // Using text for real/float compatibility
  properties: json('properties'),
  textContent: text('text_content'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type VisualElement = InferSelectModel<typeof visualElement>;

export const measurement = pgTable('measurements', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  pageId: uuid('page_id')
    .notNull()
    .references(() => documentPage.id, { onDelete: 'cascade' }),
  elementId: uuid('element_id').references(() => visualElement.id, { onDelete: 'set null' }),
  measurementType: varchar('measurement_type', { 
    enum: ['length', 'width', 'height', 'area', 'angle', 'radius'] 
  }).notNull(),
  value: text('value'), // Using text for decimal compatibility
  unit: varchar('unit', { enum: ['ft', 'in', 'mm', 'cm', 'm', 'sq_ft', 'sq_m', 'degrees'] }),
  fromCoordinates: json('from_coordinates'),
  toCoordinates: json('to_coordinates'),
  annotationText: text('annotation_text'),
  confidence: text('confidence'), // Using text for real/float compatibility
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type Measurement = InferSelectModel<typeof measurement>;

export const multimodalEmbedding = pgTable('multimodal_embeddings', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  pageId: uuid('page_id')
    .notNull()
    .references(() => documentPage.id, { onDelete: 'cascade' }),
  contentType: varchar('content_type', { enum: ['visual', 'textual', 'combined'] }).notNull(),
  chunkDescription: text('chunk_description').notNull(),
  embedding: text('embedding'), // Vector will be handled as text for now
  boundingBox: json('bounding_box'),
  metadata: json('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type MultimodalEmbedding = InferSelectModel<typeof multimodalEmbedding>;

// Enhanced Building Code Management System

// Master building code table
export const buildingCode = pgTable('building_codes', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  codeName: text('code_name').notNull(), // 'Florida Building Code', 'International Building Code'
  codeAbbreviation: text('code_abbreviation').notNull(), // 'FBC', 'IBC', 'UBC'
  jurisdiction: text('jurisdiction'), // 'Florida', 'International', 'California'
  codeType: varchar('code_type', { 
    enum: ['building', 'fire', 'plumbing', 'electrical', 'mechanical', 'energy', 'accessibility', 'zoning', 'local'] 
  }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  description: text('description'),
  officialUrl: text('official_url'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type BuildingCode = InferSelectModel<typeof buildingCode>;

// Building code versions
export const buildingCodeVersion = pgTable('building_code_versions', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  buildingCodeId: uuid('building_code_id')
    .notNull()
    .references(() => buildingCode.id, { onDelete: 'cascade' }),
  version: text('version').notNull(), // '2023', '2021', '2018'
  effectiveDate: timestamp('effective_date'),
  supersededDate: timestamp('superseded_date'),
  isDefault: boolean('is_default').notNull().default(false),
  sourceFile: text('source_file'), // Path to uploaded PDF/document
  processingStatus: varchar('processing_status', { 
    enum: ['pending', 'processing', 'completed', 'failed'] 
  }).notNull().default('pending'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type BuildingCodeVersion = InferSelectModel<typeof buildingCodeVersion>;

// Enhanced building code sections
export const buildingCodeSection = pgTable('building_code_sections', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  buildingCodeVersionId: uuid('building_code_version_id')
    .notNull()
    .references(() => buildingCodeVersion.id, { onDelete: 'cascade' }),
  codeType: varchar('code_type', { 
    enum: ['fbc', 'zoning', 'local'] 
  }).notNull(),
  sectionNumber: text('section_number').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  chapter: text('chapter'), // Chapter number/name
  parentSectionId: uuid('parent_section_id'), // Self-reference for subsections
  hierarchy: json('hierarchy'), // Array showing full hierarchy path
  applicableOccupancy: json('applicable_occupancy'),
  keywords: json('keywords'), // Extracted keywords for search
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type BuildingCodeSection = InferSelectModel<typeof buildingCodeSection>;

// Embeddings for semantic search of building codes
export const buildingCodeEmbedding = pgTable('building_code_embeddings', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  buildingCodeSectionId: uuid('building_code_section_id')
    .notNull()
    .references(() => buildingCodeSection.id, { onDelete: 'cascade' }),
  contentType: varchar('content_type', { enum: ['title', 'content', 'combined'] }).notNull(),
  embedding: text('embedding'), // Vector embedding for semantic search
  chunkText: text('chunk_text').notNull(),
  metadata: json('metadata'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type BuildingCodeEmbedding = InferSelectModel<typeof buildingCodeEmbedding>;

export const complianceCheck = pgTable('compliance_checks', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  chatId: uuid('chat_id')
    .notNull()
    .references(() => chat.id, { onDelete: 'cascade' }),
  documentId: uuid('document_id').references(() => projectDocument.id, { onDelete: 'set null' }),
  checkType: varchar('check_type', { enum: ['automated', 'manual', 'ai_assisted'] }).notNull(),
  status: varchar('status', { enum: ['compliant', 'non_compliant', 'requires_review', 'incomplete'] }).notNull(),
  codeSectionsReferenced: json('code_sections_referenced'), // Array as JSON
  findings: json('findings'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type ComplianceCheck = InferSelectModel<typeof complianceCheck>;
