// Diet templates a doctor can prescribe from, in a vegetarian and a
// non-vegetarian version, suggested from the diagnosis / chief complaint.
// The chosen template fills the plan text, which the doctor can edit.

export type DietKind = 'VEG' | 'NON_VEG';

export interface DietTemplate {
  id: string;
  title: string;
  keywords: string[];
  veg: string;
  nonVeg: string;
}

type Meal = [label: string, veg: string, nonVeg?: string];

function plan(meals: Meal[], avoid: string, tips: string): { veg: string; nonVeg: string } {
  const text = (nonVeg: boolean) =>
    [...meals.map(([label, v, nv]) => `${label}: ${nonVeg && nv ? nv : v}`), `Avoid: ${avoid}`, `Tips: ${tips}`].join('\n');
  return { veg: text(false), nonVeg: text(true) };
}

export const DIET_TEMPLATES: DietTemplate[] = [
  {
    id: 'diabetes',
    title: 'Diabetes / high blood sugar',
    keywords: ['diabetes', 'diabetic', 'dm', 't2dm', 'type 2', 'sugar', 'hyperglycemia', 'hyperglycaemia', 'prediabetes', 'hba1c'],
    ...plan(
      [
        ['Early morning', 'Methi (fenugreek) seed water or 5–6 soaked almonds'],
        ['Breakfast', 'Vegetable oats / moong dal chilla / 2 idli with sambar; tea without sugar', '2 boiled egg whites + vegetable oats or moong dal chilla; tea without sugar'],
        ['Mid-morning', '1 guava / apple / orange, or buttermilk'],
        ['Lunch', '2 multigrain or jowar/bajra rotis, dal, green vegetable sabzi, salad, curd', '2 multigrain rotis, grilled chicken or fish curry (less oil), green vegetable, salad'],
        ['Evening', 'Roasted chana or sprouts chaat; green tea'],
        ['Dinner (by 8 pm)', 'Small portion — 1–2 rotis or brown rice with dal and vegetables, or paneer bhurji', '1–2 rotis with egg bhurji or chicken/fish and vegetables'],
      ],
      'sugar, sweets, jaggery, honey, white rice in excess, maida, fruit juices, soft drinks, fried snacks, potato and sweet potato in excess, mango/chikoo/grapes',
      'eat every 3–4 hours in small portions, half the plate vegetables, walk 30 minutes after meals, check sugars as advised',
    ),
  },
  {
    id: 'hypertension',
    title: 'High blood pressure',
    keywords: ['hypertension', 'htn', 'high bp', 'bp', 'blood pressure', 'hypertensive'],
    ...plan(
      [
        ['Breakfast', 'Oats / poha with vegetables / upma, 1 banana, low-fat milk', 'Oats or poha with vegetables, 1 boiled egg, 1 banana'],
        ['Mid-morning', 'Fresh fruit (papaya, orange, pomegranate) or coconut water (if kidneys are normal)'],
        ['Lunch', 'Rotis, dal, leafy green sabzi (spinach, methi), salad, low-fat curd', 'Rotis, grilled / steamed fish or chicken, leafy green vegetable, salad'],
        ['Evening', 'Unsalted roasted chana or a handful of unsalted nuts; herbal tea'],
        ['Dinner', 'Khichdi / rotis with vegetables and dal', 'Rotis with light chicken or fish curry and vegetables'],
      ],
      'extra salt (under 1 teaspoon a day), papad, pickles, chutney powders, namkeen, chips, processed and packaged food, sauces, cheese, red meat, alcohol, smoking',
      'no salt shaker at the table; flavour with lemon, herbs and spices; walk 30–45 minutes daily; keep weight in check',
    ),
  },
  {
    id: 'fever',
    title: 'Fever / viral infection',
    keywords: ['fever', 'pyrexia', 'viral', 'flu', 'influenza', 'body ache', 'bodyache', 'chills', 'covid'],
    ...plan(
      [
        ['Through the day', '8–10 glasses of fluids: warm water, ORS, coconut water, lemon water, soups, dal water'],
        ['Breakfast', 'Soft idli / poha / suji upma / daliya with milk', 'Soft idli or daliya, 1 boiled egg'],
        ['Lunch', 'Soft rice or khichdi with moong dal, lightly cooked vegetables, curd', 'Soft rice with moong dal, light chicken stew or chicken soup, curd'],
        ['Evening', 'Fruit (papaya, chikoo, orange, mosambi juice) and vegetable soup', 'Chicken or vegetable clear soup, fruit'],
        ['Dinner', 'Khichdi / soft chapati with lauki or tinda sabzi', 'Soft chapati with egg curry (light) or chicken soup'],
      ],
      'fried, spicy and oily food, outside food, cold drinks and ice creams, heavy non-veg gravies',
      'small frequent meals even with low appetite; rest; step up to a normal diet as the fever settles',
    ),
  },
  {
    id: 'typhoid',
    title: 'Typhoid / enteric fever',
    keywords: ['typhoid', 'enteric', 'widal', 'salmonella'],
    ...plan(
      [
        ['Through the day', 'Plenty of boiled water, ORS, coconut water, rice kanji, fresh juices'],
        ['Breakfast', 'Soft idli / suji upma / rice flakes with milk', 'Soft idli or suji upma, 1 soft boiled or poached egg'],
        ['Lunch', 'Soft rice with moong dal and curd; boiled lauki / pumpkin / carrot', 'Soft rice with moong dal, curd; well-cooked egg or chicken soup'],
        ['Evening', 'Banana, chikoo, papaya; custard or kheer', 'Banana or papaya; clear chicken soup'],
        ['Dinner', 'Khichdi with ghee and curd', 'Khichdi; egg white or chicken stew'],
      ],
      'high-fibre and raw food (salads, sprouts, whole grains), spicy / fried food, outside food and water, raw peels',
      'small high-calorie meals every 2–3 hours; only boiled or filtered water; continue the soft diet for a week after the fever goes',
    ),
  },
  {
    id: 'dengue',
    title: 'Dengue / malaria / low platelets',
    keywords: ['dengue', 'malaria', 'platelet', 'platelets', 'thrombocytopenia', 'chikungunya'],
    ...plan(
      [
        ['Through the day', '3 litres of fluids: ORS, coconut water, lemon water, soups, fresh juices (pomegranate, orange, kiwi, papaya)'],
        ['Breakfast', 'Daliya / poha / idli with milk; papaya', 'Daliya or idli, 1–2 boiled eggs; papaya'],
        ['Lunch', 'Soft rice, dal, lightly cooked green vegetables, curd', 'Soft rice, dal, chicken or fish stew, curd'],
        ['Evening', 'Fruit bowl (papaya, pomegranate, kiwi) and vegetable soup', 'Chicken soup and fruit bowl'],
        ['Dinner', 'Khichdi with vegetables, or soft rotis with paneer', 'Soft rotis with egg or chicken and vegetables'],
      ],
      'oily, spicy and fried food, caffeine, cold drinks, alcohol; painkillers other than paracetamol unless prescribed',
      'watch urine output (at least every 4–6 hours); report bleeding, severe stomach pain or vomiting at once',
    ),
  },
  {
    id: 'gastritis',
    title: 'Acidity / gastritis / GERD',
    keywords: ['gastritis', 'acidity', 'gerd', 'reflux', 'heartburn', 'dyspepsia', 'ulcer', 'epigastric', 'indigestion', 'bloating', 'apd', 'acid peptic'],
    ...plan(
      [
        ['Early morning', 'Lukewarm water; a banana or a few soaked raisins — no tea on an empty stomach'],
        ['Breakfast', 'Oats / idli / poha / daliya with cold milk', 'Oats or idli with 1 boiled egg'],
        ['Mid-morning', 'Banana, papaya, melon or apple'],
        ['Lunch', 'Rice or rotis, moong dal, lauki / tinda / pumpkin sabzi, curd or buttermilk', 'Rice or rotis, steamed or grilled fish / chicken (no gravy), vegetables, buttermilk'],
        ['Evening', 'Coconut water or buttermilk; plain khakhra'],
        ['Dinner (2–3 hours before bed)', 'Light khichdi or rotis with vegetables', 'Light rotis with chicken or egg and vegetables'],
      ],
      'spicy, fried and sour food, tea and coffee in excess, carbonated drinks, alcohol, smoking, late-night heavy meals, long gaps between meals',
      'small meals, eat slowly, don’t lie down for 2 hours after food, raise the head of the bed if reflux at night',
    ),
  },
  {
    id: 'diarrhoea',
    title: 'Loose motions / gastroenteritis / vomiting',
    keywords: ['diarrhoea', 'diarrhea', 'loose motion', 'loose motions', 'loose stools', 'gastroenteritis', 'vomiting', 'dysentery', 'food poisoning'],
    ...plan(
      [
        ['Through the day', 'ORS after every loose stool; rice kanji, coconut water, lemon water with salt and sugar, buttermilk'],
        ['Breakfast', 'Banana with plain toast or soft idli', 'Banana with plain toast or soft idli'],
        ['Lunch', 'Curd rice / soft khichdi; boiled potato', 'Curd rice / soft khichdi; boiled potato'],
        ['Evening', 'Apple stewed or peeled, banana; rice water'],
        ['Dinner', 'Moong dal khichdi with curd', 'Moong dal khichdi with curd; clear chicken soup once stools settle'],
      ],
      'milk (use curd instead), fried and spicy food, raw salads, high-fibre food, outside food and water, sweets, caffeine',
      'keep drinking even if vomiting — small sips often; return to a normal diet over 2–3 days; see the doctor if unable to keep fluids down',
    ),
  },
  {
    id: 'liver',
    title: 'Jaundice / hepatitis / fatty liver',
    keywords: ['jaundice', 'hepatitis', 'liver', 'fatty liver', 'nafld', 'bilirubin', 'sgpt', 'alt', 'cirrhosis'],
    ...plan(
      [
        ['Through the day', 'Plenty of boiled water, sugarcane juice (hygienic), coconut water, fresh fruit juice'],
        ['Breakfast', 'Poha / idli / daliya with skimmed milk', 'Poha or idli with egg whites'],
        ['Lunch', 'Rice or rotis, moong dal, boiled vegetables, curd — very little oil', 'Rice or rotis, dal, boiled or grilled fish / chicken — very little oil'],
        ['Evening', 'Papaya, apple, pomegranate; roasted chana'],
        ['Dinner', 'Khichdi / rotis with vegetables', 'Rotis with vegetables and a small portion of fish or chicken'],
      ],
      'alcohol completely, fried and fatty food, ghee / butter in excess, red meat, outside food, sweets and sugary drinks',
      'eat small frequent meals; for fatty liver aim for steady weight loss and 30–45 minutes of exercise daily',
    ),
  },
  {
    id: 'anaemia',
    title: 'Anaemia / weakness',
    keywords: ['anaemia', 'anemia', 'low hb', 'haemoglobin', 'hemoglobin', 'weakness', 'fatigue', 'iron deficiency', 'tiredness'],
    ...plan(
      [
        ['Early morning', 'Soaked raisins, dates and figs'],
        ['Breakfast', 'Ragi / nachni dosa or poha with peanuts and lemon; orange or amla', 'Eggs (2) with multigrain roti; orange or amla'],
        ['Lunch', 'Rotis, rajma / chana / masoor dal, palak / methi sabzi, beetroot salad with lemon', 'Rotis, chicken liver or mutton / chicken curry, palak sabzi, beetroot salad with lemon'],
        ['Evening', 'Roasted chana with jaggery, pomegranate or guava'],
        ['Dinner', 'Rotis with soya chunks / paneer and green vegetables', 'Rotis with fish or egg curry and green vegetables'],
      ],
      'tea and coffee within an hour of meals (they block iron), too much calcium with iron-rich meals',
      'have vitamin C (lemon, amla, orange, guava) with iron-rich meals; take iron tablets as prescribed; cook in an iron kadhai',
    ),
  },
  {
    id: 'respiratory',
    title: 'Cough / cold / chest infection',
    keywords: ['cough', 'cold', 'coryza', 'urti', 'lrti', 'bronchitis', 'pneumonia', 'asthma', 'sore throat', 'pharyngitis', 'tonsillitis', 'sinusitis', 'rhinitis'],
    ...plan(
      [
        ['Through the day', 'Warm water, ginger-tulsi tea, haldi milk at night, steam inhalation'],
        ['Breakfast', 'Warm vegetable upma / daliya / idli', 'Warm daliya or idli with 1–2 boiled eggs'],
        ['Lunch', 'Rotis or rice, dal, cooked vegetables (garlic, ginger), warm soup', 'Rotis or rice, chicken soup or light chicken curry, cooked vegetables'],
        ['Evening', 'Vegetable soup; guava or orange (at room temperature)', 'Chicken clear soup; guava or orange'],
        ['Dinner', 'Khichdi or rotis with vegetables', 'Rotis with light egg or chicken curry and vegetables'],
      ],
      'cold water and drinks, ice cream, fried and oily food, excess sweets, smoking and dust',
      'warm fluids through the day; honey (not for children under 1) soothes cough; rest the voice',
    ),
  },
  {
    id: 'kidney',
    title: 'Kidney disease (CKD)',
    keywords: ['ckd', 'kidney', 'renal failure', 'creatinine', 'nephropathy', 'nephrotic', 'dialysis', 'aki'],
    ...plan(
      [
        ['Breakfast', 'Suji upma / poha / rice flakes with a little milk', 'Suji upma or poha with 1–2 egg whites'],
        ['Lunch', 'Rice or rotis, a small katori of dal, leached vegetables (lauki, tinda, cabbage, cauliflower)', 'Rice or rotis, a small portion of chicken or fish, leached vegetables'],
        ['Evening', 'Apple, pear or papaya (one portion); puffed rice'],
        ['Dinner', 'Rotis with leached vegetables', 'Rotis with leached vegetables and egg whites'],
      ],
      'extra salt, pickles, papad, packaged food; high-potassium foods (banana, coconut water, oranges, tomatoes, potatoes) unless allowed; excess protein; painkillers',
      'limit fluids and protein as your doctor advises; leach vegetables — cut, soak in warm water 2 hours, discard water, then cook',
    ),
  },
  {
    id: 'stones',
    title: 'Kidney stones',
    keywords: ['stone', 'stones', 'calculus', 'calculi', 'renal colic', 'urolithiasis', 'nephrolithiasis'],
    ...plan(
      [
        ['Through the day', '3–3.5 litres of water (clear urine), lemon water, coconut water, barley water'],
        ['Breakfast', 'Poha / upma / idli with milk; a citrus fruit', 'Poha or idli with 1 egg; a citrus fruit'],
        ['Lunch', 'Rotis, moong dal, vegetables (lauki, tinda, cucumber), curd', 'Rotis, a small portion of chicken or fish, vegetables, curd'],
        ['Evening', 'Watermelon, muskmelon or an apple; buttermilk'],
        ['Dinner', 'Rotis / rice with dal and vegetables', 'Rotis with vegetables and a small portion of egg or fish'],
      ],
      'extra salt, excess spinach / tomato seeds / chocolates / nuts / tea (oxalates), red meat and organ meat, soft drinks',
      'spread water through the day and drink a glass at bedtime; normal dairy calcium is fine — don’t cut it out',
    ),
  },
  {
    id: 'weight',
    title: 'Weight loss / obesity / PCOS',
    keywords: ['obesity', 'obese', 'overweight', 'weight loss', 'weight gain', 'pcos', 'pcod', 'metabolic syndrome', 'bmi'],
    ...plan(
      [
        ['Early morning', 'Warm water with lemon; 5 soaked almonds'],
        ['Breakfast', 'Moong dal chilla / vegetable oats / besan chilla with mint chutney', '2 egg omelette with vegetables and 1 multigrain toast'],
        ['Mid-morning', 'One fruit (apple, guava, orange) or buttermilk'],
        ['Lunch', '1–2 multigrain rotis, dal, big bowl of salad, sabzi, curd', '1–2 multigrain rotis, grilled chicken or fish, big bowl of salad, sabzi'],
        ['Evening', 'Sprouts chaat / roasted makhana; green tea'],
        ['Dinner (by 8 pm)', 'Paneer or tofu with sautéed vegetables, or dal soup and salad', 'Grilled chicken or fish with sautéed vegetables, or clear soup and salad'],
      ],
      'sugar, sweets, bakery items, fried snacks, sugary drinks and juices, white rice and maida in excess, late-night eating',
      'half the plate vegetables, a quarter protein, a quarter grains; walk 45 minutes a day; sleep 7–8 hours',
    ),
  },
  {
    id: 'heart',
    title: 'Heart disease / high cholesterol',
    keywords: ['cholesterol', 'dyslipidemia', 'dyslipidaemia', 'lipid', 'triglycerides', 'cad', 'ihd', 'heart', 'angina', 'mi', 'cardiac', 'stent', 'ptca'],
    ...plan(
      [
        ['Breakfast', 'Oats / daliya with low-fat milk, or besan chilla; a fruit', 'Oats or daliya; 2 egg whites; a fruit'],
        ['Mid-morning', 'A handful of walnuts / almonds, or flax seeds with buttermilk'],
        ['Lunch', 'Multigrain rotis, dal, green vegetables, salad, low-fat curd', 'Multigrain rotis, grilled or steamed fish (twice a week) or chicken, green vegetables, salad'],
        ['Evening', 'Roasted chana / sprouts; green tea'],
        ['Dinner', 'Light — rotis with vegetables, or vegetable soup with salad', 'Light — rotis with vegetables and a small portion of fish or chicken'],
      ],
      'ghee, butter, vanaspati, fried food, red meat, egg yolks in excess, bakery items, full-fat dairy, extra salt, smoking, alcohol',
      'use mustard / rice-bran / groundnut oil, 3–4 teaspoons a day; walk daily as allowed by the doctor',
    ),
  },
  {
    id: 'constipation',
    title: 'Constipation / piles / fissure',
    keywords: ['constipation', 'piles', 'haemorrhoids', 'hemorrhoids', 'fissure', 'fistula', 'hard stools'],
    ...plan(
      [
        ['Early morning', '2 glasses of warm water; soaked figs or prunes'],
        ['Breakfast', 'Daliya / oats with milk; papaya', 'Daliya or oats, 1 boiled egg; papaya'],
        ['Lunch', 'Whole-wheat rotis with bran, dal, green vegetables, salad, curd', 'Whole-wheat rotis, fish or chicken curry (not spicy), green vegetables, salad'],
        ['Evening', 'Guava, pear or orange; buttermilk'],
        ['Dinner', 'Rotis with vegetables and dal; 1 teaspoon isabgol in warm milk or water at bedtime', 'Rotis with vegetables and egg; isabgol at bedtime'],
      ],
      'maida, bakery items, excess tea and coffee, spicy food (for piles and fissure), too little water, red meat',
      '3 litres of water a day, fruit and vegetables at every meal, don’t delay the urge, sitz bath for piles or fissure',
    ),
  },
  {
    id: 'thyroid',
    title: 'Hypothyroidism',
    keywords: ['hypothyroid', 'hypothyroidism', 'thyroid', 'tsh'],
    ...plan(
      [
        ['Early morning', 'Thyroid tablet on an empty stomach; wait 30–60 minutes before tea or food'],
        ['Breakfast', 'Vegetable upma / poha / besan chilla; a fruit', 'Egg omelette with a multigrain roti; a fruit'],
        ['Lunch', 'Rotis, dal, vegetables, salad, curd; iodised salt', 'Rotis, fish or chicken, vegetables, salad; iodised salt'],
        ['Evening', 'Roasted chana or a handful of nuts (Brazil nuts, almonds)'],
        ['Dinner', 'Rotis / khichdi with vegetables and paneer', 'Rotis with egg or chicken and vegetables'],
      ],
      'raw cabbage, cauliflower and broccoli in large amounts, soy in excess, sugar and processed food; calcium / iron tablets within 4 hours of the thyroid tablet',
      'regular exercise helps weight and energy; recheck TSH as advised',
    ),
  },
  {
    id: 'uti',
    title: 'Urinary tract infection',
    keywords: ['uti', 'urinary', 'dysuria', 'burning micturition', 'cystitis', 'pyelonephritis'],
    ...plan(
      [
        ['Through the day', '3 litres of water, coconut water, barley water, buttermilk'],
        ['Breakfast', 'Poha / idli / upma; a fruit', 'Poha or idli with an egg; a fruit'],
        ['Lunch', 'Rice or rotis, dal, vegetables, curd', 'Rice or rotis, dal, chicken or fish (not spicy), curd'],
        ['Evening', 'Watermelon, muskmelon or cucumber; buttermilk'],
        ['Dinner', 'Khichdi / rotis with vegetables', 'Rotis with vegetables and egg'],
      ],
      'spicy food, caffeine, alcohol, carbonated and sugary drinks, holding urine',
      'pass urine often and after intercourse; complete the full antibiotic course',
    ),
  },
  {
    id: 'gout',
    title: 'Gout / high uric acid',
    keywords: ['gout', 'uric acid', 'hyperuricemia', 'hyperuricaemia'],
    ...plan(
      [
        ['Through the day', '3 litres of water; lemon water'],
        ['Breakfast', 'Poha / upma / oats with low-fat milk; cherries or a citrus fruit', 'Oats or upma with 1–2 eggs; a citrus fruit'],
        ['Lunch', 'Rotis or rice, moong dal (small), vegetables, low-fat curd', 'Rotis or rice, a small portion of chicken, vegetables, low-fat curd'],
        ['Evening', 'Fruit; roasted makhana'],
        ['Dinner', 'Rotis with vegetables and paneer', 'Rotis with vegetables and egg'],
      ],
      'red meat, organ meat, seafood (prawns, crab, sardines), alcohol especially beer, sugary drinks, rajma / chole / urad in excess',
      'keep weight down gradually — no crash diets; low-fat dairy helps lower uric acid',
    ),
  },
  {
    id: 'pregnancy',
    title: 'Pregnancy',
    keywords: ['pregnancy', 'pregnant', 'antenatal', 'anc', 'gravida', 'trimester', 'lactation', 'breastfeeding'],
    ...plan(
      [
        ['Early morning', 'Milk with soaked almonds and dates; dry toast if nauseous'],
        ['Breakfast', 'Paneer paratha / vegetable poha / ragi dosa; a fruit', 'Egg omelette with multigrain toast / paratha; a fruit'],
        ['Mid-morning', 'Coconut water / buttermilk; roasted chana'],
        ['Lunch', 'Rotis, rice, dal, green leafy vegetables, salad, curd', 'Rotis, rice, well-cooked chicken or fish (low-mercury), green vegetables, salad, curd'],
        ['Evening', 'Sprouts, fruit or a milk shake; handful of nuts'],
        ['Dinner', 'Rotis with dal / paneer and vegetables; milk at bedtime', 'Rotis with egg or chicken and vegetables; milk at bedtime'],
      ],
      'papaya (raw / semi-ripe) and pineapple in excess, undercooked meat or eggs, unpasteurised milk, alcohol, smoking, excess caffeine, high-mercury fish',
      'small frequent meals; take iron, calcium and folic acid tablets as prescribed; 8–10 glasses of water',
    ),
  },
  {
    id: 'recovery',
    title: 'After surgery / injury / fracture — healing',
    keywords: ['post op', 'post-op', 'postoperative', 'post operative', 'surgery', 'operated', 'fracture', 'wound', 'injury', 'burns', 'bed sore'],
    ...plan(
      [
        ['Breakfast', 'Paneer paratha / besan chilla / sprouts with milk; a fruit', '2–3 eggs with multigrain toast; milk; a fruit'],
        ['Mid-morning', 'Citrus fruit or amla; a handful of nuts and seeds'],
        ['Lunch', 'Rotis, rice, thick dal / rajma / chana, vegetables, curd', 'Rotis, rice, chicken or fish curry, dal, vegetables, curd'],
        ['Evening', 'Soya / paneer tikka or roasted chana; milk or buttermilk', 'Chicken soup or egg; buttermilk'],
        ['Dinner', 'Rotis with paneer or dal and vegetables; haldi milk at bedtime', 'Rotis with fish or chicken and vegetables; haldi milk at bedtime'],
      ],
      'smoking and alcohol (slow healing), junk food, excess sugar (especially if diabetic)',
      'protein at every meal for healing; vitamin C and zinc from fruits, nuts and seeds; enough water; follow any surgery-specific instructions first',
    ),
  },
  {
    id: 'general',
    title: 'General healthy diet',
    keywords: [],
    ...plan(
      [
        ['Breakfast', 'Poha / upma / idli / chilla with milk; a fruit', 'Eggs with multigrain toast or poha; a fruit'],
        ['Lunch', 'Rotis, rice, dal, seasonal vegetables, salad, curd', 'Rotis, rice, chicken or fish, vegetables, salad, curd'],
        ['Evening', 'Sprouts / roasted chana / fruit; tea without much sugar'],
        ['Dinner', 'Light — rotis with dal and vegetables', 'Light — rotis with egg or chicken and vegetables'],
      ],
      'fried and junk food, excess sugar and salt, sugary drinks, smoking and alcohol',
      '8–10 glasses of water; eat on time; 30 minutes of physical activity daily',
    ),
  },
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const patterns = new Map(DIET_TEMPLATES.map((t) => [t.id, t.keywords.map((k) => new RegExp(`\\b${escape(k)}(s|es)?\\b`, 'i'))]));

// Templates suited to the diagnosis / chief complaint, best match first.
// Keywords match whole words (plural allowed), so "bp" or "mi" never
// match inside another word.
export function suggestDietTemplates(context: string): DietTemplate[] {
  const text = context.trim();
  if (!text) return [];
  return DIET_TEMPLATES.map((t, i) => ({ t, i, score: patterns.get(t.id)!.filter((re) => re.test(text)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((x) => x.t);
}

export function dietTemplateText(t: DietTemplate, kind: DietKind): string {
  return `${t.title} — ${kind === 'VEG' ? 'vegetarian' : 'non-vegetarian'} diet\n${kind === 'VEG' ? t.veg : t.nonVeg}`;
}
