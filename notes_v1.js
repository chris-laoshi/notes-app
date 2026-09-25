// notes_v1.js
// Helpers for creating and reading note objects. A note's content is an
// ordered list of "blocks" (currently just text; table blocks come later)
// rather than one string, so new block types can be added without
// restructuring existing notes.

export function createNote({ text = '', date = null, time = null } = {}) {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    date, // 'YYYY-MM-DD' or null (no date = plain note)
    time, // 'HH:MM' or null
    done: false,
    blocks: [{ type: 'text', content: text }],
  };
}

// Plain-text content of a note, used for display and (later) search.
export function noteText(note) {
  return note.blocks
    .filter((block) => block.type === 'text')
    .map((block) => block.content)
    .join('\n');
}
