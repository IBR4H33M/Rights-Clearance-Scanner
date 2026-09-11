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

    const cleanName = options.filename
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 60) || "asset";
    const publicId = `${Date.now()}_${cleanName}`;

    const result: UploadApiResponse = await cloudinary.uploader.upload(dataUri, {
      folder: options.folder ?? "rights-clearance",
      resource_type: options.resourceType ?? "auto",
      use_filename: false,
      unique_filename: true,
      overwrite: false,
      public_id: publicId,
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
 * Delete an asset from Cloudinary using its full secure_url.
 */
export async function deleteAssetByUrl(url: string): Promise<boolean> {
  if (!url || !url.includes("cloudinary.com")) return false;
  ensureConfigured();

  try {
    const match = url.match(/\/(image|video|raw)\/upload\/(?:v\d+\/)?(.+)$/);
    if (!match) return false;

    const resourceType = match[1] as "image" | "video" | "raw";
    let publicIdWithExt = match[2];

    let publicId = publicIdWithExt;
    if (resourceType !== "raw") {
      publicId = publicIdWithExt.replace(/\.[a-zA-Z0-9]+$/, "");
    }

    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
    });
    console.log(`[Cloudinary] Destroyed ${publicId} (${resourceType}):`, result?.result);
    return result?.result === "ok";
  } catch (err) {
    console.error("[Cloudinary] Error deleting asset by URL:", err);
    return false;
  }
}

/**
 * Delete all assets and the folder for a given project from Cloudinary.
 */
export async function deleteProjectFolder(projectId: string): Promise<void> {
  if (!projectId) return;
  ensureConfigured();

  const folder = `rights-clearance/${projectId}`;
  try {
    for (const rType of ["image", "video", "raw"] as const) {
      try {
        await cloudinary.api.delete_resources_by_prefix(`${folder}/`, {
          resource_type: rType,
        });
      } catch {
        // Ignore if no resources of this type exist in the folder
      }
    }
    try {
      await cloudinary.api.delete_folder(folder);
      console.log(`[Cloudinary] Deleted project folder: ${folder}`);
    } catch {
      // Ignore if folder not found or already deleted
    }
  } catch (err) {
    console.error(`[Cloudinary] Error deleting project folder ${folder}:`, err);
  }
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
