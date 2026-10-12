import { resource, t } from './_lib/crud.js';

export default resource({
  table: 'ideas',
  fields: {
    text: t.text({ max: 4000, required: true }),
    tags: t.tags(),
    color: t.color(),
    pinned: t.bool(),
    archived: t.bool(),
    source: t.oneOf('app', 'palette', 'share', 'link', 'draft', 'import'),
    taskId: t.ref('tasks'),
    projectId: t.ref('projects'),
    convertedAt: t.timestamp(),
    surfacedAt: t.timestamp(),
  },
});
