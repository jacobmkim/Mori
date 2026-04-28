// Authorization gate for the /api/macros write path. Kept pure so the IDOR
// fix is testable without mocking Supabase or the Anthropic client.
//
// Two writes are permitted:
//   1. Curated recipes (source_type = 'curated') that have no macros yet —
//      legitimate backfill of seeded data.
//   2. Community recipes the caller submitted themselves.
// Anything else returns false. Without this gate, any authenticated user
// could pass an arbitrary `supabaseId` and overwrite another recipe's macros
// via the service-role-keyed update.

export interface MacrosOwnershipRecipe {
  source_type?: string | null;
  submitted_by?: string | null;
  macros?: unknown;
}

export function canWriteMacros(recipe: MacrosOwnershipRecipe, userId: string): boolean {
  if (!userId) return false;
  const isCuratedBackfill = recipe.source_type === 'curated' && recipe.macros == null;
  const isOwnSubmission = recipe.submitted_by === userId;
  return isCuratedBackfill || isOwnSubmission;
}
