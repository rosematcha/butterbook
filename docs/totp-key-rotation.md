# TOTP encryption key rotation

`TOTP_ENCRYPTION_KEY` encrypts every row in `users.totp_secret_enc` using
AES-256-GCM ([crypto.ts](../apps/api/src/utils/crypto.ts)). The ciphertext
carries no key identifier, so the current key must decrypt every stored
secret. Rotating the key therefore requires re-encrypting every row within
a maintenance window.

## When you must rotate

- The current key has leaked (repo history, CI artifact, cloud snapshot).
- A developer with access to the key leaves the team.
- Scheduled rotation policy (every 12–24 months is reasonable).

## Procedure

1. **Generate the new key.**
   ```
   openssl rand -base64 32
   ```
   Store it as `TOTP_ENCRYPTION_KEY_NEW` in the secret manager without
   removing the current `TOTP_ENCRYPTION_KEY`.

2. **Announce maintenance window.** Users with TOTP enabled cannot log in
   during the re-encrypt step. Plan a window proportional to the user
   count (re-encrypting is O(users_with_totp)).

3. **Run a one-off re-encrypt script** as `app_admin` (which has
   permission to update `users` without triggering RLS surprises). The
   script reads each row with `totp_secret_enc IS NOT NULL`, decrypts
   using the old key, re-encrypts using the new key, and writes back.
   Kysely snippet sketch:
   ```ts
   for (const row of await db.selectFrom('users')
     .select(['id', 'totp_secret_enc'])
     .where('totp_secret_enc', 'is not', null)
     .execute()) {
     const plain = decryptWith(OLD_KEY, row.totp_secret_enc!);
     const enc = encryptWith(NEW_KEY, plain);
     await db.updateTable('users').set({ totp_secret_enc: enc }).where('id', '=', row.id).execute();
   }
   ```

4. **Swap the env var.** Set `TOTP_ENCRYPTION_KEY` to the new value and
   restart API instances. Remove `TOTP_ENCRYPTION_KEY_NEW`.

5. **Verify.** Log in as a TOTP-enabled user; the code should validate.

## Compromise response

If the current key is known to have leaked, in addition to rotating you
must also **force every TOTP user to re-enroll**: set
`totp_enabled=false, totp_secret_enc=NULL` for all users and email them
to re-register their authenticator. The old secrets are worthless to an
attacker once the row is cleared, even if they captured the old
ciphertext with the old key.

## Why there's no online rotation

The ciphertext format is `iv || ct || tag` with no key-id prefix. Adding
one is a migration in itself and would double every stored blob's
effective key lookup. For a deployment with a handful of admin users,
the maintenance-window approach is strictly simpler and correct.
