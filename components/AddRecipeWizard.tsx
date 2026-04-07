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
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect, useRef } from 'react';
import { useTheme } from '@/hooks/useTheme';
import { fetchIngredientNames, insertCommunityRecipe } from '@/lib/api';
import type { Recipe, RecipeStep, Ingredient } from '@/types';

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
  const [prepTime, setPrepTime] = useState('');
  const [cookTime, setCookTime] = useState('');
  const [servings, setServings] = useState('');
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

  // Load ingredient names when wizard opens
  useEffect(() => {
    if (!visible) return;
    fetchIngredientNames().then(setIngredientNames).catch(() => {});
  }, [visible]);

  function resetState() {
    setStep(1);
    setName(''); setDescription(''); setCuisine(null);
    setPrepTime(''); setCookTime(''); setServings(''); setIsPublic(true);
    setIngredientRows([{ qty: '', unit: '', name: '' }]);
    setAutocompleteIndex(null); setAutocompleteQuery('');
    setUnitPickerIndex(null);
    setStepRows([{ instruction: '', timerMins: null }]);
    setActiveStepIdx(0);
    setSubmitError(null);
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

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const cleanIngredients: Ingredient[] = ingredientRows
        .filter((r) => r.name.trim() !== '')
        .map((r) => ({ name: r.name.trim(), quantity: r.qty.trim(), unit: r.unit }));

      const cleanSteps: RecipeStep[] = stepRows
        .filter((r) => r.instruction.trim() !== '')
        .map((r, i) => ({ order: i + 1, instruction: r.instruction.trim() }));

      const supabaseId = await insertCommunityRecipe({
        title: name.trim(),
        description: description.trim() || null,
        cuisine,
        ingredients: cleanIngredients,
        steps: cleanSteps,
        prep_time_mins: prepTime ? parseInt(prepTime) : null,
        cook_time_mins: cookTime ? parseInt(cookTime) : null,
        servings: servings ? parseInt(servings) : null,
        dietary_tags: [],
        submitted_by: userId,
        image_url: null,
      });

      const newRecipe: Recipe = {
        id: supabaseId,
        supabase_id: supabaseId,
        title: name.trim(),
        description: description.trim() || null,
        cuisine,
        source_type: 'community',
        ingredients: cleanIngredients,
        steps: cleanSteps,
        prep_time_mins: prepTime ? parseInt(prepTime) : null,
        cook_time_mins: cookTime ? parseInt(cookTime) : null,
        servings: servings ? parseInt(servings) : null,
        cost_per_serving: null,
        dietary_tags: [],
        macros: null,
        badge: 'none',
        avg_rating: 0,
        save_count: 0,
        image_url: null,
        submitted_by: userId,
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
              prepTime={prepTime} setPrepTime={setPrepTime}
              cookTime={cookTime} setCookTime={setCookTime}
              servings={servings} setServings={setServings}
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
              prepTime={prepTime}
              cookTime={cookTime}
              servings={servings}
              isPublic={isPublic}
              ingredients={ingredientRows.filter((r) => r.name.trim() !== '')}
              steps={stepRows.filter((r) => r.instruction.trim() !== '')}
              submitting={submitting}
              submitError={submitError}
              onSubmit={handleSubmit}
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
  prepTime, setPrepTime, cookTime, setCookTime, servings, setServings,
  isPublic, setIsPublic, onNext,
}: any) {
  const canNext = name.trim().length > 0;

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

        {/* Times + servings */}
        <Text style={labelStyle(colors)}>Timing &amp; servings</Text>
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20 }}>
          {[
            { label: 'Prep (min)', value: prepTime, set: setPrepTime },
            { label: 'Cook (min)', value: cookTime, set: setCookTime },
            { label: 'Servings', value: servings, set: setServings },
          ].map(({ label, value, set }) => (
            <View key={label} style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, color: colors.textMuted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {label}
              </Text>
              <TextInput
                value={value}
                onChangeText={set}
                keyboardType="numeric"
                placeholder="—"
                placeholderTextColor={colors.textMuted}
                style={[inputStyle(colors), { textAlign: 'center' }]}
              />
            </View>
          ))}
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
  colors, name, description, cuisine, prepTime, cookTime, servings,
  isPublic, ingredients, steps, submitting, submitError, onSubmit,
}: any) {
  const totalMins = (parseInt(prepTime) || 0) + (parseInt(cookTime) || 0);

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

        {/* Photo coming soon */}
        <View style={{ borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.border, borderRadius: 12, padding: 20, alignItems: 'center', marginTop: 8, opacity: 0.45 }}>
          <Ionicons name="camera-outline" size={28} color={colors.textMuted} />
          <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 8 }}>Photo upload coming soon</Text>
        </View>

        {/* Auto-generate notice */}
        {isPublic && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, backgroundColor: colors.card, borderRadius: 10, padding: 12 }}>
            <Ionicons name="sparkles-outline" size={14} color={colors.primary} />
            <Text style={{ flex: 1, fontSize: 12, color: colors.textMuted }}>
              An image will be generated automatically after saving.
            </Text>
          </View>
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
