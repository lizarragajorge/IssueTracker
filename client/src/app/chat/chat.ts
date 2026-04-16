import { Component, signal, inject, ElementRef, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../api.service';
import { ChatResponse, SourceCitation } from '../models';

interface ChatMessage {
  role: 'user' | 'bot';
  text: string;
  citations?: SourceCitation[];
}

@Component({
  selector: 'app-chat',
  imports: [FormsModule],
  templateUrl: './chat.html',
  styleUrl: './chat.scss',
})
export class Chat {
  private api = inject(ApiService);
  private messagesContainer = viewChild<ElementRef>('messagesContainer');

  messages = signal<ChatMessage[]>([
    { role: 'bot', text: 'Hello! Ask me anything about the documents in the library. I\'ll search the indexed emails and cite my sources.' },
  ]);
  question = signal('');
  loading = signal(false);

  send(): void {
    const q = this.question().trim();
    if (!q || this.loading()) return;

    this.messages.update(m => [...m, { role: 'user', text: q }]);
    this.question.set('');
    this.loading.set(true);
    this.scrollToBottom();

    this.api.chat(q).subscribe({
      next: (res: ChatResponse) => {
        this.messages.update(m => [...m, { role: 'bot', text: res.answer, citations: res.citations }]);
        this.loading.set(false);
        this.scrollToBottom();
      },
      error: (err) => {
        this.messages.update(m => [...m, { role: 'bot', text: `Error: ${err.error?.error || err.message}` }]);
        this.loading.set(false);
        this.scrollToBottom();
      },
    });
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }

  private scrollToBottom(): void {
    setTimeout(() => {
      const el = this.messagesContainer()?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }
}
