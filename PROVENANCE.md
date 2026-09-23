# Provenance

This repository continues [`Eriskii/svelte-pane-engine`](https://github.com/Eriskii/svelte-pane-engine)
from its original commit [`8e60fd8ae35a06f2200f9a178634e9b38fd7e264`](https://github.com/Eriskii/svelte-pane-engine/commit/8e60fd8ae35a06f2200f9a178634e9b38fd7e264).
Generic fixes and integration contracts developed in ErisDE live here, on top of the original
Git history.

The upstream work is Copyright (c) 2026 Isolyth and licensed under the MIT License; the unmodified license text is retained in [`LICENSE`](./LICENSE).

## Maintained changes

Relative to the original revision, the integrated changes:

- preserve adjacent-tab selection when the active tab closes;
- keep unchanged tab and panel DOM nodes in place during synchronization;
- avoid tab FLIP animation for activation and stationary tabs;
- expose stable group elements, group-extension lifecycle, renderer context, DOM hit-testing, and drop-decoration contracts;
- test those fixes and lifecycle contracts before packing.

Application-specific panel registration, state, Svelte group chrome, and drag policy belong to ErisDE and are not part of this generic package.
