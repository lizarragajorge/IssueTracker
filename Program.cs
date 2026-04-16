using Azure.AI.OpenAI;
using Azure.Identity;
using Azure.Search.Documents;
using Azure.Storage.Blobs;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Builder;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

var builder = FunctionsApplication.CreateBuilder(args);

builder.ConfigureFunctionsWebApplication();

builder.Services
    .AddApplicationInsightsTelemetryWorkerService()
    .ConfigureFunctionsApplicationInsights();

var credential = new DefaultAzureCredential();

builder.Services.AddSingleton(_ =>
{
    var endpoint = new Uri(Environment.GetEnvironmentVariable("SearchEndpoint")!);
    var indexName = Environment.GetEnvironmentVariable("SearchIndexName")!;
    return new SearchClient(endpoint, indexName, credential);
});

builder.Services.AddSingleton(_ =>
{
    var endpoint = new Uri(Environment.GetEnvironmentVariable("OpenAiEndpoint")!);
    return new AzureOpenAIClient(endpoint, credential);
});

builder.Services.AddSingleton(_ =>
{
    var accountName = Environment.GetEnvironmentVariable("StorageAccountName")!;
    var blobServiceUri = new Uri($"https://{accountName}.blob.core.windows.net");
    return new BlobServiceClient(blobServiceUri, credential);
});

builder.Services.AddSingleton(sp =>
{
    var containerName = Environment.GetEnvironmentVariable("BlobContainerName")!;
    return sp.GetRequiredService<BlobServiceClient>().GetBlobContainerClient(containerName);
});

builder.Build().Run();
