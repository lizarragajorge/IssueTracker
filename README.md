# TIAT RAG – Document Library Chat

A Retrieval-Augmented Generation (RAG) application that lets you chat with an indexed email/document library using Azure AI Search and Azure OpenAI, with a document browser for the underlying blob storage.

## Architecture

```
┌────────────────────┐        ┌──────────────────────────────────┐
│  Angular Frontend  │──/api──│  Azure Functions (Isolated .NET 8)│
│  (localhost:4200)   │        │  (localhost:7072)                 │
└────────────────────┘        └──────┬──────┬──────┬─────────────┘
                                     │      │      │
                              ┌──────┘      │      └──────┐
                              ▼             ▼             ▼
                      Azure AI Search  Azure OpenAI  Azure Blob Storage
                      (hybrid search)   (gpt-4o)     (attachments)
```

## Features

- **RAG Chat** – Ask questions answered by your document library with source citations
- **Hybrid Search** – BM25 full-text + vector search (`VectorizableTextQuery`) + semantic reranking
- **Document Browser** – Browse and download blobs from Azure Storage with SAS-secured URLs
- **Secure by default** – `DefaultAzureCredential` / Managed Identity everywhere, no access keys

## API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/chat` | Send a question, get a grounded answer with `[Source N]` citations |
| `GET`  | `/api/documents?prefix=` | List blobs in the attachments container (with optional prefix filter) |
| `GET`  | `/api/document/{*name}` | Get blob metadata and a 30-min SAS download URL |

## Prerequisites

- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0)
- [Azure Functions Core Tools v4](https://learn.microsoft.com/azure/azure-functions/functions-run-local)
- [Node.js 20+](https://nodejs.org/) and npm
- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli)
- An Azure subscription with the following pre-provisioned resources:
  - Azure AI Search with a populated index (`email-rag-index`)
  - Azure OpenAI with a `gpt-4o` deployment
  - Azure Storage account with an `attachments` container

## Getting Started

### 1. Clone and configure

```bash
cp local.settings.json.example local.settings.json
```

Edit `local.settings.json` with your resource names/endpoints.

### 2. Authenticate to Azure

```bash
az login
```

Your identity needs these RBAC roles on the respective resources:

| Resource | Role |
|----------|------|
| Azure AI Search | **Search Index Data Reader** |
| Azure OpenAI | **Cognitive Services OpenAI User** |
| Storage Account | **Storage Blob Data Reader** |
| Storage Account | **Storage Blob Delegator** (for SAS generation) |

### 3. Start the Functions backend

```bash
dotnet build EmailRag.Functions.csproj
cd bin/Debug/net8.0
func start --port 7072
```

### 4. Start the Angular frontend

```bash
cd client
npm install
npx ng serve
```

Open **http://localhost:4200**. The dev server proxies `/api/*` requests to the Functions host.

## Project Structure

```
├── Program.cs                    # DI: SearchClient, AzureOpenAIClient, BlobServiceClient
├── Functions/
│   ├── ChatFunction.cs           # POST /api/chat – hybrid search + GPT-4o
│   └── DocumentsFunction.cs      # GET /api/documents, GET /api/document/{*name}
├── Models/
│   └── Models.cs                 # Request/response DTOs
├── client/                       # Angular 21 frontend
│   ├── src/app/
│   │   ├── api.service.ts        # HTTP client for all API calls
│   │   ├── models.ts             # TypeScript interfaces
│   │   ├── chat/                 # Chat component (question → answer + citations)
│   │   └── documents/            # Document browser sidebar (list, filter, detail, download)
│   └── proxy.conf.json           # Dev proxy → localhost:7072
├── host.json                     # Functions host config
├── local.settings.json.example   # Template for app settings
└── EmailRag.Functions.csproj     # .NET 8 isolated worker project
```

## App Settings

| Setting | Description |
|---------|-------------|
| `SearchEndpoint` | Azure AI Search endpoint URL |
| `SearchIndexName` | Search index name (default: `email-rag-index`) |
| `OpenAiEndpoint` | Azure OpenAI endpoint URL |
| `ChatModelDeployment` | Chat model deployment name (default: `gpt-4o`) |
| `StorageAccountName` | Storage account name (no `.blob.core.windows.net`) |
| `BlobContainerName` | Blob container name (default: `attachments`) |

## Search Index Schema

The search index `email-rag-index` is expected to have these fields:

| Field | Type | Purpose |
|-------|------|---------|
| `content` | `Edm.String` | Full document text |
| `title` | `Edm.String` | Document title |
| `subject` | `Edm.String` | Email subject line |
| `sender` | `Edm.String` | Email sender |
| `received_date` | `Edm.String` | Date received |
| `summary` | `Edm.String` | Document summary |
| `content_vector` | `Collection(Edm.Single)` | 3072-dim embedding (`text-embedding-3-large`) |

Semantic configuration: `sem-config`  
Integrated vectorizer configured on the index (used via `VectorizableTextQuery`).

## Security

- **No access keys** – all Azure SDK clients use `DefaultAzureCredential`
- **User-delegation SAS** for blob download URLs (30-minute expiry)
- **Storage firewall** – recommend IP-allowlisting for local dev, private endpoints for production
