import { trailingFieldsStart } from '../../../services/tasks-plugin/tasks-fields';

/** What `trailingFieldsStart` reads as the run of fields, so a case can be stated as text. */
function fieldsOf(text: string): string {
  return text.slice(trailingFieldsStart(text));
}

describe('trailingFieldsStart', () => {
  it.each([
    ['Buy milk 🔼', '🔼'],
    ['Buy milk 📅 2026-09-20', '📅 2026-09-20'],
    ['Buy milk 📆 2026-09-20', '📆 2026-09-20'],
    ['Buy milk 🗓️ 2026-09-20', '🗓️ 2026-09-20'],
    ['Buy milk ⏳ 2026-09-20', '⏳ 2026-09-20'],
    ['Buy milk 🛫 2026-09-20', '🛫 2026-09-20'],
    ['Buy milk ➕ 2026-09-20', '➕ 2026-09-20'],
    ['Buy milk ✅ 2026-09-20', '✅ 2026-09-20'],
    ['Buy milk ❌ 2026-09-20', '❌ 2026-09-20'],
    ['Buy milk 🔁 every week on Monday', '🔁 every week on Monday'],
    ['Buy milk 🏁 delete', '🏁 delete'],
    ['Buy milk 🆔 abc123', '🆔 abc123'],
    ['Buy milk ⛔ abc123,def456', '⛔ abc123,def456'],
  ])('reads the emoji field of %s', (text, fields) => {
    expect(fieldsOf(text)).toBe(fields);
  });

  it.each([
    ['Buy milk  [priority:: high]', '[priority:: high]'],
    ['Buy milk  [due:: 2026-09-20]', '[due:: 2026-09-20]'],
    ['Buy milk  (due:: 2026-09-20)', '(due:: 2026-09-20)'],
    ['Buy milk  [scheduled:: 2026-09-20]', '[scheduled:: 2026-09-20]'],
    ['Buy milk  [start:: 2026-09-20]', '[start:: 2026-09-20]'],
    ['Buy milk  [created:: 2026-09-20]', '[created:: 2026-09-20]'],
    ['Buy milk  [completion:: 2026-09-20]', '[completion:: 2026-09-20]'],
    ['Buy milk  [cancelled:: 2026-09-20]', '[cancelled:: 2026-09-20]'],
    ['Buy milk  [repeat:: every day]', '[repeat:: every day]'],
    ['Buy milk  [onCompletion:: delete]', '[onCompletion:: delete]'],
    ['Buy milk  [id:: abc123]', '[id:: abc123]'],
    ['Buy milk  [dependsOn:: abc123, def456]', '[dependsOn:: abc123, def456]'],
  ])('reads the Dataview field of %s', (text, fields) => {
    expect(fieldsOf(text)).toBe(fields);
  });

  it('reads a whole run of fields as the Tasks plugin writes it', () => {
    expect(fieldsOf('Buy milk 🔼 📅 2026-09-20 ✅ 2026-09-21')).toBe('🔼 📅 2026-09-20 ✅ 2026-09-21');
  });

  it('reads a run mixing both formats', () => {
    expect(fieldsOf('Buy milk [due:: 2026-09-20] ✅ 2026-09-21')).toBe('[due:: 2026-09-20] ✅ 2026-09-21');
  });

  it('reads a tag standing among the fields as part of the run', () => {
    expect(fieldsOf('Buy milk 📅 2026-09-20 #errands ✅ 2026-09-21')).toBe('📅 2026-09-20 #errands ✅ 2026-09-21');
  });

  it('reads a tag after the last field as part of the run', () => {
    expect(fieldsOf('Buy milk 📅 2026-09-20 #errands')).toBe('📅 2026-09-20 #errands');
  });

  it('leaves a tag before the first field out of the run', () => {
    expect(fieldsOf('Buy #a 📅 2026-09-20 #b')).toBe('📅 2026-09-20 #b');
  });

  it('finds no run in a text ending in tags alone', () => {
    expect(fieldsOf('Buy milk #errands #urgent')).toBe('');
  });

  it('finds no run in a text without fields', () => {
    expect(fieldsOf('Buy milk')).toBe('');
  });

  it.each([
    ['a field followed by plain text', 'Pay 📅 2026-09-20 at the bank'],
    ['a Dataview field whose key the Tasks plugin does not use', 'Buy milk [store:: corner shop]'],
    ['a Dataview field with a value the Tasks plugin does not accept', 'Buy milk [due:: tomorrow]'],
    ['a date that is not written in full', 'Buy milk 📅 2026-9-20'],
  ])('finds no run in %s', (_case, text) => {
    expect(fieldsOf(text)).toBe('');
  });

  it('stops the run at plain text, leaving an earlier field in the title', () => {
    expect(fieldsOf('Pay 📅 2026-09-20 at the bank ✅ 2026-09-21')).toBe('✅ 2026-09-21');
  });
});
