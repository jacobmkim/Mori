-- Clean up leftover tracking for items that per USDA have indefinite or multi-year
-- shelf life and shouldn't fire expiration notifications. Run once in Supabase SQL editor.
--
-- Covers:
--   - All vinegars (distilled vinegars are indefinite per USDA)
--   - Dry grains, pasta, rice, oats (2+ years per USDA)
--   - Dried legumes/beans (indefinite per USDA)
--   - Sweeteners (honey indefinite, maple syrup 1+ year)
--   - Spices & dried herbs (2-3 years per USDA)
--   - Spirits/alcohol (indefinite per USDA)
--   - Dry stock cubes / bouillon powder (2+ years; liquid stock stays tracked)
--   - Non-food items (water, bamboo skewers, corn husks)
--   - Oils not already in the STAPLES list (1-2 years per USDA)

-- ─────────────────────────────────────────────────────────────
-- 1. Delete active leftover notifications for these items
-- ─────────────────────────────────────────────────────────────
DELETE FROM user_leftovers
WHERE ingredient_name ILIKE ANY (ARRAY[
  -- Vinegars (balsamic excluded — keeps its 180-day fridge tracking)
  'vinegar', 'white vinegar', '%distilled vinegar%', '%cider vinegar%',
  '%rice vinegar%', 'rice wine vinegar', 'white wine vinegar', 'red wine vinegar',
  'black vinegar', '%black vinegar%', 'champagne vinegar', 'sherry vinegar',
  'malt vinegar', 'cleaning vinegar',
  -- Sweeteners (honey never expires per USDA)
  'honey', 'raw honey', '%maple syrup%', 'golden syrup', 'molasses',
  'black treacle', 'icing sugar', 'powdered sugar', '%muscovado%',
  'palm sugar', 'rock sugar',
  -- Extracts
  '%vanilla extract%', 'vanilla bean paste',
  -- Extra oils
  'rapeseed oil', 'peanut oil', 'ground%nut oil', 'avocado oil', 'coconut oil',
  -- Dry grains, pasta, rice
  'rice', 'white rice', 'long%grain%rice%', 'jasmine rice%', 'basmati rice',
  'arborio rice', 'paella rice', 'sushi rice', 'short grain rice',
  '%dried pasta%', 'spaghetti', 'penne%', 'rigatoni', 'fusilli', 'farfalle',
  'bowtie pasta', 'ditalini pasta', 'linguine pasta', 'paccheri pasta',
  '%cannelloni%dried%', '%lasagna%dried%', '%lasagna sheets%',
  '%noodles dried%', '%dried%noodles%', 'rice vermicelli', 'glass noodles',
  'fideo noodles', '%ramyeon%',
  'oats', 'rolled oats', 'steel cut oats', 'quick oats',
  'buckwheat', 'bulgur wheat', 'farro', 'freekeh', 'rye', 'pearl barley', 'barley',
  'quinoa', 'cornmeal', 'corn flour', 'masa harina', 'potato starch',
  'cornbread mix', 'custard powder',
  -- Dried legumes
  'dried chickpeas', 'dried pinto beans', 'dried red kidney beans',
  'dried white beans', 'dried black beans', 'dried kidney beans',
  'dried lentils', 'dried split peas',
  -- Extended spices / seasoning blends
  'allspice', '%allspice%', '%cardamom%', 'clove', 'cloves', '%ground clove%',
  'fennel seeds', 'caraway seed%', 'mustard powder', 'mustard seeds',
  'peppercorns', 'sichuan pepper', 'juniper berries',
  'saffron', 'saffron threads',
  'cumin powder', 'coriander powder',
  'curry powder', '%chili powder%', '%chilli powder%',
  '%garam masala%', 'biryani masala',
  '%pav bhaji masala%', 'jamaican curry powder',
  'cajun seasoning', 'fajita seasoning', 'old bay seasoning', 'all-purpose seasoning',
  '%five spice%', '%five-spice%', 'ras el hanout',
  'celery salt', 'onion salt', 'everything bagel seasoning',
  '%dried chill%', 'dried red chilies', 'dried red peppers', 'pul biber',
  'ground paprika', 'paprika smoked', 'paprika spanish smoked',
  'ground annatto', 'amchur powder', 'ground sumac',
  -- Dried herbs
  'dried dill', 'dried parsley', 'dried rosemary', 'dried sage',
  'dried mint', 'dried mexican oregano', '%herbes de provence%',
  -- Dry stock / bouillon (liquid stock/broth stays tracked)
  '%stock cube%', '%bouillon powder%', '%dashi powder%', '%stock powder%',
  -- Spirits / alcohol
  'brandy', 'dark rum', 'white rum', 'rum', 'whiskey', 'bourbon', 'vodka', 'gin',
  'grand marnier', 'cognac', '%coffee liqueur%',
  'chinese cooking wine', 'shaoxing wine', 'sake', 'mirin',
  -- Dry seaweed & misc dry goods
  'dried seaweed', 'dried seaweed wakame', 'kombu', 'kombu seaweed', 'nori',
  'gelatin sheets', 'cocoa powder', 'cocoa', 'cacao',
  'green tea', '%ginseng root%dried%',
  -- Non-food
  'bamboo skewers', 'skewers', 'toothpicks', '%corn husks%',
  'boiling water', 'cold water', 'hot water', 'ice water', 'warm water',
  -- Yeast & leavening
  '%yeast%'
]);

-- ─────────────────────────────────────────────────────────────
-- 2. Remove these from ingredient_storage so the backfill script
--    won't re-add them and PostCookLeftoversModal won't offer them.
-- ─────────────────────────────────────────────────────────────
DELETE FROM ingredient_storage
WHERE canonical_name ILIKE ANY (ARRAY[
  -- Vinegars (balsamic intentionally excluded — keeps its 180-day fridge tracking)
  'vinegar', 'white vinegar', '%distilled vinegar%', '%cider vinegar%',
  '%rice vinegar%', 'rice wine vinegar', 'white wine vinegar', 'red wine vinegar',
  'black vinegar', '%black vinegar%', 'champagne vinegar', 'sherry vinegar',
  'malt vinegar', 'cleaning vinegar',
  'honey', 'raw honey', '%maple syrup%', 'golden syrup', 'molasses',
  'black treacle', 'icing sugar', 'powdered sugar', '%muscovado%',
  'palm sugar', 'rock sugar',
  '%vanilla extract%', 'vanilla bean paste',
  'rapeseed oil', 'peanut oil', 'ground%nut oil', 'avocado oil', 'coconut oil',
  'rice', 'white rice', 'long%grain%rice%', 'jasmine rice%', 'basmati rice',
  'arborio rice', 'paella rice', 'sushi rice', 'short grain rice',
  '%dried pasta%', 'spaghetti', 'penne%', 'rigatoni', 'fusilli', 'farfalle',
  'bowtie pasta', 'ditalini pasta', 'linguine pasta', 'paccheri pasta',
  '%cannelloni%dried%', '%lasagna%dried%', '%lasagna sheets%',
  '%noodles dried%', '%dried%noodles%', 'rice vermicelli', 'glass noodles',
  'fideo noodles', '%ramyeon%',
  'oats', 'rolled oats', 'steel cut oats', 'quick oats',
  'buckwheat', 'bulgur wheat', 'farro', 'freekeh', 'rye', 'pearl barley', 'barley',
  'quinoa', 'cornmeal', 'corn flour', 'masa harina', 'potato starch',
  'cornbread mix', 'custard powder',
  'dried chickpeas', 'dried pinto beans', 'dried red kidney beans',
  'dried white beans', 'dried black beans', 'dried kidney beans',
  'dried lentils', 'dried split peas',
  'allspice', '%allspice%', '%cardamom%', 'clove', 'cloves', '%ground clove%',
  'fennel seeds', 'caraway seed%', 'mustard powder', 'mustard seeds',
  'peppercorns', 'sichuan pepper', 'juniper berries',
  'saffron', 'saffron threads',
  'cumin powder', 'coriander powder',
  'curry powder', '%chili powder%', '%chilli powder%',
  '%garam masala%', 'biryani masala',
  '%pav bhaji masala%', 'jamaican curry powder',
  'cajun seasoning', 'fajita seasoning', 'old bay seasoning', 'all-purpose seasoning',
  '%five spice%', '%five-spice%', 'ras el hanout',
  'celery salt', 'onion salt', 'everything bagel seasoning',
  '%dried chill%', 'dried red chilies', 'dried red peppers', 'pul biber',
  'ground paprika', 'paprika smoked', 'paprika spanish smoked',
  'ground annatto', 'amchur powder', 'ground sumac',
  'dried dill', 'dried parsley', 'dried rosemary', 'dried sage',
  'dried mint', 'dried mexican oregano', '%herbes de provence%',
  '%stock cube%', '%bouillon powder%', '%dashi powder%', '%stock powder%',
  'brandy', 'dark rum', 'white rum', 'rum', 'whiskey', 'bourbon', 'vodka', 'gin',
  'grand marnier', 'cognac', '%coffee liqueur%',
  'chinese cooking wine', 'shaoxing wine', 'sake', 'mirin',
  'dried seaweed', 'dried seaweed wakame', 'kombu', 'kombu seaweed', 'nori',
  'gelatin sheets', 'cocoa powder', 'cocoa', 'cacao',
  'green tea', '%ginseng root%dried%',
  'bamboo skewers', 'skewers', 'toothpicks', '%corn husks%',
  'boiling water', 'cold water', 'hot water', 'ice water', 'warm water',
  '%yeast%'
]);
