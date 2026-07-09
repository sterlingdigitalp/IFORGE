# Batch Worker Failures

## 2026-07-02 Real Worker Validation

Command:

```bash
npm run worker:chatgpt -- --character newton
```

Batch:

```text
data/characters/newton/batches/batch-validation-chatgpt/schedule.json
```

Result:

```text
Running newton/batch-validation-chatgpt round 1 (P-EE8BF161)
ChatGPT is not signed in. Run the worker once, sign in in the opened browser, then rerun.
```

Schedule mutation observed:

```json
"status": "failed",
"error": "ChatGPT is not signed in. Run the worker once, sign in in the opened browser, then rerun."
```

Impact:

- Chrome profile path was created at `.iforge/chatgpt-profile`.
- Reference preparation succeeded with two PNG files.
- Prompt submission did not occur.
- No generated candidate was saved.
- `schedule.json` did not reach `saved`.
- Normal loop promotion was not run because there is no real saved output.

Required next action:

Authenticate the worker profile with ChatGPT, then rerun the same worker command.

Manual profile launch:

```bash
open -na "Google Chrome" --args --user-data-dir="/Users/sterlingdigital/IFORGE/.iforge/chatgpt-profile" "https://chatgpt.com/"
```

Rerun:

```bash
npm run worker:chatgpt -- --character newton
```

Do not count the batch worker as validated until a real `chatgpt-web` output is saved and approved through `./iforge`.
