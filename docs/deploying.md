# Putting this online, step by step

Written assuming no prior experience. It's mostly clicking through two websites.
Budget about 20 minutes.

You'll do three things: make a database, tell Vercel four secrets, then create the
tables.

---

## Part 1 — Make the database (Neon, free)

The app needs somewhere to store snapshots. Vercel runs the code but doesn't
provide a database, so Neon does that bit.

1. Go to **https://neon.tech** and sign up (the free tier is enough for five
   people).
2. Create a project. Any name. Pick the region closest to you.
3. You'll land on a dashboard with a **Connection string** box. It looks like:

   ```
   postgresql://neondb_owner:SOMEPASSWORD@ep-something-12345-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require
   ```

4. **Important:** make sure the **"Pooled connection"** option is switched on.
   You can tell by looking at the string — the bit after the `@` must contain
   **`-pooler`**. If it doesn't, find the pooled toggle and turn it on.

   Why it matters: the app runs as lots of short-lived serverless functions, and
   without pooling they exhaust the database's connection limit and start failing
   under normal use.

5. Click copy. **Keep this tab open**, you'll paste it twice.

> This string contains the password to your database. Don't paste it into
> Discord, a GitHub issue, or anywhere public.

---

## Part 2 — Tell Vercel the four secrets

### First, generate a session secret

This is a random value that signs login cookies. In your terminal, in the project
folder:

```bash
npm run secret
```

That prints a long random string. Copy it. **Generate a fresh one for the live
site** — don't reuse the one in your local `.env`.

### Then, in Vercel

1. Open your project on **https://vercel.com**.
2. Go to **Settings** → **Environment Variables**.
3. Add these four, one at a time. For each: type the name in the Key box, paste
   the value, leave it applied to all environments, click **Save**.

| Key | Value |
|---|---|
| `DATABASE_URL` | the Neon pooled string from Part 1 |
| `SESSION_SECRET` | the output of `npm run secret` |
| `INVITE_CODE` | the password your friends need to make an account. Make it long and not guessable. You can set **several, separated by commas** — see below. |
| `CONTACT_EMAIL` | your email address |

### Giving someone their own invite code

`INVITE_CODE` accepts a comma-separated list, so different people can have
different codes:

```
INVITE_CODE=friends-3f9a2b7c,ggg-review-cdbd8a7eb846
```

Both work. The point is that you can delete one later without disturbing the
other — useful for handing GGG a code while they review your OAuth application,
then revoking just that one afterwards.

```bash
npm run invite -- ggg-review
```

That generates a code, adds it to your local `.env`, and prints the full list.

**Generating a code is not the same as activating it.** The app reads
`INVITE_CODE` once at startup, so:

- **Locally** — restart `npm run dev`. A running server is still using the old list.
- **On the hosted site** — `.env` is not involved at all. Copy the full
  comma-separated list the command prints into Vercel's `INVITE_CODE`, then
  **redeploy**.

Skip that step and the new code is rejected with "That invite code is not valid",
which looks like the code is wrong when it simply isn't loaded yet.

### Then redeploy — this step is easy to miss

**Vercel does not automatically rebuild when you change environment variables.**
The existing deployment carries on with the old (missing) values, so if you skip
this it will look like nothing you did worked.

Go to the **Deployments** tab, find the most recent one, open its **⋯** menu and
choose **Redeploy**.

---

## Part 3 — Create the tables

The database from Part 1 is completely empty — no tables. One command creates
them, run from your own machine.

1. Open `.env` in your project folder (it's in the root; it won't show in some
   file managers because it starts with a dot).
2. Add a new line at the bottom, pasting the same Neon string:

   ```
   PRODUCTION_DATABASE_URL="postgresql://...-pooler...neon.tech/neondb?sslmode=require"
   ```

   Keep the existing `DATABASE_URL` line exactly as it is — that's your local
   database and you still want it.

3. Run:

   ```bash
   npm run db:push:prod
   ```

It prints which host it's creating tables in, and warns you if the string doesn't
look pooled. `.env` is gitignored, so nothing you just pasted gets published.

---

## Done — check it worked

Open your `https://your-project.vercel.app` URL. You should get the login page.
Register using the `INVITE_CODE` you chose, and you're in.

Send your friends the URL and the invite code.

---

## If something's wrong

**"Application error" / a 500 page.** Almost always a missing or wrong
environment variable. In Vercel: **Deployments** → click the deployment →
**Runtime Logs**. The error messages name the specific variable.

**It still behaves as if nothing changed.** You probably didn't redeploy. See the
end of Part 2.

**Login works but everything is empty.** You skipped Part 3, so the tables don't
exist. The logs will mention a relation or table not existing.

**"too many connections".** Your `DATABASE_URL` isn't the pooled one. Check for
`-pooler` in the hostname.

**The build fails.** Copy the error from the build log — the build is verified to
succeed with no environment variables set at all, so a failure there is a real
bug rather than a configuration problem.

---

## A note on cost

Neon's free tier and Vercel's Hobby plan are both £0 and comfortably handle five
people. Two things to know: Vercel's Hobby plan is for **non-commercial** use, so
don't charge for this; and Neon suspends a free project that goes unused for a
while, which makes the first request afterwards slow rather than broken.
