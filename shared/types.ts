// Types shared by the app (src/) and the Netlify Functions (netlify/functions/).

export type Sex = 'male' | 'female'
export type Units = 'imperial' | 'metric'
export type Goal = 'lose' | 'maintain' | 'gain'
export type ActivityMode = 'level' | 'track'
export type ActivityLevel = 'sedentary' | 'light' | 'active' | 'very'
/** Core meals, plus extra meals people add (ids like 'meal-k3x9'). */
export type CoreMeal = 'breakfast' | 'lunch' | 'dinner' | 'snacks'
export type Meal = CoreMeal | (string & {})

export interface ExtraMeal {
  id: string
  name: string
}

export interface Targets {
  calories: number
  protein: number
  carbs: number
  fat: number
  /** true when the user typed their own numbers instead of using the suggestion */
  manual: boolean
}

export interface Profile {
  id: string
  firstName: string
  email: string
  createdAt: string
  onboarded: boolean
  sex?: Sex
  birthYear?: number
  heightCm?: number
  units: Units
  goal?: Goal
  startWeightKg?: number
  goalWeightKg?: number
  activityMode: ActivityMode
  activityLevel: ActivityLevel
  targets?: Targets
  bestStreak: number
  milestonesHit: number[]
  timeZone: string
  notif: { enabled: boolean; hour: number }
  /** Personal code the Apple Shortcut sends (server-owned) */
  fitnessCode?: string
  /** ISO time of the last Shortcut sync (server-owned) */
  fitnessLastSync?: string
  passkeyEnabled?: boolean
  /** Extra meals for people who eat 4–6 times a day (shown between Dinner and Snacks) */
  extraMeals?: ExtraMeal[]
}

/** A store-brand product from USDA Branded Foods ('b:fdc:<id>') or Open Food Facts ('b:off:<barcode>'). */
export interface BrandFood {
  id: string
  name: string
  brand: string
  /** per 100 g / 100 ml */
  per100: { cal: number; p: number; c: number; f: number }
  units: { label: string; grams: number }[]
  upc?: string
}

export interface FoodEntry {
  id: string
  /** 'u:<ndb>' library food · 'c:<id>' custom food · 'b:…' store brand · 'q' quick add */
  foodId: string
  name: string
  meal: Meal
  qty: number
  unit: string
  cal: number
  p: number
  c: number
  f: number
  at: string
}

export interface Workout {
  id: string
  type: string
  minutes: number
  cal: number
  source: 'manual' | 'shortcut'
  at: string
}

export interface DayDoc {
  date: string
  foods: FoodEntry[]
  workouts: Workout[]
  steps: { count: number; source: 'manual' | 'shortcut'; updatedAt: string } | null
  /** ids of deleted foods/workouts, so merges between two phones don't bring them back */
  deleted: string[]
}

export interface WeightEntry {
  id: string
  date: string
  kg: number
}

export interface ListDoc<T> {
  items: T[]
  deleted: string[]
}

/** A saved food "template" used by Recents and Favorites */
export interface FoodTemplate {
  key: string
  foodId: string
  name: string
  qty: number
  unit: string
  cal: number
  p: number
  c: number
  f: number
  at: string
}

/** A saved meal: a named group of foods logged as one item (key 'meals'). */
export interface SavedMeal {
  key: string
  name: string
  items: Omit<FoodTemplate, 'key' | 'at'>[]
  at: string
}

export interface DayIndex {
  /** Dates (YYYY-MM-DD) with at least one food logged */
  dates: string[]
}

export interface CustomFood {
  id: string
  name: string
  serving: string
  cal: number
  p: number
  c: number
  f: number
  createdBy: string
  createdByName: string
  createdAt: string
}

export type DocKey = 'profile' | 'weights' | 'favorites' | 'recents' | 'dayindex' | `days/${string}`

export function emptyDay(date: string): DayDoc {
  return { date, foods: [], workouts: [], steps: null, deleted: [] }
}

export function newProfile(id: string, email: string, firstName: string, timeZone: string): Profile {
  return {
    id,
    email: email.toLowerCase(),
    firstName,
    createdAt: new Date().toISOString(),
    onboarded: false,
    units: 'imperial',
    activityMode: 'level',
    activityLevel: 'sedentary',
    bestStreak: 0,
    milestonesHit: [],
    timeZone: timeZone || 'America/Chicago',
    notif: { enabled: false, hour: 20 },
  }
}
