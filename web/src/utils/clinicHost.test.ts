import { describe, expect, it } from 'vitest';
import { clinicCodeFromHost } from './clinicHost';

describe('clinicCodeFromHost', () => {
  it("reads the clinic code from the clinic's own address", () => {
    expect(clinicCodeFromHost('anandi.ohmscare.in', 'ohmscare.in')).toBe('anandi');
    expect(clinicCodeFromHost('Sunrise-Clinic.OHMSCARE.in', 'ohmscare.in')).toBe('sunrise-clinic');
  });

  it('is null on the shared app, the API, other domains, nested names and when no domain is set', () => {
    for (const host of ['app.ohmscare.in', 'api.ohmscare.in', 'www.ohmscare.in', 'ohmscare.in', 'a.b.ohmscare.in', 'anandi.example.com', 'localhost']) {
      expect(clinicCodeFromHost(host, 'ohmscare.in')).toBeNull();
    }
    expect(clinicCodeFromHost('anandi.ohmscare.in', undefined)).toBeNull();
  });
});
