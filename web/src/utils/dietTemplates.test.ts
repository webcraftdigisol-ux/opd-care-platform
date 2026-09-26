import { describe, expect, it } from 'vitest';
import { DIET_TEMPLATES, dietTemplateText, suggestDietTemplates } from './dietTemplates';

describe('suggestDietTemplates', () => {
  it('suggests from the diagnosis and chief complaint, best match first', () => {
    expect(suggestDietTemplates('Type 2 diabetes mellitus, high sugar')[0]!.id).toBe('diabetes');
    expect(suggestDietTemplates('Fever with body ache since 3 days').map((t) => t.id)).toContain('fever');
    expect(suggestDietTemplates('K/c/o HTN; loose motions x 2 days').map((t) => t.id)).toEqual(expect.arrayContaining(['hypertension', 'diarrhoea']));
    expect(suggestDietTemplates('Acidity and heartburn after meals')[0]!.id).toBe('gastritis');
    expect(suggestDietTemplates('Dengue fever, low platelets')[0]!.id).toBe('dengue');
  });

  it('matches short keywords only as whole words', () => {
    expect(suggestDietTemplates('BP 150/100').map((t) => t.id)).toContain('hypertension');
    expect(suggestDietTemplates('Headache, mild migraine').map((t) => t.id)).not.toContain('heart');
    expect(suggestDietTemplates('Abdominal pain')).toEqual([]);
    expect(suggestDietTemplates('')).toEqual([]);
  });

  it('has a vegetarian and a non-vegetarian version of every template', () => {
    for (const t of DIET_TEMPLATES) {
      expect(t.veg).toMatch(/Avoid:/);
      expect(t.nonVeg).toMatch(/Tips:/);
    }
    const diabetes = DIET_TEMPLATES.find((t) => t.id === 'diabetes')!;
    expect(dietTemplateText(diabetes, 'VEG')).toMatch(/^Diabetes \/ high blood sugar — vegetarian diet\n/);
    expect(dietTemplateText(diabetes, 'NON_VEG')).toContain('chicken');
    expect(dietTemplateText(diabetes, 'VEG')).not.toContain('chicken');
  });
});
