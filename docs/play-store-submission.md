# Play Console submission notes — Lupira Tasks (Internal testing)

Draft answers for the gating declarations. Fill the **[BRACKETS]** and confirm each in the Console.

## Privacy policy

- Host `docs/PRIVACY.md` at a public URL (e.g. GitHub Pages on this repo, or a `/privacy` page on
  `lupira.com` / the LupiraTasksWeb SPA) and paste that URL into **Play Console → App content → Privacy policy**.

## App access (the app is login‑gated)

Select **"All or some functionality is restricted"** and provide:

- **Instructions:** "Sign in is required. On the login screen tap *Sign in with Authentik*, enter the test
  credentials below, and approve. The app then syncs with the backend at `tasks-api.lupira.com`."
- **Test account:** username **[TEST EMAIL]**, password **[TEST PASSWORD]**
  _(create a dedicated test user in Authentik for this — don't use a personal account)._

## Data safety form

**Does your app collect or share user data?** → **Yes (collects).** Encrypted in transit: **Yes.**
Users can request deletion: **Yes** (via contact in the privacy policy / leaving lists).

Declare these data types (all: collected, **not** shared, **not** used for tracking/ads):

| Category | Data type | Purpose | Notes |
|---|---|---|---|
| Personal info | **Email address** | App functionality, Account management | Required; your OIDC subject/identity |
| App info & performance | **Crash logs** | App functionality (diagnostics) | via Sentry (service provider) |
| App info & performance | **Diagnostics** | App functionality | device/app info via Sentry; PII not attached by default |
| Device or other IDs* | **Device or other IDs** | App functionality (diagnostics) | *only if Sentry's install/device id counts — declare conservatively if unsure |

**Note on task content:** your lists/items are user‑generated text stored on your backend, but Play's Data
Safety form has **no matching "data type"** for free‑form to‑do content (its categories are email, photos,
files, messages, contacts, etc.). So it isn't declared as a Data Safety "type" — it **is** described in the
privacy policy, which is the correct place for it. Don't force it into an unrelated category.

"Service provider" framing: Sentry processes crash/diagnostic data **on your behalf**, so mark those types
as **collected** (not "shared") and list Sentry as a processor if asked.

## Content rating questionnaire

Productivity app, no objectionable content → expect **Everyone / PEGI 3**. When answering:
- No violence/sexual/drug content.
- **User interaction:** users can share lists with people they invite (private membership) — there is no
  public or anonymous social feed. Answer the "share content / interact" questions honestly as *limited,
  private sharing among invited members*.

## Target audience & ads

- **Ads:** None.
- **Target audience:** adults (the operator's known users); not directed at children.

## Quick checklist before "Roll out" to Internal testing
- [ ] Privacy policy URL set
- [ ] Data safety completed
- [ ] App access test account provided
- [ ] Content rating completed
- [ ] Target audience / ads declared
- [ ] AAB uploaded (package `com.lupira.tasks`), Play App Signing accepted
- [ ] Testers added + opt‑in URL shared
