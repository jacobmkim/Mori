/**
 * CookingMode.tsx — Section 18.5 spec
 * Full-screen dark cooking experience.
 * Progress bar, large active step card, per-step timer, Back/Next nav.
 * keepScreenAwake: true to prevent screen sleep while cooking.
 */
import {
  View, Text, Modal, Pressable, ScrollView,
  Dimensions,
} from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import type { Recipe, RecipeStep } from '@/types';

// Prevents screen sleep while cooking — install expo-keep-awake if not present
import { useKeepAwake } from 'expo-keep-awake';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ── Highlight quantities, temperatures, and times in step text ────────────────
function HighlightedText({ text, style }: { text: string; style?: object }) {
  // Match: numbers with units, temperatures, time expressions
  const parts: { value: string; highlight: boolean }[] = [];
  const regex = /(\d+(?:\.\d+)?(?:\/\d+)?\s*(?:°[CF]|minutes?|mins?|hours?|hrs?|seconds?|secs?|g|kg|ml|l|tbsp|tsp|cups?|oz|lb|lbs|cm|mm|inch|inches|°)?(?:\s*[-–]\s*\d+\s*(?:°[CF]|minutes?|mins?|hours?|hrs?|seconds?|secs?))?)/gi;
  let last = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push({ value: text.slice(last, match.index), highlight: false });
    parts.push({ value: match[0], highlight: true });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ value: text.slice(last), highlight: false });
  return (
    <Text style={[{ fontSize: 15, color: '#C0C0C0', lineHeight: 24 }, style]}>
      {parts.map((p, i) =>
        p.highlight ? (
          <Text key={i} style={{ color: '#4CAF50', fontWeight: '600' }}>{p.value}</Text>
        ) : (
          <Text key={i}>{p.value}</Text>
        )
      )}
    </Text>
  );
}

// ── Extract a step title ──────────────────────────────────────────────────────
// Uses AI-generated title if present, falls back to sentence extraction
function extractStepTitle(step: RecipeStep): { title: string; detail: string } {
  // Use AI-generated title if present
  if (step.title) {
    return { title: step.title, detail: step.instruction };
  }

  // Fallback: extract first complete sentence as title
  const instruction = step.instruction;
  const match = instruction.match(/^([^.!?]+[.!?])\s+(.*)/s);
  if (match && match[1].length <= 60) {
    return { title: match[1].replace(/[.!?]$/, '').trim(), detail: match[2].trim() };
  }

  // Final fallback: first 8 words as title
  const words = instruction.split(' ');
  if (words.length > 10) {
    return { title: words.slice(0, 8).join(' '), detail: words.slice(8).join(' ') };
  }

  return { title: instruction, detail: '' };
}

// ── Extract timer minutes from step text ──────────────────────────────────────
function extractTimerMinutes(instruction: string): number | null {
  const match = instruction.match(/(\d+)[\s-]*(to[\s-]*\d+\s*)?min(?:ute)?s?/i);
  if (match) return parseInt(match[1]);
  const hrMatch = instruction.match(/(\d+)\s*hour/i);
  if (hrMatch) return parseInt(hrMatch[1]) * 60;
  return null;
}

function formatTimer(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ── Step Timer ────────────────────────────────────────────────────────────────
function StepTimer({ minutes }: { minutes: number }) {
  const totalSecs = minutes * 60;
  const [remaining, setRemaining] = useState(totalSecs);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  function toggle() {
    if (running) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setRunning(false);
    } else {
      if (remaining <= 0) { setRemaining(totalSecs); }
      intervalRef.current = setInterval(() => {
        setRemaining((prev) => {
          if (prev <= 1) {
            clearInterval(intervalRef.current!);
            setRunning(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      setRunning(true);
    }
  }

  function reset() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setRunning(false);
    setRemaining(totalSecs);
  }

  const progress = remaining / totalSecs;
  const done = remaining === 0;

  return (
    <View style={{
      backgroundColor: done ? '#1A3A1A' : '#1E3A1E',
      borderRadius: 14,
      padding: 16,
      marginTop: 16,
      borderWidth: 1,
      borderColor: done ? '#4CAF50' : '#2E5438',
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="timer-outline" size={18} color="#4CAF50" />
          <Text style={{ fontSize: 13, color: '#4CAF50', fontWeight: '600', letterSpacing: 0.5 }}>
            {done ? 'DONE' : `TIMER · ${minutes} MIN`}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable onPress={reset} hitSlop={8}>
            <Ionicons name="refresh-outline" size={18} color="#8AAB9E" />
          </Pressable>
          <Pressable
            onPress={toggle}
            style={{
              backgroundColor: running ? '#2A2A2A' : '#4CAF50',
              borderRadius: 8, paddingHorizontal: 14, paddingVertical: 6,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: '700', color: running ? '#4CAF50' : 'white' }}>
              {running ? 'PAUSE' : remaining < totalSecs ? 'RESUME' : 'START'}
            </Text>
          </Pressable>
        </View>
      </View>
      {/* Progress bar */}
      <View style={{ height: 4, backgroundColor: '#2A3D35', borderRadius: 2, marginTop: 12 }}>
        <View style={{ height: 4, backgroundColor: '#4CAF50', borderRadius: 2, width: `${progress * 100}%` }} />
      </View>
      <Text style={{ fontSize: 28, fontWeight: '700', color: done ? '#4CAF50' : 'white', textAlign: 'center', marginTop: 8 }}>
        {done ? '✓ Done' : formatTimer(remaining)}
      </Text>
    </View>
  );
}

// ── Props ──────────────────────────────────────────────────────────────────────
interface CookingModeProps {
  recipe: Recipe;
  steps: RecipeStep[];
  onClose: () => void;
  onMarkCooked?: () => void;
}

// ── Main component ─────────────────────────────────────────────────────────────
export function CookingMode({ recipe, steps, onClose, onMarkCooked }: CookingModeProps) {
  useKeepAwake();

  const [currentStep, setCurrentStep] = useState(0);
  const [markedCooked, setMarkedCooked] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const sortedSteps = [...steps].sort((a, b) => a.order - b.order);
  const total = sortedSteps.length;
  const step = sortedSteps[currentStep];
  const isFirst = currentStep === 0;
  const isLast = currentStep === total - 1;
  const progress = (currentStep + 1) / total;

  const { title, detail } = step ? extractStepTitle(step) : { title: '', detail: '' };
  const timerMins = step ? extractTimerMinutes(step.instruction) : null;

  function goNext() {
    if (currentStep < total - 1) {
      setCurrentStep(currentStep + 1);
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }
  }

  function goBack() {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }
  }

  function handleMarkCooked() {
    setMarkedCooked(true);
    onMarkCooked?.();
  }

  if (!step) return null;

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: '#1A1A1A' }}>

        {/* Header */}
        <View style={{
          paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
          borderBottomWidth: 1, borderBottomColor: '#2A2A2A',
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={{ fontSize: 11, color: '#4CAF50', fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 }}>
                Cooking Mode
              </Text>
              <Text style={{ fontSize: 15, color: '#F0EDE6', fontWeight: '600' }} numberOfLines={1}>
                {recipe.title}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              style={{
                width: 36, height: 36, borderRadius: 18,
                backgroundColor: '#2A2A2A',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Ionicons name="close" size={20} color="#F0EDE6" />
            </Pressable>
          </View>

          {/* Progress bar */}
          <View style={{ height: 4, backgroundColor: '#2A2A2A', borderRadius: 2 }}>
            <View style={{
              height: 4, backgroundColor: '#4CAF50', borderRadius: 2,
              width: `${progress * 100}%`,
            }} />
          </View>
          <Text style={{ fontSize: 11, color: '#8AAB9E', marginTop: 6, textAlign: 'right' }}>
            Step {currentStep + 1} of {total}
          </Text>
        </View>

        {/* Step content */}
        <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 120 }}>

          {/* Step card */}
          <View style={{
            backgroundColor: '#2A2A2A',
            borderRadius: 20,
            padding: 24,
            borderWidth: 1,
            borderColor: '#333',
          }}>
            <Text style={{ fontSize: 11, color: '#4CAF50', fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>
              Step {currentStep + 1}
            </Text>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#FFFFFF', lineHeight: 26, marginBottom: detail ? 12 : 0 }}>
              {title}
            </Text>
            {detail.length > 0 && (
              <HighlightedText text={detail} />
            )}

            {/* Timer block */}
            {timerMins != null && <StepTimer key={`timer-${currentStep}`} minutes={timerMins} />}
          </View>

          {/* Step dots — overview */}
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 24, flexWrap: 'wrap' }}>
            {sortedSteps.map((_, i) => (
              <Pressable
                key={i}
                onPress={() => { setCurrentStep(i); scrollRef.current?.scrollTo({ y: 0, animated: false }); }}
                style={{
                  width: i === currentStep ? 20 : 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: i < currentStep ? '#4CAF50' : i === currentStep ? '#4CAF50' : '#3A3A3A',
                  opacity: i < currentStep ? 0.5 : 1,
                }}
              />
            ))}
          </View>

          {/* All steps list — collapsed, tap to jump */}
          <View style={{ marginTop: 28, gap: 2 }}>
            <Text style={{ fontSize: 11, color: '#8AAB9E', fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
              All Steps
            </Text>
            {sortedSteps.map((s, i) => {
              const { title: t } = extractStepTitle(s);
              const done = i < currentStep;
              const active = i === currentStep;
              return (
                <Pressable
                  key={i}
                  onPress={() => { setCurrentStep(i); scrollRef.current?.scrollTo({ y: 0, animated: false }); }}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 12,
                    padding: 12, borderRadius: 12,
                    backgroundColor: active ? '#2A2A2A' : 'transparent',
                    borderWidth: active ? 1 : 0,
                    borderColor: active ? '#4CAF50' : 'transparent',
                  }}
                >
                  <View style={{
                    width: 24, height: 24, borderRadius: 12,
                    backgroundColor: done ? '#4CAF50' : active ? '#4CAF50' : '#3A3A3A',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    {done ? (
                      <Ionicons name="checkmark" size={13} color="white" />
                    ) : (
                      <Text style={{ fontSize: 11, color: active ? 'white' : '#8AAB9E', fontWeight: '700' }}>{i + 1}</Text>
                    )}
                  </View>
                  <Text
                    style={{ fontSize: 14, color: done ? '#4CAF50' : active ? '#F0EDE6' : '#666', flex: 1 }}
                    numberOfLines={1}
                  >
                    {t}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        {/* Navigation footer */}
        <View style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          backgroundColor: '#1A1A1A',
          borderTopWidth: 1, borderTopColor: '#2A2A2A',
          paddingHorizontal: 20, paddingTop: 12, paddingBottom: 36,
          gap: 10,
        }}>
          {/* Mark as cooked — final step */}
          {isLast && (
            <Pressable
              onPress={handleMarkCooked}
              disabled={markedCooked}
              style={{
                backgroundColor: markedCooked ? '#1B5E20' : '#4CAF50',
                borderRadius: 14, paddingVertical: 14,
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: '700', color: 'white' }}>
                {markedCooked ? '✓ Marked as Cooked' : 'Mark as Cooked ✓'}
              </Text>
            </Pressable>
          )}

          {/* Back / Next */}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable
              onPress={goBack}
              disabled={isFirst}
              style={{
                flex: 1, borderRadius: 14, paddingVertical: 14,
                backgroundColor: isFirst ? '#1E1E1E' : '#2A2A2A',
                alignItems: 'center', justifyContent: 'center',
                flexDirection: 'row', gap: 6,
              }}
            >
              <Ionicons name="chevron-back" size={18} color={isFirst ? '#444' : '#F0EDE6'} />
              <Text style={{ fontSize: 15, fontWeight: '600', color: isFirst ? '#444' : '#F0EDE6' }}>Back</Text>
            </Pressable>

            {!isLast ? (
              <Pressable
                onPress={goNext}
                style={{
                  flex: 2, borderRadius: 14, paddingVertical: 14,
                  backgroundColor: '#4CAF50',
                  alignItems: 'center', justifyContent: 'center',
                  flexDirection: 'row', gap: 6,
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: '700', color: 'white' }}>Next Step</Text>
                <Ionicons name="chevron-forward" size={18} color="white" />
              </Pressable>
            ) : (
              <Pressable
                onPress={onClose}
                style={{
                  flex: 2, borderRadius: 14, paddingVertical: 14,
                  backgroundColor: '#2A2A2A',
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: '600', color: '#F0EDE6' }}>Done Cooking</Text>
              </Pressable>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}
