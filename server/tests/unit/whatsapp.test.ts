import {
  MetaCloudWhatsAppClient,
  TwilioWhatsAppClient,
  sanitizeTemplateParam,
  toWhatsAppNumber,
} from '../../src/utils/whatsapp';

describe('toWhatsAppNumber', () => {
  it('normalizes the ways an Indian mobile number gets typed to E.164', () => {
    for (const raw of ['9876543210', '98765 43210', '098765-43210', '919876543210', '+91 98765 43210', '+91-98765-43210']) {
      expect(toWhatsAppNumber(raw)).toBe('+919876543210');
    }
  });

  it('keeps an explicit non-Indian country code', () => {
    expect(toWhatsAppNumber('+44 7700 900123')).toBe('+447700900123');
  });

  it('rejects numbers that cannot be real', () => {
    for (const raw of [null, undefined, '', '12345', '555-0100', '+0123456789', 'abc']) {
      expect(toWhatsAppNumber(raw)).toBeNull();
    }
  });
});

describe('sanitizeTemplateParam', () => {
  it('flattens newlines and tabs, which Meta rejects inside a parameter', () => {
    expect(sanitizeTemplateParam('Paracetamol 500mg\nCetirizine 10mg\n\tORS')).toBe('Paracetamol 500mg | Cetirizine 10mg | ORS');
  });

  it('collapses runs of 4+ spaces and never returns an empty parameter', () => {
    expect(sanitizeTemplateParam('a     b')).toBe('a b');
    expect(sanitizeTemplateParam('   ')).toBe('-');
  });

  it('caps very long values', () => {
    const out = sanitizeTemplateParam('x'.repeat(2000));
    expect(out.length).toBe(900);
    expect(out.endsWith('…')).toBe(true);
  });
});

describe('MetaCloudWhatsAppClient.buildRequestBody', () => {
  const client = new MetaCloudWhatsAppClient('token', '12345', 'en', 'v23.0');

  it('sends a template with positional body parameters', () => {
    expect(
      client.buildRequestBody({ to: '+919876543210', templateName: 'followup_reminder', params: ['Anandi', 'Ramesh'] }),
    ).toEqual({
      messaging_product: 'whatsapp',
      to: '919876543210',
      type: 'template',
      template: {
        name: 'followup_reminder',
        language: { code: 'en' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: 'Anandi' },
              { type: 'text', text: 'Ramesh' },
            ],
          },
        ],
      },
    });
  });

  it('repeats a one-time code as the copy-code button parameter', () => {
    const body = client.buildRequestBody({
      to: '+919876543210',
      templateName: 'password_reset_otp',
      params: ['123456'],
      otpCode: '123456',
    });
    expect(body.template.components[1]).toEqual({
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [{ type: 'text', text: '123456' }],
    });
  });
});

describe('TwilioWhatsAppClient.buildRequestBody', () => {
  it('uses the approved template ContentSid and numbered variables when mapped', () => {
    const client = new TwilioWhatsAppClient('AC1', 'secret', '+14155238886', { followup_reminder: 'HX123' });
    const body = client.buildRequestBody({
      to: '+919876543210',
      templateName: 'followup_reminder',
      params: ['Anandi', 'Ramesh'],
    });
    expect(body.get('ContentSid')).toBe('HX123');
    expect(JSON.parse(body.get('ContentVariables')!)).toEqual({ '1': 'Anandi', '2': 'Ramesh' });
    expect(body.get('Body')).toBeNull();
    expect(body.get('To')).toBe('whatsapp:+919876543210');
  });

  it('falls back to plain text for an unmapped template (sandbox only)', () => {
    const client = new TwilioWhatsAppClient('AC1', 'secret', '+14155238886', {});
    const body = client.buildRequestBody({ to: '+919876543210', templateName: 'x', params: ['a', 'b'] });
    expect(body.get('ContentSid')).toBeNull();
    expect(body.get('Body')).toBe('[x] a | b');
  });
});
