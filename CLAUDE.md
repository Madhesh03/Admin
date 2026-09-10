@AGENTS.md

## Deployment — commit before deploy, always

Production runs on the `sois` server (SSH alias `sois`), at `/var/www/admin`, as an actual git clone on branch `api-integration` (remote `origin`, authenticated via a read-only deploy key at `~/.ssh/sois_admin_deploy_key` with SSH host alias `github.com-sois-admin`), served by pm2 process `admin`. It is **not** a manual file copy — do not `scp` individual files to it.

**Every deploy, without exception, follows this order:**

1. Commit the change locally and `git push origin api-integration`. Never leave a fix as an uncommitted local edit that only exists on the server, or vice versa — the two must never diverge.
2. On the server: `cd /var/www/admin && git fetch origin api-integration && git reset --hard origin/api-integration`.
3. `npm install` (only needed if package.json/lock changed), then `npm run build`.
4. `pm2 restart admin`.
5. Verify: `curl -s -o /dev/null -w '%{http_code}\n' https://admin.soisstore.com/` should return 200.

Never skip step 1 to "save time" — a change that's live but not committed is a change that will be silently lost or contradicted the next time this repo is synced from git. If a commit contains changes you didn't make (someone else's in-progress work sitting uncommitted locally), ask the user what to do with it before committing — don't push it blindly, but don't let it block deploying your own change either.

Restarting the pm2 process is a production action with brief downtime — confirm with the user before rebuilding/restarting, same as any other risky/production-affecting action.
