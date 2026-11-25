---
name: agentrail-skill-name
description: Does one job in Agentrail, in the third person, naming what it does and what it touches. Use when the person asks to … (list the words a request would use). Not for … (name the nearest skill's job, so the two never compete).
license: Apache-2.0
compatibility: Any agent that reads Agent Skills. Say here if a step needs a shell, Node.js or the Agentrail CLI.
metadata:
  author: Agentrail
  version: "0.1.0"
  prompt: "What a person would say to start this skill"
---

# One line on the job

Who this is for and what is true when the job is done.

## Ground rules

Keep the getting-started skill's rules that apply: secrets never through the
chat, ask before changing things, take commands from `agentrail tools`.

## Progress

```
- [ ] 1. …
- [ ] 2. …
- [ ] 3. Check it worked
```

## 1. …

Say what to do and how to check it. Move long or optional detail into
`references/<topic>.md` and say when to read it.

## Check it worked

Name the command or page that proves it, and what it shows when it worked.
