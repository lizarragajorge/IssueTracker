export interface ChatRequest {
  question: string;
}

export interface SourceCitation {
  index: number;
  title?: string;
  subject?: string;
  sender?: string;
  receivedDate?: string;
}

export interface ChatResponse {
  answer: string;
  citations: SourceCitation[];
}

export interface BlobInfo {
  name: string;
  size: number;
  contentType?: string;
  lastModified?: string;
}

export interface DocumentListResponse {
  storageAccount: string;
  container: string;
  count: number;
  documents: BlobInfo[];
}

export interface BlobDetail {
  name: string;
  size: number;
  contentType?: string;
  lastModified?: string;
  metadata?: Record<string, string>;
  downloadUrl: string;
}
