/**
 * Input validation & sanitization using Zod schemas.
 * Prevents prompt injection, SQL injection (Supabase handles SQL), buffer overflows, and malformed payloads.
 */

import { z } from 'zod';

// ─── Common Schemas ───────────────────────────────────────────────────────

export const UUIDSchema = z.string().uuid('Invalid UUID format');

export const EmailSchema = z.string().email('Invalid email format').max(254);

export const SafeStringSchema = z
  .string()
  .max(500)
  .transform((s) => s.trim());

export const SafeLongStringSchema = z
  .string()
  .max(5000)
  .transform((s) => s.trim());

// ─── API Request Schemas ──────────────────────────────────────────────────

export const RecommendationsRequestSchema = z.object({
  userId: UUIDSchema,
  mode: z.enum(['meal_prep', 'spontaneous']),
  limit: z.number().int().min(1).max(100).optional().default(40),
});

export const MacrosRequestSchema = z.object({
  externalId: z.string().max(50).optional(),
  supabaseId: UUIDSchema.optional(),
  recipeTitle: SafeStringSchema,
  ingredients: z
    .array(
      z.object({
        name: SafeStringSchema,
        quantity: z.string().max(20),
        unit: z.string().max(20),
      })
    )
    .max(50)
    .optional()
    .default([]),
});

export const TasteProfileRequestSchema = z.object({
  userId: UUIDSchema,
  dietaryGoals: z.array(z.string()).max(10).optional().default([]),
  ingredientDislikes: z.array(SafeStringSchema).max(30).optional().default([]),
  cuisinePreferences: z.array(SafeStringSchema).max(20).optional().default([]),
  eatingStyle: z.string().max(50).optional(),
  skillLevel: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
});

export const StorageTipRequestSchema = z.object({
  ingredient: SafeStringSchema,
  storageMethod: z.enum(['room_temp', 'fridge', 'freezer']).optional(),
});

export const SubstitutionsRequestSchema = z.object({
  ingredient: SafeStringSchema,
  reason: z.enum(['allergy', 'dietary', 'preference', 'unavailable']).optional(),
  limit: z.number().int().min(1).max(10).optional().default(5),
});

export const GenerateRecipeRequestSchema = z.object({
  cuisine: z.string().min(1).max(50).toLowerCase(),
  dietaryGoals: z.array(z.string().max(50)).max(10).optional().default([]),
  cookingTime: z.enum(['quick', 'moderate', 'long']).optional(),
  servings: z.number().int().min(1).max(20).optional().default(4),
  dishName: SafeStringSchema.optional(),
  avoidDishes: z.array(SafeStringSchema).max(10).optional().default([]),
  avoidIngredients: z.array(SafeStringSchema).max(20).optional().default([]),
  skillLevel: z.enum(['beginner', 'home_cook', 'confident_chef']).optional(),
  meal_prep_friendly: z.boolean().optional(),
  save: z.boolean().optional().default(false),
  maxMins: z.number().int().min(1).max(480).optional(),
});

export const DescribeRecipeRequestSchema = z.object({
  externalId: z.string().max(100),
  title: SafeStringSchema,
  cuisine: SafeStringSchema.optional(),
  category: SafeStringSchema.optional(),
  ingredients: z.array(SafeStringSchema).max(30).optional().default([]),
});

export const WaitlistRequestSchema = z.object({
  email: EmailSchema,
  name: SafeStringSchema.optional(),
  referralCode: z.string().max(50).optional(),
});

export const AddRecipeRequestSchema = z.object({
  name: SafeStringSchema,
  description: SafeLongStringSchema.optional(),
  cuisine: SafeStringSchema.optional(),
  prepTime: z.number().int().min(0).max(1440).optional(), // minutes
  cookTime: z.number().int().min(0).max(1440).optional(),
  servings: z.number().int().min(1).max(20).optional().default(4),
  isPublic: z.boolean().optional().default(false),
  ingredients: z
    .array(
      z.object({
        name: SafeStringSchema,
        quantity: z.string().max(20),
        unit: z.string().max(20),
      })
    )
    .max(30)
    .optional()
    .default([]),
  steps: z.array(SafeLongStringSchema).max(15).optional().default([]),
  photoUrl: z.string().url().optional(),
});

export const SeedRecipesRequestSchema = z.object({
  recipes: z
    .array(
      z.object({
        title: SafeStringSchema,
        cuisine: SafeStringSchema.optional(),
        ingredients: z.array(z.object({ name: SafeStringSchema })).optional(),
      })
    )
    .max(1000)
    .optional()
    .default([]),
});

// ─── Validation Helper ─────────────────────────────────────────────────────

export class ValidationError extends Error {
  constructor(public issues: z.ZodIssue[]) {
    super('Validation failed');
    this.name = 'ValidationError';
  }
}

export async function validate<T>(schema: z.ZodSchema, data: unknown): Promise<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ValidationError(result.error.issues);
  }
  return result.data as T;
}

// ─── Error Response Helper ─────────────────────────────────────────────────

export function formatValidationError(error: ValidationError): object {
  return {
    error: 'Validation failed',
    details: error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
      code: issue.code,
    })),
  };
}
