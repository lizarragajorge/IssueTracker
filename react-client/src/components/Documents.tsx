import { useState, useEffect, useRef, useCallback } from 'react';
import { listDocuments, getDocument } from '../api';
import type { BlobInfo, BlobDetail } from '../models';
import './Documents.css';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString();
}

function formatDateMedium(iso?: string): string {
  if (!iso) return 'N/A';
  return new Date(iso).toLocaleString();
}

export default function Documents() {
  const [documents, setDocuments] = useState<BlobInfo[]>([]);
  const [storageAccount, setStorageAccount] = useState('');
  const [container, setContainer] = useState('');
  const [docCount, setDocCount] = useState(0);
  const [prefix, setPrefix] = useState('');
  const [selectedDoc, setSelectedDoc] = useState<BlobDetail | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadDocuments = useCallback(async (p?: string) => {
    setLoadingList(true);
    try {
      const res = await listDocuments(p?.trim() || undefined);
      setDocuments(res.documents);
      setStorageAccount(res.storageAccount);
      setContainer(res.container);
      setDocCount(res.count);
    } catch {
      setDocuments([]);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const onPrefixChange = (value: string) => {
    setPrefix(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => loadDocuments(value), 300);
  };

  const selectDocument = async (name: string) => {
    setLoadingDetail(true);
    try {
      const detail = await getDocument(name);
      setSelectedDoc(detail);
    } catch {
      setSelectedDoc(null);
    } finally {
      setLoadingDetail(false);
    }
  };

  return (
    <>
      <div className="sidebar-header">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        Documents
      </div>

      {storageAccount && (
        <div className="storage-info">
          <div className="storage-badge">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
              <ellipse cx="12" cy="5" rx="9" ry="3" />
              <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
              <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
            </svg>
            {storageAccount}
          </div>
          <div className="container-badge">
            📦 {container} &middot; {docCount} blob{docCount === 1 ? '' : 's'}
          </div>
        </div>
      )}

      <div className="sidebar-filter">
        <input
          type="text"
          placeholder="Filter by prefix..."
          value={prefix}
          onChange={(e) => onPrefixChange(e.target.value)}
        />
      </div>

      <div className="doc-list">
        {loadingList ? (
          <div className="doc-empty">Loading...</div>
        ) : documents.length === 0 ? (
          <div className="doc-empty">No documents found.</div>
        ) : (
          documents.map((doc) => (
            <div key={doc.name} className="doc-item" onClick={() => selectDocument(doc.name)}>
              <div className="doc-name">{doc.name}</div>
              <div className="doc-meta">
                {formatBytes(doc.size)} &middot; {doc.contentType || 'unknown'}
                {doc.lastModified && <> &middot; {formatDate(doc.lastModified)}</>}
              </div>
            </div>
          ))
        )}
      </div>

      {loadingDetail && <div className="doc-empty">Loading detail...</div>}

      {selectedDoc && (
        <div className="doc-detail-panel">
          <div className="detail-header">
            <h4>{selectedDoc.name}</h4>
            <button className="close-btn" onClick={() => setSelectedDoc(null)}>
              &times;
            </button>
          </div>
          <p>
            <strong>Size:</strong> {formatBytes(selectedDoc.size)}
          </p>
          <p>
            <strong>Type:</strong> {selectedDoc.contentType || 'unknown'}
          </p>
          <p>
            <strong>Modified:</strong> {formatDateMedium(selectedDoc.lastModified)}
          </p>
          {selectedDoc.metadata && Object.keys(selectedDoc.metadata).length > 0 && (
            <p>
              <strong>Metadata:</strong>{' '}
              {Object.entries(selectedDoc.metadata)
                .map(([k, v]) => `${k}=${v}`)
                .join(', ')}
            </p>
          )}
          <a href={selectedDoc.downloadUrl} target="_blank" rel="noopener noreferrer">
            Download
          </a>
        </div>
      )}
    </>
  );
}
