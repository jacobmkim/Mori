import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Switch,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect, useRef } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { fetchIngredientNames, insertCommunityRecipe } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { validateImageForUpload, ImageValidationError } from '@/lib/imageUpload';
import { cropToLandscape } from '@/lib/cropToLandscape';
import { DIETARY_TAGS, inferDietaryTags, diffDietaryTags } from '@/lib/dietaryClassifier';
import { getApiBaseUrl } from '@/lib/apiBaseUrl';
import { useUserStore } from '@/stores/userStore';
import { router } from 'expo-router';
import type { Recipe, RecipeStep, Ingredient, Macros } from '@/types';

// ── Pure helpers (mirrored from RecipeDetailModal) ────────────────────────────

function extractStepTitle(step: RecipeStep): { title: string; detail: string } {
  if (step.title) {
    return { title: step.title, detail: step.instruction };
  }
  const instruction = step.instruction;
  const match = instruction.match(/^([^.!?]+[.!?])\s+(.*)/s);
  if (match && match[1].length <= 60) {
    return { title: match[1].replace(/[.!?]$/, '').trim(), detail: match[2].trim() };
  }
  const words = instruction.split(' ');
  if (words.length > 10) {
    return { title: words.slice(0, 8).join(' '), detail: words.slice(8).join(' ') };
  }
  return { title: instruction, detail: '' };
}

function extractTimerMinutes(instruction: string): number | null {
  const match = instruction.match(/(\d+)[\s-]*(to[\s-]*\d+\s*)?min(?:ute)?s?/i);
  if (match) return parseInt(match[1]);
  const hrMatch = instruction.match(/(\d+)\s*hour/i);
  if (hrMatch) return parseInt(hrMatch[1]) * 60;
  return null;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface IngredientRow {
  qty: string;
  unit: string;
  name: string;
}

interface StepRow {
  instruction: string;
  timerMins: number | null;
}

export interface AddRecipeWizardProps {
  visible: boolean;
  userId: string;
  onClose: () => void;
  onSuccess: (recipe: Recipe) => void;
}

const CUISINES = [
  'American', 'Italian', 'Mexican', 'Japanese', 'Chinese',
  'Indian', 'Mediterranean', 'Thai', 'French', 'Korean', 'Middle Eastern', 'Other',
];

const UNITS = ['whole', 'g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'handful', 'pinch', 'slice'];

const TIMER_PRESETS = [2, 5, 10, 15];

// ── Component ─────────────────────────────────────────────────────────────────

export function AddRecipeWizard({ visible, userId, onClose, onSuccess }: AddRecipeWizardProps) {
  const colors = useTheme();

  // Navigation
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [cuisine, setCuisine] = useState<string | null>(null);
  // Single combined "Total time" field. Stored in DB as cook_time_mins=total,
  // prep_time_mins=0 so existing aggregations (formatTime, weekly totals) keep
  // working without a schema change.
  const [totalTime, setTotalTime] = useState('');
  const [servings, setServings] = useState('');
  const [mealPrepFriendly, setMealPrepFriendly] = useState(false);
  const [skillLevel, setSkillLevel] = useState<'beginner' | 'home_cook' | 'confident_chef'>('home_cook');
  const [isPublic, setIsPublic] = useState(true);

  // Step 2
  const [ingredientRows, setIngredientRows] = useState<IngredientRow[]>([{ qty: '', unit: '', name: '' }]);
  const [ingredientNames, setIngredientNames] = useState<string[]>([]);
  const [autocompleteIndex, setAutocompleteIndex] = useState<number | null>(null);
  const [autocompleteQuery, setAutocompleteQuery] = useState('');
  const [autocompleteY, setAutocompleteY] = useState(0);
  const [unitPickerIndex, setUnitPickerIndex] = useState<number | null>(null);
  const ingredientRefs = useRef<(TextInput | null)[]>([]);

  // Step 3
  const [stepRows, setStepRows] = useState<StepRow[]>([{ instruction: '', timerMins: null }]);
  const [activeStepIdx, setActiveStepIdx] = useState(0);

  // Step 4
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  // User-picked dietary tags from the canonical vocabulary. The classifier
  // runs as a sanity check post-submit (see handleSubmit + diffDietaryTags).
  const [dietaryTags, setDietaryTags] = useState<Set<string>>(() => new Set());
  // Macro calculator state. macros starts null; the review step auto-fetches
  // from /api/macros once you land on it. macrosLoading toggles the spinner;
  // macrosError surfaces a fallback "enter manually" CTA.
  const [macros, setMacros] = useState<Macros | null>(null);
  const [macrosLoading, setMacrosLoading] = useState(false);
  const [macrosError, setMacrosError] = useState<string | null>(null);

  // Load ingredient names when wizard opens
  useEffect(() => {
    if (!visible) return;
    fetchIngredientNames().then(setIngredientNames).catch(() => {});
  }, [visible]);

  function resetState() {
    setStep(1);
    setName(''); setDescription(''); setCuisine(null);
    setTotalTime(''); setServings(''); setIsPublic(true);
    setMealPrepFriendly(false); setSkillLevel('home_cook');
    setIngredientRows([{ qty: '', unit: '', name: '' }]);
    setAutocompleteIndex(null); setAutocompleteQuery('');
    setUnitPickerIndex(null);
    setStepRows([{ instruction: '', timerMins: null }]);
    setActiveStepIdx(0);
    setSubmitError(null);
    setImageUri(null);
    setImageUploading(false);
    setDietaryTags(new Set());
    setMacros(null); setMacrosLoading(false); setMacrosError(null);
  }

  async function handlePickImage() {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow photo library access to add a recipe photo.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.85,
      });
      if (!result.canceled && result.assets[0]?.uri) {
        setImageUri(result.assets[0].uri);
      }
    } catch {
      Alert.alert('Could not open photo library', 'Please try again.');
    }
  }

  async function uploadImage(uri: string): Promise<string | null> {
    try {
      setImageUploading(true);
      // Force 4:3 landscape before uploading. iOS picker's `aspect: [4, 3]`
      // option is silently ignored, so portrait phone photos otherwise ship
      // as-is and look awkwardly cropped on every card surface. cropToLandscape
      // is a no-op for already-landscape sources.
      const cropped = await cropToLandscape(uri).catch(() => ({ uri }));
      const { data, contentType } = await validateImageForUpload(cropped.uri, 5 * 1024 * 1024);
      const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('recipe-images')
        .upload(path, data, { upsert: true, contentType, cacheControl: '31536000' });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('recipe-images').getPublicUrl(path);
      return urlData.publicUrl;
    } catch (err) {
      if (err instanceof ImageValidationError) {
        Alert.alert('Image not supported', err.userMessage);
        return null;
      }
      // Surface non-validation failures (RLS denial, missing bucket, network)
      // so users don't end up with a saved recipe missing the photo they
      // attached. Previously this branch silently returned null.
      const detail = err instanceof Error && err.message ? `\n\n${err.message}` : '';
      Alert.alert(
        'Could not upload photo',
        `Please check your connection and try again.${detail}`,
      );
      if (__DEV__) console.warn('[AddRecipeWizard] image upload failed:', err);
      return null;
    } finally {
      setImageUploading(false);
    }
  }

  function handleDiscard() {
    resetState();
    onClose();
  }

  function handleBack() {
    if (step === 1) {
      Alert.alert(
        'Discard recipe?',
        'Your progress will be lost.',
        [
          { text: 'Keep editing', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: handleDiscard },
        ]
      );
    } else {
      setStep((s) => (s - 1) as 1 | 2 | 3 | 4);
    }
  }

  function goNext() {
    setStep((s) => (s + 1) as 1 | 2 | 3 | 4);
  }

  // Auto-fetch macros when the user lands on Step 4. Re-runs on the (already-
  // settled) ingredients + servings since those drive the estimate. User can
  // still edit each value after the fetch — we never overwrite a user-edited
  // value with a refetch (debounced + only fires once per Step 4 entry).
  const reviewFetchKey = useRef<string | null>(null);
  useEffect(() => {
    if (step !== 4) return;
    const cleanIngs = ingredientRows
      .filter((r) => r.name.trim() !== '')
      .map((r) => ({ name: r.name.trim(), quantity: r.qty.trim(), unit: r.unit }));
    const servingsNum = servings ? parseInt(servings) : NaN;
    if (cleanIngs.length === 0 || isNaN(servingsNum) || servingsNum <= 0) {
      setMacrosError('Add ingredients and servings before macros can be estimated.');
      setMacros(null);
      return;
    }
    // Idempotency key — skip if we already fetched for this exact payload.
    const key = JSON.stringify({ cleanIngs, servingsNum, title: name.trim() });
    if (reviewFetchKey.current === key) return;
    reviewFetchKey.current = key;

    let cancelled = false;
    (async () => {
      setMacrosLoading(true);
      setMacrosError(null);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (!token) {
          if (!cancelled) setMacrosError('Could not estimate — please enter macros manually.');
          return;
        }
        const res = await fetch(`${getApiBaseUrl()}/api/macros`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            recipeTitle: name.trim(),
            ingredients: cleanIngs,
            servings: servingsNum,
          }),
        });
        if (!res.ok) throw new Error(`macros ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        if (data && typeof data.calories === 'number') {
          setMacros({
            calories: data.calories,
            protein: data.protein ?? 0,
            carbohydrates: data.carbohydrates ?? 0,
            fat: data.fat ?? 0,
            fibre: data.fibre ?? 0,
            isEstimated: true,
          });
        } else {
          setMacrosError('Could not estimate — please enter macros manually.');
        }
      } catch {
        if (!cancelled) setMacrosError('Could not estimate — please enter macros manually.');
      } finally {
        if (!cancelled) setMacrosLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [step, ingredientRows, servings, name]);

  async function handleSubmit() {
    // Gate: a recipe with no submitter name lands on cards as a blank "By"
    // line — bad UX for the user discovering it. Block submit and send the
    // author to set up a display name first. Profile state lives in
    // userStore; we read it fresh in case the user updated it mid-session.
    const profile = useUserStore.getState().profile;
    const displayName = (profile?.name ?? '').trim();
    if (!displayName) {
      Alert.alert(
        'Set a display name first',
        "Other Mori users will see your recipes — add a name to your profile so they know who to thank.",
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Set up now',
            onPress: () => {
              handleDiscard();
              router.push('/edit-profile');
            },
          },
        ],
      );
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      const cleanIngredients: Ingredient[] = ingredientRows
        .filter((r) => r.name.trim() !== '')
        .map((r) => ({ name: r.name.trim(), quantity: r.qty.trim(), unit: r.unit }));

      const cleanSteps: RecipeStep[] = stepRows
        .filter((r) => r.instruction.trim() !== '')
        .map((r, i) => ({
          order: i + 1,
          instruction: r.instruction.trim(),
          timer_minutes: r.timerMins ?? null,
        }));

      // Upload photo if user picked one. If the upload fails we abort the
      // submit entirely — saving a recipe with a missing photo is a worse
      // outcome than asking the user to retry. uploadImage already surfaces
      // an alert before returning null.
      let imageUrl: string | null = null;
      if (imageUri) {
        imageUrl = await uploadImage(imageUri);
        if (imageUrl === null) {
          setSubmitError('Photo upload failed. Try again or remove the photo before saving.');
          return;
        }
      }

      const parsedServings = parseInt(servings);
      const parsedTotal = totalTime ? parseInt(totalTime) : 0;
      const tagsArray = Array.from(dietaryTags);

      const supabaseId = await insertCommunityRecipe({
        title: name.trim(),
        description: description.trim() || null,
        cuisine,
        ingredients: cleanIngredients,
        steps: cleanSteps,
        // Store the user's single "total time" as cook_time_mins so existing
        // sums (formatTime, weekly aggregations) continue to work unchanged.
        prep_time_mins: 0,
        cook_time_mins: parsedTotal,
        servings: parsedServings,
        dietary_tags: tagsArray,
        meal_prep_friendly: mealPrepFriendly,
        skill_level: skillLevel,
        macros,
        submitted_by: userId,
        image_url: imageUrl,
        is_public: isPublic,
      });

      // Sanity-check the user's dietary picks against the heuristic
      // classifier. Strict-tag conflicts (e.g. "vegan" claimed with chicken
      // in the ingredients) get a console.warn — replace with Sentry
      // breadcrumb when the moderation queue lands. We never override the
      // user's picks; they have ground truth.
      const inferred = inferDietaryTags(name.trim(), cleanIngredients);
      const diff = diffDietaryTags(tagsArray, inferred);
      if (diff.conflicts.length > 0 && __DEV__) {
        console.warn('[community-recipe-tags] strict-tag conflicts on submit', {
          recipeId: supabaseId,
          userPicked: tagsArray,
          inferred,
          conflicts: diff.conflicts,
        });
      }

      const newRecipe: Recipe = {
        id: supabaseId,
        supabase_id: supabaseId,
        title: name.trim(),
        description: description.trim() || null,
        cuisine,
        source_type: 'community',
        ingredients: cleanIngredients,
        steps: cleanSteps,
        prep_time_mins: 0,
        cook_time_mins: parsedTotal,
        servings: parsedServings,
        cost_per_serving: null,
        dietary_tags: tagsArray,
        macros,
        badge: 'none',
        avg_rating: 0,
        save_count: 0,
        image_url: imageUrl,
        submitted_by: userId,
        is_public: isPublic,
        moderation_status: 'approved',
      };

      onSuccess(newRecipe);
      resetState();
    } catch {
      setSubmitError('Could not save recipe. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Autocomplete helpers ───────────────────────────────────────────────────

  const suggestions =
    autocompleteIndex !== null && autocompleteQuery.length >= 1
      ? ingredientNames
          .filter((n) => n.toLowerCase().includes(autocompleteQuery.toLowerCase()))
          .slice(0, 4)
      : [];

  function applyAutocomplete(value: string) {
    if (autocompleteIndex === null) return;
    setIngredientRows((rows) =>
      rows.map((r, i) => (i === autocompleteIndex ? { ...r, name: value } : r))
    );
    setAutocompleteIndex(null);
    setAutocompleteQuery('');
  }

  function measureIngredientInput(index: number) {
    const ref = ingredientRefs.current[index];
    if (!ref) return;
    (ref as any).measure(
      (_x: number, _y: number, _w: number, h: number, _px: number, py: number) => {
        setAutocompleteY(py + h);
      }
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={handleBack}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        {/* Header */}
        <WizardHeader step={step} onBack={handleBack} colors={colors} />

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          {step === 1 && (
            <Step1Basics
              colors={colors}
              name={name} setName={setName}
              description={description} setDescription={setDescription}
              cuisine={cuisine} setCuisine={setCuisine}
              totalTime={totalTime} setTotalTime={setTotalTime}
              servings={servings} setServings={setServings}
              mealPrepFriendly={mealPrepFriendly} setMealPrepFriendly={setMealPrepFriendly}
              skillLevel={skillLevel} setSkillLevel={setSkillLevel}
              isPublic={isPublic} setIsPublic={setIsPublic}
              onNext={goNext}
            />
          )}
          {step === 2 && (
            <Step2Ingredients
              colors={colors}
              rows={ingredientRows}
              setRows={setIngredientRows}
              autocompleteIndex={autocompleteIndex}
              setAutocompleteIndex={setAutocompleteIndex}
              autocompleteQuery={autocompleteQuery}
              setAutocompleteQuery={setAutocompleteQuery}
              suggestions={suggestions}
              applyAutocomplete={applyAutocomplete}
              autocompleteY={autocompleteY}
              measureIngredientInput={measureIngredientInput}
              ingredientRefs={ingredientRefs}
              unitPickerIndex={unitPickerIndex}
              setUnitPickerIndex={setUnitPickerIndex}
              onNext={goNext}
            />
          )}
          {step === 3 && (
            <Step3Steps
              colors={colors}
              rows={stepRows}
              setRows={setStepRows}
              activeStepIdx={activeStepIdx}
              setActiveStepIdx={setActiveStepIdx}
              onNext={goNext}
            />
          )}
          {step === 4 && (
            <Step4Review
              colors={colors}
              name={name}
              description={description}
              cuisine={cuisine}
              totalTime={totalTime}
              servings={servings}
              isPublic={isPublic}
              ingredients={ingredientRows.filter((r) => r.name.trim() !== '')}
              steps={stepRows.filter((r) => r.instruction.trim() !== '')}
              submitting={submitting}
              submitError={submitError}
              onSubmit={handleSubmit}
              imageUri={imageUri}
              imageUploading={imageUploading}
              onPickImage={handlePickImage}
              onRemoveImage={() => setImageUri(null)}
              dietaryTags={dietaryTags}
              setDietaryTags={setDietaryTags}
              macros={macros}
              setMacros={setMacros}
              macrosLoading={macrosLoading}
              macrosError={macrosError}
            />
          )}
        </KeyboardAvoidingView>

        {/* Autocomplete overlay — positioned on root SafeAreaView */}
        {autocompleteIndex !== null && suggestions.length > 0 && (
          <View
            style={{
              position: 'absolute',
              top: autocompleteY,
              left: 16 + 64 + 86 + 6,
              right: 16 + 32,
              zIndex: 999,
              backgroundColor: colors.card,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colors.border,
              shadowColor: '#000',
              shadowOpacity: 0.12,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 2 },
              elevation: 8,
            }}
          >
            {suggestions.map((s) => (
              <SuggestionRow
                key={s}
                name={s}
                query={autocompleteQuery}
                colors={colors}
                onPress={() => applyAutocomplete(s)}
              />
            ))}
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

// ── WizardHeader ──────────────────────────────────────────────────────────────

function WizardHeader({ step, onBack, colors }: { step: number; onBack: () => void; colors: any }) {
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable onPress={onBack} hitSlop={10} style={{ padding: 4 }}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1, flexDirection: 'row', gap: 6 }}>
          {[1, 2, 3, 4].map((s) => (
            <View
              key={s}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 2,
                backgroundColor: s <= step ? colors.primary : colors.border,
              }}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

// ── Step 1 — Basics ───────────────────────────────────────────────────────────

function Step1Basics({
  colors, name, setName, description, setDescription, cuisine, setCuisine,
  totalTime, setTotalTime, servings, setServings,
  mealPrepFriendly, setMealPrepFriendly, skillLevel, setSkillLevel,
  isPublic, setIsPublic, onNext,
}: any) {
  // Servings is REQUIRED — drives macro per-serving math. Without it /api/macros
  // defaults to 4 and the result is silently 4x off.
  const parsedServings = parseInt(servings);
  const canNext = name.trim().length > 0 && !isNaN(parsedServings) && parsedServings > 0;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ fontSize: 22, fontFamily: 'Georgia', fontStyle: 'italic', color: colors.text, marginBottom: 20, marginTop: 4 }}>
          Recipe basics
        </Text>

        {/* Name */}
        <Text style={labelStyle(colors)}>Recipe name *</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. Lemon garlic pasta"
          placeholderTextColor={colors.textMuted}
          autoFocus
          style={inputStyle(colors)}
        />

        {/* Description */}
        <Text style={labelStyle(colors)}>Description</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="One-line description"
          placeholderTextColor={colors.textMuted}
          style={inputStyle(colors)}
        />

        {/* Cuisine */}
        <Text style={labelStyle(colors)}>Cuisine</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          {CUISINES.map((c) => (
            <Pressable
              key={c}
              onPress={() => setCuisine(cuisine === c ? null : c)}
              style={{
                paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
                backgroundColor: cuisine === c ? colors.primary : colors.card,
                borderWidth: 1,
                borderColor: cuisine === c ? colors.primary : colors.border,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '500', color: cuisine === c ? '#fff' : colors.text }}>
                {c}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Time + servings */}
        <Text style={labelStyle(colors)}>Timing &amp; servings</Text>
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
          {[
            { label: 'Total time (min)', value: totalTime, set: setTotalTime, required: false },
            { label: 'Servings *', value: servings, set: setServings, required: true },
          ].map(({ label, value, set, required }) => (
            <View key={label} style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, color: colors.textMuted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {label}
              </Text>
              <TextInput
                value={value}
                onChangeText={set}
                keyboardType="numeric"
                placeholder={required ? 'Required' : '—'}
                placeholderTextColor={colors.textMuted}
                style={[inputStyle(colors), { textAlign: 'center' }]}
              />
            </View>
          ))}
        </View>

        {/* Skill level */}
        <Text style={labelStyle(colors)}>Skill level</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
          {(['beginner', 'home_cook', 'confident_chef'] as const).map((s) => {
            const label = s === 'beginner' ? 'Beginner' : s === 'home_cook' ? 'Home cook' : 'Confident chef';
            const active = skillLevel === s;
            return (
              <Pressable
                key={s}
                onPress={() => setSkillLevel(s)}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 12,
                  alignItems: 'center',
                  backgroundColor: active ? colors.primary : colors.card,
                  borderWidth: 1,
                  borderColor: active ? colors.primary : colors.border,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '500', color: active ? '#fff' : colors.text }}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Meal-prep toggle */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          backgroundColor: colors.card, borderRadius: 12, padding: 14, marginBottom: 12,
        }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>Meal-prep friendly</Text>
            <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>Keeps well 3+ days in the fridge</Text>
          </View>
          <Switch
            value={mealPrepFriendly}
            onValueChange={setMealPrepFriendly}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor="#fff"
          />
        </View>

        {/* Public toggle */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          backgroundColor: colors.card, borderRadius: 12, padding: 14,
        }}>
          <View>
            <Text style={{ fontSize: 14, fontWeight: '600', color: colors.text }}>Public recipe</Text>
            <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>Visible to all Mori users</Text>
          </View>
          <Switch
            value={isPublic}
            onValueChange={setIsPublic}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor="#fff"
          />
        </View>
      </ScrollView>

      <StickyFooter colors={colors}>
        <NextButton colors={colors} onPress={onNext} disabled={!canNext} label="Next" />
      </StickyFooter>
    </View>
  );
}

// ── Step 2 — Ingredients ──────────────────────────────────────────────────────

function Step2Ingredients({
  colors, rows, setRows, autocompleteIndex, setAutocompleteIndex,
  autocompleteQuery, setAutocompleteQuery, suggestions, applyAutocomplete,
  autocompleteY, measureIngredientInput, ingredientRefs, unitPickerIndex, setUnitPickerIndex, onNext,
}: any) {
  const canNext = rows.some((r: IngredientRow) => r.name.trim() !== '');

  function updateRow(index: number, field: keyof IngredientRow, value: string) {
    setRows((prev: IngredientRow[]) =>
      prev.map((r: IngredientRow, i: number) => (i === index ? { ...r, [field]: value } : r))
    );
  }

  function addRow() {
    if (rows.length >= 30) return;
    setRows((prev: IngredientRow[]) => [...prev, { qty: '', unit: '', name: '' }]);
  }

  function deleteRow(index: number) {
    if (rows.length <= 1) return;
    setRows((prev: IngredientRow[]) => prev.filter((_: IngredientRow, i: number) => i !== index));
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ fontSize: 22, fontFamily: 'Georgia', fontStyle: 'italic', color: colors.text, marginBottom: 16, marginTop: 4 }}>
          Ingredients
        </Text>

        {/* Table header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, paddingRight: 32 }}>
          <Text style={[colHeaderStyle(colors), { width: 64 }]}>Qty</Text>
          <Text style={[colHeaderStyle(colors), { width: 86 }]}>Unit</Text>
          <Text style={[colHeaderStyle(colors), { flex: 1 }]}>Ingredient</Text>
        </View>

        {rows.map((row: IngredientRow, index: number) => (
          <View key={index} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            {/* Qty */}
            <TextInput
              value={row.qty}
              onChangeText={(v) => updateRow(index, 'qty', v)}
              keyboardType="decimal-pad"
              placeholder="—"
              placeholderTextColor={colors.textMuted}
              style={[inputStyle(colors), { width: 64, textAlign: 'center', marginBottom: 0 }]}
            />
            {/* Unit */}
            <Pressable
              onPress={() => setUnitPickerIndex(index)}
              style={[inputStyle(colors), {
                width: 86, marginBottom: 0, justifyContent: 'center', alignItems: 'center',
              }]}
            >
              <Text style={{ color: row.unit ? colors.text : colors.textMuted, fontSize: 14 }}>
                {row.unit || '—'}
              </Text>
            </Pressable>
            {/* Ingredient name */}
            <TextInput
              ref={(el) => { ingredientRefs.current[index] = el; }}
              value={row.name}
              onChangeText={(v) => {
                updateRow(index, 'name', v);
                setAutocompleteQuery(v);
                setAutocompleteIndex(index);
              }}
              onFocus={() => {
                setAutocompleteIndex(index);
                setAutocompleteQuery(row.name);
                setTimeout(() => measureIngredientInput(index), 100);
              }}
              onBlur={() => {
                setTimeout(() => {
                  setAutocompleteIndex(null);
                  setAutocompleteQuery('');
                }, 150);
              }}
              placeholder="e.g. garlic"
              placeholderTextColor={colors.textMuted}
              style={[inputStyle(colors), { flex: 1, marginBottom: 0 }]}
            />
            {/* Delete */}
            <Pressable
              onPress={() => deleteRow(index)}
              hitSlop={8}
              style={{ width: 28, alignItems: 'center', opacity: rows.length <= 1 ? 0.2 : 1 }}
            >
              <Ionicons name="close-circle" size={20} color={colors.textMuted} />
            </Pressable>
          </View>
        ))}

        {/* Add row */}
        <Pressable
          onPress={addRow}
          disabled={rows.length >= 30}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, opacity: rows.length >= 30 ? 0.4 : 1 }}
        >
          <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
          <Text style={{ fontSize: 14, color: colors.primary, fontWeight: '600' }}>Add ingredient</Text>
        </Pressable>
      </ScrollView>

      <StickyFooter colors={colors}>
        <NextButton colors={colors} onPress={onNext} disabled={!canNext} label="Next" />
      </StickyFooter>

      {/* Unit picker modal */}
      <Modal
        visible={unitPickerIndex !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setUnitPickerIndex(null)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}
          onPress={() => setUnitPickerIndex(null)}
        >
          <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 32 }}>
            <View style={{ alignItems: 'center', paddingVertical: 12 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
            </View>
            <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text, paddingHorizontal: 20, marginBottom: 8 }}>
              Select unit
            </Text>
            {UNITS.map((u) => (
              <Pressable
                key={u}
                onPress={() => {
                  if (unitPickerIndex !== null) {
                    setRows((prev: IngredientRow[]) =>
                      prev.map((r: IngredientRow, i: number) => (i === unitPickerIndex ? { ...r, unit: u } : r))
                    );
                  }
                  setUnitPickerIndex(null);
                }}
                style={{ paddingVertical: 14, paddingHorizontal: 20, borderBottomWidth: 0.5, borderBottomColor: colors.border }}
              >
                <Text style={{ fontSize: 15, color: colors.text }}>{u}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

// ── Step 3 — Steps ────────────────────────────────────────────────────────────

function Step3Steps({ colors, rows, setRows, activeStepIdx, setActiveStepIdx, onNext }: any) {
  const canNext = rows[0]?.instruction.trim().length > 0;

  function updateInstruction(index: number, value: string) {
    setRows((prev: StepRow[]) =>
      prev.map((r: StepRow, i: number) => (i === index ? { ...r, instruction: value } : r))
    );
  }

  function applyTimer(index: number, mins: number) {
    setRows((prev: StepRow[]) =>
      prev.map((r: StepRow, i: number) => {
        if (i !== index) return r;
        const alreadyHasTimer = extractTimerMinutes(r.instruction) !== null;
        const newInstruction = alreadyHasTimer ? r.instruction : `${r.instruction} — ${mins} min`.trim();
        return { ...r, instruction: newInstruction, timerMins: mins };
      })
    );
  }

  function addStep() {
    if (rows.length >= 15) return;
    setRows((prev: StepRow[]) => [...prev, { instruction: '', timerMins: null }]);
    setActiveStepIdx(rows.length);
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ fontSize: 22, fontFamily: 'Georgia', fontStyle: 'italic', color: colors.text, marginBottom: 16, marginTop: 4 }}>
          Steps
        </Text>

        {rows.map((row: StepRow, idx: number) => {
          const isActive = idx === activeStepIdx;
          const isFilled = idx < activeStepIdx;
          const timerMins = extractTimerMinutes(row.instruction);
          const syntheticStep: RecipeStep = { order: idx + 1, instruction: row.instruction };
          const { title, detail } = extractStepTitle(syntheticStep);

          if (isActive) {
            return (
              <View
                key={idx}
                style={{
                  borderRadius: 14, marginBottom: 10, padding: 14,
                  borderWidth: 1.5, borderColor: colors.primary,
                  backgroundColor: colors.card,
                }}
              >
                <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                  <StepCircle order={idx + 1} active colors={colors} />
                  <View style={{ flex: 1 }}>
                    <TextInput
                      value={row.instruction}
                      onChangeText={(v) => updateInstruction(idx, v)}
                      placeholder="Start with a verb. e.g. Dice the onion finely."
                      placeholderTextColor={colors.textMuted}
                      multiline
                      style={{ fontSize: 14, color: colors.text, lineHeight: 20, minHeight: 60 }}
                      autoFocus={idx === activeStepIdx}
                    />
                    {/* Timer suggestion bar */}
                    {timerMins !== null && (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                        <Text style={{ fontSize: 11, color: colors.textMuted, alignSelf: 'center' }}>Timer:</Text>
                        {TIMER_PRESETS.map((mins) => (
                          <Pressable
                            key={mins}
                            onPress={() => applyTimer(idx, mins)}
                            style={{
                              paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999,
                              backgroundColor: row.timerMins === mins ? colors.primary : colors.primaryLight ?? colors.border,
                            }}
                          >
                            <Text style={{ fontSize: 12, fontWeight: '600', color: row.timerMins === mins ? '#fff' : colors.primary }}>
                              {mins} min
                            </Text>
                          </Pressable>
                        ))}
                        <Pressable
                          onPress={() => {
                            Alert.prompt(
                              'Custom timer',
                              'Enter minutes:',
                              (val) => { if (val && parseInt(val)) applyTimer(idx, parseInt(val)); },
                              'plain-text',
                              '',
                              'numeric'
                            );
                          }}
                          style={{
                            paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999,
                            backgroundColor: colors.border,
                          }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '600', color: colors.text }}>Custom</Text>
                        </Pressable>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            );
          }

          // Completed / upcoming preview card
          return (
            <Pressable
              key={idx}
              onPress={() => setActiveStepIdx(idx)}
              style={{
                borderRadius: 14, marginBottom: 10, padding: 14,
                borderWidth: 0.5,
                borderColor: isFilled ? colors.primary + '55' : colors.border,
                backgroundColor: isFilled ? colors.card : colors.background,
              }}
            >
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                <StepCircle order={idx + 1} completed={isFilled} colors={colors} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: detail ? 4 : 0 }}>
                    {row.instruction ? title : <Text style={{ color: colors.textMuted }}>Step {idx + 1}</Text>}
                  </Text>
                  {detail ? (
                    <Text style={{ fontSize: 13, color: colors.textMuted, lineHeight: 19 }}>{detail}</Text>
                  ) : null}
                  {timerMins ? (
                    <View style={{
                      alignSelf: 'flex-start', marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 5,
                      backgroundColor: '#E8F5E9', borderRadius: 999, paddingVertical: 5, paddingHorizontal: 10,
                    }}>
                      <Ionicons name="timer-outline" size={12} color={colors.primary} />
                      <Text style={{ fontSize: 11, fontWeight: '600', color: colors.primary }}>{timerMins} min</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </Pressable>
          );
        })}

        {/* Add step */}
        <Pressable
          onPress={addStep}
          disabled={rows.length >= 15}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4,
            opacity: rows.length >= 15 ? 0.4 : 1,
          }}
        >
          <Ionicons name="add-circle-outline" size={20} color={colors.primary} />
          <Text style={{ fontSize: 14, color: colors.primary, fontWeight: '600' }}>Add step</Text>
        </Pressable>
      </ScrollView>

      <StickyFooter colors={colors}>
        <NextButton colors={colors} onPress={onNext} disabled={!canNext} label="Next" />
      </StickyFooter>
    </View>
  );
}

// ── Step 4 — Review ───────────────────────────────────────────────────────────

function Step4Review({
  colors, name, description, cuisine, totalTime, servings,
  isPublic, ingredients, steps, submitting, submitError, onSubmit,
  imageUri, imageUploading, onPickImage, onRemoveImage,
  dietaryTags, setDietaryTags, macros, setMacros, macrosLoading, macrosError,
}: any) {
  const totalMins = parseInt(totalTime) || 0;

  function toggleTag(tag: string) {
    setDietaryTags((prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  function updateMacro(field: 'calories' | 'protein' | 'carbohydrates' | 'fat' | 'fibre', raw: string) {
    const n = parseFloat(raw);
    setMacros((prev: Macros | null) => ({
      calories: 0, protein: 0, carbohydrates: 0, fat: 0, fibre: 0, isEstimated: true,
      ...(prev ?? {}),
      [field]: isNaN(n) ? 0 : n,
    }));
  }

  function tagLabel(t: string): string {
    return t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}>
        <Text style={{ fontSize: 22, fontFamily: 'Georgia', fontStyle: 'italic', color: colors.text, marginBottom: 4, marginTop: 4 }}>
          Review
        </Text>
        <Text style={{ fontSize: 13, color: colors.textMuted, marginBottom: 20 }}>
          Looks good? Tap Save Recipe to publish.
        </Text>

        {/* Title */}
        <Text style={{ fontSize: 22, fontFamily: 'Georgia', fontStyle: 'italic', fontWeight: '700', color: colors.text, marginBottom: 4 }}>
          {name}
        </Text>
        {description ? (
          <Text style={{ fontSize: 14, color: colors.textMuted, marginBottom: 12 }}>{description}</Text>
        ) : null}

        {/* Meta chips */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          {cuisine ? <MetaChip label={cuisine} colors={colors} /> : null}
          {totalMins > 0 ? <MetaChip label={`${totalMins} min`} colors={colors} /> : null}
          {servings ? <MetaChip label={`${servings} servings`} colors={colors} /> : null}
          <MetaChip label={isPublic ? 'Public' : 'Private'} colors={colors} />
        </View>

        {/* Ingredients */}
        {ingredients.length > 0 && (
          <>
            <Text style={sectionHeading(colors)}>Ingredients</Text>
            <View style={{ backgroundColor: colors.card, borderRadius: 12, padding: 14, marginBottom: 20 }}>
              {ingredients.map((ing: IngredientRow, i: number) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: i < ingredients.length - 1 ? 0.5 : 0, borderBottomColor: colors.border }}>
                  <Text style={{ flex: 1, fontSize: 14, color: colors.text }}>{ing.name}</Text>
                  <Text style={{ fontSize: 13, color: colors.textMuted }}>
                    {[ing.qty, ing.unit].filter(Boolean).join(' ')}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Steps */}
        {steps.length > 0 && (
          <>
            <Text style={sectionHeading(colors)}>Steps</Text>
            {steps.map((row: StepRow, idx: number) => {
              const syntheticStep: RecipeStep = { order: idx + 1, instruction: row.instruction };
              const { title, detail } = extractStepTitle(syntheticStep);
              const timerMins = extractTimerMinutes(row.instruction);
              return (
                <View
                  key={idx}
                  style={{
                    borderRadius: 14, marginBottom: 10, padding: 14,
                    borderWidth: 0.5, borderColor: colors.border,
                    backgroundColor: colors.background,
                  }}
                >
                  <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                    <StepCircle order={idx + 1} colors={colors} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: detail ? 4 : 0 }}>
                        {title}
                      </Text>
                      {detail ? <Text style={{ fontSize: 13, color: colors.textMuted, lineHeight: 19 }}>{detail}</Text> : null}
                      {timerMins ? (
                        <View style={{
                          alignSelf: 'flex-start', marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 5,
                          backgroundColor: '#E8F5E9', borderRadius: 999, paddingVertical: 5, paddingHorizontal: 10,
                        }}>
                          <Ionicons name="timer-outline" size={12} color={colors.primary} />
                          <Text style={{ fontSize: 11, fontWeight: '600', color: colors.primary }}>{timerMins} min</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </View>
              );
            })}
          </>
        )}

        {/* Dietary tags */}
        <Text style={sectionHeading(colors)}>Dietary tags</Text>
        <Text style={{ fontSize: 12, color: colors.textMuted, marginBottom: 10 }}>
          Tap any that apply. We'll double-check against your ingredients.
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          {DIETARY_TAGS.map((tag) => {
            const active = dietaryTags.has(tag);
            return (
              <Pressable
                key={tag}
                onPress={() => toggleTag(tag)}
                style={{
                  paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
                  backgroundColor: active ? colors.primary : colors.card,
                  borderWidth: 1,
                  borderColor: active ? colors.primary : colors.border,
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                }}
              >
                {active ? <Ionicons name="checkmark" size={12} color="#fff" /> : null}
                <Text style={{ fontSize: 12, fontWeight: '500', color: active ? '#fff' : colors.text }}>
                  {tagLabel(tag)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Macro calculator */}
        <Text style={sectionHeading(colors)}>Macros per serving</Text>
        {macrosLoading ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20, padding: 14, backgroundColor: colors.card, borderRadius: 12 }}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={{ fontSize: 13, color: colors.textMuted }}>Estimating macros from your ingredients…</Text>
          </View>
        ) : (
          <>
            {macrosError ? (
              <Text style={{ fontSize: 12, color: colors.textMuted, marginBottom: 10 }}>
                {macrosError} Edit any value to override.
              </Text>
            ) : (
              <Text style={{ fontSize: 12, color: colors.textMuted, marginBottom: 10 }}>
                Auto-estimated from your ingredients — tap any value to edit.
              </Text>
            )}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
              {([
                { key: 'calories', label: 'Calories' },
                { key: 'protein', label: 'Protein (g)' },
                { key: 'carbohydrates', label: 'Carbs (g)' },
                { key: 'fat', label: 'Fat (g)' },
                { key: 'fibre', label: 'Fibre (g)' },
              ] as const).map(({ key, label }) => (
                <View key={key} style={{ flexGrow: 1, flexBasis: '30%', minWidth: 90 }}>
                  <Text style={{ fontSize: 10, color: colors.textMuted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {label}
                  </Text>
                  <TextInput
                    value={macros && macros[key] != null ? String(Math.round(Number(macros[key]) * 10) / 10) : ''}
                    onChangeText={(v) => updateMacro(key, v)}
                    keyboardType="decimal-pad"
                    placeholder="—"
                    placeholderTextColor={colors.textMuted}
                    style={[inputStyle(colors), { textAlign: 'center', marginBottom: 0 }]}
                  />
                </View>
              ))}
            </View>
          </>
        )}

        {/* Photo upload */}
        {imageUri ? (
          <View style={{ marginTop: 8, borderRadius: 12, overflow: 'hidden', backgroundColor: colors.card }}>
            <Image source={{ uri: imageUri }} style={{ width: '100%', height: 180 }} contentFit="cover" />
            {imageUploading ? (
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator size="small" color="#fff" />
              </View>
            ) : null}
            <Pressable
              onPress={onRemoveImage}
              disabled={imageUploading}
              style={{
                position: 'absolute', top: 8, right: 8,
                backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 999,
                paddingVertical: 6, paddingHorizontal: 10,
                flexDirection: 'row', alignItems: 'center', gap: 4,
              }}
            >
              <Ionicons name="trash-outline" size={14} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>Remove</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={onPickImage}
            style={{
              borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.border,
              borderRadius: 12, padding: 24, alignItems: 'center', marginTop: 8,
              backgroundColor: colors.card,
            }}
          >
            <Ionicons name="camera-outline" size={28} color={colors.primary} />
            <Text style={{ fontSize: 14, color: colors.text, marginTop: 8, fontWeight: '600' }}>Add a photo</Text>
            <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>Optional — but recipes with photos get more saves</Text>
          </Pressable>
        )}

        {submitError ? (
          <Text style={{ fontSize: 13, color: colors.error ?? '#E53935', marginTop: 12, textAlign: 'center' }}>
            {submitError}
          </Text>
        ) : null}
      </ScrollView>

      <StickyFooter colors={colors}>
        <Pressable
          onPress={onSubmit}
          disabled={submitting}
          style={{
            flex: 1, backgroundColor: submitting ? colors.border : colors.primary,
            borderRadius: 14, paddingVertical: 16, alignItems: 'center', justifyContent: 'center',
            flexDirection: 'row', gap: 8,
          }}
        >
          {submitting
            ? <ActivityIndicator size="small" color="#fff" />
            : <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />}
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>
            {submitting ? 'Saving…' : 'Save Recipe'}
          </Text>
        </Pressable>
      </StickyFooter>
    </View>
  );
}

// ── Shared UI atoms ───────────────────────────────────────────────────────────

function StepCircle({ order, active, completed, colors }: { order: number; active?: boolean; completed?: boolean; colors: any }) {
  return (
    <View style={{
      width: 24, height: 24, borderRadius: 12, flexShrink: 0, marginTop: 1,
      backgroundColor: completed ? '#A5D6A7' : active ? colors.primary : colors.border,
      alignItems: 'center', justifyContent: 'center',
    }}>
      {completed
        ? <Ionicons name="checkmark" size={13} color="white" />
        : <Text style={{ fontSize: 11, fontWeight: '700', color: 'white' }}>{order}</Text>}
    </View>
  );
}

function MetaChip({ label, colors }: { label: string; colors: any }) {
  return (
    <View style={{ backgroundColor: colors.card, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 0.5, borderColor: colors.border }}>
      <Text style={{ fontSize: 12, color: colors.textMuted, fontWeight: '500' }}>{label}</Text>
    </View>
  );
}

function StickyFooter({ colors, children }: { colors: any; children: React.ReactNode }) {
  return (
    <View style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      backgroundColor: colors.background,
      paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24,
      borderTopWidth: 0.5, borderTopColor: colors.border,
    }}>
      {children}
    </View>
  );
}

function NextButton({ colors, onPress, disabled, label }: { colors: any; onPress: () => void; disabled: boolean; label: string }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        backgroundColor: disabled ? colors.border : colors.primary,
        borderRadius: 14, paddingVertical: 16, alignItems: 'center',
      }}
    >
      <Text style={{ color: disabled ? colors.textMuted : '#fff', fontSize: 16, fontWeight: '700' }}>
        {label} →
      </Text>
    </Pressable>
  );
}

function SuggestionRow({ name, query, colors, onPress }: { name: string; query: string; colors: any; onPress: () => void }) {
  const lowerName = name.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const idx = lowerName.indexOf(lowerQuery);
  if (idx === -1) {
    return (
      <Pressable onPress={onPress} style={{ paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
        <Text style={{ fontSize: 14, color: colors.text }}>{name}</Text>
      </Pressable>
    );
  }
  const before = name.slice(0, idx);
  const match = name.slice(idx, idx + query.length);
  const after = name.slice(idx + query.length);
  return (
    <Pressable onPress={onPress} style={{ paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 0.5, borderBottomColor: colors.border }}>
      <Text style={{ fontSize: 14, color: colors.text }}>
        {before}
        <Text style={{ fontWeight: '700' }}>{match}</Text>
        {after}
      </Text>
    </Pressable>
  );
}

// ── Style helpers ─────────────────────────────────────────────────────────────

function inputStyle(colors: any) {
  return {
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    color: colors.text,
    marginBottom: 16,
  };
}

function labelStyle(colors: any) {
  return {
    fontSize: 12,
    fontWeight: '600' as const,
    color: colors.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: 8,
  };
}

function colHeaderStyle(colors: any) {
  return {
    fontSize: 11,
    fontWeight: '600' as const,
    color: colors.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  };
}

function sectionHeading(colors: any) {
  return {
    fontSize: 16,
    fontFamily: 'Georgia',
    fontStyle: 'italic' as const,
    fontWeight: '700' as const,
    color: colors.text,
    marginBottom: 10,
  };
}
