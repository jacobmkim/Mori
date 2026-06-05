import { supabase } from '@/lib/supabase';
import { validateImageForUpload, ImageValidationError } from '@/lib/imageUpload';
import { cropToLandscape } from '@/lib/cropToLandscape';

// Uploads a user's "cook photo" (a picture of a dish they made) to the
// dedicated `cook-photos` storage bucket and returns its public URL. The URL is
// stored on the user's recipe_reviews row (photo_url). Mirrors the recipe-photo
// upload in AddRecipeWizard: 4:3 crop → validate (5 MB, image MIME) → upload as
// Uint8Array (RN/iOS Blob bug — see lib/imageUpload.ts).
//
// Path is scoped to `${userId}/...` so the storage RLS policy (writes allowed
// only where auth.uid() === first folder segment) lets the user write their own
// photo and nobody else's. recipe_reviews is UNIQUE (recipe_id, user_id), so one
// cook photo per user per recipe; including recipeId in the filename keeps a
// user's photos for different recipes distinct.
//
// Throws ImageValidationError (with a user-friendly `userMessage`) on bad input;
// re-throws other failures (RLS denial, network) for the caller to surface.

const COOK_PHOTOS_BUCKET = 'cook-photos';

export async function uploadCookPhoto(
  userId: string,
  recipeId: string,
  uri: string,
): Promise<string> {
  // cropToLandscape is a no-op for already-landscape sources; fall back to the
  // original uri if it fails so we still attempt the upload.
  const cropped = await cropToLandscape(uri).catch(() => ({ uri }));
  const { data, contentType } = await validateImageForUpload(cropped.uri, 5 * 1024 * 1024);

  const path = `${userId}/${recipeId}-${Date.now()}.jpg`;
  const { error: uploadError } = await supabase.storage
    .from(COOK_PHOTOS_BUCKET)
    .upload(path, data, { upsert: true, contentType, cacheControl: '31536000' });
  if (uploadError) throw uploadError;

  const { data: urlData } = supabase.storage.from(COOK_PHOTOS_BUCKET).getPublicUrl(path);
  return urlData.publicUrl;
}

export { ImageValidationError };
