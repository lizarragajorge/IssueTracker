import { Component, signal, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { ApiService } from '../api.service';
import { BlobInfo, BlobDetail } from '../models';

@Component({
  selector: 'app-documents',
  imports: [FormsModule, DatePipe],
  templateUrl: './documents.html',
  styleUrl: './documents.scss',
})
export class Documents implements OnInit {
  private api = inject(ApiService);

  documents = signal<BlobInfo[]>([]);
  storageAccount = signal('');
  container = signal('');
  docCount = signal(0);
  prefix = signal('');
  selectedDoc = signal<BlobDetail | null>(null);
  loadingList = signal(false);
  loadingDetail = signal(false);

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.loadDocuments();
  }

  onPrefixChange(value: string): void {
    this.prefix.set(value);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.loadDocuments(), 300);
  }

  loadDocuments(): void {
    this.loadingList.set(true);
    const p = this.prefix().trim() || undefined;
    this.api.listDocuments(p).subscribe({
      next: (res) => {
        this.documents.set(res.documents);
        this.storageAccount.set(res.storageAccount);
        this.container.set(res.container);
        this.docCount.set(res.count);
        this.loadingList.set(false);
      },
      error: () => {
        this.documents.set([]);
        this.loadingList.set(false);
      },
    });
  }

  selectDocument(name: string): void {
    this.loadingDetail.set(true);
    this.api.getDocument(name).subscribe({
      next: (detail) => {
        this.selectedDoc.set(detail);
        this.loadingDetail.set(false);
      },
      error: () => {
        this.selectedDoc.set(null);
        this.loadingDetail.set(false);
      },
    });
  }

  closeDetail(): void {
    this.selectedDoc.set(null);
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  metadataEntries(meta: Record<string, string> | undefined): [string, string][] {
    return meta ? Object.entries(meta) : [];
  }
}
