# Scripts

Operational scripts. They read the active network from `REEG_NETWORK` and the matching
`config/<network>.json`. Scaffold only; the real logic lands alongside the phases noted.

- `publish-package.sh` - publish the Move package and write the resulting `packageId` and
  policy object id back into `config/<network>.json` (build-roadmap phases D, O).
- `deploy.ts` - deploy/refresh the Console as a Walrus Site and wire endpoints (phase H).
- `seed-demo.ts` - create a Machine, run a scripted agent, checkpoint, and fork so the
  acceptance demo has data to show (phases G, J).
