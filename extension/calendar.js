/* Read-only iCalendar extraction. Preserve timezone identifiers; never guess offsets. */
(() => {
  const MAX = 256000;
  const unescape = s => s.replace(/\\([nN,;\\])/g, (_, c) => /n/i.test(c) ? '\n' : c);
  function property(line) {
    let quoted = false, colon = -1;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') quoted = !quoted;
      if (line[i] === ':' && !quoted) { colon = i; break; }
    }
    if (colon < 0) return null;
    const chunks = line.slice(0, colon).match(/(?:[^;" ]|"[^"]*"| )+/g) || [];
    const name = chunks.shift()?.toUpperCase(), params = {};
    for (const chunk of chunks) {
      const i = chunk.indexOf('=');
      if (i > 0) params[chunk.slice(0, i).toUpperCase()] = chunk.slice(i + 1).replace(/^"|"$/g, '');
    }
    return {name, params, value:line.slice(colon + 1)};
  }
  function date(p) {
    if (!p) return null;
    const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(p.value);
    if (!m) return {raw:p.value, timezone:p.params.TZID || null, invalid:true};
    return {raw:p.value, value:`${m[1]}-${m[2]}-${m[3]}` + (m[4] ? `T${m[4]}:${m[5]}:${m[6]}${m[7] || ''}` : ''),
      all_day:!m[4], timezone:m[7] ? 'UTC' : p.params.TZID || null, floating:!!m[4] && !m[7] && !p.params.TZID};
  }
  function parse(source) {
    if (source.length > MAX) throw new Error('Calendar exceeds 256000 characters.');
    const lines = source.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');
    const events = [], stack = []; let current = null, method = null;
    for (const line of lines) {
      const p = property(line); if (!p) continue;
      if (p.name === 'BEGIN') {
        stack.push(p.value.toUpperCase());
        if (stack.join('/') === 'VCALENDAR/VEVENT') current = [];
      } else if (p.name === 'END') {
        if (stack.at(-1) !== p.value.toUpperCase()) throw new Error('Malformed calendar component.');
        if (stack.join('/') === 'VCALENDAR/VEVENT' && current) { events.push(current); current = null; }
        stack.pop();
      } else if (stack.join('/') === 'VCALENDAR' && p.name === 'METHOD') method = p.value;
      else if (stack.join('/') === 'VCALENDAR/VEVENT' && current) current.push(p);
    }
    if (stack.length || !events.length) throw new Error('Incomplete calendar or no VEVENT.');
    if (events.length > 20) throw new Error('Calendar exceeds 20 events.');
    return events.map(props => {
      const one = name => props.find(p => p.name === name);
      const value = name => one(name) ? unescape(one(name).value) : null;
      const person = p => ({address:p.value.replace(/^mailto:/i, ''), name:p.params.CN || null, role:p.params.ROLE || null, response:p.params.PARTSTAT || null});
      const description = value('DESCRIPTION'), location = value('LOCATION');
      return {method, uid:value('UID'), title:value('SUMMARY'), start:date(one('DTSTART')), end:date(one('DTEND')),
        end_is_exclusive:true, duration:value('DURATION'), status:value('STATUS'), sequence:value('SEQUENCE'),
        recurrence_id:date(one('RECURRENCE-ID')), recurrence:props.filter(p => ['RRULE','RDATE','EXDATE'].includes(p.name)),
        organizer:one('ORGANIZER') ? person(one('ORGANIZER')) : null,
        attendees:props.filter(p => p.name === 'ATTENDEE').map(person), description, location, url:value('URL'),
        meeting_links:[...new Set([description, location, value('URL'), value('X-MICROSOFT-SKYPETEAMSMEETINGURL')].filter(Boolean).flatMap(s => s.match(/https?:\/\/[^\s<>"\\]+/g) || []))],
        timezone_note:'TZID and local wall time are preserved. Resolve timezone rules before scheduling; do not assume the computer timezone. Recurrences are not expanded.'};
    });
  }
  // Some Thunderbird versions omit inline calendar bodies from getFull and attachments.
  function rawCalendars(raw, depth = 0) {
    if (depth > 20) throw new Error('MIME nesting limit exceeded.');
    const split = /\r?\n\r?\n/.exec(raw); if (!split) return [];
    const headers = raw.slice(0, split.index).replace(/\r?\n[ \t]+/g, ' ');
    const body = raw.slice(split.index + split[0].length);
    const type = /^content-type:\s*([^\r\n]+)/im.exec(headers)?.[1] || 'text/plain';
    if (/^message\/rfc822/i.test(type)) return [];
    if (/^multipart\//i.test(type)) {
      const boundary = /boundary\s*=\s*(?:"([^"]+)"|([^;\s]+))/i.exec(type);
      if (!boundary) throw new Error('Missing MIME boundary.');
      const marker = '--' + (boundary[1] || boundary[2]);
      const parts = []; let lines = null;
      for (const line of body.split(/\r?\n/)) {
        if (line.trimEnd() === marker || line.trimEnd() === marker + '--') {
          if (lines) parts.push(lines.join('\r\n'));
          lines = line.trimEnd() === marker ? [] : null;
          if (!lines) break;
        } else if (lines) lines.push(line);
      }
      return parts.flatMap(part => rawCalendars(part, depth + 1));
    }
    if (!/^(text\/calendar|application\/ics)(;|\s|$)/i.test(type)) return [];
    const encoding = /^content-transfer-encoding:\s*([^\s]+)/im.exec(headers)?.[1]?.toLowerCase();
    let text = body;
    const charset = /charset\s*=\s*"?([^;"\s]+)/i.exec(type)?.[1] || 'utf-8';
    if (encoding === 'base64') text = new TextDecoder(charset).decode(Uint8Array.from(atob(body.replace(/\s/g, '')), c => c.charCodeAt(0)));
    else if (encoding === 'quoted-printable') {
      const binary = body.replace(/=\r?\n/g, '').replace(/=([0-9a-f]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
      text = new TextDecoder(charset).decode(Uint8Array.from(binary, c => c.charCodeAt(0)));
    }
    return [text];
  }
  async function read(id) {
    const result = {events:[], warnings:[], content_is_untrusted:true};
    try {
      const root = await messenger.messages.getFull(id, {decodeContent:true});
      const candidates = [];
      function walk(part) {
        if (String(part.contentType).toLowerCase().split(';')[0] === 'message/rfc822') return;
        if (/^(text\/calendar|application\/ics)(;|$)/i.test(part.contentType || '') || /\.ics$/i.test(part.name || '')) candidates.push(part);
        for (const child of part.parts || []) walk(child);
      }
      walk(root);
      if (candidates.length > 10) result.warnings.push('Only the first 10 calendar parts were read.');
      let rawFallback;
      for (const part of candidates.slice(0, 10)) {
        try {
          if (part.size > MAX) throw new Error('Calendar part exceeds size limit.');
          let body = part.body;
          if (typeof body !== 'string') {
            try {
              const file = await messenger.messages.getAttachmentFile(id, part.partName);
              if (file.size > MAX) throw new Error('Calendar attachment exceeds size limit.');
              body = await file.text();
            } catch {
              if (!rawFallback) {
                const file = await messenger.messages.getRaw(id, {data_format:'File'});
                if (file.size > 5 * 1024 * 1024) throw new Error('Raw MIME fallback exceeds 5 MiB.');
                rawFallback = rawCalendars(await file.text());
                for (const text of rawFallback.slice(0, 10)) result.events.push(...parse(text).map(event => ({...event, source:'raw_mime'})));
              }
              continue;
            }
          }
          result.events.push(...parse(body).map(event => ({...event, part_name:part.partName})));
        } catch (e) { result.warnings.push(`Calendar part ${part.partName}: ${e.message}`); }
      }
    } catch (e) { result.warnings.push(`Calendar extraction unavailable: ${e.message}`); }
    const seen = new Set();
    result.events = result.events.filter(event => {const key = JSON.stringify([event.uid,event.start,event.end,event.recurrence_id,event.sequence,event.title]); if (seen.has(key)) return false; seen.add(key); return true;});
    return result;
  }
  globalThis.TBCalendar = {parse, read, rawCalendars};
})();
