# Lupira Tasks — Privacy Policy

_Last updated: [EFFECTIVE DATE]_

> Draft for review — this describes how the app actually handles data today. It is not legal advice;
> review/adjust before publishing, and host it at a public URL for the Play Console.

Lupira Tasks ("the app") is a self-hosted to‑do and shopping‑list app for a small group of family/known
users. This policy explains what data the app handles and why. The service is operated by
**[YOUR NAME / "Lupira"]** ("we", "us"). Contact: **[CONTACT EMAIL]**.

## What we collect and why

- **Account identity (email address).** You sign in with an account from our identity provider (Authentik)
  using OpenID Connect. We use your email to authenticate you, sync your data across your devices, and
  attribute list membership and changes (e.g. who created or completed an item).
- **Content you create.** Lists, items, tags, due dates, assignments, and list membership you create are
  stored on our backend (`tasks-api.lupira.com`) so they sync across your devices and with the people you
  share a list with. This content is visible only to members of the relevant list.
- **Crash and diagnostic data.** We use **Sentry** to capture crashes and error events, including basic
  device and app information (e.g. OS version, app version), to diagnose and fix problems. The app is
  configured **not** to attach personally identifying details (such as your IP address) to these reports by
  default.
- **On‑device storage.** Authentication tokens are stored in the device's secure storage, and a local copy
  of your lists is cached on the device so the app works offline. This data stays on your device.

We do **not** sell your data, use it for advertising, or use third‑party advertising or tracking SDKs.

## Sharing

- **People you invite.** List content is shared only with the members you add to that list.
- **Service providers.** Crash/diagnostic data is processed by Sentry on our behalf. Hosting/sync uses our
  own backend infrastructure.
- We do not otherwise share your data with third parties.

## Security

Data is transmitted over encrypted connections (HTTPS). Access tokens are kept in the operating system's
secure storage on your device.

## Data retention and deletion

You can remove your content by deleting items/lists or leaving a list within the app (leaving as the last
owner deletes the list). To request deletion of your account data, contact **[CONTACT EMAIL]** and we will
delete your profile and the data you own.

## Children

The app is not directed to children and is intended for the operator's known users.

## Changes

We may update this policy; material changes will be reflected by the "Last updated" date above.

## Contact

Questions or requests: **[CONTACT EMAIL]**.
