# Changelog

## v0.3.0 (2026-04-03)

### Español

- Instalación en Pi corregida para flujo real de `pi install git:github.com/fr0ziii/memoria`.
- Rama por defecto del repo movida a `main`.
- Rama `master` eliminada para evitar instalaciones de código antiguo.
- Layout del paquete alineado con el patrón de Pi:
  - `pi.extensions` ahora apunta a `./.pi/extensions/memoria`
  - `pi.skills` ahora apunta a `./skills`
- Extensión ejecuta runtime desde `dist`, no desde `src`, para carga más estable en instalación.
- Se añadieron smoke tests de instalación:
  - instalación global
  - instalación project-local (`-l`)
  - validación de rutas declaradas en `package.json`
- README actualizado con instalación recomendada pinneada y troubleshooting.

### English

- Fixed Pi install path for real usage with `pi install git:github.com/fr0ziii/memoria`.
- Default repository branch moved to `main`.
- `master` branch removed to prevent old-code installs.
- Package layout aligned with Pi conventions:
  - `pi.extensions` now points to `./.pi/extensions/memoria`
  - `pi.skills` now points to `./skills`
- Extension runtime now loads from `dist`, not `src`, for more stable installs.
- Added install smoke tests:
  - global install
  - project-local install (`-l`)
  - `package.json` declared-path validation
- README updated with pinned install guidance and troubleshooting.
