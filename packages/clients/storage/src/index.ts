import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type S3Config = {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  forcePathStyle?: boolean;
};

export function createS3Client(config: S3Config) {
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    },
    forcePathStyle: config.forcePathStyle ?? true
  });
  // Remove checksum middleware to avoid signing x-amz-checksum-* for presigned PUTs
  try {
    // @ts-ignore internal middleware id
    client.middlewareStack.remove("flexibleChecksumsMiddleware");
  } catch {}
  return client;
}

export async function createPresignedPutUrl(
  client: S3Client,
  bucket: string,
  key: string,
  contentType: string,
  expiresInSeconds = 900
) {
  const command = new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType });
  return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}

export async function createPresignedGetUrl(
  client: S3Client,
  bucket: string,
  key: string,
  expiresInSeconds = 900
) {
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}

export async function putObjectDirect(
  client: S3Client,
  bucket: string,
  key: string,
  body: Uint8Array | string,
  contentType?: string
) {
  const cmd = new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType });
  return client.send(cmd);
}

export async function headObject(
  client: S3Client,
  bucket: string,
  key: string
) {
  const cmd = new HeadObjectCommand({ Bucket: bucket, Key: key });
  return client.send(cmd);
}

