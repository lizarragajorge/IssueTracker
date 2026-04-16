import 'dotenv/config';

function env(key: string, fallback?: string): string {
  const value = process.env[key] ?? fallback;
  if (!value) throw new Error(`Missing environment variable: ${key}`);
  return value;
}

export const config = {
  searchEndpoint: env('SEARCH_ENDPOINT'),
  searchIndexName: env('SEARCH_INDEX_NAME', 'email-rag-index'),
  openAiEndpoint: env('OPENAI_ENDPOINT'),
  chatModelDeployment: env('CHAT_MODEL_DEPLOYMENT', 'gpt-4o'),
  storageAccountName: env('STORAGE_ACCOUNT_NAME'),
  blobContainerName: env('BLOB_CONTAINER_NAME', 'attachments'),
  port: parseInt(env('PORT', '7072'), 10),
};
