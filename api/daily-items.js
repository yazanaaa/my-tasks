import { resource, t } from './_lib/crud.js';

// «يومية» checklist items. checkedAt is the last tick; the client treats anything before the latest
// 5 AM as unchecked, and the reset button clears it.
export default resource({
  table: 'daily_items',
  fields: {
    title: t.text({ max: 300, required: true }),
    checkedAt: t.timestamp(),
    position: t.float(),
  },
});
