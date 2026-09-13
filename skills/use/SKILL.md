---
name: use
description: One slash, zero setup — /use. Routes through 8 free-tier providers (chat, code, image) with level-2 token compression. Bash vs chat intent inferred from one quoted string.
---

## /use — Unified Slash Command

**Usage:** `/use "quoted string"`

**Bash intent** (executed via local shell) if the quoted string contains:
- Shell tokens: `|`, `>`, `>>`, `<`, `<<`, `&&`, `||`, `$(`, `` ` ``
- Path patterns: `./`, `../`, `/bin/`, `/usr/`
- Command leads: `sudo`, `npm`, `npx`, `git`, `docker`, `make`, `pip`, `yarn`
- Sentinel chars: `!`, `$` at end

**Chat intent** (routed to free provider) for everything else — natural language, code questions, prompts.

**Override prefixes:**
- `bash: ` — force bash execution
- `chat: ` — force chat routing

**Examples:**
```
/use "hello world"                        # chat
/use "git log -1 --stat"                  # bash
/use "summarize this PR"                  # chat
/use "ls -la src"                         # bash
/use "bash: ls -la"                       # forced bash
/use "chat: ls -la"                       # forced chat (prompt)
```

**Subcommands:**
```
/use status                 # Current routing + quota levels
/use providers              # List providers + their quota status
/use compress stats         # See tokens saved this session
/use strategy <name>        # Switch strategy (priority|round-robin|cost)
/use compress <0|1|2>       # Adjust compression level (default: 2)
/use config                 # Interactive setup wizard
/use provider add <name>    # Add custom provider
/use provider remove <name> # Remove a provider
/use provider disable <name># Temporarily disable a provider
/use forecast               # Quota exhaustion projection
/use emergency local        # Enable local-model fallback (Ollama/llama.cpp)
/use emergency skip         # Stop on provider exhaustion
/use savings                # Session cost dashboard
```

**Implementation:** Dispatch is in `src/cli.ts` (`inferIntent()` + `dispatch()`). Slash wiring in `src/commands/`.