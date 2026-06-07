# SceneSelf Partner API

The Partner API lets approved partners self-service generate batches of
redemption codes that their users can redeem for SceneSelf credits.

This is a small, focused API:

- One endpoint to generate a batch of codes.
- One credential type: an API key in the `x-api-key` header.
- One quota: a daily code-generation limit per key.

---

## 1. Authentication

All requests must include your API key in the `x-api-key` request header:

```
x-api-key: sk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

- Keys are issued by the SceneSelf team via the admin console.
- Keys are returned **exactly once at creation time** — store them in a
  secret manager. We only retain a SHA-256 hash.
- Keys can be deactivated at any time. Deactivated keys return `403`.

> Do not commit keys to source control.
> Do not expose keys in client-side code.

---

## 2. Generate Codes

```
POST https://your-domain.com/api/partner/codes
Content-Type: application/json
x-api-key: sk_...
```

Request body:

```json
{
  "count": 50,
  "credits": 500,
  "channel": "spring-campaign-2026"
}
```

| Field     | Type    | Required | Notes                                                                           |
| --------- | ------- | -------- | ------------------------------------------------------------------------------- |
| `count`   | integer | yes      | Number of codes to generate. Must be an integer in `[1, 500]`.                  |
| `credits` | integer | yes      | Credits per code. Must be a positive integer.                                   |
| `channel` | string  | no       | Free-form label for analytics/auditing (e.g. `"newsletter-jan"`). Max 200 chars. |

### Success response (200)

```json
{
  "success": true,
  "batchId": "batch_8aF2qLp4",
  "codes": [
    "ABCDEFGHJKMN",
    "PQRSTUVWXYZ2",
    "..."
  ]
}
```

- Each code is 12 characters long.
- Character set: `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (avoids `0/O/1/I/L`).
- When displayed to end users, you can format as `AAAA-BBBB-CCCC` —
  the redemption endpoint accepts dashes, lowercase, or mixed input.
- One code = one redemption. Codes are claimed atomically; only the
  first user to redeem succeeds.

### Example: curl

```bash
curl -X POST https://your-domain.com/api/partner/codes \
  -H "Content-Type: application/json" \
  -H "x-api-key: $SCENESELF_PARTNER_KEY" \
  -d '{"count": 50, "credits": 500, "channel": "spring-campaign-2026"}'
```

### Example: Node (fetch)

```ts
const res = await fetch("https://your-domain.com/api/partner/codes", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-key": process.env.SCENESELF_PARTNER_KEY!,
  },
  body: JSON.stringify({
    count: 50,
    credits: 500,
    channel: "spring-campaign-2026",
  }),
});
const data = await res.json();
```

---

## 3. Error Codes

| Status | Meaning                                                                                       |
| ------ | --------------------------------------------------------------------------------------------- |
| `400`  | Invalid JSON body, or `count` / `credits` outside allowed range.                              |
| `401`  | Missing or invalid `x-api-key`.                                                               |
| `403`  | API key has been deactivated.                                                                 |
| `429`  | Daily limit exceeded. Try again after midnight UTC, or request a higher limit.                |
| `500`  | Internal server error while generating the batch. Retry with exponential backoff is fine.     |

Error response shape:

```json
{ "error": "Daily limit exceeded" }
```

---

## 4. Daily Limit

- Each key has a configurable `dailyLimit` (default `1000`).
- The counter (`codesToday`) resets at **00:00 UTC** the next day.
- The check is atomic: a request that would push `codesToday + count`
  over the limit is rejected with `429` and no codes are generated.

If you need a higher limit, contact us with the partner name and the
expected steady-state volume.

---

## 5. How End Users Redeem

End users redeem codes on the SceneSelf account page:

```
https://your-domain.com/credits     (English)
https://your-domain.com/zh/credits  (Chinese)
```

They enter the 12-character code. We accept any combination of
uppercase, lowercase, and dashes — `abcd-efgh-jkmn` and
`ABCDEFGHJKMN` are treated identically.

Upon successful redemption, credits are added to the user's balance
and a `redemption` entry appears in their credit history.

---

## 6. Operational Notes

- We log every code generation event with your `partnerId` and a
  `batchId` so disputes and audits are tractable.
- We will email the registered contact if your key is rate-limited or
  deactivated.
- Plan for storage: a typical campaign of 10k codes is ~150 KB of
  text. Treat codes themselves as sensitive — anyone with the code
  can redeem.

---

## 7. Contact

For onboarding, increased limits, deactivation, or anything else,
contact us at **partners@your-domain.com**.
