# Deployment runbook

This covers the AWS "lean tier" setup discussed alongside the app: RDS
(Postgres) + a single EC2 box (backend, via PM2 + Nginx) + S3/CloudFront
(frontend). It assumes Mumbai (`ap-south-1`) as the region.

Steps 1–5 are one-time, manual, and need your AWS console/domain access —
nothing here can create AWS resources on your behalf. Step 6 (GitHub
Actions) is what makes every subsequent `git push` to `main` redeploy
automatically, once you've done steps 1–5 and filled in the secrets below.

## 1. RDS (PostgreSQL)

- Create a `db.t4g.micro` Postgres instance in `ap-south-1`, single-AZ to
  start. Note the endpoint hostname, and set a strong master password.
- Security group: allow port 5432 **only** from the EC2 instance's security
  group (step 2) -- never open it to `0.0.0.0/0`.

## 2. EC2 (backend)

Launch a `t4g.micro` instance (Ubuntu 22.04+) in `ap-south-1`. SSH in and:

```bash
# Node 24, git, nginx, certbot, pm2
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs git nginx certbot python3-certbot-nginx
sudo npm install -g pm2

# Clone the repo
sudo mkdir -p /opt/opd-care-platform
sudo chown $USER /opt/opd-care-platform
git clone <your-repo-url> /opt/opd-care-platform
cd /opt/opd-care-platform

# Production env vars -- never commit this file
cp server/.env.example server/.env
# edit server/.env: DATABASE_URL (-> RDS endpoint from step 1), a freshly
# generated JWT_SECRET, CORS_ORIGIN (-> your frontend domain), SMTP_* if
# you have real email credentials yet

# First build + migrate + start
npm ci
npm run build:shared
npm run build:server
(cd server && npx prisma migrate deploy)
pm2 start deploy/ecosystem.config.js
pm2 save
pm2 startup   # follow the printed instructions to survive reboots
```

Then set up Nginx + HTTPS in front of it — see `deploy/nginx.conf` for the
exact commands (reverse-proxies `api.yourclinic.example` → `localhost:4000`,
`certbot --nginx` handles the SSL certificate and renewal).

## 3. S3 + CloudFront (frontend)

- Create an S3 bucket for the built frontend (block all public access; you
  serve it through CloudFront, not directly).
- Create a CloudFront distribution pointing at that bucket, with an ACM
  certificate for your frontend domain (the certificate must be requested
  in `us-east-1` specifically -- that's a CloudFront requirement, unrelated
  to which region everything else runs in).

## 4. DNS (Route 53)

- `app.yourclinic.example` → CloudFront distribution
- `api.yourclinic.example` → the EC2 instance's IP (or an Elastic IP, so it
  doesn't change if the instance restarts)

## 5. IAM user for GitHub Actions

Create an IAM user (not your root account) with permissions limited to:
`s3:PutObject`/`s3:DeleteObject`/`s3:ListBucket` on your frontend bucket,
and `cloudfront:CreateInvalidation` on your distribution. Generate an
access key for it -- this is what `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`
below will be.

## 6. GitHub Actions secrets

Once steps 1–5 are done, add these under the repo's Settings → Secrets and
variables → Actions. `.github/workflows/deploy.yml` checks for
`DEPLOY_HOST` and does nothing (green, not red) until it's set — so this is
safe to leave unset for as long as you're not ready to deploy.

| Secret | Value |
|---|---|
| `DEPLOY_HOST` | EC2 public IP or DNS |
| `DEPLOY_USER` | SSH user (e.g. `ubuntu`) |
| `DEPLOY_SSH_KEY` | Private half of an SSH key whose public half is in the EC2 instance's `~/.ssh/authorized_keys` -- create a dedicated deploy key, don't reuse your personal one |
| `VITE_API_URL` | `https://api.yourclinic.example/api` (baked into the frontend build) |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | From the IAM user in step 5 |
| `AWS_REGION` | `ap-south-1` |
| `S3_BUCKET` | Frontend bucket name from step 3 |
| `CLOUDFRONT_DISTRIBUTION_ID` | From step 3 |

After that, every push to `main` that passes CI automatically: SSHes into
the EC2 box, pulls latest, rebuilds the backend, runs `prisma migrate
deploy`, and reloads it under PM2 with zero manual steps -- then builds the
frontend and syncs it to S3 with a CloudFront cache invalidation.

## Rolling back

PM2 keeps the previous build until the next successful one overwrites it,
but there's no automatic rollback yet. To roll back by hand: SSH in,
`git checkout <previous-commit>`, rebuild, `pm2 restart`. Same idea for the
frontend: rebuild from the older commit and re-sync to S3.
