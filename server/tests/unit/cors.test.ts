import { corsOrigins } from '../../src/utils/cors';

const allows = (list: ReturnType<typeof corsOrigins>, origin: string) =>
  list === '*' || list.some((o) => (typeof o === 'string' ? o === origin : o.test(origin)));

describe('corsOrigins', () => {
  it('allows any origin when unset', () => {
    expect(corsOrigins(undefined)).toBe('*');
  });

  it('allows the listed origins and one-label subdomains of a "*." entry, nothing else', () => {
    const list = corsOrigins('https://app.ohmscare.in, https://*.ohmscare.in');
    expect(allows(list, 'https://app.ohmscare.in')).toBe(true);
    expect(allows(list, 'https://anandi.ohmscare.in')).toBe(true);
    expect(allows(list, 'https://a.b.ohmscare.in')).toBe(false);
    expect(allows(list, 'http://anandi.ohmscare.in')).toBe(false);
    expect(allows(list, 'https://anandi.ohmscare.in.evil.com')).toBe(false);
    expect(allows(list, 'https://evilohmscare.in')).toBe(false);
    expect(allows(list, 'https://ohmscare.in')).toBe(false);
  });
});
