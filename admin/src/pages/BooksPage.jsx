import { useCallback, useEffect, useRef, useState } from 'react';
import { api, uploadBook } from '../lib/api.js';
import { formatBytes, formatDate, formatLabel } from '../lib/format.js';

const ACCEPTED = '.pdf,.epub,.mobi,.azw3,.txt,.doc,.docx';
const PAGE_SIZE = 25;

export default function BooksPage() {
  const [books, setBooks] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [search, setSearch] = useState('');
  const [activeQuery, setActiveQuery] = useState('');

  const [title, setTitle] = useState('');
  const [extract, setExtract] = useState('');
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(null);
  const fileInput = useRef(null);

  // Which book is open for editing, and the draft values while it is.
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState({ title: '', extract: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (query = '') => {
    setLoading(true);
    try {
      const result = await api.listBooks({ q: query, limit: PAGE_SIZE });
      setBooks(result.books);
      setCursor(result.nextCursor);
      setHasMore(result.hasMore);
      setActiveQuery(query);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Debounced search so a query fires once the admin stops typing rather than
  // on every keystroke.
  useEffect(() => {
    const term = search.trim();
    if (term === activeQuery) return undefined;
    const timer = setTimeout(() => load(term), 350);
    return () => clearTimeout(timer);
  }, [search, activeQuery, load]);

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await api.listBooks({
        q: activeQuery,
        cursor,
        limit: PAGE_SIZE,
      });
      setBooks((current) => [...current, ...result.books]);
      setCursor(result.nextCursor);
      setHasMore(result.hasMore);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingMore(false);
    }
  }

  function resetForm() {
    setTitle('');
    setExtract('');
    setFile(null);
    setProgress(null);
    if (fileInput.current) fileInput.current.value = '';
  }

  async function handleUpload(event) {
    event.preventDefault();
    setError('');
    setNotice('');

    if (!file) {
      setError('Choose a book file to upload.');
      return;
    }

    setProgress(0);
    try {
      const { book } = await uploadBook({
        title,
        extract,
        file,
        onProgress: setProgress,
      });
      // Only prepend when the list is showing everything; during a search the
      // new book may not match, and showing it anyway would be misleading.
      if (!activeQuery) setBooks((current) => [book, ...current]);
      setNotice(`“${book.title}” is now in the library.`);
      resetForm();
    } catch (err) {
      setError(err.message);
      setProgress(null);
    }
  }

  function startEdit(book) {
    setEditingId(book.id);
    setDraft({ title: book.title, extract: book.extract || '' });
    setError('');
    setNotice('');
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft({ title: '', extract: '' });
  }

  async function saveEdit(book) {
    const nextTitle = draft.title.trim();
    if (!nextTitle) {
      setError('The title cannot be empty.');
      return;
    }

    const nextExtract = draft.extract.trim();
    if (nextTitle === book.title && nextExtract === (book.extract || '')) {
      cancelEdit();
      return;
    }

    setSaving(true);
    setError('');
    try {
      await api.updateBook(book.id, { title: nextTitle, extract: nextExtract });
      setBooks((current) =>
        current.map((b) =>
          b.id === book.id ? { ...b, title: nextTitle, extract: nextExtract } : b,
        ),
      );
      setNotice(`“${nextTitle}” was updated.`);
      cancelEdit();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(book) {
    const confirmed = window.confirm(
      `Delete “${book.title}”?\n\nThis removes it from the library and ` +
        `permanently deletes the file from Google Drive. This cannot be undone.\n\n` +
        `To fix a typo, use Edit instead — that keeps the file.`,
    );
    if (!confirmed) return;

    setError('');
    setNotice('');
    try {
      const result = await api.deleteBook(book.id);
      setBooks((current) => current.filter((b) => b.id !== book.id));
      setNotice(result.warning || `“${book.title}” was deleted.`);
    } catch (err) {
      setError(err.message);
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    setDragging(false);
    const dropped = event.dataTransfer.files?.[0];
    if (dropped) setFile(dropped);
  }

  const uploading = progress !== null;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Books</h1>
          <p>Upload a book, give it a title and an extract, and it appears in the app.</p>
        </div>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => load(activeQuery)}
          disabled={loading}
        >
          Refresh
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}

      <form className="card" onSubmit={handleUpload}>
        <div className="card-title">
          <h2>Add a book</h2>
          <p>The file uploads straight to Google Drive, so large books are fine.</p>
        </div>

        <div className="field">
          <label htmlFor="title">Title</label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Introduction to Algorithms"
            maxLength={200}
            required
            disabled={uploading}
          />
        </div>

        <div className="field">
          <label htmlFor="extract">Extract</label>
          <textarea
            id="extract"
            value={extract}
            onChange={(e) => setExtract(e.target.value)}
            placeholder="A short passage or summary students see before opening the book."
            maxLength={5000}
            disabled={uploading}
          />
          <span className="hint">{extract.length} / 5000 characters</span>
        </div>

        <div className="field">
          <label>Book file</label>
          {file ? (
            <div className="file-chosen">
              <div>
                <strong>{file.name}</strong>
                <span>
                  {formatLabel(file.type, file.name)} · {formatBytes(file.size)}
                </span>
              </div>
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => {
                  setFile(null);
                  if (fileInput.current) fileInput.current.value = '';
                }}
                disabled={uploading}
              >
                Change
              </button>
            </div>
          ) : (
            <div
              className={`file-drop${dragging ? ' dragging' : ''}`}
              onClick={() => fileInput.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
            >
              <strong>Choose a file or drag it here</strong>
              <span>PDF, EPUB, MOBI, AZW3, TXT, DOC or DOCX · up to 512 MB</span>
            </div>
          )}
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPTED}
            hidden
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </div>

        {uploading && (
          <div className="field">
            <span className="hint">
              {progress < 100 ? `Uploading… ${progress}%` : 'Finishing up…'}
            </span>
            <div className="progress">
              <div className="progress-bar" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        <div className="btn-row">
          <button type="submit" className="btn-primary" disabled={uploading}>
            {uploading ? 'Uploading…' : 'Add to library'}
          </button>
          {!uploading && (title || extract || file) && (
            <button type="button" className="btn-secondary" onClick={resetForm}>
              Clear
            </button>
          )}
        </div>
      </form>

      <div className="card">
        <div className="card-title">
          <h2>Library</h2>
          <p>
            {activeQuery
              ? `${books.length} ${books.length === 1 ? 'match' : 'matches'} for “${activeQuery}”`
              : `Showing ${books.length}${hasMore ? ' so far' : ''}`}
          </p>
        </div>

        <div className="field">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title…"
            aria-label="Search books by title"
          />
          <span className="hint">
            Matches titles that begin with what you type.
          </span>
        </div>

        {loading ? (
          <div className="empty">Loading…</div>
        ) : books.length === 0 ? (
          <div className="empty">
            {activeQuery ? (
              <>
                <strong>No titles start with “{activeQuery}”</strong>
                Search matches the beginning of a title, so try the first word.
              </>
            ) : (
              <>
                <strong>No books yet</strong>
                Upload the first one using the form above.
              </>
            )}
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Format</th>
                    <th>Size</th>
                    <th>Added</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {books.map((book) =>
                    editingId === book.id ? (
                      <tr key={book.id}>
                        <td colSpan={5}>
                          <div className="field">
                            <label htmlFor={`edit-title-${book.id}`}>Title</label>
                            <input
                              id={`edit-title-${book.id}`}
                              type="text"
                              value={draft.title}
                              onChange={(e) =>
                                setDraft((d) => ({ ...d, title: e.target.value }))
                              }
                              maxLength={200}
                              disabled={saving}
                              autoFocus
                            />
                          </div>
                          <div className="field">
                            <label htmlFor={`edit-extract-${book.id}`}>Extract</label>
                            <textarea
                              id={`edit-extract-${book.id}`}
                              value={draft.extract}
                              onChange={(e) =>
                                setDraft((d) => ({ ...d, extract: e.target.value }))
                              }
                              maxLength={5000}
                              disabled={saving}
                            />
                            <span className="hint">
                              {draft.extract.length} / 5000 characters · the file
                              itself is not changed
                            </span>
                          </div>
                          <div className="btn-row">
                            <button
                              type="button"
                              className="btn-primary btn-sm"
                              onClick={() => saveEdit(book)}
                              disabled={saving}
                            >
                              {saving ? 'Saving…' : 'Save changes'}
                            </button>
                            <button
                              type="button"
                              className="btn-secondary btn-sm"
                              onClick={cancelEdit}
                              disabled={saving}
                            >
                              Cancel
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr key={book.id}>
                        <td>
                          <div className="cell-title">{book.title}</div>
                          {book.extract && (
                            <div className="cell-sub">
                              {book.extract.length > 110
                                ? `${book.extract.slice(0, 110)}…`
                                : book.extract}
                            </div>
                          )}
                        </td>
                        <td>
                          <span className="badge">
                            {formatLabel(book.mimeType, book.fileName)}
                          </span>
                        </td>
                        <td>{formatBytes(book.fileSize)}</td>
                        <td>{formatDate(book.createdAt)}</td>
                        <td>
                          <div className="btn-row">
                            <button
                              type="button"
                              className="btn-secondary btn-sm"
                              onClick={() => startEdit(book)}
                            >
                              Edit
                            </button>
                            {book.webViewLink && (
                              <a
                                className="btn-sm"
                                href={book.webViewLink}
                                target="_blank"
                                rel="noreferrer"
                              >
                                View
                              </a>
                            )}
                            <button
                              type="button"
                              className="btn-danger btn-sm"
                              onClick={() => handleDelete(book)}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>

            {hasMore && (
              <div className="btn-row" style={{ marginTop: 16 }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={loadMore}
                  disabled={loadingMore}
                >
                  {loadingMore ? 'Loading…' : `Load ${PAGE_SIZE} more`}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
