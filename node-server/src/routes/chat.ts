import { Router, type Request, type Response } from 'express';
import { KnownVectorQueryKind } from '@azure/search-documents';
import { searchClient, openAiClient, type SearchDoc } from '../clients.js';
import { config } from '../config.js';

const router = Router();

const SYSTEM_PROMPT = `You are an AI assistant that answers questions based on the document library.
Use the provided sources to answer the user's question accurately.
Always cite your sources using [Source N] notation, where N is the source number.
If the sources do not contain relevant information, say so clearly.
Do not make up information that is not in the sources.`;

interface ChatRequestBody {
  question?: string;
}

interface SourceCitation {
  index: number;
  title?: string;
  subject?: string;
  sender?: string;
  receivedDate?: string;
}

router.post('/chat', async (req: Request, res: Response) => {
  const body = req.body as ChatRequestBody;
  const question = body?.question?.trim();

  if (!question) {
    res.status(400).json({ error: "A 'question' field is required." });
    return;
  }

  console.log(`Chat question: ${question}`);

  // Hybrid search: BM25 + vector (VectorizableTextQuery) + semantic reranker
  const searchResults = await searchClient.search(question, {
    top: 5,
    select: ['content', 'title', 'subject', 'sender', 'received_date', 'summary'],
    queryType: 'semantic',
    semanticSearchOptions: {
      configurationName: 'sem-config',
    },
    vectorSearchOptions: {
      queries: [
        {
          kind: KnownVectorQueryKind.Text,
          text: question,
          kNearestNeighborsCount: 5,
          fields: ['content_vector'],
        },
      ],
    },
  });

  const sources: { index: number; doc: SearchDoc }[] = [];
  let context = '';
  let sourceIndex = 1;

  for await (const result of searchResults.results) {
    const doc = result.document;
    sources.push({ index: sourceIndex, doc });

    context += `[Source ${sourceIndex}]\n`;
    if (doc.title) context += `Title: ${doc.title}\n`;
    if (doc.subject) context += `Subject: ${doc.subject}\n`;
    if (doc.sender) context += `Sender: ${doc.sender}\n`;
    if (doc.received_date) context += `Date: ${doc.received_date}\n`;
    if (doc.summary) context += `Summary: ${doc.summary}\n`;
    if (doc.content) context += `Content: ${doc.content}\n`;
    context += '\n';

    sourceIndex++;
  }

  const userMessage = `Sources:\n${context}\nQuestion: ${question}`;

  const completion = await openAiClient.chat.completions.create({
    model: config.chatModelDeployment,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
  });

  const answer = completion.choices[0]?.message?.content ?? '';

  const citations: SourceCitation[] = sources.map((s) => ({
    index: s.index,
    title: s.doc.title,
    subject: s.doc.subject,
    sender: s.doc.sender,
    receivedDate: s.doc.received_date,
  }));

  res.json({ answer, citations });
});

export default router;
