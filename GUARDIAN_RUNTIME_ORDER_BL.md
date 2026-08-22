# Guardian runtime ordering · BL

The browser must never dynamically reload an older Guardian layer after the final current-build Guardian is installed.

Required order:
1. stability identity
2. device-state Guardian checks
3. privacy hardening
4. BJ foundation Guardian
5. BL current-build Guardian
6. guardian runtime UI wrapper

The stability layer must not call a dynamic `loadFullGuardian()` path. Guardian layers are loaded exactly once by `index.html`.
