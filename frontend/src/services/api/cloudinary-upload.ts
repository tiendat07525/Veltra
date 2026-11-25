import axios from 'axios';

// Answer of the server's sign endpoints (message attachments, avatar)
export interface SignedUpload {
  uploadUrl: string;
  fields: Record<string, string | number>;
}

// Separate client: Cloudinary must never receive our Authorization header or cookies
const uploadClient = axios.create({ withCredentials: false });

// Uploads a file straight to Cloudinary. Resolves to the public id the server chose.
export async function uploadSigned(
  signed: SignedUpload,
  file: File,
  onProgress?: (fraction: number) => void
): Promise<string> {
  const form = new FormData();
  // Exactly the signed fields (any change invalidates the signature), then the file
  Object.entries(signed.fields).forEach(([key, value]) => form.append(key, String(value)));
  form.append('file', file);
  await uploadClient.post(signed.uploadUrl, form, {
    onUploadProgress: (event) => {
      if (event.total) onProgress?.(Math.min(event.loaded / event.total, 1));
    },
  });
  return String(signed.fields.public_id);
}
