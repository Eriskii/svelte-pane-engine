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
    const animate = vi.spyOn(tab, 'animate').mockReturnValue({ id: '' } as Animation);
    vi.spyOn(tab, 'getAnimations').mockReturnValue([]);

    animateTabMutation(root, () => {});
    expect(animate).not.toHaveBeenCalled();

    animateTabMutation(root, () => {
      left = 24;
    });
    expect(animate).toHaveBeenCalledOnce();
  });

  it('retargets a moving tab from its rendered position', () => {
    const root = document.createElement('div');
    const tab = document.createElement('div');
    tab.className = 'pane-tab';
    tab.dataset.tabPanelId = 'a';
    root.append(tab);
    let layout = 100;
    let translation = 35;
    tab.getBoundingClientRect = () => new DOMRect(layout + translation, 0, 80, 24);
    const running = {
      id: 'pane-tab-shift',
      cancel: vi.fn(() => {
        translation = 0;
      }),
    };
    vi.spyOn(tab, 'getAnimations').mockReturnValue([running as unknown as Animation]);
    const animate = vi.spyOn(tab, 'animate').mockReturnValue({ id: '' } as Animation);

    animateTabMutation(root, () => {
      layout = 20;
    });

    expect(running.cancel).toHaveBeenCalledOnce();
    expect(animate).toHaveBeenCalledWith(
      [{ transform: 'translate(115px, 0px)' }, { transform: 'translate(0, 0)' }],
      expect.any(Object),
    );
  });
});
