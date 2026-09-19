import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Attachment } from '@opd/shared';
import { TOKEN_KEY } from './client';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000/api';

// A local cache filename never trusts the server-supplied fileName directly
// -- it's display metadata the same way it is server-side (see
// server/src/utils/uploads.ts's comment on the same point), so anything
// that isn't alphanumeric/dot/dash/underscore/space gets collapsed. The
// attachment id is prefixed too, so two different attachments that happen
// to share a display name never collide in the cache.
function safeCacheFileName(attachment: Attachment): string {
  const sanitized = attachment.fileName.replace(/[^a-zA-Z0-9 ._-]/g, '_');
  return `${attachment.id}-${sanitized}`;
}

// Downloads an attachment straight to this device's cache (authenticated --
// a bare fetch/Image.uri can't carry the auth header, but
// FileSystem.downloadAsync takes one directly) and hands it to the native
// share sheet, the same "let the OS decide how to open it" approach the web
// app takes by opening the blob in a new tab. There's no in-app PDF/image
// viewer here -- Sharing.shareAsync's system sheet lets the user view it in
// whatever app the device already has for that file type, save it, or send
// it on, without this app needing to embed a viewer for every mime type it
// might receive.
export async function openAttachment(attachment: Attachment): Promise<void> {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  const fileUri = `${FileSystem.cacheDirectory}${safeCacheFileName(attachment)}`;

  const result = await FileSystem.downloadAsync(`${API_URL}/attachments/${attachment.id}/download`, fileUri, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (result.status !== 200) {
    throw new Error(`Could not download this file (status ${result.status})`);
  }

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error('Sharing is not available on this device');
  }
  await Sharing.shareAsync(result.uri, { mimeType: attachment.mimeType, dialogTitle: attachment.fileName });
}
