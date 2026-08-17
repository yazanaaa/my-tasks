export const rowToNote = (row) => ({
  id: row.id,
  userId: row.user_id,
  folderId: row.folder_id,
  title: row.title,
  content: row.content,
  isPinned: row.is_pinned,
  isDeleted: row.is_deleted,
  deletedAt: row.deleted_at == null ? null : Number(row.deleted_at),
  createdAt: Number(row.created_at),
  updatedAt: Number(row.updated_at),
});

export const rowToFolder = (row) => ({
  id: row.id,
  userId: row.user_id,
  name: row.name,
  createdAt: Number(row.created_at),
  updatedAt: Number(row.updated_at),
});

export function requestId(req) {
  if (req.query?.id) return String(req.query.id);
  const parts = new URL(req.url, 'http://x').pathname.split('/').filter(Boolean);
  const marker = parts.findIndex((part) => part === 'notes' || part === 'note-folders');
  return marker >= 0 ? decodeURIComponent(parts[marker + 1] || '') : '';
}

export function boolParam(value) {
  return value === true || value === 'true' || value === '1';
}

function textFromHtml(html) {
  return String(html || '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(div|p|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .trim();
}

export function resolvedTitle(title, content) {
  const explicit = String(title || '').trim();
  if (explicit) return explicit.slice(0, 300);
  const firstLine = textFromHtml(content).split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  return (firstLine || 'ملاحظة جديدة').slice(0, 300);
}

export function targetUserId(req, user) {
  const requested = new URL(req.url, 'http://x').searchParams.get('user_id');
  if (!requested || requested === user.id) return user.id;
  return user.role === 'admin' ? requested : null;
}

