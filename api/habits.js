import { resource, t } from './_lib/crud.js';

export default resource({
  table: 'habits',
  fields: {
    name: t.text({ max: 120, required: true }),
    color: t.color(),
    icon: t.text({ max: 40 }),
    days: t.weekdays(),
    archived: t.bool(),
    position: t.float(),
  },
});
