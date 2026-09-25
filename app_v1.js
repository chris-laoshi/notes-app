import { storage } from './storage.js';
import { createNote, noteText } from './notes_v1.js';

const listEl = document.getElementById('notes-list');
const form = document.getElementById('quick-add');
const textInput = document.getElementById('quick-add-text');
const dateToggle = document.getElementById('quick-add-date-toggle');
const dateInput = document.getElementById('quick-add-date');
const timeInput = document.getElementById('quick-add-time');

const undoToast = document.getElementById('undo-toast');
const undoMessage = document.getElementById('undo-message');
const undoButton = document.getElementById('undo-button');

let notes = [];
let pendingUndo = null; // { note, timeoutId }

async function init() {
  await storage.requestPersistence();
  notes = await storage.getAllNotes();
  render();
}

function render() {
  listEl.innerHTML = '';

  if (notes.length === 0) {
    listEl.innerHTML = '<div class="empty-state">No notes yet. Add one above.</div>';
    return;
  }

  const sorted = [...notes].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  for (const note of sorted) {
    listEl.appendChild(renderNoteCard(note));
  }
}

function renderNoteCard(note) {
  const card = document.createElement('div');
  card.className = 'note-card' + (note.done ? ' done' : '');

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'note-checkbox';
  checkbox.checked = note.done;
  checkbox.addEventListener('change', () => toggleDone(note.id, checkbox.checked));

  const body = document.createElement('div');
  body.className = 'note-body';

  const text = document.createElement('div');
  text.className = 'note-text';
  text.textContent = noteText(note);
  body.appendChild(text);

  if (note.date) {
    const meta = document.createElement('div');
    meta.className = 'note-meta';
    meta.textContent = note.time ? `${note.date} at ${note.time}` : note.date;
    body.appendChild(meta);
  }

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'note-delete';
  deleteBtn.textContent = 'Delete';
  deleteBtn.addEventListener('click', () => deleteNoteWithUndo(note));

  card.appendChild(checkbox);
  card.appendChild(body);
  card.appendChild(deleteBtn);
  return card;
}

async function toggleDone(id, done) {
  const note = notes.find((n) => n.id === id);
  if (!note) return;
  note.done = done;
  note.updatedAt = new Date().toISOString();
  await storage.saveNote(note);
  render();
}

async function deleteNoteWithUndo(note) {
  notes = notes.filter((n) => n.id !== note.id);
  await storage.deleteNote(note.id);
  render();
  showUndo(note);
}

function showUndo(note) {
  if (pendingUndo) {
    clearTimeout(pendingUndo.timeoutId);
  }

  undoMessage.textContent = 'Note deleted.';
  undoToast.classList.remove('hidden');

  const timeoutId = setTimeout(() => {
    undoToast.classList.add('hidden');
    pendingUndo = null;
  }, 5000);

  pendingUndo = { note, timeoutId };
}

undoButton.addEventListener('click', async () => {
  if (!pendingUndo) return;
  clearTimeout(pendingUndo.timeoutId);
  const { note } = pendingUndo;
  pendingUndo = null;
  undoToast.classList.add('hidden');

  notes.push(note);
  await storage.saveNote(note);
  render();
});

dateToggle.addEventListener('change', () => {
  dateInput.classList.toggle('hidden', !dateToggle.checked);
  timeInput.classList.toggle('hidden', !dateToggle.checked);
  if (!dateToggle.checked) {
    dateInput.value = '';
    timeInput.value = '';
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const text = textInput.value.trim();
  if (!text) return;

  const note = createNote({
    text,
    date: dateToggle.checked && dateInput.value ? dateInput.value : null,
    time: dateToggle.checked && timeInput.value ? timeInput.value : null,
  });

  notes.push(note);
  await storage.saveNote(note);
  render();

  form.reset();
  dateInput.classList.add('hidden');
  timeInput.classList.add('hidden');
  textInput.focus();
});

init();
