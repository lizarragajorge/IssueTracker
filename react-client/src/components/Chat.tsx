import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import { chat } from '../api';
import type { SourceCitation } from '../models';
import './Chat.css';

interface ChatMessage {
  role: 'user' | 'bot';
  text: string;
  citations?: SourceCitation[];
}

export default function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'bot',
      text: "Hello! Ask me anything about the documents in the library. I'll search the indexed emails and cite my sources.",
    },
  ]);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }));
  };

  useEffect(scrollToBottom, [messages, loading]);

  const send = async () => {
    const q = question.trim();
    if (!q || loading) return;

    setMessages((prev) => [...prev, { role: 'user', text: q }]);
    setQuestion('');
    setLoading(true);

    try {
      const res = await chat(q);
      setMessages((prev) => [...prev, { role: 'bot', text: res.answer, citations: res.citations }]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setMessages((prev) => [...prev, { role: 'bot', text: `Error: ${msg}` }]);
    } finally {
      setLoading(false);
    }
  };

  const onKeydown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="chat-container">
      <div className="chat-header">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        Chat with your Document Library
      </div>

      <div className="chat-messages">
        {messages.map((msg, i) => (
          <div key={i} className={`msg ${msg.role}`}>
            <div className="msg-text">{msg.text}</div>
            {msg.citations && msg.citations.length > 0 && (
              <div className="citations">
                <strong>Sources:</strong>
                {msg.citations.map((c) => (
                  <div key={c.index} className="citation">
                    [Source {c.index}] {c.title || c.subject || ''}
                    {c.sender && <> &mdash; {c.sender}</>}
                    {c.receivedDate && <> ({c.receivedDate})</>}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {loading && <div className="typing">Thinking...</div>}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area">
        <input
          type="text"
          placeholder="Ask a question..."
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={onKeydown}
          disabled={loading}
          autoComplete="off"
        />
        <button onClick={send} disabled={loading || !question.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}
