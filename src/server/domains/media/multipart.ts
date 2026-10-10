import { ValidationError } from "@/server/lib/errors";

/**
 * Reads the single uploaded file of a multipart request (SEC-16).
 *
 * `request.formData()` throws a TypeError on a JSON or empty body, which
 * reached the client as a 500 "Internal server error" — a malformed request
 * is the caller's error, so it is now a 400 with a French message.
 */
export async function readMultipart(request: Request): Promise<FormData> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    throw new ValidationError("Envoyez le fichier au format multipart/form-data.");
  }
  try {
    return await request.formData();
  } catch {
    throw new ValidationError("Le contenu envoyé n'a pas pu être lu.");
  }
}

/** The file in `field` of an already-parsed multipart body. */
export function uploadedFile(formData: FormData, field = "file"): File {
  const file = formData.get(field);
  if (!(file instanceof File)) {
    throw new ValidationError("Aucun fichier reçu.");
  }
  return file;
}

export async function readUploadedFile(request: Request, field = "file"): Promise<File> {
  const formData = await readMultipart(request);
  const file = formData.get(field);
  if (!(file instanceof File)) {
    throw new ValidationError("Aucun fichier reçu.");
  }
  return file;
}
