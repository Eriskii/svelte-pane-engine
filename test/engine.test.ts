import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PaneEngine,
  type PaneGroupExtensionContext,
  type PanePanelRenderContext,
  type PanePanelRenderer,
  type PanePanelState,
} from '../src/engine';

let reducedMotion = true;

beforeEach(() => {
  reducedMotion = true;
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: reducedMotion,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
});

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function setup() {
  const host = document.createElement('div');
  Object.defineProperties(host, {
    clientWidth: { configurable: true, value: 800 },
    clientHeight: { configurable: true, value: 600 },
  });
  host.getBoundingClientRect = () => new DOMRect(0, 0, 800, 600);
  document.body.append(host);
  const renderers = new Map<
    string,
    PanePanelRenderer & {
      dispose: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    }
  >();
  const engine = new PaneEngine(host, {
    motionDuration: 0,
    createRenderer(panel) {
      const renderer = {
        element: document.createElement('article'),
        dispose: vi.fn(),
        update: vi.fn(
          (_panel: PanePanelState, _visible: boolean, _context: PanePanelRenderContext) => {},
        ),
      };
      renderer.element.append(document.createElement('span'));
      renderers.set(panel.id, renderer);
      return renderer;
    },
  });
  return { engine, host, renderers };
}

const panel = (id: string) => ({ id, component: 'test', title: id });

describe('PaneEngine DOM contracts', () => {
  it('keeps ordered tab and renderer nodes in place for activation and unchanged updates', () => {
    const { engine, renderers } = setup();
    const first = engine.addPanel(panel('a'));
    engine.addPanel({
      ...panel('b'),
      position: { referenceGroupId: first.groupId!, direction: 'within' },
    });
    const elements = engine.groupElements(first.groupId!)!;
    const tabs = [...elements.tabList.children];
    const contents = [...elements.content.children];
    expect(elements.tabElement('a')).toBe(tabs[0]);
    expect(elements.tabElement('missing')).toBeUndefined();
    const observer = new MutationObserver(() => {});
    observer.observe(elements.element, { childList: true, characterData: true, subtree: true });

    engine.activatePanel('a');
    engine.updatePanel('a', { params: { unchangedTitle: true } });

    expect(observer.takeRecords()).toEqual([]);
    expect([...elements.tabList.children]).toEqual(tabs);
    expect([...elements.content.children]).toEqual(contents);
    expect(renderers.get('a')!.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'a' }),
      true,
      expect.objectContaining({
        group: expect.objectContaining({ id: first.groupId }),
        elements,
      }),
    );
    engine.dispose();
  });

  it('activates a tab without running tab-mutation animation', () => {
    const { engine } = setup();
    const first = engine.addPanel(panel('a'));
    engine.addPanel({
      ...panel('b'),
      position: { referenceGroupId: first.groupId!, direction: 'within' },
    });
    const tabs = [
      ...engine.groupElements(first.groupId!)!.tabList.querySelectorAll<HTMLElement>('.pane-tab'),
    ];
    const animate = tabs.map((tab, index) => {
      tab.getBoundingClientRect = () =>
        new DOMRect(tab.classList.contains('pane-tab-active') ? index * 100 : index * 100 + 10, 0);
      const content = tab.querySelector<HTMLElement>('.pane-tab-content')!;
      vi.spyOn(content, 'getAnimations').mockReturnValue([]);
      return vi.spyOn(content, 'animate').mockReturnValue({ id: '' } as Animation);
    });
    reducedMotion = false;

    engine.activatePanel('a');

    expect(animate.every((spy) => spy.mock.calls.length === 0)).toBe(true);
    engine.dispose();
  });

  it('owns group extension creation, updates, refresh, and disposal', () => {
    const { engine } = setup();
    const first = engine.addPanel(panel('a'));
    const groupId = first.groupId!;
    const created: PaneGroupExtensionContext[] = [];
    const updated: PaneGroupExtensionContext[] = [];
    const disposed: string[] = [];
    const registration = engine.registerGroupExtension((context) => {
      created.push(context);
      const id = context.group.id;
      return {
        update: (next) => updated.push(next),
        dispose: () => disposed.push(id),
      };
    });

    expect(created).toHaveLength(1);
    expect(created[0].elements).toBe(engine.groupElements(groupId));
    engine.updatePanel('a', { title: 'A' });
    registration.refresh(groupId);
    expect(updated).toHaveLength(2);

    engine.closePanel('a');
    expect(disposed).toEqual([groupId]);
    registration.dispose();
    engine.dispose();
  });

  it('keeps an exiting group extension alive until its physical view is removed', async () => {
    reducedMotion = false;
    const { engine } = setup();
    const first = engine.addPanel(panel('a'));
    const phases: string[] = [];
    const dispose = vi.fn();
    engine.registerGroupExtension((context) => {
      phases.push(context.phase);
      return { update: (next) => phases.push(next.phase), dispose };
    });
    const group = engine.groupElements(first.groupId!)!.element;
    let finish!: () => void;
    const finished = new Promise<void>((resolve) => (finish = resolve));
    vi.spyOn(group, 'animate').mockReturnValue({
      id: '',
      finished,
      cancel: vi.fn(),
    } as unknown as Animation);

    engine.closePanel('a');

    expect(phases).toEqual(['active', 'exiting']);
    expect(dispose).not.toHaveBeenCalled();
    finish();
    await finished;
    await Promise.resolve();
    expect(dispose).toHaveBeenCalledOnce();
    engine.dispose();
  });

  it('exposes semantic hit testing and isolated drop decorations', () => {
    const { engine, renderers } = setup();
    const handle = engine.addPanel(panel('a'));
    const elements = engine.groupElements(handle.groupId!)!;
    const tab = elements.tabList.firstElementChild!;
    const title = tab.querySelector('.pane-tab-title')!;
    const close = tab.querySelector('.pane-tab-close')!;
    const panelChild = renderers.get('a')!.element.firstElementChild!;

    expect(engine.hitTest(title)).toEqual({ kind: 'tab', groupId: handle.groupId, panelId: 'a' });
    expect(engine.hitTest(close)).toEqual({
      kind: 'tab-close',
      groupId: handle.groupId,
      panelId: 'a',
    });
    expect(engine.hitTest(panelChild)).toEqual({
      kind: 'panel',
      groupId: handle.groupId,
      panelId: 'a',
    });

    const decoration = engine.createDropDecoration({
      activeClass: 'drop-active',
      directionClass: (direction) => `drop-${direction}`,
    });
    decoration.set({ groupId: handle.groupId!, direction: 'left' });
    expect(elements.element.classList.contains('drop-active')).toBe(true);
    expect(elements.element.classList.contains('drop-left')).toBe(true);
    expect(engine.positionForDropTarget(decoration.target)).toEqual({
      referenceGroupId: handle.groupId,
      direction: 'left',
    });
    decoration.set();
    expect(elements.element.classList.contains('drop-active')).toBe(false);
    expect(elements.element.classList.contains('drop-left')).toBe(false);
    decoration.dispose();
    engine.dispose();
  });
});
