import crypto from "crypto";
import "dotenv/config";

function getB2Config() {
  return {
    b2KeyId: process.env.B2_KEY_ID,
    b2ApplicationKey: process.env.B2_APPLICATION_KEY,
    b2BucketName: process.env.B2_BUCKET_NAME || "dreamapp",
    b2BucketId: process.env.B2_BUCKET_ID || "015ea13b9ee24fccae02031a",
  };
}

let cachedAuth = null;
let authExpiry = 0;

/**
 * Authorize with Backblaze B2 Native API
 */
async function authorizeB2() {
  const now = Date.now();
  if (cachedAuth && authExpiry > now) {
    return cachedAuth;
  }

  const { b2KeyId, b2ApplicationKey } = getB2Config();
  if (!b2KeyId || !b2ApplicationKey) {
    throw new Error("Backblaze B2 credentials missing.");
  }

  const credentials = Buffer.from(`${b2KeyId}:${b2ApplicationKey}`).toString("base64");
  const response = await fetch("https://api.backblazeb2.com/b2api/v2/b2_authorize_account", {
    headers: { Authorization: `Basic ${credentials}` },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`B2 Auth failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  cachedAuth = data;
  authExpiry = now + 20 * 60 * 1000; // Cache for 20 minutes
  return data;
}

/**
 * Upload a file buffer to Backblaze B2 bucket
 * @param {Buffer} fileBuffer
 * @param {string} originalName
 * @param {string} mimeType
 * @returns {Promise<string>} Relative API route URL
 */
export async function uploadToB2(fileBuffer, originalName, mimeType) {
  const { b2KeyId, b2ApplicationKey, b2BucketId } = getB2Config();
  if (!b2KeyId || !b2ApplicationKey) {
    throw new Error("Backblaze B2 credentials missing in environment variables.");
  }

  const authData = await authorizeB2();

  // 1. Get upload URL
  const uploadUrlRes = await fetch(`${authData.apiUrl}/b2api/v2/b2_get_upload_url`, {
    method: "POST",
    headers: {
      Authorization: authData.authorizationToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ bucketId: b2BucketId }),
  });

  if (!uploadUrlRes.ok) {
    const errText = await uploadUrlRes.text();
    throw new Error(`Failed to get B2 upload URL: ${errText}`);
  }

  const uploadUrlData = await uploadUrlRes.json();

  // 2. Upload file
  const extension = originalName.includes(".") ? originalName.split(".").pop() : "jpg";
  const uniqueName = `uploads/${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${extension}`;
  const sha1Hash = crypto.createHash("sha1").update(fileBuffer).digest("hex");

  const uploadRes = await fetch(uploadUrlData.uploadUrl, {
    method: "POST",
    headers: {
      Authorization: uploadUrlData.authorizationToken,
      "X-Bz-File-Name": encodeURIComponent(uniqueName),
      "Content-Type": mimeType || "b2/x-auto",
      "Content-Length": fileBuffer.length.toString(),
      "X-Bz-Content-Sha1": sha1Hash,
    },
    body: fileBuffer,
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`B2 File Upload failed (${uploadRes.status}): ${errText}`);
  }

  // Return server route URL for streaming private B2 object
  return `/api/upload/file/${uniqueName}`;
}

/**
 * Stream a private B2 object
 * @param {string} key
 * @returns {Promise<{ stream: any, contentType: string, contentLength: string }>}
 */
export async function getFileStreamFromB2(key) {
  const { b2KeyId, b2ApplicationKey, b2BucketName } = getB2Config();
  if (!b2KeyId || !b2ApplicationKey) {
    throw new Error("Backblaze B2 credentials missing.");
  }

  const authData = await authorizeB2();
  const downloadUrl = `${authData.downloadUrl}/file/${b2BucketName}/${encodeURI(key)}`;

  const response = await fetch(downloadUrl, {
    headers: {
      Authorization: authData.authorizationToken,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch file from B2 (${response.status})`);
  }

  return {
    stream: response.body,
    contentType: response.headers.get("content-type") || "image/jpeg",
    contentLength: response.headers.get("content-length"),
  };
}
