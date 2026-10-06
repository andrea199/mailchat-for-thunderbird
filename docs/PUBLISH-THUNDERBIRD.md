# Pubblicazione sul portale Thunderbird

1. Accedi al [Developer Hub](https://addons.thunderbird.net/developers/) e avvia l'invio di un nuovo componente aggiuntivo, scegliendo la pubblicazione sul portale.
2. Carica **dist/MailChat-for-Thunderbird-1.4.0.xpi**. Non caricare il pacchetto Windows come estensione. Il manifest richiede Thunderbird 153 o superiore.
3. Nome: **MailChat for Thunderbird**. Riassunto: **Collega Thunderbird alle chat locali di Codex: ricerca email, allegati, bozze e risposte con storico. Invio automatico facoltativo.**
4. Descrizione: **MailChat collega Thunderbird e Codex sullo stesso PC Windows tramite un ponte locale autenticato. Permette di cercare e leggere email, scaricare allegati e preparare bozze con firma e storico delle risposte. La modalità predefinita non può inviare: l'utente controlla e invia da Thunderbird. La modalità autonoma va attivata esplicitamente nell'installer e nelle impostazioni dell'estensione, concedendo il permesso facoltativo di invio. Richiede Thunderbird 153+, Node.js 22+, Codex desktop e il pacchetto Windows disponibile su GitHub. I dati letti dalla chat possono essere elaborati dal servizio AI utilizzato da Codex. Progetto indipendente, versione beta.**
5. Icona: **assets/icon-128.png**. Licenza: **MIT**. Homepage: https://github.com/andrea199/mailchat-for-thunderbird . Supporto: https://github.com/andrea199/mailchat-for-thunderbird/issues . Informativa privacy: https://github.com/andrea199/mailchat-for-thunderbird/blob/main/PRIVACY.md .
6. Se vengono richiesti i sorgenti, carica **dist/MailChat-Source-1.4.0.zip**. Nelle note per i revisori incolla il contenuto di **docs/REVIEWER-NOTES.md**. Il codice è leggibile, non minificato, senza dipendenze runtime nell'estensione.
7. Prima di inviare, prova entrambe le modalità in un profilo Thunderbird pulito con account di prova. Aggiungi screenshot reali delle impostazioni, senza la chiave visibile. Controlla e risolvi gli errori del validatore del portale. Non dichiarare completati test che non hai eseguito.
8. Invia alla revisione. L'approvazione e la visibilità sul catalogo dipendono dai revisori Thunderbird. Il caricamento su GitHub non equivale alla pubblicazione nel catalogo.

Per Riccardo e Luca condividi il link alla release GitHub e il **ZIP Windows**. Ognuno deve estrarlo ed eseguire il proprio installer: non condividere cartelle installate, `connection.json` o `Collegamento.txt`.

Riferimenti ufficiali: https://developer.thunderbird.net/add-ons/mailextensions e https://thunderbird.github.io/atn-review-policy/ .
