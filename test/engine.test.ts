import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PaneEngine,
  type PaneGroupExtensionContext,
  type PanePanelRenderContext,
  type PanePanelRenderer,
  type PanePanelState,
} from '../src/engine';
import { installPanePointerController } from '../src/pointer';

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
  it('updates gaps and drag geometry without replacing panel views or split proportions', () => {
    const { engine, renderers } = setup();
    const first = engine.addPanel(panel('a'));
    const second = engine.addPanel({
      ...panel('b'),
      position: { referenceGroupId: first.groupId!, direction: 'right' },
    });
    const original = engine.groupElements(first.groupId!)!.element;
    const layout = engine.toJSON();
    for (const gap of [24, 0, 7]) {
      engine.setGap(gap);
      const left = engine.currentGroupRect(first.groupId!)!;
      const right = engine.currentGroupRect(second.groupId!)!;
      expect(right.x - left.x - left.width).toBeCloseTo(gap);
      expect(engine.toJSON()).toEqual(layout);
      expect(engine.groupElements(first.groupId!)!.element).toBe(original);
      expect(renderers.get('a')!.dispose).not.toHaveBeenCalled();
    }
    const selection = engine.beginPanelDrag(['a'], 100, 100)!;
    const left = selection.snapshotGeometry.groups.get(first.groupId!)!;
    const right = selection.snapshotGeometry.groups.get(second.groupId!)!;
    expect(right.x - left.x - left.width).toBeCloseTo(7);
    engine.dispose();
  });

  it('keeps tab actions separate from selection and drag gestures', () => {
    const { engine } = setup();
    const first = engine.addPanel(panel('a'));
    engine.addPanel({
      ...panel('b'),
      position: { referenceGroupId: first.groupId!, direction: 'within' },
    });
    const elements = engine.groupElements(first.groupId!)!;
    const tab = elements.tabElements('a')!;
    const action = document.createElement('button');
    const activate = vi.fn();
    action.addEventListener('click', activate);
    tab.actions.append(action);
    const disposePointer = installPanePointerController(engine);

    expect(tab.button.getAttribute('role')).toBe('tab');
    expect(tab.button.contains(action)).toBe(false);
    expect(engine.hitTest(action)).toEqual({
      kind: 'tab-action',
      groupId: first.groupId,
      panelId: 'a',
    });
    action.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 10, clientY: 10 }));
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 100, clientY: 100 }));
    action.click();
    expect(activate).toHaveBeenCalledOnce();
    expect(engine.dragging).toBe(false);
    expect(engine.state.activePanelId).toBe('b');
    engine.updatePanel('a', { title: 'Renamed' });
    expect(elements.tabElements('a')!.actions.contains(action)).toBe(true);
    tab.actions.querySelector<HTMLButtonElement>('.pane-tab-close')!.click();
    expect(engine.getPanel('a')).toBeUndefined();
    expect(engine.state.activePanelId).toBe('b');

    disposePointer();
    engine.dispose();
  });

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
      vi.spyOn(tab, 'getAnimations').mockReturnValue([]);
      return vi.spyOn(tab, 'animate').mockReturnValue({ id: '' } as Animation);
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
