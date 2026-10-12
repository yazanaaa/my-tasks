import { resource, t } from './_lib/crud.js';

export default resource({
  table: 'projects',
  fields: {
    name: t.text({ max: 120, required: true }),
    description: t.longText(),
    color: t.color(),
    icon: t.text({ max: 40 }),
    view: t.oneOf('list', 'board'),
    dueDate: t.date(),
    archived: t.bool(),
    position: t.float(),
  },
});
