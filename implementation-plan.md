# BuildRight → NotebookLM Level Implementation Plan

## Database Schema Enhancements

```sql
-- Enhanced document hierarchy tracking
CREATE TABLE document_hierarchy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  hierarchy_data jsonb NOT NULL,
  document_relationships jsonb,
  cross_references jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Semantic chunks with hierarchical structure
CREATE TABLE semantic_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES project_documents(id) ON DELETE CASCADE,
  parent_chunk_id uuid REFERENCES semantic_chunks(id),
  level varchar(20) NOT NULL CHECK (level IN ('project', 'document', 'section', 'subsection', 'paragraph')),
  content text NOT NULL,
  context jsonb,
  metadata jsonb,
  embedding vector(1536),
  created_at timestamp with time zone DEFAULT now()
);

-- Multi-level embeddings for different contexts
CREATE TABLE hierarchical_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chunk_id uuid NOT NULL REFERENCES semantic_chunks(id) ON DELETE CASCADE,
  embedding_level varchar(20) NOT NULL CHECK (embedding_level IN ('project', 'document', 'section', 'chunk')),
  embedding vector(1536) NOT NULL,
  context_summary text,
  metadata jsonb,
  created_at timestamp with time zone DEFAULT now()
);

-- Document classification and type detection
CREATE TABLE document_classifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES project_documents(id) ON DELETE CASCADE,
  primary_type varchar(50) NOT NULL,
  subtype varchar(50),
  sheet_number varchar(20),
  discipline varchar(20),
  confidence float DEFAULT 0.0,
  ai_analysis jsonb,
  created_at timestamp with time zone DEFAULT now()
);

-- Structured project summaries
CREATE TABLE project_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  summary_type varchar(20) NOT NULL CHECK (summary_type IN ('overview', 'scope', 'compliance', 'zoning')),
  structured_content jsonb NOT NULL,
  generated_summary text,
  source_documents uuid[],
  confidence float DEFAULT 0.0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Cross-document relationships and references
CREATE TABLE document_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_document_id uuid NOT NULL REFERENCES project_documents(id) ON DELETE CASCADE,
  target_document_id uuid NOT NULL REFERENCES project_documents(id) ON DELETE CASCADE,
  relationship_type varchar(50) NOT NULL,
  confidence float DEFAULT 0.0,
  metadata jsonb,
  created_at timestamp with time zone DEFAULT now()
);

-- Enhanced search and retrieval tracking
CREATE TABLE query_context (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id varchar(100),
  query text NOT NULL,
  query_type varchar(50),
  context_used jsonb,
  results_returned jsonb,
  user_feedback jsonb,
  created_at timestamp with time zone DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_semantic_chunks_document_id ON semantic_chunks(document_id);
CREATE INDEX idx_semantic_chunks_level ON semantic_chunks(level);
CREATE INDEX idx_semantic_chunks_parent ON semantic_chunks(parent_chunk_id);
CREATE INDEX idx_hierarchical_embeddings_chunk_id ON hierarchical_embeddings(chunk_id);
CREATE INDEX idx_hierarchical_embeddings_level ON hierarchical_embeddings(embedding_level);
CREATE INDEX idx_document_classifications_type ON document_classifications(primary_type, subtype);
CREATE INDEX idx_project_summaries_project_id ON project_summaries(project_id);
CREATE INDEX idx_document_relationships_source ON document_relationships(source_document_id);
```

## API Enhancements

### Enhanced Document Upload API
```typescript
// app/(chat)/api/documents/upload/route.ts - Enhanced version
export async function POST(request: NextRequest) {
  // 1. Upload and basic processing (existing)
  // 2. NEW: Document classification
  const classification = await DocumentClassifier.classifyDocument(pages);
  
  // 3. NEW: Hierarchical parsing
  const hierarchy = await HierarchicalParser.parseStructure(document);
  
  // 4. NEW: Semantic chunking
  const semanticChunks = await SemanticChunker.chunkDocument(document, hierarchy);
  
  // 5. NEW: Multi-level embedding generation
  for (const chunk of semanticChunks) {
    await HierarchicalEmbeddings.generateMultiLevelEmbeddings(chunk);
  }
  
  // 6. NEW: Project-level analysis and summary
  await ProjectAnalyzer.updateProjectSummary(projectId);
}
```

### Enhanced Search API
```typescript
// app/(chat)/api/search/route.ts - Enhanced version
export async function POST(request: NextRequest) {
  const { query, chatId, queryType, context } = await request.json();
  
  // 1. Query classification and intent detection
  const queryIntent = await QueryClassifier.classifyQuery(query, context);
  
  // 2. Multi-level contextual retrieval
  const results = await ContextualRetrieval.retrieveWithContext(query, {
    queryType: queryIntent.type,
    scope: queryIntent.scope,
    documentTypes: queryIntent.documentTypes,
    precedingQueries: context.previousQueries
  });
  
  // 3. Grounded response generation with source attribution
  const response = await GroundedResponseGenerator.generateResponse(query, results);
  
  return NextResponse.json(response);
}
```

## Implementation Priorities

### **Immediate Impact (Weeks 1-4)**
1. **Document Classification System** - Automatically identify document types
2. **Enhanced Chunking** - Context-aware semantic chunking
3. **Multi-level Embeddings** - Hierarchy-aware embeddings

### **High Impact (Weeks 5-8)**
1. **Contextual Retrieval** - Smarter search with document structure awareness
2. **Grounded Responses** - Source attribution and confidence scoring
3. **Cross-document Analysis** - Understanding relationships between documents

### **Advanced Features (Weeks 9-13)**
1. **Hierarchical Summarization** - NotebookLM-style project summaries
2. **Compliance Intelligence** - Automated code compliance analysis
3. **Predictive Insights** - Proactive identification of potential issues

## Key Technical Improvements

### **1. Smarter Document Processing**
- Replace basic text extraction with structure-aware parsing
- Use Gemini Vision API for layout understanding
- Implement document relationship detection

### **2. Enhanced Embedding Strategy**
- Multi-level embeddings (project, document, section, chunk)
- Context-aware embedding generation
- Relationship embeddings for cross-document understanding

### **3. Intelligent Retrieval**
- Query intent classification
- Context-aware search strategies
- Multi-hop reasoning across documents

### **4. Grounded Response Generation**
- Explicit source attribution
- Confidence scoring
- Structured response formatting

## Expected Outcomes

After implementing this plan, BuildRight will achieve:

✅ **NotebookLM-level document understanding**
✅ **Comprehensive project summaries** like the example provided
✅ **Intelligent cross-document analysis**
✅ **Grounded responses with source attribution**
✅ **Superior architectural/engineering domain expertise**
✅ **Automated compliance analysis**

This will position BuildRight as a specialized, domain-expert version of NotebookLM specifically designed for architectural and engineering professionals. 