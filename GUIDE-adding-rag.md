# Adding RAG (AI Search + OpenAI + Content Understanding) to an Existing Solution

A step-by-step guide for adding Retrieval-Augmented Generation capabilities to a solution that already has Azure Blob Storage and a frontend.

---

## What You'll End Up With

```
Blob Storage (existing)
    │
    ▼
Azure Content Understanding ──► extracts text, tables, images from documents
    │
    ▼
Azure AI Search ──► indexes content with vectors + full-text + semantic ranking
    │
    ▼
Azure OpenAI (gpt-4o) ──► answers questions grounded in your indexed documents
    │
    ▼
Your Frontend (existing) ──► chat UI + document browser
```

---

## Prerequisites

- Existing Azure Storage account with a blob container containing documents
- Existing frontend application
- Azure subscription with access to create AI Search, OpenAI, and Content Understanding resources
- Azure CLI installed and authenticated (`az login`)

---

## Phase 1: Provision Azure Resources

### 1.1 Create Azure OpenAI

```bash
RESOURCE_GROUP="rg-your-project"
LOCATION="eastus"
OAI_NAME="oai-yourproject-$(openssl rand -hex 6)"

az cognitiveservices account create \
  --name $OAI_NAME \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION \
  --kind OpenAI \
  --sku S0 \
  --custom-domain $OAI_NAME
```

Deploy the models:

```bash
# Chat model
az cognitiveservices account deployment create \
  --name $OAI_NAME \
  --resource-group $RESOURCE_GROUP \
  --deployment-name gpt-4o \
  --model-name gpt-4o \
  --model-version "2024-11-20" \
  --model-format OpenAI \
  --sku-capacity 30 \
  --sku-name Standard

# Embedding model (3072 dimensions)
az cognitiveservices account deployment create \
  --name $OAI_NAME \
  --resource-group $RESOURCE_GROUP \
  --deployment-name text-embedding-3-large \
  --model-name text-embedding-3-large \
  --model-version "1" \
  --model-format OpenAI \
  --sku-capacity 30 \
  --sku-name Standard
```

### 1.2 Create Azure AI Search

```bash
SEARCH_NAME="srch-yourproject-$(openssl rand -hex 6)"

az search service create \
  --name $SEARCH_NAME \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION \
  --sku standard \
  --semantic-search standard
```

### 1.3 Create Azure Content Understanding (optional)

Content Understanding extracts structured content from PDFs, images, Office docs, and more. If your blobs are already plain text or you only need basic extraction, you can skip this and use the built-in AI Search document cracking instead.

```bash
CU_NAME="cu-yourproject-$(openssl rand -hex 6)"

az cognitiveservices account create \
  --name $CU_NAME \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION \
  --kind ContentUnderstanding \
  --sku S0 \
  --custom-domain $CU_NAME
```

---

## Phase 2: Configure RBAC (No Access Keys)

Grant your identity (and later your app's managed identity) the required roles:

```bash
PRINCIPAL_ID=$(az ad signed-in-user show --query id -o tsv)
STORAGE_ID=$(az storage account show -n <your-storage-account> -g $RESOURCE_GROUP --query id -o tsv)
SEARCH_ID=$(az search service show -n $SEARCH_NAME -g $RESOURCE_GROUP --query id -o tsv)
OAI_ID=$(az cognitiveservices account show -n $OAI_NAME -g $RESOURCE_GROUP --query id -o tsv)

# Storage
az role assignment create --assignee $PRINCIPAL_ID --role "Storage Blob Data Reader" --scope $STORAGE_ID
az role assignment create --assignee $PRINCIPAL_ID --role "Storage Blob Delegator" --scope $STORAGE_ID

# AI Search
az role assignment create --assignee $PRINCIPAL_ID --role "Search Index Data Reader" --scope $SEARCH_ID
az role assignment create --assignee $PRINCIPAL_ID --role "Search Index Data Contributor" --scope $SEARCH_ID
az role assignment create --assignee $PRINCIPAL_ID --role "Search Service Contributor" --scope $SEARCH_ID

# OpenAI
az role assignment create --assignee $PRINCIPAL_ID --role "Cognitive Services OpenAI User" --scope $OAI_ID
```

For the **Search service** to access your **Storage** and **OpenAI** (for indexer + integrated vectorizer), enable Search managed identity and grant it roles:

```bash
# Enable system-assigned identity on Search
az search service update --name $SEARCH_NAME -g $RESOURCE_GROUP --identity SystemAssigned

SEARCH_PRINCIPAL=$(az search service show -n $SEARCH_NAME -g $RESOURCE_GROUP --query identity.principalId -o tsv)

# Search → Storage (to read blobs during indexing)
az role assignment create --assignee $SEARCH_PRINCIPAL --role "Storage Blob Data Reader" --scope $STORAGE_ID

# Search → OpenAI (for integrated vectorizer)
az role assignment create --assignee $SEARCH_PRINCIPAL --role "Cognitive Services OpenAI User" --scope $OAI_ID
```

---

## Phase 3: Create the Search Index, Skillset, Indexer

### 3.1 Define the Index

Create a file `index.json`:

```json
{
  "name": "your-index",
  "fields": [
    { "name": "id", "type": "Edm.String", "key": true, "filterable": true },
    { "name": "content", "type": "Edm.String", "searchable": true, "retrievable": true },
    { "name": "title", "type": "Edm.String", "searchable": true, "retrievable": true, "filterable": true },
    { "name": "metadata_storage_path", "type": "Edm.String", "retrievable": true },
    { "name": "content_vector", "type": "Collection(Edm.Single)",
      "searchable": true, "retrievable": false,
      "dimensions": 3072,
      "vectorSearchProfile": "vec-profile" }
  ],
  "vectorSearch": {
    "algorithms": [
      { "name": "vec-algo", "kind": "hnsw", "hnswParameters": { "m": 4, "efConstruction": 400, "efSearch": 500, "metric": "cosine" } }
    ],
    "profiles": [
      { "name": "vec-profile", "algorithm": "vec-algo", "vectorizer": "vec-openai" }
    ],
    "vectorizers": [
      {
        "name": "vec-openai",
        "kind": "azureOpenAI",
        "azureOpenAIParameters": {
          "resourceUri": "https://<OAI_NAME>.openai.azure.com",
          "deploymentId": "text-embedding-3-large",
          "modelName": "text-embedding-3-large",
          "authIdentity": { "@odata.type": "#Microsoft.Azure.Search.DataUserAssignedIdentity" }
        }
      }
    ]
  },
  "semantic": {
    "configurations": [
      {
        "name": "sem-config",
        "prioritizedFields": {
          "contentFields": [{ "fieldName": "content" }],
          "titleField": { "fieldName": "title" }
        }
      }
    ]
  }
}
```

```bash
SEARCH_ENDPOINT="https://${SEARCH_NAME}.search.windows.net"
TOKEN=$(az account get-access-token --resource https://search.azure.com --query accessToken -o tsv)

curl -X PUT "${SEARCH_ENDPOINT}/indexes/your-index?api-version=2024-07-01" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d @index.json
```

### 3.2 Create a Data Source (pointing at your existing blob container)

```json
{
  "name": "blob-datasource",
  "type": "azureblob",
  "credentials": { "connectionString": "ResourceId=/subscriptions/<SUB>/resourceGroups/<RG>/providers/Microsoft.Storage/storageAccounts/<STORAGE_ACCOUNT>;" },
  "container": { "name": "your-container" }
}
```

```bash
curl -X PUT "${SEARCH_ENDPOINT}/datasources/blob-datasource?api-version=2024-07-01" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d @datasource.json
```

### 3.3 Create a Skillset (with integrated vectorization)

The skillset cracks documents and generates embeddings automatically during indexing:

```json
{
  "name": "your-skillset",
  "skills": [
    {
      "@odata.type": "#Microsoft.Skills.Text.SplitSkill",
      "name": "split-text",
      "description": "Split content into chunks",
      "textSplitMode": "pages",
      "maximumPageLength": 2000,
      "pageOverlapLength": 200,
      "context": "/document",
      "inputs": [{ "name": "text", "source": "/document/content" }],
      "outputs": [{ "name": "textItems", "targetName": "chunks" }]
    },
    {
      "@odata.type": "#Microsoft.Skills.Text.AzureOpenAIEmbeddingSkill",
      "name": "embed-chunks",
      "description": "Generate embeddings",
      "resourceUri": "https://<OAI_NAME>.openai.azure.com",
      "deploymentId": "text-embedding-3-large",
      "modelName": "text-embedding-3-large",
      "context": "/document",
      "inputs": [{ "name": "text", "source": "/document/content" }],
      "outputs": [{ "name": "embedding", "targetName": "content_vector" }],
      "authIdentity": { "@odata.type": "#Microsoft.Azure.Search.DataUserAssignedIdentity" }
    }
  ]
}
```

#### With Content Understanding (advanced extraction)

If you opted for Content Understanding, add it as a custom skill or use the built-in integration to extract structured content from complex documents (scanned PDFs, forms, images with text):

```json
{
  "@odata.type": "#Microsoft.Skills.Custom.WebApiSkill",
  "name": "content-understanding",
  "description": "Extract content using Azure Content Understanding",
  "uri": "https://<CU_NAME>.cognitiveservices.azure.com/contentunderstanding/analyzers/<ANALYZER_ID>:analyze?api-version=2024-12-01-preview",
  "httpMethod": "POST",
  "timeout": "PT3M",
  "batchSize": 1,
  "context": "/document",
  "inputs": [
    { "name": "formUrl", "source": "/document/metadata_storage_path" },
    { "name": "formSasToken", "source": "/document/metadata_storage_sas_token" }
  ],
  "outputs": [
    { "name": "content", "targetName": "extracted_content" }
  ]
}
```

### 3.4 Create an Indexer

```json
{
  "name": "blob-indexer",
  "dataSourceName": "blob-datasource",
  "targetIndexName": "your-index",
  "skillsetName": "your-skillset",
  "parameters": {
    "configuration": {
      "dataToExtract": "contentAndMetadata",
      "parsingMode": "default"
    }
  },
  "fieldMappings": [
    { "sourceFieldName": "metadata_storage_path", "targetFieldName": "id", "mappingFunction": { "name": "base64Encode" } },
    { "sourceFieldName": "metadata_storage_name", "targetFieldName": "title" }
  ],
  "outputFieldMappings": [
    { "sourceFieldName": "/document/content_vector", "targetFieldName": "content_vector" }
  ],
  "schedule": { "interval": "PT1H" }
}
```

```bash
curl -X PUT "${SEARCH_ENDPOINT}/indexers/blob-indexer?api-version=2024-07-01" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d @indexer.json
```

The indexer will now:
1. Detect blobs in your container
2. Crack document content (PDFs, Office docs, etc.)
3. Generate vector embeddings via OpenAI
4. Populate the search index
5. Re-run hourly to pick up new/changed documents

Monitor indexer status:

```bash
curl "${SEARCH_ENDPOINT}/indexers/blob-indexer/status?api-version=2024-07-01" \
  -H "Authorization: Bearer $TOKEN" | jq '.lastResult.status, .lastResult.itemsProcessed'
```

---

## Phase 4: Add Backend Chat API

### 4.1 Install NuGet packages

```bash
dotnet add package Azure.AI.OpenAI
dotnet add package Azure.Identity
dotnet add package Azure.Search.Documents
```

### 4.2 Register services (DI)

```csharp
var credential = new DefaultAzureCredential();

// Azure AI Search
builder.Services.AddSingleton(_ =>
    new SearchClient(
        new Uri(config["SearchEndpoint"]!),
        config["SearchIndexName"]!,
        credential));

// Azure OpenAI
builder.Services.AddSingleton(_ =>
    new AzureOpenAIClient(
        new Uri(config["OpenAiEndpoint"]!),
        credential));
```

### 4.3 Implement hybrid search + chat

```csharp
// 1. Search: hybrid (BM25 + vector + semantic reranking)
var searchOptions = new SearchOptions
{
    Size = 5,
    Select = { "content", "title" },
    QueryType = SearchQueryType.Semantic,
    SemanticSearch = new SemanticSearchOptions
    {
        SemanticConfigurationName = "sem-config",
    },
    VectorSearch = new VectorSearchOptions
    {
        Queries =
        {
            new VectorizableTextQuery(userQuestion)
            {
                KNearestNeighborsCount = 5,
                Fields = { "content_vector" },
            }
        }
    }
};

var results = await searchClient.SearchAsync<SearchDocument>(userQuestion, searchOptions);

// 2. Build grounded prompt from search results
var context = new StringBuilder();
int i = 1;
await foreach (var result in results.Value.GetResultsAsync())
{
    context.AppendLine($"[Source {i}] {result.Document["content"]}");
    i++;
}

// 3. Chat completion with source citations
var chatClient = openAiClient.GetChatClient("gpt-4o");
var completion = await chatClient.CompleteChatAsync(
[
    new SystemChatMessage("""
        You are an AI assistant that answers questions based on the document library.
        Always cite sources using [Source N] notation.
        """),
    new UserChatMessage($"Sources:\n{context}\n\nQuestion: {userQuestion}")
]);

return completion.Value.Content[0].Text;
```

### 4.4 App settings to add

```json
{
  "SearchEndpoint": "https://<SEARCH_NAME>.search.windows.net",
  "SearchIndexName": "your-index",
  "OpenAiEndpoint": "https://<OAI_NAME>.openai.azure.com",
  "ChatModelDeployment": "gpt-4o"
}
```

---

## Phase 5: Add Chat UI to Frontend

Minimal integration — add a chat panel that calls your new API:

```typescript
// Angular service method
chat(question: string): Observable<ChatResponse> {
  return this.http.post<ChatResponse>('/api/chat', { question });
}

// Interface
interface ChatResponse {
  answer: string;
  citations: { index: number; title?: string }[];
}
```

Key UX elements:
- Text input + send button
- Message list (user bubbles + bot bubbles)
- Citation display below bot messages
- Loading/typing indicator during API call

---

## Phase 6: Content Understanding Deep Dive (Optional)

Use Content Understanding when you need more than basic document cracking:

| Scenario | Use Content Understanding? |
|----------|--------------------------|
| Plain text / Markdown files | No – AI Search handles natively |
| Simple PDFs with text | No – AI Search built-in cracking works |
| Scanned PDFs / images with text | **Yes** – OCR + layout analysis |
| Forms, invoices, receipts | **Yes** – field extraction |
| Mixed media (text + images + tables) | **Yes** – multimodal extraction |
| Audio/video transcription | **Yes** – speech-to-text extraction |

### Creating an Analyzer

```bash
CU_ENDPOINT="https://${CU_NAME}.cognitiveservices.azure.com"

curl -X PUT "${CU_ENDPOINT}/contentunderstanding/analyzers/doc-analyzer?api-version=2024-12-01-preview" \
  -H "Authorization: Bearer $(az account get-access-token --resource https://cognitiveservices.azure.com --query accessToken -o tsv)" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Document content extractor",
    "scenario": "documentAnalysis",
    "config": {
      "returnDetails": true
    },
    "fieldSchema": {
      "fields": {
        "content": { "type": "string", "description": "Full document text" },
        "summary": { "type": "string", "description": "Brief summary" },
        "keyEntities": { "type": "array", "items": { "type": "string" }, "description": "Key entities" }
      }
    }
  }'
```

### Wiring into the Indexer Pipeline

Content Understanding results feed into your skillset as enriched fields, which then get embedded and indexed just like any other content.

---

## Checklist

- [ ] Azure OpenAI resource created with `gpt-4o` + `text-embedding-3-large` deployments
- [ ] Azure AI Search resource created with semantic search enabled
- [ ] (Optional) Azure Content Understanding resource created
- [ ] RBAC roles assigned (your identity + Search managed identity)
- [ ] Search index created with vector field + semantic config
- [ ] Data source pointing to existing blob container
- [ ] Skillset with embedding skill (+ Content Understanding skill if needed)
- [ ] Indexer created and successfully processing documents
- [ ] Backend chat API implemented with hybrid search + OpenAI
- [ ] Frontend chat UI calling the API
- [ ] Test end-to-end: upload doc → indexer runs → ask question → get cited answer
