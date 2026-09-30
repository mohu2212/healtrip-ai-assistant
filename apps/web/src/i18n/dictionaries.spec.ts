import { dictionaries } from './dictionaries';

type Tree = { [key: string]: unknown };

function leaves(tree: unknown, prefix = ''): [string, unknown][] {
  if (tree === null || typeof tree !== 'object') return [[prefix, tree]];
  return Object.entries(tree as Tree).flatMap(([key, value]) =>
    leaves(value, prefix ? `${prefix}.${key}` : key),
  );
}

describe('dictionaries', () => {
  const en = leaves(dictionaries.en);
  const ar = leaves(dictionaries.ar);

  it('have exactly the same keys in English and Arabic', () => {
    expect(ar.map(([k]) => k).sort()).toEqual(en.map(([k]) => k).sort());
  });

  it('have no empty strings', () => {
    for (const [key, value] of [...en, ...ar]) {
      if (typeof value === 'string') expect(value.trim(), key).not.toBe('');
    }
  });

  it('keep the same placeholders in both languages', () => {
    const placeholders = (s: unknown) =>
      typeof s === 'string' ? (s.match(/\{\w+\}/g) ?? []).sort() : [];
    const arByKey = new Map(ar);
    for (const [key, value] of en)
      expect(placeholders(arByKey.get(key)), key).toEqual(placeholders(value));
  });

  it('actually translates the Arabic UI', () => {
    expect(dictionaries.ar.composer.send).toMatch(/[؀-ۿ]/);
  });
});
