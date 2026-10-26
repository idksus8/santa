# Secret Santa: setup

The wheel now picks live, and the site remembers who has been picked, so it needs a small free database.

1. Deploy: in this folder run `npx vercel`, or put the folder on GitHub and import it at vercel.com/new.
2. Add the database: in your Vercel project open Storage (or Marketplace), add **Upstash Redis**, and connect it to this project. Vercel fills in the login details by itself.
3. Redeploy so the site can see the database: `npx vercel --prod`.
4. Before you send the link, clear your own test spins: add an environment variable called `ADMIN_KEY` (any password you like), redeploy, then open `https://YOUR-SITE.vercel.app/api/reset?key=YOUR_PASSWORD`.

Names and banned pairs live in `config.json`. Change them there, redeploy, then reset.
