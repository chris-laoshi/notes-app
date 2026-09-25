import { storage } from './storage.js';
import { createNote, noteText, updateNote } from './notes.js';
import { icon } from './icons.js';

const listRoot = document.getElementById('list-root');
const composer = document.getElementById('composer');
const composerInput = document.getElementById('composer-input');
const composerAdd = document.getElementById('composer-add');
const composerRow = document.getElementById('composer-row');
const toast = document.getElementById('toast');
const undoButton = document.getElementById('undo');
const themeButton = document.getElementById('theme-toggle');

let notes = [];
let editingId = null;
let completedCollapsed = false;
let pendingUndo = null; // { note, timeoutId }

async function init() {
  await storage.requestPersistence();
  notes = await storage.getAllNotes();
  render();
}

// ---------- Dates ----------

const pad = (n) => String(n).padStart(2, '0');

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function dateTag(date, time) {
  const d = new Date(date + 'T00:00');
  const diff = Math.round((d - startOfToday()) / 86400000);
  const short = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  let kind, label, ic;
  if (diff < 0) { kind = 'overdue'; label = `Overdue · ${short}`; ic = 'alert'; }
  else if (diff === 0) { kind = 'today'; label = 'Today'; ic = 'clock'; }
  else if (diff === 1) { kind = 'upcoming'; label = 'Tomorrow'; ic = 'calendar'; }
  else { kind = 'upcoming'; label = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }); ic = 'calendar'; }
  if (time) label += ` · ${time}`;
  return `<span class="tag ${kind}">${icon(ic)}${label}</span>`;
}

document.getElementById('today-label').textContent =
  startOfToday().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

// ---------- Shared input behaviour ----------

function autoGrow(ta) {
  ta.style.height = 'auto';
  ta.style.height = ta.scrollHeight + 'px';
}

// Enter saves, Shift+Enter inserts a newline, Escape cancels.
function wireInput(ta, onSave, onCancel) {
  ta.addEventListener('input', () => autoGrow(ta));
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); onSave(); }
    if (e.key === 'Escape' && onCancel) { e.preventDefault(); onCancel(); }
  });
}

// "Date" chip that reveals date + time inputs. Returns { el, get(), reset() }.
function dateControl(date, time) {
  const wrap = document.createElement('span');
  wrap.className = 'date-control';
  wrap.innerHTML = `
    <button type="button" class="chip">${icon('calendar')}<span>Date</span></button>
    <span class="date-fields">
      <input type="date" aria-label="Date" />
      <input type="time" aria-label="Time" />
      <button type="button" class="icon-btn small" aria-label="Clear date">${icon('x')}</button>
    </span>`;
  const chip = wrap.querySelector('.chip');
  const fields = wrap.querySelector('.date-fields');
  const [dateInput, timeInput] = wrap.querySelectorAll('input');
  const isOpen = () => fields.classList.contains('open');
  const setOpen = (open) => {
    fields.classList.toggle('open', open);
    chip.classList.toggle('active', open);
  };

  dateInput.value = date || '';
  timeInput.value = time || '';
  setOpen(!!date);

  chip.addEventListener('click', () => {
    setOpen(!isOpen());
    if (isOpen()) dateInput.focus();
  });
  fields.querySelector('.icon-btn').addEventListener('click', () => {
    dateInput.value = '';
    timeInput.value = '';
    setOpen(false);
  });

  return {
    el: wrap,
    get: () => (isOpen() && dateInput.value
      ? { date: dateInput.value, time: timeInput.value || null }
      : { date: null, time: null }),
    reset: () => {
      dateInput.value = '';
      timeInput.value = '';
      setOpen(false);
    },
  };
}

// ---------- Composer ----------

const composerDate = dateControl(null, null);
composerRow.prepend(composerDate.el);
composerAdd.innerHTML = `${icon('plus')}Add`;

async function addFromComposer() {
  const text = composerInput.value.trim();
  if (!text) return;

  const note = createNote({ text, ...composerDate.get() });
  notes.push(note);
  await storage.saveNote(note);
  render({ enterId: note.id });

  composerInput.value = '';
  autoGrow(composerInput);
  composerDate.reset();
  composerAdd.disabled = true;
  composerInput.focus();
}

wireInput(composerInput, addFromComposer);
composerInput.addEventListener('input', () => {
  composerAdd.disabled = !composerInput.value.trim();
});
composer.addEventListener('submit', (event) => {
  event.preventDefault();
  addFromComposer();
});

// ---------- Rendering ----------

const newestFirst = (a, b) => b.createdAt.localeCompare(a.createdAt);

function render({ enterId = null } = {}) {
  listRoot.innerHTML = '';

  if (notes.length === 0) {
    listRoot.innerHTML = `
      <div class="empty">
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="62" r="46" fill="var(--accent-soft)"/>
          <rect x="38" y="30" width="44" height="56" rx="8" fill="var(--surface)" stroke="var(--border)" />
          <rect x="46" y="44" width="28" height="4" rx="2" fill="var(--text-3)" opacity=".6"/>
          <rect x="46" y="54" width="22" height="4" rx="2" fill="var(--text-3)" opacity=".4"/>
          <rect x="46" y="64" width="25" height="4" rx="2" fill="var(--text-3)" opacity=".4"/>
          <path d="M88 26l2.5 6 6 2.5-6 2.5-2.5 6-2.5-6-6-2.5 6-2.5z" fill="var(--accent)"/>
          <path d="M30 80l1.6 3.4 3.4 1.6-3.4 1.6L30 90l-1.6-3.4L25 85l3.4-1.6z" fill="var(--accent)" opacity=".6"/>
        </svg>
        <h2>A clean slate</h2>
        <p>Nothing here yet. Jot down your first thought above,<br />and add a date if it’s something to remember.</p>
      </div>`;
    return;
  }

  const active = notes.filter((n) => !n.done).sort(newestFirst);
  const done = notes.filter((n) => n.done).sort(newestFirst);

  const activeList = document.createElement('div');
  activeList.className = 'list';
  active.forEach((n) => activeList.appendChild(renderCard(n, n.id === enterId)));
  listRoot.appendChild(activeList);

  if (done.length) {
    const label = document.createElement('button');
    label.className = 'section-label' + (completedCollapsed ? ' collapsed' : '');
    label.innerHTML = `${icon('chevron')}Completed · ${done.length}`;
    label.addEventListener('click', () => {
      completedCollapsed = !completedCollapsed;
      render();
    });
    listRoot.appendChild(label);

    if (!completedCollapsed) {
      const doneList = document.createElement('div');
      doneList.className = 'list';
      done.forEach((n) => doneList.appendChild(renderCard(n, n.id === enterId)));
      listRoot.appendChild(doneList);
    }
  }
}

function renderCard(note, entering) {
  if (note.id === editingId) return renderEditor(note);

  const [title, ...rest] = noteText(note).split('\n');
  const card = document.createElement('article');
  card.className = 'card' + (note.done ? ' done' : '') + (entering ? ' enter' : '');
  card.innerHTML = `
    <button class="check" aria-label="${note.done ? 'Mark not done' : 'Mark done'}">${icon('check')}</button>
    <div class="content">
      <div class="title"></div>
      ${rest.length ? '<div class="body"></div>' : ''}
      ${note.date ? `<div class="tags">${dateTag(note.date, note.time)}</div>` : ''}
    </div>
    <div class="actions">
      <button class="icon-btn edit" aria-label="Edit">${icon('pencil')}</button>
      <button class="icon-btn danger delete" aria-label="Delete">${icon('trash')}</button>
    </div>`;
  card.querySelector('.title').textContent = title;
  if (rest.length) card.querySelector('.body').textContent = rest.join('\n');

  card.querySelector('.check').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleDone(note, card);
  });
  card.querySelector('.delete').addEventListener('click', (e) => {
    e.stopPropagation();
    deleteNoteWithUndo(note, card);
  });
  // Clicking anywhere else on the card (including the pencil) opens the editor.
  card.addEventListener('click', () => startEditing(note.id));
  return card;
}

function startEditing(id) {
  editingId = id;
  render();
}

function renderEditor(note) {
  const card = document.createElement('article');
  card.className = 'card editing';
  card.innerHTML = `
    <div class="editor">
      <textarea class="note-input" rows="1" aria-label="Note text"></textarea>
      <div class="input-row">
        <span class="spacer"></span>
        <span class="hint"><kbd>Enter</kbd> to save · <kbd>Esc</kbd> to cancel</span>
        <button type="button" class="btn ghost cancel">Cancel</button>
        <button type="button" class="btn primary save">Save</button>
      </div>
    </div>`;
  const ta = card.querySelector('textarea');
  const editDate = dateControl(note.date, note.time);
  card.querySelector('.input-row').prepend(editDate.el);
  ta.value = noteText(note);

  const save = async () => {
    const text = ta.value.trim();
    if (!text) return;
    updateNote(note, { text, ...editDate.get() });
    editingId = null;
    await storage.saveNote(note);
    render();
  };
  const cancel = () => {
    editingId = null;
    render();
  };

  wireInput(ta, save, cancel);
  card.querySelector('.save').addEventListener('click', save);
  card.querySelector('.cancel').addEventListener('click', cancel);

  requestAnimationFrame(() => {
    autoGrow(ta);
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  });
  return card;
}

// ---------- Actions ----------

// Collapses a card out of the list, then calls `done`.
function leave(card, done) {
  card.style.height = card.offsetHeight + 'px';
  card.offsetHeight; // force reflow so the height transition starts from here
  card.classList.add('leaving');
  card.style.height = '0px';
  setTimeout(done, 300);
}

async function toggleDone(note, card) {
  note.done = !note.done;
  note.updatedAt = new Date().toISOString();
  card.classList.toggle('done', note.done);
  const check = card.querySelector('.check');
  check.classList.remove('pop');
  check.offsetWidth; // restart the animation
  check.classList.add('pop');
  await storage.saveNote(note);
  // Let the tick + strikethrough register, then move the card to its section.
  setTimeout(() => leave(card, () => render({ enterId: note.id })), 450);
}

function deleteNoteWithUndo(note, card) {
  leave(card, async () => {
    notes = notes.filter((n) => n.id !== note.id);
    await storage.deleteNote(note.id);
    render();
    showUndo(note);
  });
}

function showUndo(note) {
  if (pendingUndo) clearTimeout(pendingUndo.timeoutId);
  toast.classList.add('show');
  const timeoutId = setTimeout(() => {
    toast.classList.remove('show');
    pendingUndo = null;
  }, 5000);
  pendingUndo = { note, timeoutId };
}

undoButton.addEventListener('click', async () => {
  if (!pendingUndo) return;
  clearTimeout(pendingUndo.timeoutId);
  const { note } = pendingUndo;
  pendingUndo = null;
  toast.classList.remove('show');

  notes.push(note);
  await storage.saveNote(note);
  render({ enterId: note.id });
});

// ---------- Theme ----------

const THEME_KEY = 'notes-theme';

function isDark() {
  const theme = document.documentElement.dataset.theme;
  return theme ? theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
}

function paintThemeButton() {
  themeButton.innerHTML = icon(isDark() ? 'sun' : 'moon');
}

try {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved) document.documentElement.dataset.theme = saved;
} catch (err) {
  // Storage blocked (e.g. private mode) — fall back to the system theme.
}

themeButton.addEventListener('click', () => {
  const next = isDark() ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem(THEME_KEY, next); } catch (err) {}
  paintThemeButton();
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', paintThemeButton);
paintThemeButton();

init();
