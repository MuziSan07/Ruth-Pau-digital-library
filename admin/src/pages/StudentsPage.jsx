import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { formatDate } from '../lib/format.js';

// Ambiguous characters (O/0, l/1) are left out so a password read off a screen
// and typed on a phone does not fail for the wrong reason.
const ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const PAGE_SIZE = 25;

function generatePassword(length = 10) {
  const values = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(values, (n) => ALPHABET[n % ALPHABET.length]).join('');
}

export default function StudentsPage() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [issued, setIssued] = useState(null);

  const [name, setName] = useState('');
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState(() => generatePassword());
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async (query = '') => {
    setLoading(true);
    try {
      const result = await api.listStudents({ q: query, limit: PAGE_SIZE });
      setStudents(result.students);
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

  // Debounced so a query fires once typing stops, not on every keystroke.
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
      const result = await api.listStudents({ cursor, limit: PAGE_SIZE });
      setStudents((current) => [...current, ...result.students]);
      setCursor(result.nextCursor);
      setHasMore(result.hasMore);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleCreate(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    setIssued(null);
    setSaving(true);

    try {
      const result = await api.createStudent({ name, loginId, password });
      // Only prepend when showing the full list; during a search the new
      // account may not match the query, and showing it would mislead.
      if (!activeQuery) setStudents((current) => [result.student, ...current]);
      setIssued(result.credentials);
      setName('');
      setLoginId('');
      setPassword(generatePassword());
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleResetPassword(student) {
    const next = generatePassword();
    const confirmed = window.confirm(
      `Reset the password for ${student.name}?\n\n` +
        `The new password will be: ${next}\n\n` +
        `They will be signed out of the app and must sign in again.`,
    );
    if (!confirmed) return;

    setError('');
    try {
      await api.updateStudent(student.uid, { password: next });
      setIssued({
        loginId: student.loginId,
        password: next,
        note: `Password reset for ${student.name}. Share it with them directly.`,
      });
      setNotice('');
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleToggleAccess(student) {
    const disable = !student.disabled;
    setError('');
    try {
      await api.updateStudent(student.uid, { disabled: disable });
      setStudents((current) =>
        current.map((s) =>
          s.uid === student.uid ? { ...s, disabled: disable } : s,
        ),
      );
      setNotice(
        disable
          ? `${student.name} can no longer sign in.`
          : `${student.name} can sign in again.`,
      );
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(student) {
    const confirmed = window.confirm(
      `Delete ${student.name} (${student.loginId})?\n\n` +
        'Their account is removed permanently. This cannot be undone.\n\n' +
        'To block access temporarily, use Disable instead.',
    );
    if (!confirmed) return;

    setError('');
    try {
      await api.deleteStudent(student.uid);
      setStudents((current) => current.filter((s) => s.uid !== student.uid));
      setNotice(`${student.name} was deleted.`);
    } catch (err) {
      setError(err.message);
    }
  }

  // Filtering now happens in the database rather than over a fully downloaded
  // list, so what the server returned is exactly what to render.
  const visible = students;
  const term = activeQuery;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Students</h1>
          <p>Create accounts and hand out the credentials. Students cannot sign themselves up.</p>
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

      {issued && (
        <div className="credentials">
          <h3>Credentials — copy these now</h3>
          <dl>
            <dt>Login ID</dt>
            <dd className="mono">{issued.loginId}</dd>
            <dt>Password</dt>
            <dd className="mono">{issued.password}</dd>
          </dl>
          <p>
            {issued.note} This password is not stored anywhere and cannot be shown
            again — if it is lost, reset it from the table below.
          </p>
          <div className="btn-row" style={{ marginTop: 12 }}>
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() =>
                navigator.clipboard
                  .writeText(`Login: ${issued.loginId}\nPassword: ${issued.password}`)
                  .then(() => setNotice('Credentials copied to the clipboard.'))
                  .catch(() => setError('Could not copy — select the text by hand.'))
              }
            >
              Copy
            </button>
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => setIssued(null)}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <form className="card" onSubmit={handleCreate}>
        <div className="card-title">
          <h2>Add a student</h2>
          <p>Use a roll number for a simpler login, or an email address if you prefer.</p>
        </div>

        <div className="form-grid">
          <div className="field">
            <label htmlFor="name">Full name</label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ali Raza"
              required
              disabled={saving}
            />
          </div>

          <div className="field">
            <label htmlFor="loginId">Roll number or email</label>
            <input
              id="loginId"
              type="text"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              placeholder="e.g. 2024-CS-101"
              required
              disabled={saving}
            />
            <span className="hint">
              Anything without an @ is treated as a roll number.
            </span>
          </div>
        </div>

        <div className="field">
          <label htmlFor="password">Password</label>
          <div className="btn-row">
            <input
              id="password"
              type="text"
              className="mono"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
              disabled={saving}
              style={{ flex: 1, minWidth: 180 }}
            />
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setPassword(generatePassword())}
              disabled={saving}
            >
              Generate
            </button>
          </div>
          <span className="hint">
            Shown in plain text so you can pass it on — at least 6 characters.
          </span>
        </div>

        <button type="submit" className="btn-primary" disabled={saving}>
          {saving ? 'Creating…' : 'Create student'}
        </button>
      </form>

      <div className="card">
        <div className="card-title">
          <h2>All students</h2>
          <p>
            {term
              ? `${students.length} ${students.length === 1 ? 'match' : 'matches'} for “${term}”`
              : `Showing ${students.length}${hasMore ? ' so far' : ''}`}
          </p>
        </div>

        <div className="field">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or login ID…"
            aria-label="Search students by name or login ID"
          />
          <span className="hint">
            Matches names and roll numbers that begin with what you type.
          </span>
        </div>

        {loading ? (
          <div className="empty">Loading…</div>
        ) : visible.length === 0 ? (
          <div className="empty">
            <strong>{term ? 'No matches' : 'No students yet'}</strong>
            {term ? 'Try a different search.' : 'Create the first account above.'}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Login ID</th>
                  <th>Status</th>
                  <th>Added</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visible.map((student) => (
                  <tr key={student.uid}>
                    <td className="cell-title">{student.name}</td>
                    <td>
                      <div className="mono">{student.loginId}</div>
                      <div className="cell-sub">
                        {student.loginKind === 'rollNumber' ? 'Roll number' : 'Email'}
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${student.disabled ? 'badge-off' : 'badge-ok'}`}>
                        {student.disabled ? 'Disabled' : 'Active'}
                      </span>
                    </td>
                    <td>{formatDate(student.createdAt)}</td>
                    <td>
                      <div className="btn-row">
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          onClick={() => handleResetPassword(student)}
                        >
                          Reset password
                        </button>
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          onClick={() => handleToggleAccess(student)}
                        >
                          {student.disabled ? 'Enable' : 'Disable'}
                        </button>
                        <button
                          type="button"
                          className="btn-danger btn-sm"
                          onClick={() => handleDelete(student)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {hasMore && !term && (
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
      </div>
    </>
  );
}
