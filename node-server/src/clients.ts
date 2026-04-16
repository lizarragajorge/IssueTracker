import { DefaultAzureCredential } from '@azure/identity';
import { SearchClient } from '@azure/search-documents';
import { BlobServiceClient } from '@azure/storage-blob';
import { AzureOpenAI } from 'openai';
import { config } from './config.js';

export interface SearchDoc {
  content?: string;
  title?: string;
  subject?: string;
  sender?: string;
  received_date?: string;
  summary?: string;
  content_vector?: number[];
}

const credential = new DefaultAzureCredential();

export const searchClient = new SearchClient<SearchDoc>(
  config.searchEndpoint,
  config.searchIndexName,
  credential,
);

export const openAiClient = new AzureOpenAI({
  endpoint: config.openAiEndpoint,
  azureADTokenProvider: async () => {
    const token = await credential.getToken('https://cognitiveservices.azure.com/.default');
    return token.token;
  },
  apiVersion: '2024-10-21',
});

export const blobServiceClient = new BlobServiceClient(
  `https://${config.storageAccountName}.blob.core.windows.net`,
  credential,
);

export const containerClient = blobServiceClient.getContainerClient(config.blobContainerName);
