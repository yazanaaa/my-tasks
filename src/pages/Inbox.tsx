import { useMemo } from 'react';
import { Inbox } from 'lucide-react';
import { byCompletedDesc, byPosition, useTaskList } from '../lib/selectors';
import { InlineAdd } from '../components/QuickAdd';
import { SortableGroup, SortableGroups } from '../components/SortableGroups';
import { commitMove, CompletedSection, OverlayRow, SortableTaskRows } from '../components/TaskLists';
import { EmptyState } from '../components/ui';
import { PageTitle } from '../components/PageTitle';

export function InboxPage() {
  const tasks = useTaskList();
  const { groups, done } = useMemo(() => {
    const mine = tasks.filter((t) => !t.projectId && !t.parentId);
    return {
      groups: { inbox: mine.filter((t) => !t.completed).sort(byPosition).map((t) => t.id) },
      done: mine.filter((t) => t.completed).sort(byCompletedDesc),
    };
  }, [tasks]);

  return (
    <div className="page">
      <PageTitle view="inbox" title="الوارد" subtitle="مهام لسا ما إلها مشروع" />
      <SortableGroups groups={groups} renderOverlay={(id) => <OverlayRow id={id} showProject={false} />} onMove={(m) => commitMove(m)}>
        <SortableGroup id="inbox" className="group-drop">
          <SortableTaskRows groupId="inbox" showProject={false} />
        </SortableGroup>
      </SortableGroups>
      <InlineAdd />
      {groups.inbox.length === 0 && (
        <EmptyState color="var(--accent)" icon={<Inbox />} title="الوارد فاضي" body="حط هون المهام اللي لازم تنعمل ولسا ما إلها مشروع. الأفكار الحرة مكانها بصفحة الأفكار." />
      )}
      <CompletedSection tasks={done} showProject={false} />
    </div>
  );
}
