import { makeCoverPhoto, movePhoto } from '@dagestan/shared';
import { describe, expect, it } from 'vitest';

/** Порядок фотографий: первая — обложка (ТЗ, п. 2). */
describe('Порядок фотографий', () => {
  const photos = ['a', 'b', 'c', 'd'];

  it('«★» делает фото обложкой, порядок остальных сохраняется', () => {
    expect(makeCoverPhoto(photos, 2)).toEqual(['c', 'a', 'b', 'd']);
    expect(makeCoverPhoto(photos, 3)[0]).toBe('d');
  });

  it('обложка остаётся обложкой; неверный номер ничего не меняет', () => {
    expect(makeCoverPhoto(photos, 0)).toEqual(photos);
    expect(makeCoverPhoto(photos, 9)).toEqual(photos);
  });

  it('стрелки меняют фото с соседом', () => {
    expect(movePhoto(photos, 0, 1)).toEqual(['b', 'a', 'c', 'd']);
    expect(movePhoto(photos, 2, -1)).toEqual(['a', 'c', 'b', 'd']);
  });

  it('за края не сдвигается', () => {
    expect(movePhoto(photos, 0, -1)).toEqual(photos);
    expect(movePhoto(photos, 3, 1)).toEqual(photos);
  });

  it('исходный список не меняется', () => {
    const copy = [...photos];
    movePhoto(photos, 1, 1);
    makeCoverPhoto(photos, 2);
    expect(photos).toEqual(copy);
  });
});
