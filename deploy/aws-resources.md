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

## SSM parameters

`DATABASE_URL`, `JWT_SECRET`, `DB_MASTER_PASSWORD`, `ADMIN_SSH_KEY`, and
`DEPLOY_SSH_KEY` (the GitHub Actions deploy key, whose public half is
already in `~ubuntu/.ssh/authorized_keys`).

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
  (`VITE_API_URL=/api`) and served by Nginx from `/var/www/opd-care`, with
  `/api/*` and `/health` proxied to the backend on the same origin
  (`/etc/nginx/sites-available/opd-care`). The app is at
  `http://3.7.243.104/` (HTTP only until a domain + certificate exist).
- **IAM user for GitHub Actions (step 5) and the Actions secrets (step 6)
  aren't set up yet**: `deploy.yml` syncs the frontend to S3 and invalidates
  CloudFront, so it can't fully work until the distribution exists. With
  `DEPLOY_HOST` unset, pushes to `main` don't redeploy. Until then, redeploy
  by hand on the box: `git pull`, run the build/migrate/`pm2 startOrReload`
  steps from the README, then `VITE_API_URL=/api npm run build:web` and
  `sudo rsync -a --delete web/dist/ /var/www/opd-care/`.
- The database is migrated but **not seeded**. The first clinic signs up
  through the app's registration flow.
