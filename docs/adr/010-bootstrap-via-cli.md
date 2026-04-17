# ADR 010 — First superadmin via CLI, not a web flow

**Status:** Accepted.

## Decision

The first superadmin for a fresh deployment is created with a CLI:

```
pnpm --filter api bootstrap --email=... --org-name=... --org-address=... --org-zip=... --timezone=...
```

The password is prompted interactively (never from argv, never logged). The CLI exits with a non-zero code if any superadmin already exists, unless `--force` is passed.

## Why not a web form?

A web "first-run" page is a well-known foot-gun: it either stays reachable forever (anyone can claim admin of an empty install) or relies on a flag that can be tricked. The CLI requires shell access to the deployment — a useful hurdle — and can be run once, then forgotten.

## Consequences

- Operators run the CLI as part of provisioning.
- In development, the same CLI seeds a working local environment.
- Subsequent superadmins are added via the invitation flow.
