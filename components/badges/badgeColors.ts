// badges/badgeColors.ts
// Per-category colour tokens for the badge system.
// These extend the Mori brand palette for the badge UI specifically —
// they are NOT in constants/theme.ts because they are badge-only.

import { BadgeCategory } from './badgeData';

export interface BadgeCategoryColors {
  background: string;
  border: string;
  borderHigh: string;
  icon: string;
}

const BADGE_COLORS_LIGHT: Record<BadgeCategory, BadgeCategoryColors> = {
  cooking: {
    background: '#FAEEDA',
    border:     '#FAC775',
    borderHigh: '#EF9F27',
    icon:       '#633806',
  },
  streak: {
    background: '#FAECE7',
    border:     '#F0997B',
    borderHigh: '#D85A30',
    icon:       '#4A1B0C',
  },
  exploration: {
    background: '#E1F5EE',
    border:     '#5DCAA5',
    borderHigh: '#1D9E75',
    icon:       '#04342C',
  },
  community: {
    background: '#EEEDFE',
    border:     '#AFA9EC',
    borderHigh: '#7F77DD',
    icon:       '#26215C',
  },
};

const BADGE_COLORS_DARK: Record<BadgeCategory, BadgeCategoryColors> = {
  cooking: {
    background: '#412402',
    border:     '#BA7517',
    borderHigh: '#EF9F27',
    icon:       '#FAEEDA',
  },
  streak: {
    background: '#4A1B0C',
    border:     '#993C1D',
    borderHigh: '#D85A30',
    icon:       '#FAECE7',
  },
  exploration: {
    background: '#04342C',
    border:     '#0F6E56',
    borderHigh: '#1D9E75',
    icon:       '#E1F5EE',
  },
  community: {
    background: '#26215C',
    border:     '#534AB7',
    borderHigh: '#7F77DD',
    icon:       '#EEEDFE',
  },
};

export function getBadgeColors(
  category: BadgeCategory,
  isDark: boolean,
): BadgeCategoryColors {
  return isDark ? BADGE_COLORS_DARK[category] : BADGE_COLORS_LIGHT[category];
}
