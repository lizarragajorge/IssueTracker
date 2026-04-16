namespace EmailRag.Functions.Models;

public class ChatRequest
{
    public string Question { get; set; } = string.Empty;
}

public class ChatResponse
{
    public string Answer { get; set; } = string.Empty;
    public List<SourceCitation> Citations { get; set; } = [];
}

public class SourceCitation
{
    public int Index { get; set; }
    public string? Title { get; set; }
    public string? Subject { get; set; }
    public string? Sender { get; set; }
    public string? ReceivedDate { get; set; }
}

public class BlobInfo
{
    public string Name { get; set; } = string.Empty;
    public long Size { get; set; }
    public string? ContentType { get; set; }
    public DateTimeOffset? LastModified { get; set; }
}

public class BlobDetail
{
    public string Name { get; set; } = string.Empty;
    public long Size { get; set; }
    public string? ContentType { get; set; }
    public DateTimeOffset? LastModified { get; set; }
    public IDictionary<string, string>? Metadata { get; set; }
    public string DownloadUrl { get; set; } = string.Empty;
}
