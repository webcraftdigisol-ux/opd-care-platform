import { colors } from './theme';

test('theme exposes the expected brand colors', () => {
  expect(colors.teal).toBe('#0B6259');
  expect(colors.gold).toBe('#C8922A');
  expect(Object.values(colors).every((c) => /^#[0-9A-Fa-f]{6}$/.test(c))).toBe(true);
});
