import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { animateTabMutation } from '../src/tab-motion';

beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false })),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('tab motion', () => {
  it('does not restart animation for a stationary tab', () => {
    const root = document.createElement('div');
    const tab = document.createElement('button');
    tab.className = 'pane-tab';
    tab.dataset.tabPanelId = 'a';
    const content = document.createElement('span');
    content.className = 'pane-tab-content';
    tab.append(content);
    root.append(tab);
    let left = 10;
    tab.getBoundingClientRect = () => new DOMRect(left, 20, 80, 24);
    const animate = vi.spyOn(content, 'animate').mockReturnValue({ id: '' } as Animation);
    vi.spyOn(content, 'getAnimations').mockReturnValue([]);

    animateTabMutation(root, () => {});
    expect(animate).not.toHaveBeenCalled();

    animateTabMutation(root, () => {
      left = 24;
    });
    expect(animate).toHaveBeenCalledOnce();
  });
});
