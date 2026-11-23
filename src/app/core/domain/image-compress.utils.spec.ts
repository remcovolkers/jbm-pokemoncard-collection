import { describe, expect, it } from 'vitest';
import { buildDriveViewUrl, compressScreenshotFile } from './image-compress.utils';

describe('image-compress.utils', () => {
  it('bouwt Google Drive view links en valt veilig terug op screenshotUrl', () => {
    expect(buildDriveViewUrl('abc123', 'https://fallback.example/img.png')).toBe(
      'https://drive.google.com/file/d/abc123/view'
    );
    expect(buildDriveViewUrl('', 'https://fallback.example/img.png')).toBe(
      'https://fallback.example/img.png'
    );
    expect(buildDriveViewUrl()).toBe('');
  });

  it('weigert niet-afbeeldingen met duidelijke Nederlandse foutmelding', async () => {
    const textFile = new File(['hello'], 'notes.txt', { type: 'text/plain' });
    await expect(compressScreenshotFile(textFile)).rejects.toThrow(/geldige afbeelding/);
  });

  it('verwerkt een geldige afbeelding naar base64 + mimeType + dataUrl', async () => {
    const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]);
    const file = new File([pngBytes], 'screen.png', { type: 'image/png' });
    const result = await compressScreenshotFile(file);

    expect(result.mimeType).toBe('image/png');
    expect(result.fileName).toBe('screen.png');
    expect(result.base64.length).toBeGreaterThan(5);
    expect(result.dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(result.sizeKb).toBeGreaterThanOrEqual(1);
  });
});
