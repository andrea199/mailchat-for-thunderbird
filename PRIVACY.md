# MailChat privacy notice

MailChat is an independent, open-source local bridge between Thunderbird and Codex on the same computer. The project author operates no MailChat mail-processing server and collects no telemetry through this extension.

## Data and where it goes

The extension accesses account identities, message metadata, selected message bodies and attachments to answer tool requests. Reply preparation retrieves the original and RFC-linked predecessors. These data are sent over authenticated localhost HTTP to the local Node.js bridge. Tool responses are then returned to Codex. Codex and its connected AI provider may transmit, store or process those data under their own terms and privacy settings. Check those settings before using MailChat with confidential or other people's mail.

Outgoing local files are read only from supplied paths, verified by SHA-256 and transferred through the bridge for attachment to drafts. Selected received attachments are saved under the installation's private local attachment directory. The chat can subsequently read those local files with its own tools. Mail sent or drafts saved are also processed by your configured mail provider.

The extension stores a local pairing key, mode and consent choice in Thunderbird storage, together with draft verification records and sending receipts. The Windows installer stores two random authentication keys, mode and port in `connection.json` and prints the extension key in `Pairing-Key.txt`. Keep the installed folder private and out of shared/cloud folders. MailChat does not bundle your passwords or an AI API key.

## Consent and sending

No email tools are handled until you pair the extension and accept its data-sharing notice. Drafts-only is the default. Sending is optional and requires autonomous mode in both the installer and extension, plus the Thunderbird `compose.send` permission. In autonomous mode the AI can send without an additional approval of each draft. Content in mail is treated as untrusted data in tool instructions, but AI behaviour is not a privacy or correctness guarantee.

## Control and retention

Disable automatic sending in extension settings, or disconnect to remove the pairing key and consent. Disconnecting does not erase already-created drafts, chat history, locally downloaded files or verification records. Removing the extension removes its local extension storage according to Thunderbird behaviour; remove the installation folder to delete bridge keys and downloaded attachments. You control mail and chat retention separately with your providers.

No tracking, advertising or analytics libraries are bundled. This notice describes the project code, not the independent practices of Thunderbird, your mail provider or your AI service. For questions, use the project's GitHub Issues, without posting private mail or keys.
