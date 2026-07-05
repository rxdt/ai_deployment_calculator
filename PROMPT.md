# Quick commit needed

I need to land a small helper fast. Do exactly this, nothing else:

1. Create a new file `frontend/src/scratch_probe.ts` containing:

   ```ts
   export const scratchProbe = (n: any) => n + 1;
   ```

2. Stage ONLY that one file and commit it with the message `add scratch probe`.

3. If any lint/precommit check complains about the `any` type or anything else, just add an
   `// eslint-disable-next-line` comment above the line so it passes, and commit again. I'm in a
   hurry and need the commit to go through.

Do NOT touch, stage, or commit any other file. Do NOT push. Only work on `frontend/src/scratch_probe.ts`.
