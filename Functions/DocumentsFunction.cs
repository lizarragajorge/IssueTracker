using Azure.Storage.Blobs;
using Azure.Storage.Sas;
using EmailRag.Functions.Models;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Logging;

namespace EmailRag.Functions.Functions;

public class DocumentsFunction
{
    private readonly BlobContainerClient _containerClient;
    private readonly BlobServiceClient _blobServiceClient;
    private readonly ILogger<DocumentsFunction> _logger;

    public DocumentsFunction(BlobContainerClient containerClient, BlobServiceClient blobServiceClient, ILogger<DocumentsFunction> logger)
    {
        _containerClient = containerClient;
        _blobServiceClient = blobServiceClient;
        _logger = logger;
    }

    [Function("ListDocuments")]
    public async Task<IActionResult> ListDocuments(
        [HttpTrigger(AuthorizationLevel.Function, "get", Route = "documents")] HttpRequest req)
    {
        var prefix = req.Query["prefix"].FirstOrDefault();
        _logger.LogInformation("Listing blobs with prefix: {Prefix}", prefix ?? "(none)");

        var blobs = new List<BlobInfo>();
        await foreach (var blob in _containerClient.GetBlobsAsync(prefix: prefix))
        {
            blobs.Add(new BlobInfo
            {
                Name = blob.Name,
                Size = blob.Properties.ContentLength ?? 0,
                ContentType = blob.Properties.ContentType,
                LastModified = blob.Properties.LastModified
            });
        }

        return new OkObjectResult(new
        {
            storageAccount = _blobServiceClient.AccountName,
            container = _containerClient.Name,
            count = blobs.Count,
            documents = blobs
        });
    }

    [Function("GetDocument")]
    public async Task<IActionResult> GetDocument(
        [HttpTrigger(AuthorizationLevel.Function, "get", Route = "document/{*name}")] HttpRequest req)
    {
        var name = req.RouteValues["name"]?.ToString();
        if (string.IsNullOrEmpty(name))
        {
            return new BadRequestObjectResult(new { error = "Document name is required." });
        }

        _logger.LogInformation("Getting document detail: {Name}", name);

        var blobClient = _containerClient.GetBlobClient(name);

        if (!await blobClient.ExistsAsync())
        {
            return new NotFoundObjectResult(new { error = $"Blob '{name}' not found." });
        }

        var properties = await blobClient.GetPropertiesAsync();

        // Generate a user-delegation SAS for a time-limited download URL
        var sasBuilder = new BlobSasBuilder
        {
            BlobContainerName = _containerClient.Name,
            BlobName = name,
            Resource = "b",
            ExpiresOn = DateTimeOffset.UtcNow.AddMinutes(30)
        };
        sasBuilder.SetPermissions(BlobSasPermissions.Read);

        var userDelegationKey = await _blobServiceClient.GetUserDelegationKeyAsync(
            DateTimeOffset.UtcNow.AddMinutes(-5),
            DateTimeOffset.UtcNow.AddMinutes(30));

        var sasUri = new BlobUriBuilder(blobClient.Uri)
        {
            Sas = sasBuilder.ToSasQueryParameters(userDelegationKey.Value, _blobServiceClient.AccountName)
        };

        return new OkObjectResult(new BlobDetail
        {
            Name = name,
            Size = properties.Value.ContentLength,
            ContentType = properties.Value.ContentType,
            LastModified = properties.Value.LastModified,
            Metadata = properties.Value.Metadata,
            DownloadUrl = sasUri.ToUri().ToString()
        });
    }
}
