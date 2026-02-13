# Novu Advisor - AI Business Consultant

Universal AI consultant that any business can install on any website with two lines of code.

## Install in 5 steps

**Step 1** - Clone & install

```bash
git clone <your-repo-url> novu-advisor
cd novu-advisor
npm install
```

**Step 2** - Configure

```bash
cp .env.example .env
```

Edit `.env` and set at least:

- `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`
- `JWT_SECRET`
- `ADMIN_MASTER_KEY`
- `BASE_URL`

**Step 3** - Start the server

```bash
npm start
```

Server runs on `http://localhost:3000`.

**Step 4** - Set up your business

Open:

`http://localhost:3000/dashboard/setup.html`

Complete the 3-step onboarding flow.

After setup is saved, continue with:

- `http://localhost:3000/dashboard/advisor.html` to configure AI provider/model, API key, and custom instructions.
- `http://localhost:3000/dashboard/clients.html` for super admin multi-client management.

**Step 5** - Install on your website

Copy the snippet from the client advisor page and paste it before `</body>`:

```html
<script src="https://YOUR-DOMAIN.com/widget/widget.js" data-business-id="BUSINESS_UUID" data-api-url="https://YOUR-DOMAIN.com"></script>
```

Important:
- Use only the script tag (do not add a separate CSS link).
- Do not use an iframe.

## Deploy options

- Railway (recommended for QA)
- Render (free tier available, with limitations)
- Any VPS with Node.js 18+

## Railway QA deployment (fast path)

1. Go to Railway and create a new project from GitHub repository:
   - Repo: `JaimeAndresV/Novu-Advisor`
   - Branch: `qa`
2. Add a persistent Volume and mount it at `/data`.
3. Set environment variables in Railway service:
   - `NODE_ENV=production`
   - `DB_PATH=/data/novu.db`
   - `JWT_SECRET=<strong-random-secret>`
   - `ADMIN_MASTER_KEY=<master-key>`
   - `OPENAI_API_KEY=<or ANTHROPIC_API_KEY>`
   - `BASE_URL=https://<your-railway-domain>`
4. Redeploy service.
5. Smoke test:
   - `https://<your-railway-domain>/health`
   - `https://<your-railway-domain>/dashboard/setup.html`
   - Create client -> configure advisor -> test widget snippet.

## Project structure

```text
/novu-advisor/
  server/
  routes/
  services/
  db/
  middleware/
  utils/
  widget/
  dashboard/
  .env.example
  package.json
  README.md
```

## Core API endpoints

- `POST /api/chat` - main advisor endpoint
- `POST /api/crawl` - website indexing
- `GET /api/report` - business intelligence report
- `POST /api/business` - onboarding creation
- `GET /api/business/:id` - business configuration
- `PUT /api/business/:id` - business update
- `POST /api/auth/login` - admin panel login

## Security and quality notes

- Widget is isolated using Shadow DOM
- All SQL queries use prepared statements (`better-sqlite3`)
- Rate limiting enabled on `/api/chat` (`60 requests/hour`)
- API keys stay server-side (never sent to frontend)
- HTML responses are sanitized before rendering in widget
- Database schema is auto-created on first server boot

## Environment notes

- `SERPER_API_KEY` is optional and only used for dynamic market queries
- SMTP variables are optional; when absent, notifications are logged safely

