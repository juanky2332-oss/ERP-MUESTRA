-- Enable pgvector extension for RAG
CREATE EXTENSION IF NOT EXISTS vector;

-- 1. Document Embeddings Table
-- Stores embeddings for all RAG documents
CREATE TABLE IF NOT EXISTS document_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT, -- Text content extracted via OCR/Parser
  embedding vector(1536), -- OpenAI text-embedding-3-small dimension
  metadata JSONB, -- { "filename": "...", "type": "invoice|contract", "related_id": "..." }
  created_at TIMESTAMP DEFAULT NOW()
);

-- Index for faster similarity search
CREATE INDEX IF NOT EXISTS document_embeddings_embedding_idx ON document_embeddings USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- 2. Client Emails Table
-- For "Smart Email Input" (Multi-contact management)
CREATE TABLE IF NOT EXISTS client_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES contactos(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  tag TEXT, -- 'Administración', 'Taller', 'Gerencia', etc.
  created_at TIMESTAMP DEFAULT NOW()
);

-- 3. RAG/Similarity Search Function
-- Function to be called from Supabase Client to find context
CREATE OR REPLACE FUNCTION match_documents (
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  metadata JSONB,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    document_embeddings.id,
    document_embeddings.content,
    document_embeddings.metadata,
    1 - (document_embeddings.embedding <=> query_embedding) AS similarity
  FROM document_embeddings
  WHERE 1 - (document_embeddings.embedding <=> query_embedding) > match_threshold
  ORDER BY document_embeddings.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- 4. Status updates (Comments/Docs only, as columns are TEXT)
-- Presupuestos: 'borrador', 'enviado', 'aceptado', 'rechazado', 'traspasado'
-- Albaranes: 'pendiente', 'firmado', 'facturado'
-- Facturas: 'borrador', 'emitida', 'pagada', 'vencida'

-- Make sure existing tables allow these states (they are TEXT, so yes).
