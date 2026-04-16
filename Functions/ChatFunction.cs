using System.Text.Json;
using Azure.AI.OpenAI;
using Azure.Search.Documents;
using Azure.Search.Documents.Models;
using EmailRag.Functions.Models;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;
using OpenAI.Chat;

namespace EmailRag.Functions.Functions;

public class ChatFunction
{
    private readonly SearchClient _searchClient;
    private readonly AzureOpenAIClient _openAiClient;
    private readonly ILogger<ChatFunction> _logger;
    private readonly string _chatDeployment;

    private const string SystemPrompt = """
        You are an AI assistant that answers questions based on the document library.
        Use the provided sources to answer the user's question accurately.
        Always cite your sources using [Source N] notation, where N is the source number.
        If the sources do not contain relevant information, say so clearly.
        Do not make up information that is not in the sources.
        """;

    public ChatFunction(
        SearchClient searchClient,
        AzureOpenAIClient openAiClient,
        ILogger<ChatFunction> logger)
    {
        _searchClient = searchClient;
        _openAiClient = openAiClient;
        _logger = logger;
        _chatDeployment = Environment.GetEnvironmentVariable("ChatModelDeployment") ?? "gpt-4o";
    }

    [Function("Chat")]
    public async Task<IActionResult> Run(
        [HttpTrigger(AuthorizationLevel.Function, "post", Route = "chat")] HttpRequest req)
    {
        var chatRequest = await JsonSerializer.DeserializeAsync<ChatRequest>(req.Body,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

        if (chatRequest is null || string.IsNullOrWhiteSpace(chatRequest.Question))
        {
            return new BadRequestObjectResult(new { error = "A 'question' field is required." });
        }

        _logger.LogInformation("Chat question: {Question}", chatRequest.Question);

        // Hybrid search: BM25 + vector (VectorizableTextQuery) + semantic reranker
        var searchOptions = new SearchOptions
        {
            Size = 5,
            Select = { "content", "title", "subject", "sender", "received_date", "summary" },
            QueryType = SearchQueryType.Semantic,
            SemanticSearch = new SemanticSearchOptions
            {
                SemanticConfigurationName = "sem-config",
            },
            VectorSearch = new VectorSearchOptions
            {
                Queries =
                {
                    new VectorizableTextQuery(chatRequest.Question)
                    {
                        KNearestNeighborsCount = 5,
                        Fields = { "content_vector" },
                    }
                }
            }
        };

        var searchResults = await _searchClient.SearchAsync<SearchDocument>(
            chatRequest.Question, searchOptions);

        var sources = new List<(int Index, SearchDocument Doc)>();
        var contextBuilder = new System.Text.StringBuilder();
        int sourceIndex = 1;

        await foreach (var result in searchResults.Value.GetResultsAsync())
        {
            var doc = result.Document;
            sources.Add((sourceIndex, doc));

            contextBuilder.AppendLine($"[Source {sourceIndex}]");
            if (doc.TryGetValue("title", out var title)) contextBuilder.AppendLine($"Title: {title}");
            if (doc.TryGetValue("subject", out var subject)) contextBuilder.AppendLine($"Subject: {subject}");
            if (doc.TryGetValue("sender", out var sender)) contextBuilder.AppendLine($"Sender: {sender}");
            if (doc.TryGetValue("received_date", out var receivedDate)) contextBuilder.AppendLine($"Date: {receivedDate}");
            if (doc.TryGetValue("summary", out var summary)) contextBuilder.AppendLine($"Summary: {summary}");
            if (doc.TryGetValue("content", out var content)) contextBuilder.AppendLine($"Content: {content}");
            contextBuilder.AppendLine();

            sourceIndex++;
        }

        var userMessage = $"""
            Sources:
            {contextBuilder}

            Question: {chatRequest.Question}
            """;

        var chatClient = _openAiClient.GetChatClient(_chatDeployment);
        var completion = await chatClient.CompleteChatAsync(
        [
            new SystemChatMessage(SystemPrompt),
            new UserChatMessage(userMessage)
        ]);

        var answer = completion.Value.Content[0].Text;

        var citations = sources.Select(s =>
        {
            var citation = new SourceCitation { Index = s.Index };
            if (s.Doc.TryGetValue("title", out var t)) citation.Title = t?.ToString();
            if (s.Doc.TryGetValue("subject", out var sub)) citation.Subject = sub?.ToString();
            if (s.Doc.TryGetValue("sender", out var snd)) citation.Sender = snd?.ToString();
            if (s.Doc.TryGetValue("received_date", out var rd)) citation.ReceivedDate = rd?.ToString();
            return citation;
        }).ToList();

        return new OkObjectResult(new ChatResponse { Answer = answer, Citations = citations });
    }
}
