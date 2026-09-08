import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";

let configured = false;

function ensureConfigured(): void {
  if (configured) return;

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      "Cloudinary credentials missing. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET."
    );
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });

  configured = true;
  console.log("[Cloudinary] Configured for cloud:", cloudName);
}

export type UploadResult = {
  secureUrl: string;
  publicId: string;
  width: number;
  height: number;
  bytes: number;
  format: string;
  resourceType: string;
};

/**
 * Upload an asset to Cloudinary from a base64-encoded string.
 */
export async function uploadAsset(
  base64Data: string,
  options: {
    filename: string;
    mimeType: string;
    folder?: string;
    resourceType?: "image" | "video" | "raw" | "auto";
  }
): Promise<UploadResult> {
  ensureConfigured();

  const dataUri = `data:${options.mimeType};base64,${base64Data}`;

  const result: UploadApiResponse = await cloudinary.uploader.upload(dataUri, {
    folder: options.folder ?? "rights-clearance",
    resource_type: options.resourceType ?? "auto",
    use_filename: true,
    unique_filename: true,
    overwrite: false,
    public_id: options.filename.replace(/\.[^.]+$/, ""), // strip extension
  });

  return {
    secureUrl: result.secure_url,
    publicId: result.public_id,
    width: result.width ?? 0,
    height: result.height ?? 0,
    bytes: result.bytes ?? 0,
    format: result.format ?? "",
    resourceType: result.resource_type ?? "auto",
  };
}

/**
 * Delete an asset from Cloudinary.
 */
export async function deleteAsset(
  publicId: string,
  resourceType: string = "image"
): Promise<void> {
  ensureConfigured();
  await cloudinary.uploader.destroy(publicId, {
    resource_type: resourceType,
  });
}

/**
 * Fetch asset bytes from a Cloudinary URL (for passing to Gemini).
 */
export async function fetchAssetBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch asset from ${url}: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Check if Cloudinary is properly configured.
 */
export function isCloudinaryConfigured(): boolean {
  return !!(
    process.env.CLOUDINARY_CLOUD_NAME &&
    process.env.CLOUDINARY_API_KEY &&
    process.env.CLOUDINARY_API_SECRET
  );
}
