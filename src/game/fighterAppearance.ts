export type FaceHairStyle =
  | 'spiky'
  | 'short'
  | 'parted'
  | 'topknot'
  | 'braid'
  | 'shaved'
  | 'ponytail'
  | 'afro'
  | 'long'
  | 'slick';

export type FacialFeatureKind =
  | 'none'
  | 'beard'
  | 'goatee'
  | 'mustache'
  | 'scar'
  | 'warPaint'
  | 'fierceBrows';

export type HeadgearKind =
  | 'none'
  | 'mongkhon'
  | 'headband'
  | 'ninjaMask'
  | 'kendoMen'
  | 'fencingMask'
  | 'hemaHelm'
  | 'kudoVisor'
  | 'turban'
  | 'tanjak'
  | 'bowlerHat'
  | 'laurel'
  | 'boxingHeadgear'
  | 'malgai'
  | 'gaungBaung'
  | 'helmetCage';

export type OutfitKind =
  | 'muayThai'
  | 'tkdDobok'
  | 'karateGi'
  | 'boxingSinglet'
  | 'savateSuit'
  | 'kungFuTunic'
  | 'wushuSilk'
  | 'capoeiraAbada'
  | 'bjjGi'
  | 'wrestlingSinglet'
  | 'sumoMawashi'
  | 'samboKurtka'
  | 'bokhZodog'
  | 'kurashJacket'
  | 'ssireumSatba'
  | 'glimaHarness'
  | 'pehlwaniLangot'
  | 'kendoBogu'
  | 'hakama'
  | 'shinobiSuit'
  | 'silatAttire'
  | 'fencingWhites'
  | 'hemaGambeson'
  | 'sikhChola'
  | 'tacticalMma'
  | 'victorianVest'
  | 'greekChiton';

export interface FighterAppearanceProfile {
  skinColor: number;
  hairStyle: FaceHairStyle;
  hairColor: number;
  eyeColor: number;
  facialFeature: FacialFeatureKind;
  headgear: HeadgearKind;
  headgearColor: number;
  outfit: OutfitKind;
  outfitPrimary: number;
  outfitSecondary: number;
  beltColor: number;
  gloveColor: number;
}

/**
 * Researched cultural appearance, face, hair, headgear, and uniform profiles
 * for all 64 world martial arts so every fighter looks distinctly unique.
 */
export const FIGHTER_APPEARANCE_BY_ID: Record<string, FighterAppearanceProfile> = {
  // 1. Striking
  'muay-thai': {
    skinColor: 0xd99b66,
    hairStyle: 'short',
    hairColor: 0x18181b,
    eyeColor: 0x3b2f2f,
    facialFeature: 'fierceBrows',
    headgear: 'mongkhon',
    headgearColor: 0xfacc15,
    outfit: 'muayThai',
    outfitPrimary: 0xdc2626,
    outfitSecondary: 0xfacc15,
    beltColor: 0xfacc15,
    gloveColor: 0xb91c1c
  },
  taekwondo: {
    skinColor: 0xf5cfb0,
    hairStyle: 'parted',
    hairColor: 0x1e293b,
    eyeColor: 0x0f172a,
    facialFeature: 'none',
    headgear: 'none',
    headgearColor: 0x38bdf8,
    outfit: 'tkdDobok',
    outfitPrimary: 0xf8fafc,
    outfitSecondary: 0x0f172a,
    beltColor: 0x0f172a,
    gloveColor: 0x38bdf8
  },
  karate: {
    skinColor: 0xf6d3b8,
    hairStyle: 'spiky',
    hairColor: 0x0f172a,
    eyeColor: 0x1e293b,
    facialFeature: 'fierceBrows',
    headgear: 'headband',
    headgearColor: 0xdc2626,
    outfit: 'karateGi',
    outfitPrimary: 0xfef2f2,
    outfitSecondary: 0xdc2626,
    beltColor: 0x111827,
    gloveColor: 0xdc2626
  },
  kickboxing: {
    skinColor: 0xe6b48a,
    hairStyle: 'slick',
    hairColor: 0x5c2c0e,
    eyeColor: 0x0284c7,
    facialFeature: 'goatee',
    headgear: 'none',
    headgearColor: 0x38bdf8,
    outfit: 'muayThai',
    outfitPrimary: 0x0891b2,
    outfitSecondary: 0xfacc15,
    beltColor: 0xfacc15,
    gloveColor: 0x0ea5e9
  },
  boxing: {
    skinColor: 0xf4c9a8,
    hairStyle: 'short',
    hairColor: 0x7c2d12,
    eyeColor: 0x1d4ed8,
    facialFeature: 'mustache',
    headgear: 'boxingHeadgear',
    headgearColor: 0xbe123c,
    outfit: 'boxingSinglet',
    outfitPrimary: 0xe11d48,
    outfitSecondary: 0x1e293b,
    beltColor: 0xfacc15,
    gloveColor: 0xb91c1c
  },
  savate: {
    skinColor: 0xf9dcc4,
    hairStyle: 'parted',
    hairColor: 0x854d0e,
    eyeColor: 0x2563eb,
    facialFeature: 'mustache',
    headgear: 'none',
    headgearColor: 0x3b82f6,
    outfit: 'savateSuit',
    outfitPrimary: 0x1e3a8a,
    outfitSecondary: 0xef4444,
    beltColor: 0xf8fafc,
    gloveColor: 0x2563eb
  },
  lethwei: {
    skinColor: 0xc68652,
    hairStyle: 'shaved',
    hairColor: 0x18181b,
    eyeColor: 0x27272a,
    facialFeature: 'warPaint',
    headgear: 'headband',
    headgearColor: 0xfacc15,
    outfit: 'muayThai',
    outfitPrimary: 0x15803d,
    outfitSecondary: 0xfacc15,
    beltColor: 0xdc2626,
    gloveColor: 0xf5f5f4
  },
  sanda: {
    skinColor: 0xf5cfa8,
    hairStyle: 'short',
    hairColor: 0x09090b,
    eyeColor: 0x1e293b,
    facialFeature: 'fierceBrows',
    headgear: 'boxingHeadgear',
    headgearColor: 0xfacc15,
    outfit: 'boxingSinglet',
    outfitPrimary: 0x991b1b,
    outfitSecondary: 0xfacc15,
    beltColor: 0xfacc15,
    gloveColor: 0xef4444
  },
  'kyokushin-karate': {
    skinColor: 0xe4b287,
    hairStyle: 'shaved',
    hairColor: 0x18181b,
    eyeColor: 0x111827,
    facialFeature: 'scar',
    headgear: 'none',
    headgearColor: 0xef4444,
    outfit: 'karateGi',
    outfitPrimary: 0xe2e8f0,
    outfitSecondary: 0x0f172a,
    beltColor: 0xfacc15,
    gloveColor: 0xf1f5f9
  },
  'shotokan-karate': {
    skinColor: 0xf4cfb2,
    hairStyle: 'slick',
    hairColor: 0x334155,
    eyeColor: 0x1e293b,
    facialFeature: 'mustache',
    headgear: 'headband',
    headgearColor: 0xf8fafc,
    outfit: 'karateGi',
    outfitPrimary: 0xf8fafc,
    outfitSecondary: 0xb91c1c,
    beltColor: 0x7f1d1d,
    gloveColor: 0xffffff
  },
  'goju-ryu-karate': {
    skinColor: 0xd99e70,
    hairStyle: 'short',
    hairColor: 0x27272a,
    eyeColor: 0x1f2937,
    facialFeature: 'beard',
    headgear: 'none',
    headgearColor: 0xf97316,
    outfit: 'karateGi',
    outfitPrimary: 0xfef3c7,
    outfitSecondary: 0xea580c,
    beltColor: 0x7c2d12,
    gloveColor: 0xf97316
  },
  wushu: {
    skinColor: 0xf6d3b3,
    hairStyle: 'ponytail',
    hairColor: 0x0f172a,
    eyeColor: 0x1e293b,
    facialFeature: 'none',
    headgear: 'headband',
    headgearColor: 0xfde047,
    outfit: 'wushuSilk',
    outfitPrimary: 0xe11d48,
    outfitSecondary: 0xfde047,
    beltColor: 0xfde047,
    gloveColor: 0xe11d48
  },
  'pradal-serey': {
    skinColor: 0xc98b5b,
    hairStyle: 'short',
    hairColor: 0x18181b,
    eyeColor: 0x1c1917,
    facialFeature: 'scar',
    headgear: 'mongkhon',
    headgearColor: 0x2563eb,
    outfit: 'muayThai',
    outfitPrimary: 0x1d4ed8,
    outfitSecondary: 0xef4444,
    beltColor: 0xf8fafc,
    gloveColor: 0x1d4ed8
  },
  'yaw-yan': {
    skinColor: 0xd39768,
    hairStyle: 'spiky',
    hairColor: 0x111827,
    eyeColor: 0x27272a,
    facialFeature: 'goatee',
    headgear: 'headband',
    headgearColor: 0x2563eb,
    outfit: 'tacticalMma',
    outfitPrimary: 0x1d4ed8,
    outfitSecondary: 0xfacc15,
    beltColor: 0xef4444,
    gloveColor: 0x0284c7
  },
  capoeira: {
    skinColor: 0x8d5524,
    hairStyle: 'afro',
    hairColor: 0x18181b,
    eyeColor: 0x292524,
    facialFeature: 'goatee',
    headgear: 'none',
    headgearColor: 0x22c55e,
    outfit: 'capoeiraAbada',
    outfitPrimary: 0xf8fafc,
    outfitSecondary: 0x16a34a,
    beltColor: 0xfacc15,
    gloveColor: 0xd97706
  },
  kudo: {
    skinColor: 0xf1cab0,
    hairStyle: 'short',
    hairColor: 0x18181b,
    eyeColor: 0x0f172a,
    facialFeature: 'none',
    headgear: 'kudoVisor',
    headgearColor: 0x38bdf8,
    outfit: 'karateGi',
    outfitPrimary: 0x0f172a,
    outfitSecondary: 0x0ea5e9,
    beltColor: 0x38bdf8,
    gloveColor: 0xf43f5e
  },

  // 2. Grappling & Wrestling
  'brazilian-jiu-jitsu': {
    skinColor: 0xd69a68,
    hairStyle: 'slick',
    hairColor: 0x292524,
    eyeColor: 0x1c1917,
    facialFeature: 'beard',
    headgear: 'none',
    headgearColor: 0x16a34a,
    outfit: 'bjjGi',
    outfitPrimary: 0x1d4ed8,
    outfitSecondary: 0xfacc15,
    beltColor: 0x111827,
    gloveColor: 0x16a34a
  },
  judo: {
    skinColor: 0xf3cbb0,
    hairStyle: 'short',
    hairColor: 0x111827,
    eyeColor: 0x0f172a,
    facialFeature: 'fierceBrows',
    headgear: 'none',
    headgearColor: 0x2563eb,
    outfit: 'bjjGi',
    outfitPrimary: 0xf8fafc,
    outfitSecondary: 0x2563eb,
    beltColor: 0x18181b,
    gloveColor: 0xf8fafc
  },
  'freestyle-wrestling': {
    skinColor: 0xe8b991,
    hairStyle: 'short',
    hairColor: 0x78350f,
    eyeColor: 0x1e40af,
    facialFeature: 'none',
    headgear: 'boxingHeadgear',
    headgearColor: 0x2563eb,
    outfit: 'wrestlingSinglet',
    outfitPrimary: 0x2563eb,
    outfitSecondary: 0xfacc15,
    beltColor: 0xfacc15,
    gloveColor: 0x1d4ed8
  },
  'greco-roman-wrestling': {
    skinColor: 0xf0c19d,
    hairStyle: 'shaved',
    hairColor: 0x27272a,
    eyeColor: 0x1e293b,
    facialFeature: 'mustache',
    headgear: 'boxingHeadgear',
    headgearColor: 0xb91c1c,
    outfit: 'wrestlingSinglet',
    outfitPrimary: 0xbe123c,
    outfitSecondary: 0xfbbf24,
    beltColor: 0xfbbf24,
    gloveColor: 0x991b1b
  },
  sumo: {
    skinColor: 0xefc39e,
    hairStyle: 'topknot',
    hairColor: 0x09090b,
    eyeColor: 0x18181b,
    facialFeature: 'fierceBrows',
    headgear: 'none',
    headgearColor: 0xef4444,
    outfit: 'sumoMawashi',
    outfitPrimary: 0x1e1b4b,
    outfitSecondary: 0xfde047,
    beltColor: 0x1e1b4b,
    gloveColor: 0xefc39e
  },
  sambo: {
    skinColor: 0xf8d8c0,
    hairStyle: 'shaved',
    hairColor: 0x78350f,
    eyeColor: 0x0284c7,
    facialFeature: 'beard',
    headgear: 'none',
    headgearColor: 0xdc2626,
    outfit: 'samboKurtka',
    outfitPrimary: 0xdc2626,
    outfitSecondary: 0xf8fafc,
    beltColor: 0xdc2626,
    gloveColor: 0xb91c1c
  },
  'catch-wrestling': {
    skinColor: 0xf5cfb6,
    hairStyle: 'parted',
    hairColor: 0x9a3412,
    eyeColor: 0x0f766e,
    facialFeature: 'mustache',
    headgear: 'none',
    headgearColor: 0xf43f5e,
    outfit: 'wrestlingSinglet',
    outfitPrimary: 0x1e293b,
    outfitSecondary: 0xf43f5e,
    beltColor: 0xf8fafc,
    gloveColor: 0xf43f5e
  },
  'shuai-jiao': {
    skinColor: 0xefc39a,
    hairStyle: 'topknot',
    hairColor: 0x111827,
    eyeColor: 0x1e293b,
    facialFeature: 'goatee',
    headgear: 'none',
    headgearColor: 0x10b981,
    outfit: 'kurashJacket',
    outfitPrimary: 0xf8fafc,
    outfitSecondary: 0x10b981,
    beltColor: 0x047857,
    gloveColor: 0x10b981
  },
  'mongol-bokh': {
    skinColor: 0xe6b186,
    hairStyle: 'short',
    hairColor: 0x18181b,
    eyeColor: 0x1c1917,
    facialFeature: 'fierceBrows',
    headgear: 'malgai',
    headgearColor: 0xfacc15,
    outfit: 'bokhZodog',
    outfitPrimary: 0x2563eb,
    outfitSecondary: 0xfacc15,
    beltColor: 0xfacc15,
    gloveColor: 0x2563eb
  },
  kurash: {
    skinColor: 0xe2ac7f,
    hairStyle: 'short',
    hairColor: 0x18181b,
    eyeColor: 0x1e293b,
    facialFeature: 'mustache',
    headgear: 'none',
    headgearColor: 0x14b8a6,
    outfit: 'kurashJacket',
    outfitPrimary: 0x0d9488,
    outfitSecondary: 0xfacc15,
    beltColor: 0xef4444,
    gloveColor: 0x14b8a6
  },
  glima: {
    skinColor: 0xfde2cf,
    hairStyle: 'braid',
    hairColor: 0xfbbf24,
    eyeColor: 0x38bdf8,
    facialFeature: 'beard',
    headgear: 'none',
    headgearColor: 0x38bdf8,
    outfit: 'glimaHarness',
    outfitPrimary: 0x0369a1,
    outfitSecondary: 0xf8fafc,
    beltColor: 0x92400e,
    gloveColor: 0x78350f
  },
  ssireum: {
    skinColor: 0xf3cbb0,
    hairStyle: 'spiky',
    hairColor: 0x0f172a,
    eyeColor: 0x0f172a,
    facialFeature: 'fierceBrows',
    headgear: 'headband',
    headgearColor: 0xef4444,
    outfit: 'ssireumSatba',
    outfitPrimary: 0xdc2626,
    outfitSecondary: 0x2563eb,
    beltColor: 0x2563eb,
    gloveColor: 0xf1c7a4
  },
  'luta-livre': {
    skinColor: 0xc28454,
    hairStyle: 'shaved',
    hairColor: 0x18181b,
    eyeColor: 0x1c1917,
    facialFeature: 'scar',
    headgear: 'none',
    headgearColor: 0x22c55e,
    outfit: 'tacticalMma',
    outfitPrimary: 0x15803d,
    outfitSecondary: 0xfde047,
    beltColor: 0xfde047,
    gloveColor: 0x16a34a
  },
  pehlwani: {
    skinColor: 0xa6693f,
    hairStyle: 'slick',
    hairColor: 0x09090b,
    eyeColor: 0x1c1917,
    facialFeature: 'mustache',
    headgear: 'headband',
    headgearColor: 0xf97316,
    outfit: 'pehlwaniLangot',
    outfitPrimary: 0xf97316,
    outfitSecondary: 0x22c55e,
    beltColor: 0xdc2626,
    gloveColor: 0xf97316
  },

  // 3. Traditional Martial Arts
  aikido: {
    skinColor: 0xf4ceb2,
    hairStyle: 'long',
    hairColor: 0x334155,
    eyeColor: 0x1e293b,
    facialFeature: 'beard',
    headgear: 'none',
    headgearColor: 0x818cf8,
    outfit: 'hakama',
    outfitPrimary: 0xf8fafc,
    outfitSecondary: 0x1e1b4b,
    beltColor: 0x1e1b4b,
    gloveColor: 0xf8fafc
  },
  hapkido: {
    skinColor: 0xf3cbb0,
    hairStyle: 'slick',
    hairColor: 0x0f172a,
    eyeColor: 0x1e293b,
    facialFeature: 'none',
    headgear: 'none',
    headgearColor: 0x2563eb,
    outfit: 'karateGi',
    outfitPrimary: 0x0f172a,
    outfitSecondary: 0x2563eb,
    beltColor: 0xf43f5e,
    gloveColor: 0x1e293b
  },
  'kung-fu': {
    skinColor: 0xefc39a,
    hairStyle: 'ponytail',
    hairColor: 0x09090b,
    eyeColor: 0x18181b,
    facialFeature: 'goatee',
    headgear: 'none',
    headgearColor: 0xfacc15,
    outfit: 'kungFuTunic',
    outfitPrimary: 0xf59e0b,
    outfitSecondary: 0x7f1d1d,
    beltColor: 0xdc2626,
    gloveColor: 0xb91c1c
  },
  ninjutsu: {
    skinColor: 0xefc7a4,
    hairStyle: 'short',
    hairColor: 0x0f172a,
    eyeColor: 0x38bdf8,
    facialFeature: 'fierceBrows',
    headgear: 'ninjaMask',
    headgearColor: 0x1e1b4b,
    outfit: 'shinobiSuit',
    outfitPrimary: 0x0f172a,
    outfitSecondary: 0x6366f1,
    beltColor: 0x06b6d4,
    gloveColor: 0x312e81
  },
  kendo: {
    skinColor: 0xf3cbb0,
    hairStyle: 'short',
    hairColor: 0x0f172a,
    eyeColor: 0x1e293b,
    facialFeature: 'none',
    headgear: 'kendoMen',
    headgearColor: 0x1e3a8a,
    outfit: 'kendoBogu',
    outfitPrimary: 0x1e293b,
    outfitSecondary: 0x3b82f6,
    beltColor: 0xf8fafc,
    gloveColor: 0x1e3a8a
  },
  iaido: {
    skinColor: 0xf5d2b8,
    hairStyle: 'topknot',
    hairColor: 0x1e293b,
    eyeColor: 0x0f172a,
    facialFeature: 'scar',
    headgear: 'headband',
    headgearColor: 0x94a3b8,
    outfit: 'hakama',
    outfitPrimary: 0x1e293b,
    outfitSecondary: 0x94a3b8,
    beltColor: 0xf8fafc,
    gloveColor: 0x334155
  },
  kenjutsu: {
    skinColor: 0xf0c6a4,
    hairStyle: 'long',
    hairColor: 0x18181b,
    eyeColor: 0x7f1d1d,
    facialFeature: 'scar',
    headgear: 'headband',
    headgearColor: 0xdc2626,
    outfit: 'hakama',
    outfitPrimary: 0x7f1d1d,
    outfitSecondary: 0xfacc15,
    beltColor: 0xfacc15,
    gloveColor: 0x450a0a
  },
  kobudo: {
    skinColor: 0xe3b186,
    hairStyle: 'short',
    hairColor: 0x27272a,
    eyeColor: 0x1c1917,
    facialFeature: 'beard',
    headgear: 'headband',
    headgearColor: 0x06b6d4,
    outfit: 'karateGi',
    outfitPrimary: 0x0f172a,
    outfitSecondary: 0xf97316,
    beltColor: 0x06b6d4,
    gloveColor: 0x0e7490
  },
  baguazhang: {
    skinColor: 0xf2c9a6,
    hairStyle: 'topknot',
    hairColor: 0x18181b,
    eyeColor: 0x6b21a8,
    facialFeature: 'goatee',
    headgear: 'none',
    headgearColor: 0xa855f7,
    outfit: 'wushuSilk',
    outfitPrimary: 0x581c87,
    outfitSecondary: 0x38bdf8,
    beltColor: 0xf8fafc,
    gloveColor: 0x7e22ce
  },
  'tai-chi': {
    skinColor: 0xf5d0b5,
    hairStyle: 'long',
    hairColor: 0xe2e8f0,
    eyeColor: 0x334155,
    facialFeature: 'beard',
    headgear: 'none',
    headgearColor: 0x38bdf8,
    outfit: 'wushuSilk',
    outfitPrimary: 0xf8fafc,
    outfitSecondary: 0x0284c7,
    beltColor: 0x0f172a,
    gloveColor: 0xf8fafc
  },
  xingyiquan: {
    skinColor: 0xedc199,
    hairStyle: 'spiky',
    hairColor: 0x18181b,
    eyeColor: 0x7c2d12,
    facialFeature: 'fierceBrows',
    headgear: 'none',
    headgearColor: 0xf97316,
    outfit: 'kungFuTunic',
    outfitPrimary: 0xc2410c,
    outfitSecondary: 0xfef08a,
    beltColor: 0xfacc15,
    gloveColor: 0x9a3412
  },
  bajiquan: {
    skinColor: 0xe5b48a,
    hairStyle: 'shaved',
    hairColor: 0x18181b,
    eyeColor: 0x1c1917,
    facialFeature: 'scar',
    headgear: 'none',
    headgearColor: 0xdc2626,
    outfit: 'kungFuTunic',
    outfitPrimary: 0x292524,
    outfitSecondary: 0xdc2626,
    beltColor: 0xf59e0b,
    gloveColor: 0x78350f
  },
  'wing-chun': {
    skinColor: 0xf3cbb0,
    hairStyle: 'parted',
    hairColor: 0x0f172a,
    eyeColor: 0x1e293b,
    facialFeature: 'none',
    headgear: 'none',
    headgearColor: 0xfacc15,
    outfit: 'kungFuTunic',
    outfitPrimary: 0x111827,
    outfitSecondary: 0xf8fafc,
    beltColor: 0xfacc15,
    gloveColor: 0x1f2937
  },
  silat: {
    skinColor: 0xc68a59,
    hairStyle: 'short',
    hairColor: 0x18181b,
    eyeColor: 0x1c1917,
    facialFeature: 'goatee',
    headgear: 'tanjak',
    headgearColor: 0x10b981,
    outfit: 'silatAttire',
    outfitPrimary: 0x065f46,
    outfitSecondary: 0xfacc15,
    beltColor: 0xfacc15,
    gloveColor: 0x047857
  },
  'pencak-silat': {
    skinColor: 0xc88c5c,
    hairStyle: 'short',
    hairColor: 0x09090b,
    eyeColor: 0x292524,
    facialFeature: 'fierceBrows',
    headgear: 'tanjak',
    headgearColor: 0xdc2626,
    outfit: 'silatAttire',
    outfitPrimary: 0x18181b,
    outfitSecondary: 0xef4444,
    beltColor: 0xf8fafc,
    gloveColor: 0xb91c1c
  },
  arnis: {
    skinColor: 0xd49664,
    hairStyle: 'short',
    hairColor: 0x111827,
    eyeColor: 0x1f2937,
    facialFeature: 'none',
    headgear: 'helmetCage',
    headgearColor: 0x2563eb,
    outfit: 'tacticalMma',
    outfitPrimary: 0x1e40af,
    outfitSecondary: 0xfacc15,
    beltColor: 0xdc2626,
    gloveColor: 0x1d4ed8
  },
  eskrima: {
    skinColor: 0xd09260,
    hairStyle: 'ponytail',
    hairColor: 0x18181b,
    eyeColor: 0x1c1917,
    facialFeature: 'mustache',
    headgear: 'helmetCage',
    headgearColor: 0xdc2626,
    outfit: 'tacticalMma',
    outfitPrimary: 0x991b1b,
    outfitSecondary: 0xfacc15,
    beltColor: 0xfacc15,
    gloveColor: 0xdc2626
  },
  bando: {
    skinColor: 0xc58856,
    hairStyle: 'short',
    hairColor: 0x18181b,
    eyeColor: 0x1c1917,
    facialFeature: 'warPaint',
    headgear: 'gaungBaung',
    headgearColor: 0xf8fafc,
    outfit: 'kungFuTunic',
    outfitPrimary: 0x166534,
    outfitSecondary: 0xfacc15,
    beltColor: 0x22c55e,
    gloveColor: 0x15803d
  },

  // 4. Weapon-Based Martial Arts
  fencing: {
    skinColor: 0xf8d9c4,
    hairStyle: 'parted',
    hairColor: 0x78350f,
    eyeColor: 0x0284c7,
    facialFeature: 'none',
    headgear: 'fencingMask',
    headgearColor: 0xf8fafc,
    outfit: 'fencingWhites',
    outfitPrimary: 0xf8fafc,
    outfitSecondary: 0x38bdf8,
    beltColor: 0x38bdf8,
    gloveColor: 0xe2e8f0
  },
  kyudo: {
    skinColor: 0xf4cfb2,
    hairStyle: 'topknot',
    hairColor: 0x111827,
    eyeColor: 0x1e293b,
    facialFeature: 'none',
    headgear: 'headband',
    headgearColor: 0xf8fafc,
    outfit: 'hakama',
    outfitPrimary: 0xf8fafc,
    outfitSecondary: 0x18181b,
    beltColor: 0xfacc15,
    gloveColor: 0xd97706
  },
  jodo: {
    skinColor: 0xf0c6a4,
    hairStyle: 'shaved',
    hairColor: 0x18181b,
    eyeColor: 0x0f172a,
    facialFeature: 'beard',
    headgear: 'none',
    headgearColor: 0x22c55e,
    outfit: 'hakama',
    outfitPrimary: 0x14532d,
    outfitSecondary: 0xf8fafc,
    beltColor: 0xf8fafc,
    gloveColor: 0x166534
  },
  sojutsu: {
    skinColor: 0xefc39e,
    hairStyle: 'ponytail',
    hairColor: 0x111827,
    eyeColor: 0x0284c7,
    facialFeature: 'fierceBrows',
    headgear: 'headband',
    headgearColor: 0x0ea5e9,
    outfit: 'kendoBogu',
    outfitPrimary: 0x0c4a6e,
    outfitSecondary: 0xef4444,
    beltColor: 0xef4444,
    gloveColor: 0x0284c7
  },
  hema: {
    skinColor: 0xf7d6c0,
    hairStyle: 'short',
    hairColor: 0x92400e,
    eyeColor: 0x475569,
    facialFeature: 'beard',
    headgear: 'hemaHelm',
    headgearColor: 0x475569,
    outfit: 'hemaGambeson',
    outfitPrimary: 0x334155,
    outfitSecondary: 0xf59e0b,
    beltColor: 0x78350f,
    gloveColor: 0x64748b
  },
  gatka: {
    skinColor: 0xb87a4e,
    hairStyle: 'long',
    hairColor: 0x18181b,
    eyeColor: 0x1c1917,
    facialFeature: 'beard',
    headgear: 'turban',
    headgearColor: 0xf97316,
    outfit: 'sikhChola',
    outfitPrimary: 0x1d4ed8,
    outfitSecondary: 0xf97316,
    beltColor: 0xfacc15,
    gloveColor: 0x1e40af
  },

  // 5. Hybrid & Modern Martial Arts
  mma: {
    skinColor: 0xe6b58c,
    hairStyle: 'shaved',
    hairColor: 0x18181b,
    eyeColor: 0x1e293b,
    facialFeature: 'beard',
    headgear: 'none',
    headgearColor: 0xf43f5e,
    outfit: 'tacticalMma',
    outfitPrimary: 0x0f172a,
    outfitSecondary: 0xf43f5e,
    beltColor: 0xfacc15,
    gloveColor: 0x18181b
  },
  'combat-sambo': {
    skinColor: 0xf5d4bc,
    hairStyle: 'shaved',
    hairColor: 0x451a03,
    eyeColor: 0x0284c7,
    facialFeature: 'beard',
    headgear: 'boxingHeadgear',
    headgearColor: 0x1d4ed8,
    outfit: 'samboKurtka',
    outfitPrimary: 0x1d4ed8,
    outfitSecondary: 0xef4444,
    beltColor: 0x1d4ed8,
    gloveColor: 0x38bdf8
  },
  'jeet-kune-do': {
    skinColor: 0xf2c8a2,
    hairStyle: 'parted',
    hairColor: 0x09090b,
    eyeColor: 0x18181b,
    facialFeature: 'fierceBrows',
    headgear: 'none',
    headgearColor: 0xfacc15,
    outfit: 'savateSuit',
    outfitPrimary: 0xfacc15,
    outfitSecondary: 0x09090b,
    beltColor: 0x09090b,
    gloveColor: 0x18181b
  },
  'krav-maga': {
    skinColor: 0xdfac82,
    hairStyle: 'short',
    hairColor: 0x1c1917,
    eyeColor: 0x334155,
    facialFeature: 'scar',
    headgear: 'none',
    headgearColor: 0x3b82f6,
    outfit: 'tacticalMma',
    outfitPrimary: 0x334155,
    outfitSecondary: 0x3b82f6,
    beltColor: 0x0f172a,
    gloveColor: 0x1e293b
  },
  kajukenbo: {
    skinColor: 0xc48758,
    hairStyle: 'spiky',
    hairColor: 0x18181b,
    eyeColor: 0x1c1917,
    facialFeature: 'warPaint',
    headgear: 'none',
    headgearColor: 0x06b6d4,
    outfit: 'karateGi',
    outfitPrimary: 0x111827,
    outfitSecondary: 0x06b6d4,
    beltColor: 0xf97316,
    gloveColor: 0x06b6d4
  },
  'shoot-wrestling': {
    skinColor: 0xf3cbb0,
    hairStyle: 'slick',
    hairColor: 0x18181b,
    eyeColor: 0x0f172a,
    facialFeature: 'fierceBrows',
    headgear: 'none',
    headgearColor: 0xef4444,
    outfit: 'wrestlingSinglet',
    outfitPrimary: 0x0f172a,
    outfitSecondary: 0xf8fafc,
    beltColor: 0xef4444,
    gloveColor: 0xf8fafc
  },
  'vale-tudo': {
    skinColor: 0xbe8152,
    hairStyle: 'shaved',
    hairColor: 0x18181b,
    eyeColor: 0x1c1917,
    facialFeature: 'goatee',
    headgear: 'none',
    headgearColor: 0x22c55e,
    outfit: 'tacticalMma',
    outfitPrimary: 0x16a34a,
    outfitSecondary: 0xfacc15,
    beltColor: 0xfacc15,
    gloveColor: 0xf8fafc
  },
  bartitsu: {
    skinColor: 0xf7d8c4,
    hairStyle: 'parted',
    hairColor: 0x5c3a21,
    eyeColor: 0x3b82f6,
    facialFeature: 'mustache',
    headgear: 'bowlerHat',
    headgearColor: 0x1e293b,
    outfit: 'victorianVest',
    outfitPrimary: 0x312e81,
    outfitSecondary: 0xfacc15,
    beltColor: 0x78350f,
    gloveColor: 0x92400e
  },
  pankration: {
    skinColor: 0xe6b48c,
    hairStyle: 'afro',
    hairColor: 0x3f2314,
    eyeColor: 0x0284c7,
    facialFeature: 'beard',
    headgear: 'laurel',
    headgearColor: 0xfde047,
    outfit: 'greekChiton',
    outfitPrimary: 0xf8fafc,
    outfitSecondary: 0x38bdf8,
    beltColor: 0xfacc15,
    gloveColor: 0xd97706
  },
  'combat-hapkido': {
    skinColor: 0xf2c9a6,
    hairStyle: 'spiky',
    hairColor: 0x1e293b,
    eyeColor: 0x0f172a,
    facialFeature: 'scar',
    headgear: 'none',
    headgearColor: 0x3b82f6,
    outfit: 'tacticalMma',
    outfitPrimary: 0x1e293b,
    outfitSecondary: 0x3b82f6,
    beltColor: 0xef4444,
    gloveColor: 0x0f172a
  },
  'blue-striker': {
    skinColor: 0xf4cfb6,
    hairStyle: 'spiky',
    hairColor: 0x0f172a,
    eyeColor: 0x38bdf8,
    facialFeature: 'goatee',
    headgear: 'none',
    headgearColor: 0x38bdf8,
    outfit: 'savateSuit',
    outfitPrimary: 0x1d4ed8,
    outfitSecondary: 0x0ea5e9,
    beltColor: 0x38bdf8,
    gloveColor: 0x0284c7
  }
};

const DEFAULT_APPEARANCE: FighterAppearanceProfile = {
  skinColor: 0xefc39e,
  hairStyle: 'short',
  hairColor: 0x18181b,
  eyeColor: 0x1e293b,
  facialFeature: 'none',
  headgear: 'none',
  headgearColor: 0x38bdf8,
  outfit: 'tacticalMma',
  outfitPrimary: 0x1e293b,
  outfitSecondary: 0x38bdf8,
  beltColor: 0xfacc15,
  gloveColor: 0x1e293b
};

/** Returns the cultural appearance profile for a fighter id, if defined. */
export function getFighterAppearance(characterId: string): FighterAppearanceProfile | undefined {
  return FIGHTER_APPEARANCE_BY_ID[characterId];
}

/** Returns the appearance profile or a safe default fallback. */
export function resolveFighterAppearance(characterId: string): FighterAppearanceProfile {
  return FIGHTER_APPEARANCE_BY_ID[characterId] ?? DEFAULT_APPEARANCE;
}
