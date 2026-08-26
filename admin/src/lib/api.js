// Thin client for the /api/* routes. Attaches the caller's Firebase ID token
// to every request so the server can verify they are an admin.

import { auth } from './firebase.js';

async function authHeader() {
  const user = auth.currentUser;
  if (!user) throw new Error('You are signed out. Sign in again.');
  // getIdToken refreshes automatically when the current token is near expiry.
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

async function request(path, { method = 'GET', body } = {}) {
  const headers = await authHeader();
  if (body) headers['Content-Type'] = 'application/json';

  const response = await fetch(`/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch {
    // A non-JSON response means the function crashed before it could reply.
    if (!response.ok) {
      throw new Error(
        `The server returned ${response.status} with no details. ` +
          'Check the Vercel function logs.',
      );
    }
  }

  if (!response.ok) {
    throw new Error(payload.error || `Request failed (${response.status}).`);
  }
  return payload;
}

export const api = {
  listStudents: () => request('/students'),
  createStudent: (data) => request('/students', { method: 'POST', body: data }),
  updateStudent: (uid, data) =>
    request(`/students/${uid}`, { method: 'PATCH', body: data }),
  deleteStudent: (uid) => request(`/students/${uid}`, { method: 'DELETE' }),

  listBooks: () => request('/books'),
  updateBook: (id, data) => request(`/books/${id}`, { method: 'PATCH', body: data }),
  deleteBook: (id) => request(`/books/${id}`, { method: 'DELETE' }),
};

/**
 * Uploads a book in two steps:
 *   1. ask our API for a Google-issued resumable upload URL
 *   2. PUT the bytes straight to Google, reporting progress
 *   3. tell our API the file id so it becomes a catalogue entry
 *
 * The bytes never touch the serverless function, which is what keeps large
 * files working — Vercel would reject anything over 4.5 MB.
 */
export async function uploadBook({ title, extract, file, onProgress }) {
  const { uploadUrl } = await request('/books/upload-session', {
    method: 'POST',
    body: {
      fileName: file.name,
      mimeType: file.type,
      fileSize: file.size,
    },
  });

  const driveFile = await putToDrive({ uploadUrl, file, onProgress });

  return request('/books', {
    method: 'POST',
    body: {
      title,
      extract,
      fileId: driveFile.id,
      fileName: file.name,
      mimeType: file.type,
    },
  });
}

// XMLHttpRequest rather than fetch: it is still the only way to observe
// upload progress in the browser.
function putToDrive({ uploadUrl, file, onProgress }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl, true);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !onProgress) return;
      onProgress(Math.round((event.loaded / event.total) * 100));
    };

    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(
          new Error(
            `Google Drive rejected the upload (${xhr.status}). ${xhr.responseText}`,
          ),
        );
        return;
      }
      try {
        resolve(JSON.parse(xhr.responseText));
      } catch {
        reject(new Error('Drive returned an unreadable response.'));
      }
    };

    xhr.onerror = () =>
      reject(new Error('The upload failed. Check your network connection.'));
    xhr.onabort = () => reject(new Error('The upload was cancelled.'));

    xhr.send(file);
  });
}
