// What the ✦ AI line says while it works. Shuffled every time so it never feels like 2–3 lines on repeat.
export const AI_PHRASES = [
  'Crisping up the numbers…',
  'Sizzling up the macros…',
  'Checking the menu…',
  'Reading the nutrition label…',
  'Counting the crunch…',
  'Asking the chef…',
  'Peeking in the pantry…',
  'Tallying the protein…',
  'Untangling the carbs…',
  'Measuring the fats…',
  'Scanning the menu boards…',
  'Plating your results…',
  'Toasting the data…',
  'Seasoning the search…',
  'Whisking up answers…',
  'Simmering the stats…',
  'Slicing through menus…',
  'Shaking up the search…',
  'Stacking the macros…',
  'Lighting up the bars…',
  'Double-checking portions…',
  'Finding the fine print…',
  'Hunting down calories…',
  'Mixing the macros…',
  'Preheating the oven…',
  'Taste-testing the data…',
  'Garnishing the numbers…',
  'Rounding up the ingredients…',
  'Sorting sauces and sides…',
  'Comparing serving sizes…',
  'Reading between the buns…',
  'Flipping through menus…',
  'Warming up the grill…',
  'Dicing up the details…',
  'Blending the numbers…',
  'Steeping the tea…',
  'Buttering the toast…',
  'Weighing every bite…',
  'Fluffing the rice…',
  'Cracking the eggs…',
  'Pouring the sauce on the stats…',
  'Checking the drive-thru…',
  'Counting every fry…',
  'Squeezing out the details…',
  'Folding in the fiber…',
  'Tossing the salad of data…',
  'Grating the cheese facts…',
  'Brewing the numbers…',
  'Unwrapping the burrito…',
  'Lining up the plates…',
  'Sharpening the knives…',
  'Reading the recipe card…',
  'Neon-glazing your macros…',
  'Polishing the portions…',
  'Matching your bites…',
]

/** A fresh shuffled order (Fisher–Yates). The first line always says what's really happening. */
export function phraseOrder(): string[] {
  const a = [...AI_PHRASES]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return ['Looking up your meal…', ...a]
}
