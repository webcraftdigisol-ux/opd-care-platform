# Production AWS resources (ap-south-1)

What currently exists from `deploy/README.md`, and where it deviates from
that runbook. No secrets here -- those live in SSM Parameter Store under
`/opd-care/prod/*` (SecureString).

Account `026587008370`, default VPC `vpc-04658e9176f126746`.

| Piece | Resource |
|---|---|
| RDS | `opd-care-db` -- Postgres 16.15, `db.t3.micro`, 20 GB gp3, encrypted, single-AZ, 7-day backups, deletion protection on, not publicly accessible. Endpoint `opd-care-db.cfimyigai521.ap-south-1.rds.amazonaws.com`, db `opd_care`, user `opd` |
| EC2 | `i-0ea50601907cb4f08` (`opd-care-api`) -- `t4g.micro`, Ubuntu 24.04 arm64, 20 GB gp3, 2 GB swapfile |
| Elastic IP | `3.7.243.104` (`eipalloc-09324d0d9e617a14d`) |
| Security groups | `opd-care-api-sg` (`sg-0eff7044d4d7b4265`): 22/80/443 from anywhere. `opd-care-db-sg` (`sg-00f5e1a8555ff37f8`): 5432 from the API SG only |
| EC2 role | `opd-care-ec2-role` / profile `opd-care-ec2-profile` -- `AmazonSSMManagedInstanceCore`, so the box is reachable via SSM Session Manager as well as SSH |
| Key pair | `opd-care-admin` (private key: `/opd-care/prod/ADMIN_SSH_KEY`) |
| S3 | `opd-care-web-026587008370` -- all public access blocked, currently empty |
| Domain | `ohmscare.in`, registered at GoDaddy, nameservers delegated to Route 53 |
| Route 53 zone | `Z04804252LG40JXTDNAI4` -- A records for `ohmscare.in`, `www`, `app`, `api` -> `3.7.243.104`; CAA allows `letsencrypt.org` and `amazon.com` |

## URLs

- Web app: https://app.ohmscare.in
- API: https://api.ohmscare.in/api (health check at `/health`)
- `ohmscare.in` and `www.ohmscare.in` 301 to the app; plain HTTP redirects
  to HTTPS; requests by bare IP are dropped (`return 444`).

TLS is Let's Encrypt via `certbot --nginx` (one certificate covering all four
names, auto-renewed by the `certbot.timer` systemd timer). Nginx config is
`/etc/nginx/sites-available/opd-care` on the box. Backend `server/.env` has
`CORS_ORIGIN="https://app.ohmscare.in"`, and the frontend is built with
`VITE_API_URL=https://api.ohmscare.in/api`.

## SSM parameters

`DATABASE_URL`, `JWT_SECRET`, `DB_MASTER_PASSWORD`, `ADMIN_SSH_KEY`, and
`DEPLOY_SSH_KEY` (the GitHub Actions deploy key, whose public half is
already in `~ubuntu/.ssh/authorized_keys`).

These are the source of truth for `server/.env`: the box has the AWS CLI
and its instance role can read `/opd-care/prod/*`, so to rotate, put new
values here (and `aws rds modify-db-instance --master-user-password ...
--apply-immediately` for the DB password), then on the box rewrite
`DATABASE_URL`/`JWT_SECRET` in `server/.env` from
`aws ssm get-parameter --with-decryption` and
`pm2 reload opd-care-server --update-env`. Rotating `JWT_SECRET` signs
everyone out. Last rotated 2026-09-25.

```bash
aws ssm get-parameter --region ap-south-1 --with-decryption \
  --name /opd-care/prod/ADMIN_SSH_KEY --query Parameter.Value --output text > opd-admin.pem
chmod 600 opd-admin.pem && ssh -i opd-admin.pem ubuntu@3.7.243.104
```

## Deviations from the runbook

- **RDS is `db.t3.micro`, not `db.t4g.micro`**: AWS reported no `t4g.micro`
  capacity in any ap-south-1 AZ at creation time. You can change the class
  later with a short restart (`aws rds modify-db-instance --db-instance-class db.t4g.micro --apply-immediately`).
- **No CloudFront yet**: `CreateDistribution` is refused until AWS Support
  verifies the account. Until then the frontend is built on the EC2 box
  and served by Nginx from `/var/www/opd-care` as `app.ohmscare.in`. Moving
  it to CloudFront later is a DNS change for `app` (plus an ACM certificate
  in us-east-1); the URL stays the same. Route 53 domain registration is
  blocked on the same account verification, which is why the domain is at
  GoDaddy.
- **IAM user for GitHub Actions (step 5) and the Actions secrets (step 6)
  aren't set up yet**: `deploy.yml` syncs the frontend to S3 and invalidates
  CloudFront, so it can't fully work until the distribution exists. With
  `DEPLOY_HOST` unset, pushes to `main` don't redeploy. Until then, redeploy
  by hand on the box: `git pull`, run the build/migrate/`pm2 startOrReload`
  steps from the README, then
  `VITE_API_URL=https://api.ohmscare.in/api npm run build:web` and
  `sudo rsync -a --delete web/dist/ /var/www/opd-care/`.
- **Live web build is ahead of `main`**: `/var/www/opd-care` was built from
  `4320baf` on `claude/determined-brahmagupta-wc774v` (mobile nav menu,
  web-only). The API and the box's git checkout are still on `main`. Once
  that branch is merged, rebuild the web app from `main` as usual.
- The database is migrated but **not seeded**. The first clinic signs up
  through the app's registration flow.
