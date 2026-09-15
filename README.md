# svelte-pane-engine

Real-time layout/tiling engine with animated resizing, panel movement, and tab groups for Svelte, inspired by Hyprland.

This is the independent source repository for the engine. ErisDE consumes a pinned commit as
its `packages/pane-engine` Git submodule and links the package through npm workspaces. See
[PROVENANCE.md](./PROVENANCE.md) for the original revision and the integrated changes.

## Build and test

```sh
git clone https://github.com/Eriskii/svelte-pane-engine.git
cd svelte-pane-engine
npm ci
npm run build
npm test
npm pack
```

Development requires Node 22+. `npm test` exercises layout, geometry, tab motion, and DOM
lifecycle using Happy DOM. No desktop or display server is required. `npm pack` builds/tests and
produces `svelte-pane-engine-0.1.0.tgz`, which another project can install by file path.

The distributable entry point and declarations are generated in `dist/`. Consumers import `svelte-pane-engine` rather than reaching into `src` or engine DOM.

## Minimal browser usage

Provide a sized host element and a renderer for your panel content:

```ts
import { PaneEngine } from 'svelte-pane-engine';
import 'svelte-pane-engine/style.css';

const engine = new PaneEngine(document.querySelector<HTMLElement>('#workspace')!, {
  createRenderer() {
    const element = document.createElement('div');
    return {
      element,
      update(panel, visible) {
        element.textContent = panel.title;
        element.hidden = !visible;
      },
      dispose() {
        element.remove();
      },
    };
  },
});

engine.addPanel({ id: 'welcome', component: 'text', title: 'Welcome' });
const savedLayout = engine.toJSON();
engine.fromJSON(savedLayout);
// When the host application removes this workspace:
engine.dispose();
```

For Svelte 5 components, pass `createSvelteRenderer({ text: YourPanel })` as `createRenderer`.
Each component receives a readable `model` store with `id`, `title`, `params`, and `visible`.
The renderer contract itself is framework-neutral; the package currently declares Svelte 5
as a peer because the main entry also exports the optional Svelte bindings.

## Public API

| Area                  | Entry points                                                                       |
| --------------------- | ---------------------------------------------------------------------------------- |
| Engine lifecycle      | `PaneEngine`, `PanePanelHandle`, `addPanel`, `removePanel`, `dispose`              |
| State and persistence | `PaneLayoutState`, `emptyPaneLayout`, `isPaneLayoutState`, `toJSON`, `fromJSON`    |
| Geometry and movement | Layout/geometry helpers, drag sessions, split resizing and drop targets            |
| Host integration      | `PanePanelRenderer`, group extensions, stable group elements, semantic hit testing |
| Svelte adapter        | `SveltePaneRenderer`, `createSvelteRenderer`, `SveltePaneProps`                    |

State snapshots are cloned. The host owns where they are saved and when they are restored.
The engine owns its DOM and renderer lifetimes; dispose registrations and the engine when their
host owners are removed. API declarations are generated alongside the JavaScript in `dist/`.

## Integration contracts

- `PanePanelRenderer.update(panel, visible, context)` receives the current group and its stable element handles.
- `groupElements(groupId)` exposes the group root, tab bar, tab list, and content container without selector scraping.
- `groupElements(groupId).tabElements(panelId)` exposes the tab wrapper, its native activation `button`, and a separate `actions` outlet. Append application buttons to that outlet; their clicks and pointer gestures do not select or drag the tab. The wrapper returned by `tabElement(panelId)` remains stable across unchanged updates.
- `registerGroupExtension(factory)` owns one application extension per physical group view. It updates on every engine synchronization—including transient drag views—and disposes when that physical view is removed. Exiting views remain alive through their exit animation.
- `hitTest(target)` converts engine-owned DOM into semantic tab, tab-action, tab-close, panel, group, or split hits.
- `createDropDecoration(options)` owns and reliably clears one class-based drop preview. `positionForDropTarget(target)` commits the same semantic target without a second hit test.

The engine owns layout state, geometry, and generic DOM. ErisDE continues to own its panel catalog and state, Svelte header component, keyboard/pointer policy, header-extra teleport convention, and application styling. In particular, `.panel-header-extras` and `[data-pane-group-drag-id]` are application contracts, not pane-engine APIs.

## Upstream demo

https://github.com/user-attachments/assets/69496313-bb48-45dc-a682-0197e7123533

## License

MIT; see [LICENSE](./LICENSE).
