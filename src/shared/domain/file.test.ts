import { describe, expect, test } from 'bun:test';

import { BINARY_CONTENT_TYPE, detectContentType, fileExtension, isInlineImage } from './file';

const bytes = (...values: (number | string)[]) =>
  new Uint8Array(
    values.flatMap((value) =>
      typeof value === 'number' ? [value] : [...value].map((char) => char.charCodeAt(0)),
    ),
  );

describe('detectContentType', () => {
  test.each([
    ['image/png', bytes(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a, 0, 0)],
    ['image/jpeg', bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0)],
    ['image/gif', bytes('GIF89a', 0, 0)],
    ['image/webp', bytes('RIFF', 1, 2, 3, 4, 'WEBPVP8 ')],
    ['image/avif', bytes(0, 0, 0, 0x1c, 'ftypavif', 0, 0)],
  ])('recognizes %s by its leading bytes', (type, content) => {
    expect(detectContentType(content)).toBe(type);
    expect(isInlineImage(type)).toBe(true);
  });

  test.each([
    ['an HTML page', bytes('<!doctype html><script>alert(1)</script>')],
    ['an SVG, which can carry script', bytes('<svg xmlns="http://www.w3.org/2000/svg">')],
    ['a RIFF file that is not WebP', bytes('RIFF', 1, 2, 3, 4, 'WAVEfmt ')],
    ['an MP4, which is ftyp but not AVIF', bytes(0, 0, 0, 0x18, 'ftypmp42')],
    ['nothing at all', bytes()],
  ])('treats %s as a download', (_what, content) => {
    const type = detectContentType(content);
    expect(type).toBe(BINARY_CONTENT_TYPE);
    expect(isInlineImage(type)).toBe(false);
  });
});

test('addresses end in an extension CDNs recognize', () => {
  expect(fileExtension('image/jpeg')).toBe('jpg');
  expect(fileExtension(BINARY_CONTENT_TYPE)).toBe('bin');
});
