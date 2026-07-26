# LLNKKR Short URL API

## Endpoint

`POST https://llnk.kr/api/v1/shorten.php`

The request body must be JSON.

```json
{
  "url": "https://example.com/very/long/link"
}
```

## Response

```json
{
  "ok": true,
  "success": true,
  "code": "ak7m2q",
  "shortUrl": "https://llnk.kr/ak7m2q",
  "createdAt": "2026-07-26T12:00:00+09:00"
}
```

API-generated links use `a` followed by five lowercase letters or numbers.

## Limits

Without an API key:

- 300 links per IP per day
- 60 requests per minute
- 20 requests per 10 seconds

With an API key, the default limits are:

- 3,000 links per day
- 300 requests per minute
- 60 requests per 10 seconds

The server returns HTTP `429` and a `Retry-After` header when a limit is exceeded.

## Authentication

API keys are optional. Send a key from a trusted server using one of these headers:

```text
Authorization: Bearer YOUR_API_KEY
```

```text
X-API-Key: YOUR_API_KEY
```

Do not embed an API key in public browser JavaScript.

## cURL

```bash
curl -X POST https://llnk.kr/api/v1/shorten.php \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/very/long/link"}'
```

## JavaScript

```js
const response = await fetch("https://llnk.kr/api/v1/shorten.php", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ url: "https://example.com/very/long/link" }),
});

const result = await response.json();
```

## Status Codes

- `200`: Link created
- `401`: Invalid or unavailable API key
- `405`: Unsupported method
- `422`: Invalid target URL
- `429`: Rate limit exceeded
- `500`: Server error
