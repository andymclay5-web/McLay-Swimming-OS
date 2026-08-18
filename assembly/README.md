# MSOS App Assembly v1

This directory is the clean application assembly layer.

Base engine milestone: `009d4d099113dfecaa3b3ea86ab88fd8526859f8`.

## Rule

The assembly layer may compose public engine/surface contracts and browser/device adapters. It does not inherit the old `app.js` / `v4-*` domain-owner chain.

If a rebuilt engine owns a domain, assembly code may call that owner but must not reproduce its calculation or reach into its storage.

## Familiar shell source

The visual/workflow reference is the proven v3 family rather than the later v4 shell. Historical `v3.20.18` used the familiar navy/light-blue palette, sticky active context, Deck/Board, Attendance/Roll, Times, Tests and Capture navigation. Those patterns may be reused as presentation language; their old domain logic is not copied back in.

## Assembly sequence

1. Calendar month and Day view over Session Schedule.
2. Exact occurrence -> session intake -> Session Truth/Lifecycle binding.
3. Exact session -> rebuilt Coach Board.
4. Android/browser Back and resume persistence through Navigation State.
5. Swimmer/Profile, TV/Group, Assistant Coach and Meet surfaces through their contracts.
6. Offline/storage/sync adapters.
7. Rendered-phone acceptance, then real-pool acceptance.

No file in this directory is the live production entry point until the acceptance gate is explicitly passed.
