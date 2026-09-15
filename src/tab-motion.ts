import { motionDuration, motionEasing, prefersReducedMotion } from './motion.js';

const tabSelector = '.pane-tab[data-tab-panel-id]';
const animationPrefix = 'pane-tab-';

interface TabPosition {
  left: number;
  top: number;
}

export function animateTabMutation(root: HTMLElement, update: () => void): void {
  if (prefersReducedMotion()) {
    update();
    return;
  }

  const before = tabPositions(root);
  const lists = new Map(
    [...root.querySelectorAll<HTMLElement>('.pane-tabs-list')].map((list) => [
      list,
      list.getBoundingClientRect().width,
    ]),
  );
  update();
  for (const list of lists.keys()) cancelMotion(list);
  for (const tab of root.querySelectorAll<HTMLElement>(tabSelector)) {
    const id = tab.dataset.tabPanelId;
    if (!id) continue;
    const previous = before.get(id);
    cancelMotion(tab);
    const current = tab.getBoundingClientRect();
    if (
      previous &&
      Math.abs(previous.left - current.left) < 0.5 &&
      Math.abs(previous.top - current.top) < 0.5
    )
      continue;
    const frames = previous
      ? [
          {
            transform: `translate(${previous.left - current.left}px, ${previous.top - current.top}px)`,
          },
          { transform: 'translate(0, 0)' },
        ]
      : [
          { opacity: 0, transform: 'translateX(-9px)' },
          { opacity: 1, transform: 'translateX(0)' },
        ];
    playMotion(tab, frames, previous ? 'shift' : 'enter');
  }
  for (const [list, previous] of lists) {
    if (!root.contains(list)) continue;
    const current = list.getBoundingClientRect().width;
    if (Math.abs(previous - current) < 0.5) continue;
    // Keep the clipping edge alongside the moving tabs while their layout contracts.
    playMotion(list, [{ width: `${previous}px` }, { width: `${current}px` }], 'resize');
  }
}

function cancelMotion(element: HTMLElement): void {
  for (const animation of element.getAnimations()) {
    if (animation.id.startsWith(animationPrefix)) animation.cancel();
  }
}

function playMotion(element: HTMLElement, frames: Keyframe[], kind: string): void {
  const animation = element.animate(frames, {
    duration: motionDuration(element, '--pane-motion-tab', 190),
    easing: motionEasing(element, '--pane-easing', 'cubic-bezier(0.16, 0.84, 0.24, 1.08)'),
  });
  animation.id = `${animationPrefix}${kind}`;
}

function tabPositions(root: HTMLElement): Map<string, TabPosition> {
  return new Map(
    [...root.querySelectorAll<HTMLElement>(tabSelector)].flatMap((tab) => {
      const id = tab.dataset.tabPanelId;
      if (!id) return [];
      const { left, top } = tab.getBoundingClientRect();
      return [[id, { left, top }] as const];
    }),
  );
}
