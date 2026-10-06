<img src="assets/icon-128.png" width="96" alt="MailChat bird" />

# MailChat for Thunderbird

Connect Thunderbird to local Codex chats on your Windows PC. Search and read mail, download selected attachments, prepare new messages and replies with your account signature and conversation history.

**Public beta 1.4.0 — Windows, Node.js 22+, Thunderbird 153+, Codex desktop with local MCP support.** End-to-end testing in a clean Thunderbird profile is still required before a stable release. This is an independent community project, not an official Thunderbird or OpenAI product. There is no hosted service or API key bundled with MailChat. Your chat service may require its own account or subscription.

## Choose how sending works

| Mode | Behaviour |
| --- | --- |
| Drafts only (default) | The chat prepares drafts. You review and send manually in Thunderbird. Sending tools are hidden and blocked by the local bridge; the extension does not request send permission. |
| Autonomous sending (opt-in) | The chat can send a prepared message without another human review. Enable this in both the Windows installer and Thunderbird settings, granting the optional send permission. |

“Write an email” means prepare a draft in either mode. Autonomous mode makes sending available when requested; creating a draft never sends it. Mode changes are local user actions, not chat commands. Switch off autonomous mode in Thunderbird at any time. Rerun the installer in drafts mode to also disable sending in the bridge, then restart Codex.

## Install on Windows

1. Download `MailChat-Windows-1.4.0.zip` from [Releases](https://github.com/andrea199/mailchat-for-thunderbird/releases). Extract the ZIP first.
2. Install Node.js 22 or later from [nodejs.org](https://nodejs.org/en/download) if it is missing. Install Thunderbird 153+ and configure your mail account. Install Codex desktop and sign in.
3. Run `Install.cmd`. Choose **1 — Drafts only** or **2 — Autonomous sending**. Choice 2 also asks you to type `AUTONOMOUS SENDING`.
4. The installer prints a folder under `%LOCALAPPDATA%\MailChat`. In Thunderbird, open **Add-ons and Themes → gear → Install Add-on From File** and select `MailChat-for-Thunderbird-1.4.0.xpi` in that folder.
5. Open MailChat settings. Copy the local key from `Pairing-Key.txt`, read and accept the data-sharing consent, and save. Never share that key or the installed folder. Each person runs their own installer and receives different keys.
6. For autonomous sending, also select that mode in Thunderbird, tick its confirmation and grant the optional sending permission. Both sides must be enabled.
7. Completely close and reopen Codex. Leave Thunderbird open. Ask the chat to check the MailChat/Thunderbird connection, then start with a draft.

The XPI alone is not sufficient: the local Windows bridge is also required. The installer adds an `mcp_servers.mailchat` block to your Codex configuration and backs up an existing configuration. It preserves other server entries. A previous **Thunderbird Direct** integration uses the same local port; disable that server and add-on and close its broker before using MailChat. Do not run both together.

## Replies and attachments

Replies include the original message and its RFC-linked predecessors, including older messages outside the normal search window. Missing referenced messages produce an error instead of silently omitting them. Subject-only matches and unrelated sibling branches are not guessed. Limits: 200 history messages, 2 million history characters. Each local attachment is checked by SHA-256 before transfer; limits are 10 attachments, 20 MiB each and 25 MiB total.

Autonomous sending checks the exact draft, recipients, attachments and parent again before sending. If the draft changes, permission is revoked or the result is uncertain, it stops. Do not retry an uncertain send with a new request ID: inspect Drafts, Sent and Outbox. Restarted sessions may require preparing a new verified draft after inspecting the existing one.

## Privacy and support

The bridge listens only on `127.0.0.1:37629` with independent local authentication keys. Mail read by tools is returned to Codex and may be processed by its AI service; this is **not an offline AI system**. Read [PRIVACY.md](PRIVACY.md) for details. Report bugs in [Issues](https://github.com/andrea199/mailchat-for-thunderbird/issues), without mail content, keys or personal configuration.

Uninstall: remove the extension in Thunderbird, remove the marked MailChat block from Codex `config.toml`, restart Codex, stop any remaining MailChat Node process, then remove `%LOCALAPPDATA%\MailChat`. Drafts or messages already saved in Thunderbird remain in your mail account.

## Build and review

No npm dependencies are needed. With Node.js 22+: `npm test`, then `npm run build`. Outputs are in `dist/`: universal XPI, Windows ZIP, source ZIP and SHA-256 checksums. Icons are committed PNG files. JavaScript is readable and unminified. See [portal submission instructions](docs/PUBLISH-THUNDERBIRD.md) and [reviewer notes](docs/REVIEWER-NOTES.md). MIT license.
