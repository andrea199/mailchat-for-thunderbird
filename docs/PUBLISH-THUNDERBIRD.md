# Publishing on the Thunderbird add-ons portal

## GitHub release automation

`.github/workflows/publish-thunderbird.yml` submits the public XPI to the existing Thunderbird listing when a GitHub release is published. It verifies the tag, version and public extension ID, runs tests, builds the packages and preserves the reviewer source ZIP as an Actions artifact. Manual runs default to a dry run and require an existing release tag.

One-time setup: obtain API credentials from https://addons.thunderbird.net/developers/addon/api/key/ and store them in this repository's Actions secrets as `ATN_SIGN_KEY` and `ATN_SIGN_SECRET`. Do not put credentials in commits, logs, chat or release assets. The workflow has read-only GitHub permissions and exposes portal credentials only to the submission step.

Thunderbird uses the legacy v4 submission API. Submission does not mean review approval. Release/reviewer notes and any required source upload must be completed in the Developer Hub; the source ZIP is available in the workflow artifacts. Do not rerun a submission blindly after an uncertain result: check the existing version in the Developer Hub first. Version 1.4.3 was already submitted manually on 2026-10-26 and must not be resubmitted.

## Portal submission

1. Sign in to the [Developer Hub](https://addons.thunderbird.net/developers/), submit a new add-on and choose listing on the portal.
2. Upload **dist/MailChat-for-Thunderbird-1.4.3.xpi**. Do not upload the Windows ZIP as the extension. The manifest requires Thunderbird 153 or later.
3. Name: **MailChat for Thunderbird**. Summary: **Connect Thunderbird to local Codex chats: email search, attachments, drafts and replies with history. Optional autonomous sending.**
4. Description: **MailChat connects Thunderbird and Codex on the same Windows PC through an authenticated local bridge. Search and read messages, download attachments and prepare drafts with your account signature and reply history. The default mode cannot send: you review and send in Thunderbird. Autonomous mode must be enabled explicitly in both the installer and extension settings, with the optional send permission. Requires Thunderbird 153+, Node.js 22+, Codex desktop and the Windows package available on GitHub. Data read by the chat may be processed by the AI service used by Codex. Independent project, beta release.**
5. Icon: **assets/icon-128.png**. License: **MIT**. Homepage: https://github.com/andrea199/mailchat-for-thunderbird . Support: https://github.com/andrea199/mailchat-for-thunderbird/issues . Privacy notice: https://github.com/andrea199/mailchat-for-thunderbird/blob/main/PRIVACY.md .
6. If source code is requested, upload **dist/MailChat-Source-1.4.3.zip**. Paste **docs/REVIEWER-NOTES.md** into the reviewer notes. The JavaScript is readable, unminified and has no runtime extension dependencies.
7. Before submission, test both modes in a clean Thunderbird profile with a test mail account. Add real screenshots of settings with the pairing key hidden. Fix portal validator errors. Do not claim tests were completed unless you ran them.
8. Submit for review. Approval and catalog visibility depend on Thunderbird's reviewers. Publishing on GitHub does not publish the extension in the Thunderbird catalog.

For beta testers, share the GitHub release link and the **Windows ZIP**. Each person must extract it and run their own installer. Never share installed folders, connection.json or Pairing-Key.txt.

Official references: https://developer.thunderbird.net/add-ons/mailextensions and https://thunderbird.github.io/atn-review-policy/ .
