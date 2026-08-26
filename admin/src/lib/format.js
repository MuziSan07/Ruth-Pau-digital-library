// Display helpers shared by the pages.

export function formatBytes(bytes) {
  const value = Number(bytes);
  if (!value || value < 0) return '—';
  if (value < 1024) return `${value} B`;
  const units = ['KB', 'MB', 'GB'];
  let size = value / 1024;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[unit]}`;
}

/**
 * Firestore timestamps arrive from the Admin SDK as { _seconds, _nanoseconds }
 * once serialised to JSON, so handle that alongside plain dates and strings.
 */
export function formatDate(value) {
  if (!value) return '—';
  const date =
    typeof value === 'object' && value._seconds
      ? new Date(value._seconds * 1000)
      : new Date(value);

  if (Number.isNaN(date.getTime())) return '—';

  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

const FORMAT_LABELS = {
  'application/pdf': 'PDF',
  'application/epub+zip': 'EPUB',
  'application/x-mobipocket-ebook': 'MOBI',
  'application/vnd.amazon.ebook': 'AZW3',
  'text/plain': 'TXT',
  'application/msword': 'DOC',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'DOCX',
};

export function formatLabel(mimeType, fileName = '') {
  if (FORMAT_LABELS[mimeType]) return FORMAT_LABELS[mimeType];
  const ext = fileName.split('.').pop();
  return ext && ext !== fileName ? ext.toUpperCase() : 'FILE';
}
