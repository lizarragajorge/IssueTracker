import { Router, type Request, type Response } from 'express';
import {
  BlobSASPermissions,
  generateBlobSASQueryParameters,
} from '@azure/storage-blob';
import { containerClient, blobServiceClient } from '../clients.js';
import { config } from '../config.js';

const router = Router();

router.get('/documents', async (req: Request, res: Response) => {
  const prefix = (req.query.prefix as string) || undefined;
  console.log(`Listing blobs with prefix: ${prefix ?? '(none)'}`);

  const blobs: {
    name: string;
    size: number;
    contentType?: string;
    lastModified?: Date;
  }[] = [];

  for await (const blob of containerClient.listBlobsFlat({ prefix })) {
    blobs.push({
      name: blob.name,
      size: blob.properties.contentLength ?? 0,
      contentType: blob.properties.contentType,
      lastModified: blob.properties.lastModified,
    });
  }

  res.json({
    storageAccount: config.storageAccountName,
    container: config.blobContainerName,
    count: blobs.length,
    documents: blobs,
  });
});

router.get('/document/{*name}', async (req: Request, res: Response) => {
  const nameParts = req.params.name;
  const name = Array.isArray(nameParts) ? nameParts.join('/') : nameParts;

  if (!name) {
    res.status(400).json({ error: 'Document name is required.' });
    return;
  }

  console.log(`Getting document detail: ${name}`);

  const blobClient = containerClient.getBlobClient(name);
  const exists = await blobClient.exists();

  if (!exists) {
    res.status(404).json({ error: `Blob '${name}' not found.` });
    return;
  }

  const properties = await blobClient.getProperties();

  // Generate a user-delegation SAS for a time-limited download URL
  const startsOn = new Date(Date.now() - 5 * 60_000);
  const expiresOn = new Date(Date.now() + 30 * 60_000);

  const userDelegationKey = await blobServiceClient.getUserDelegationKey(startsOn, expiresOn);

  const sasToken = generateBlobSASQueryParameters(
    {
      containerName: config.blobContainerName,
      blobName: name,
      permissions: BlobSASPermissions.parse('r'),
      startsOn,
      expiresOn,
    },
    userDelegationKey,
    config.storageAccountName,
  ).toString();

  const downloadUrl = `${blobClient.url}?${sasToken}`;

  res.json({
    name,
    size: properties.contentLength,
    contentType: properties.contentType,
    lastModified: properties.lastModified,
    metadata: properties.metadata,
    downloadUrl,
  });
});

export default router;
