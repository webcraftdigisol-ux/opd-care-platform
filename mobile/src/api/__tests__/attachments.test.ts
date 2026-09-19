import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { Attachment } from '@opd/shared';
import { openAttachment } from '../attachments';
import { TOKEN_KEY } from '../client';

jest.mock('expo-file-system', () => ({
  cacheDirectory: 'file:///mock-cache/',
  downloadAsync: jest.fn(),
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}));

const mockDownloadAsync = FileSystem.downloadAsync as jest.MockedFunction<typeof FileSystem.downloadAsync>;
const mockIsAvailableAsync = Sharing.isAvailableAsync as jest.MockedFunction<typeof Sharing.isAvailableAsync>;
const mockShareAsync = Sharing.shareAsync as jest.MockedFunction<typeof Sharing.shareAsync>;

function makeAttachment(overrides: Partial<Attachment> = {}): Attachment {
  return {
    id: 'att-1',
    patientId: 'patient-1',
    category: 'LAB_REPORT',
    entityId: 'invoice-1',
    fileName: 'cbc-report.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1234,
    uploadedById: 'user-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('openAttachment (mobile)', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  it('downloads with the auth token as a Bearer header and shares the result', async () => {
    await AsyncStorage.setItem(TOKEN_KEY, 'test-jwt-token');
    mockDownloadAsync.mockResolvedValue({ uri: 'file:///mock-cache/att-1-cbc-report.pdf', status: 200 } as any);
    mockIsAvailableAsync.mockResolvedValue(true);

    const attachment = makeAttachment();
    await openAttachment(attachment);

    expect(mockDownloadAsync).toHaveBeenCalledTimes(1);
    const [url, fileUri, options] = mockDownloadAsync.mock.calls[0];
    expect(url).toMatch(/\/attachments\/att-1\/download$/);
    expect(fileUri).toBe('file:///mock-cache/att-1-cbc-report.pdf');
    expect(options).toEqual({ headers: { Authorization: 'Bearer test-jwt-token' } });

    expect(mockShareAsync).toHaveBeenCalledWith('file:///mock-cache/att-1-cbc-report.pdf', {
      mimeType: 'application/pdf',
      dialogTitle: 'cbc-report.pdf',
    });
  });

  it('sanitizes an unsafe filename before using it as a local cache path', async () => {
    mockDownloadAsync.mockResolvedValue({ uri: 'file:///mock-cache/whatever', status: 200 } as any);
    mockIsAvailableAsync.mockResolvedValue(true);

    await openAttachment(makeAttachment({ fileName: '../../etc/passwd' }));

    const [, fileUri] = mockDownloadAsync.mock.calls[0];
    expect(fileUri.startsWith('file:///mock-cache/')).toBe(true);
    // No slash survives sanitization -- without one, ".." characters have
    // no directory separator to traverse through, so they're inert.
    const localName = fileUri.replace('file:///mock-cache/', '');
    expect(localName).not.toContain('/');
  });

  it('throws when the download does not return HTTP 200', async () => {
    mockDownloadAsync.mockResolvedValue({ uri: 'file:///mock-cache/x', status: 404 } as any);

    await expect(openAttachment(makeAttachment())).rejects.toThrow(/404/);
    expect(mockShareAsync).not.toHaveBeenCalled();
  });

  it('throws when sharing is not available on the device, without leaving the file dangling silently', async () => {
    mockDownloadAsync.mockResolvedValue({ uri: 'file:///mock-cache/x', status: 200 } as any);
    mockIsAvailableAsync.mockResolvedValue(false);

    await expect(openAttachment(makeAttachment())).rejects.toThrow(/[Ss]haring is not available/);
    expect(mockShareAsync).not.toHaveBeenCalled();
  });

  it('sends no Authorization header when there is no stored token', async () => {
    mockDownloadAsync.mockResolvedValue({ uri: 'file:///mock-cache/x', status: 200 } as any);
    mockIsAvailableAsync.mockResolvedValue(true);

    await openAttachment(makeAttachment());

    const [, , options] = mockDownloadAsync.mock.calls[0];
    expect(options).toEqual({ headers: {} });
  });
});
