import { resource, t } from './_lib/crud.js';

export default resource({
  table: 'sections',
  fields: {
    projectId: t.ref('projects', { nullable: false }),
    name: t.text({ max: 120, required: true }),
    position: t.float(),
  },
});
