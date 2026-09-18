import { findBestNameMatch } from '../../src/utils/match';

describe('findBestNameMatch', () => {
  const catalog = [
    { name: 'Paracetamol 500mg' },
    { name: 'Amoxicillin 250mg' },
    { name: 'Cough Syrup 100ml' },
  ];

  it('matches exact name case-insensitively', () => {
    expect(findBestNameMatch(catalog, 'paracetamol 500mg')).toEqual(catalog[0]);
    expect(findBestNameMatch(catalog, 'PARACETAMOL 500MG')).toEqual(catalog[0]);
  });

  it('falls back to a substring match when the catalog name contains the needle', () => {
    expect(findBestNameMatch(catalog, 'Amoxicillin')).toEqual(catalog[1]);
  });

  it('falls back to a substring match when the needle contains the catalog name', () => {
    expect(findBestNameMatch(catalog, 'Cough Syrup 100ml Extra Strength')).toEqual(catalog[2]);
  });

  it('returns null for a name with no reasonable match, never throwing', () => {
    expect(findBestNameMatch(catalog, 'Completely Unrelated Drug')).toBeNull();
  });

  it('returns null for an empty or whitespace-only needle', () => {
    expect(findBestNameMatch(catalog, '')).toBeNull();
    expect(findBestNameMatch(catalog, '   ')).toBeNull();
  });

  it('prefers an exact match over a substring match even when both exist', () => {
    const withOverlap = [{ name: 'Vitamin D' }, { name: 'Vitamin D3' }];
    expect(findBestNameMatch(withOverlap, 'Vitamin D')).toEqual(withOverlap[0]);
  });
});
