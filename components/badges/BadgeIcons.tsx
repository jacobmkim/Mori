// badges/BadgeIcons.tsx
// One icon component per badge, plus a lookup map.
// Requires: react-native-svg  (expo install react-native-svg)

import React, { ComponentType } from 'react';
import Svg, { Path, Circle, Line, Rect } from 'react-native-svg';

interface IconProps {
  size?: number;
  color?: string;
}

const base = {
  fill: 'none' as const,
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

// — Cooking ——————————————————————————————————————————————————————————————————

export const Cook1Icon = ({ size = 24, color = '#633806' }: IconProps) => (
  <Svg viewBox="0 0 24 24" width={size} height={size} {...base} stroke={color}>
    <Path d="M7 3v5M5 3v2a2 2 0 0 0 4 0V3M7 9v12M17 3v18M17 3c2 1 3 3 3 5s-1 4-3 4" />
  </Svg>
);

export const Cook5Icon = ({ size = 24, color = '#633806' }: IconProps) => (
  <Svg viewBox="0 0 24 24" width={size} height={size} {...base} stroke={color}>
    <Path d="M5 14h14M7 14V9a5 5 0 0 1 10 0v5M6 14v5h12v-5" />
  </Svg>
);

export const Cook10Icon = ({ size = 24, color = '#633806' }: IconProps) => (
  <Svg viewBox="0 0 24 24" width={size} height={size} {...base} stroke={color}>
    <Circle cx={11} cy={12} r={6} />
    <Line x1={17} y1={12} x2={22} y2={12} />
    <Line x1={8} y1={7} x2={10} y2={4} />
  </Svg>
);

export const Cook25Icon = ({ size = 24, color = '#633806' }: IconProps) => (
  <Svg viewBox="0 0 24 24" width={size} height={size} {...base} stroke={color}>
    <Path d="M12 3c0 4 4 7 4 11a4 4 0 0 1-8 0c0-4 4-7 4-11z" />
    <Circle cx={12} cy={17} r={1.5} fill={color} stroke="none" />
  </Svg>
);

export const Cook50Icon = ({ size = 24, color = '#633806' }: IconProps) => (
  <Svg viewBox="0 0 24 24" width={size} height={size} {...base} stroke={color}>
    <Path d="M9 5c0 3 3 5 3 8a3 3 0 0 1-6 0c0-3 3-5 3-8zM16 6c0 2.5 2.5 4.5 2.5 7a2.5 2.5 0 0 1-5 0c0-2.5 2.5-4.5 2.5-7z" />
  </Svg>
);

export const Cook100Icon = ({ size = 24, color = '#633806' }: IconProps) => (
  <Svg viewBox="0 0 24 24" width={size} height={size} {...base} stroke={color}>
    <Path d="M7 4h10v5a5 5 0 0 1-10 0V4z" />
    <Path d="M4 4h3M17 4h3v3a3 3 0 0 1-3 3M12 17v3M9 20h6" />
  </Svg>
);

// — Streak —————————————————————————————————————————————————————————————————

export const Streak3Icon = ({ size = 24, color = '#4A1B0C' }: IconProps) => (
  <Svg viewBox="0 0 24 24" width={size} height={size} {...base} stroke={color}>
    <Path d="M12 5c0 3 3 5 3 7.5a3 3 0 0 1-6 0c0-2.5 3-4.5 3-7.5z" />
  </Svg>
);

export const Streak7Icon = ({ size = 24, color = '#4A1B0C' }: IconProps) => (
  <Svg viewBox="0 0 24 24" width={size} height={size} {...base} stroke={color}>
    <Path d="M12 3c0 4 4 6.5 4 10.5a4 4 0 0 1-8 0c0-4 4-6.5 4-10.5z" />
  </Svg>
);

export const Streak14Icon = ({ size = 24, color = '#4A1B0C' }: IconProps) => (
  <Svg viewBox="0 0 24 24" width={size} height={size} {...base} stroke={color}>
    <Path d="M12 2c0 5 5 8 5 13a5 5 0 0 1-10 0c0-5 5-8 5-13z" />
  </Svg>
);

export const Streak30Icon = ({ size = 24, color = '#4A1B0C' }: IconProps) => (
  <Svg viewBox="0 0 24 24" width={size} height={size} {...base} stroke={color}>
    <Path d="M5 11l2-7 5 4 5-4 2 7H5z" />
    <Path d="M12 11c0 3 3 5 3 8a3 3 0 0 1-6 0c0-3 3-5 3-8z" />
  </Svg>
);

// — Exploration ————————————————————————————————————————————————————————————

export const Cuisines5Icon = ({ size = 24, color = '#04342C' }: IconProps) => (
  <Svg viewBox="0 0 24 24" width={size} height={size} {...base} stroke={color}>
    <Circle cx={12} cy={12} r={9} />
    <Line x1={3} y1={12} x2={21} y2={12} />
    <Path d="M12 3a14 14 0 0 1 4 9 14 14 0 0 1-4 9 14 14 0 0 1-4-9 14 14 0 0 1 4-9z" />
  </Svg>
);

export const MealPrepIcon = ({ size = 24, color = '#04342C' }: IconProps) => (
  <Svg viewBox="0 0 24 24" width={size} height={size} {...base} stroke={color}>
    <Rect x={3} y={4} width={18} height={18} rx={2} />
    <Line x1={3} y1={10} x2={21} y2={10} />
    <Line x1={8} y1={2} x2={8} y2={6} />
    <Line x1={16} y1={2} x2={16} y2={6} />
    <Path d="M9 15l2 2 4-4" />
  </Svg>
);

// — Community ——————————————————————————————————————————————————————————————

export const Submit1Icon = ({ size = 24, color = '#26215C' }: IconProps) => (
  <Svg viewBox="0 0 24 24" width={size} height={size} {...base} stroke={color}>
    <Path d="M17 3a2.83 2.83 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
    <Line x1={15} y1={5} x2={19} y2={9} />
  </Svg>
);

export const Submit5Icon = ({ size = 24, color = '#26215C' }: IconProps) => (
  <Svg viewBox="0 0 24 24" width={size} height={size} {...base} stroke={color}>
    <Path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <Circle cx={9} cy={7} r={4} />
    <Path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </Svg>
);

// — Lookup map —————————————————————————————————————————————————————————————

export const BADGE_ICONS: Record<string, ComponentType<IconProps>> = {
  cook_1:     Cook1Icon,
  cook_5:     Cook5Icon,
  cook_10:    Cook10Icon,
  cook_25:    Cook25Icon,
  cook_50:    Cook50Icon,
  cook_100:   Cook100Icon,
  streak_3:   Streak3Icon,
  streak_7:   Streak7Icon,
  streak_14:  Streak14Icon,
  streak_30:  Streak30Icon,
  cuisines_5: Cuisines5Icon,
  meal_prep:  MealPrepIcon,
  submit_1:   Submit1Icon,
  submit_5:   Submit5Icon,
};
