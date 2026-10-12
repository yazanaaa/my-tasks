import { resource, t } from './_lib/crud.js';

export default resource({
  table: 'tasks',
  fields: {
    title: t.text({ max: 500, required: true }),
    notes: t.longText(),
    projectId: t.ref('projects'),
    sectionId: t.ref('sections'),
    parentId: t.ref('tasks'),
    priority: t.int(0, 3),
    dueDate: t.date(),
    dueTime: t.time(),
    recurrence: t.recurrence(),
    tags: t.tags(),
    completed: t.bool(),
    pinned: t.bool(),
    completedAt: t.timestamp(),
    position: t.float(),
  },
});
