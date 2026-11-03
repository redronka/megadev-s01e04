# rig

Keeps a lane's lights on while nobody is in it: a heartbeat every minute, a status board, and
(next) a morning digest of what ran overnight.

```sh
cp .env.example .env   # set LANE_MARKER
pnpm install
pnpm dev               # http://localhost:8787
```

Working on it with an agent: start at [AGENTS.md](AGENTS.md).

## Podgląd przez GitHub Pages

Podgląd uruchamia się ręcznie w zakładce **Actions** przez workflow **Preview**. Wybierz
**Run workflow** i pozostaw `include_marker` wyłączone. Workflow używa Node.js 22, pnpm 11.25.0
i istniejącego `pnpm-lock.yaml`; najpierw uruchamia testy oraz typecheck, a potem zapisuje
`/digest/2026-10-28` jako `index.html`.

Workflow publikuje jeden plik HTML jako artefakt GitHub Pages. Plik nie trafia do repozytorium.
Po zakończeniu wdrożenia adres strony pojawi się przy zadaniu w Actions. Kolejne ręczne
wdrożenie używa tego samego adresu. Artefakt wygasa po jednym dniu.

Opcję `include_marker` włączaj tylko po osobnej zgodzie operatora. Wtedy workflow pobiera
`LANE_MARKER` z sekretu repozytorium o tej nazwie. Jeśli sekretu brakuje, zadanie kończy się
błędem. Po przeglądzie i osobnej zgodzie na nadpisanie uruchom workflow ponownie z `include_marker` wyłączonym, aby zastąpić
publiczny podgląd wersją bez znacznika, zgodnie z [ADR 0003](docs/adr/0003-previews-are-public-and-short-lived.md).
