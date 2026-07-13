const DRAG_THRESHOLD_PX = 5;

export function reorderWidgets(widgetIds, fromIndex, toIndex) {
  if (fromIndex === toIndex) return [...widgetIds];
  if (fromIndex < 0 || fromIndex >= widgetIds.length) return [...widgetIds];
  if (toIndex < 0 || toIndex >= widgetIds.length) return [...widgetIds];

  const next = [...widgetIds];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function syncDomOrder(grid, widgetIds) {
  for (const id of widgetIds) {
    const card = grid.querySelector(`[data-widget-id="${id}"]`);
    if (card) grid.appendChild(card);
  }
}

function resolveInsertIndex(fromIndex, targetIndex, before) {
  let insertIndex = before ? targetIndex : targetIndex + 1;
  if (fromIndex < insertIndex) insertIndex -= 1;
  return insertIndex;
}

function resolveDropEdge(rect, clientX, clientY) {
  const nx = (clientX - rect.left) / rect.width;
  const ny = (clientY - rect.top) / rect.height;
  const cx = nx - 0.5;
  const cy = ny - 0.5;

  if (Math.abs(cx) > Math.abs(cy)) {
    return { before: nx < 0.5, axis: 'horizontal' };
  }
  return { before: ny < 0.5, axis: 'vertical' };
}

function dropIndicatorClass(before, axis) {
  if (axis === 'horizontal') {
    return before ? 'widget-card--drop-left' : 'widget-card--drop-right';
  }
  return before ? 'widget-card--drop-before' : 'widget-card--drop-after';
}

function getCards(grid) {
  return [...grid.querySelectorAll('.widget-card[data-widget-id]')];
}

function getCardIndex(grid, card) {
  return getCards(grid).indexOf(card);
}

function getCardCenter(card) {
  const rect = card.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function findNeighborCard(cards, currentCard, direction) {
  const current = getCardCenter(currentCard);
  let best = null;
  let bestScore = Infinity;

  for (const card of cards) {
    if (card === currentCard) continue;

    const target = getCardCenter(card);
    const dx = target.x - current.x;
    const dy = target.y - current.y;

    let aligns = false;
    if (direction === 'up' && dy < -1) aligns = true;
    if (direction === 'down' && dy > 1) aligns = true;
    if (direction === 'left' && dx < -1) aligns = true;
    if (direction === 'right' && dx > 1) aligns = true;
    if (!aligns) continue;

    const primary = direction === 'up' || direction === 'down'
      ? Math.abs(dy)
      : Math.abs(dx);
    const secondary = direction === 'up' || direction === 'down'
      ? Math.abs(dx)
      : Math.abs(dy);
    const score = primary + secondary * 0.5;

    if (score < bestScore) {
      bestScore = score;
      best = card;
    }
  }

  return best;
}

function clearDropIndicators(grid) {
  grid.querySelectorAll(
    '.widget-card--drop-before, .widget-card--drop-after, .widget-card--drop-left, .widget-card--drop-right',
  ).forEach((el) => {
    el.classList.remove(
      'widget-card--drop-before',
      'widget-card--drop-after',
      'widget-card--drop-left',
      'widget-card--drop-right',
    );
  });
}

function getCardUnderPointer(x, y, draggingCard) {
  const el = document.elementFromPoint(x, y);
  const card = el?.closest('.widget-card');
  if (!card || card === draggingCard || !card.dataset.widgetId) return null;
  return card;
}

function releasePointerCaptureSafe(handle, pointerId) {
  try {
    if (handle.hasPointerCapture(pointerId)) {
      handle.releasePointerCapture(pointerId);
    }
  } catch (err) {
    if (!(err instanceof DOMException)) throw err;
  }
}

// Drag session owns widget order until cleanup; ignores external config changes.
export function initLayoutDrag(grid, getConfig, saveConfig) {
  let session = null;

  function cleanupSession(rollback = false) {
    if (!session) return;

    const { handle, card, pointerId, originalOrder } = session;
    session = null;

    if (rollback) {
      rollbackDom(originalOrder);
    }

    card.classList.remove('widget-card--dragging');
    clearDropIndicators(grid);
    document.body.classList.remove('is-dragging-widget');

    releasePointerCaptureSafe(handle, pointerId);
  }

  function rollbackDom(originalOrder) {
    syncDomOrder(grid, originalOrder);
  }

  function cancelDrag() {
    if (!session) return;
    cleanupSession(true);
  }

  function commitReorder(fromIndex, insertIndex) {
    if (fromIndex === insertIndex) return;

    const config = getConfig();
    config.widgets = reorderWidgets(config.widgets, fromIndex, insertIndex);
    saveConfig(config);
    syncDomOrder(grid, config.widgets);
  }

  function commitSwap(indexA, indexB) {
    if (indexA === indexB) return;

    const config = getConfig();
    const next = [...config.widgets];
    [next[indexA], next[indexB]] = [next[indexB], next[indexA]];
    config.widgets = next;
    saveConfig(config);
    syncDomOrder(grid, config.widgets);
  }

  function moveCardByKeyboard(card, direction) {
    if (session) return;

    const cards = getCards(grid);
    const fromIndex = getCardIndex(grid, card);
    if (fromIndex === -1) return;

    const neighbor = findNeighborCard(cards, card, direction);
    if (!neighbor) return;

    const toIndex = getCardIndex(grid, neighbor);
    if (toIndex === -1) return;

    commitSwap(fromIndex, toIndex);
    card.querySelector('.widget-drag-handle')?.focus();
  }

  function onPointerDown(event) {
    const handle = event.target.closest('.widget-drag-handle');
    if (!handle || !event.isPrimary || session) return;

    const card = handle.closest('.widget-card');
    if (!card) return;

    const fromIndex = getCardIndex(grid, card);
    if (fromIndex === -1) return;

    session = {
      pointerId: event.pointerId,
      state: 'pending',
      handle,
      card,
      fromIndex,
      insertIndex: fromIndex,
      originalOrder: [...getConfig().widgets],
      startX: event.clientX,
      startY: event.clientY,
    };

    handle.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event) {
    if (!session || event.pointerId !== session.pointerId) return;

    if (session.state === 'pending') {
      const dist = Math.hypot(
        event.clientX - session.startX,
        event.clientY - session.startY,
      );
      if (dist < DRAG_THRESHOLD_PX) return;

      session.state = 'dragging';
      session.card.classList.add('widget-card--dragging');
      document.body.classList.add('is-dragging-widget');
    }

    if (session.state !== 'dragging') return;

    clearDropIndicators(grid);

    const targetCard = getCardUnderPointer(event.clientX, event.clientY, session.card);
    if (!targetCard) {
      session.insertIndex = session.fromIndex;
      return;
    }

    const targetIndex = getCardIndex(grid, targetCard);
    if (targetIndex === -1) return;

    const rect = targetCard.getBoundingClientRect();
    const { before, axis } = resolveDropEdge(rect, event.clientX, event.clientY);
    session.insertIndex = resolveInsertIndex(session.fromIndex, targetIndex, before);

    targetCard.classList.add(dropIndicatorClass(before, axis));
  }

  function onPointerUp(event) {
    if (!session || event.pointerId !== session.pointerId) return;

    if (session.state === 'dragging') {
      commitReorder(session.fromIndex, session.insertIndex);
    }

    cleanupSession();
  }

  function onPointerCancel(event) {
    if (!session || event.pointerId !== session.pointerId) return;
    cancelDrag();
  }

  function onLostPointerCapture(event) {
    if (!session || event.pointerId !== session.pointerId) return;
    cancelDrag();
  }

  const KEY_DIRECTIONS = {
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right',
  };

  function onKeyDown(event) {
    const handle = event.target.closest('.widget-drag-handle');
    if (!handle || session) return;

    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      return;
    }

    const direction = KEY_DIRECTIONS[event.key];
    if (!direction) return;

    event.preventDefault();

    const card = handle.closest('.widget-card');
    if (!card) return;

    moveCardByKeyboard(card, direction);
  }

  grid.addEventListener('pointerdown', onPointerDown);
  grid.addEventListener('pointermove', onPointerMove);
  grid.addEventListener('pointerup', onPointerUp);
  grid.addEventListener('pointercancel', onPointerCancel);
  grid.addEventListener('lostpointercapture', onLostPointerCapture);
  grid.addEventListener('keydown', onKeyDown);
}
