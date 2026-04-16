import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ChatRequest, ChatResponse, DocumentListResponse, BlobDetail } from './models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);

  chat(question: string): Observable<ChatResponse> {
    return this.http.post<ChatResponse>('/api/chat', { question } as ChatRequest);
  }

  listDocuments(prefix?: string): Observable<DocumentListResponse> {
    let params = new HttpParams();
    if (prefix) {
      params = params.set('prefix', prefix);
    }
    return this.http.get<DocumentListResponse>('/api/documents', { params });
  }

  getDocument(name: string): Observable<BlobDetail> {
    const encodedPath = name.split('/').map(encodeURIComponent).join('/');
    return this.http.get<BlobDetail>(`/api/document/${encodedPath}`);
  }
}
