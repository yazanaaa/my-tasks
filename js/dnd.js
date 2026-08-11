// Pointer-based drag & drop sorting. Works with mouse and touch uniformly.
// axis: 'y' for vertical lists, 'grid' for multi-column grids (RTL aware).

export function makeSortable(container, itemSelector, handleSelector, onReorder, axis = 'y') {
  container.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest(handleSelector);
    if (!handle || !container.contains(handle)) return;
    const item = handle.closest(itemSelector);
    if (!item || item.parentElement !== container) return;
    e.preventDefault();

    let startX = e.clientX;
    let startY = e.clientY;
    let dragging = false;

    const onMove = (ev) => {
      if (!dragging) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return;
        dragging = true;
        item.classList.add('dragging');
        document.body.style.userSelect = 'none';
      }

      item.style.transform = `translate(${ev.clientX - startX}px, ${ev.clientY - startY}px)`;

      const under = document.elementFromPoint(ev.clientX, ev.clientY);
      const target = under ? under.closest(itemSelector) : null;
      if (target && target !== item && target.parentElement === container) {
        const r = target.getBoundingClientRect();
        let before;
        if (axis === 'grid') {
          const sameRow = ev.clientY >= r.top && ev.clientY <= r.bottom;
          // RTL: items flow right-to-left, so pointer on right half = insert before
          before = sameRow ? ev.clientX > r.left + r.width / 2 : ev.clientY < r.top + r.height / 2;
        } else {
          before = ev.clientY < r.top + r.height / 2;
        }
        // Keep the dragged element glued to the pointer across reflows
        const ox = item.offsetLeft;
        const oy = item.offsetTop;
        container.insertBefore(item, before ? target : target.nextSibling);
        startX += item.offsetLeft - ox;
        startY += item.offsetTop - oy;
      }
    };

    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      document.body.style.userSelect = '';
      if (dragging) {
        item.classList.remove('dragging');
        item.style.transform = '';
        const ids = [...container.querySelectorAll(itemSelector)].map((n) => n.dataset.id);
        onReorder(ids);
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    window.addEventListener('pointercancel', onUp, { once: true });
  });
}
