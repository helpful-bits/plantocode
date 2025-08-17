# Reddit Ads API Quick Start Guide

## 1) Prerequisites Checklist

* A Reddit Ads account + a **developer application** (client id/secret, redirect URI). ([Reddit Help Center](https://business.reddithelp.com/s/article/Create-a-Reddit-Application))
* OAuth scopes you'll likely want: `adsread,adsedit,adsconversions` (plus `read,history` if you'll fetch Reddit-side context)
* Note: **creating/editing/deleting** (write) endpoints are restricted; you must be an approved developer (apply via Reddit for Business). Read/reporting works for everyone.

---

## 2) Authentication (OAuth Flow)

### 2.1 Get an authorization code

Open this URL in your browser (replace UPPERCASE placeholders; scopes are comma-separated and URL-encoded):

```
https://www.reddit.com/api/v1/authorize?client_id=CLIENT_ID&response_type=code&state=ANYSTRING&redirect_uri=REDIRECT_URI&duration=permanent&scope=adsread,adsedit,adsconversions
```

After approving, copy the `code` param from the redirect.

### 2.2 Exchange the code for tokens

```bash
# Exchange the authorization code for access + refresh tokens
curl -X POST \
  -A "YourAppName/1.0 by YOUR_REDDIT_USERNAME" \
  -u "CLIENT_ID:CLIENT_SECRET" \
  -d "grant_type=authorization_code&code=AUTH_CODE&redirect_uri=REDIRECT_URI" \
  https://www.reddit.com/api/v1/access_token
```

You'll get `access_token` (bearer) and a `refresh_token`. Keep both. (User-Agent header is required by Reddit.)

### 2.3 Refresh the access token later

```bash
curl -X POST \
  -A "YourAppName/1.0 by YOUR_REDDIT_USERNAME" \
  -u "CLIENT_ID:CLIENT_SECRET" \
  -d "grant_type=refresh_token&refresh_token=REFRESH_TOKEN" \
  https://www.reddit.com/api/v1/access_token
```

---

## 3) Initial Setup - Finding Your Ad Account

> Base for Ads API calls: `https://ads-api.reddit.com/api/v3/...` (send your bearer token + a real User-Agent).

### 3.1 Get your member/profile info

```bash
curl -H "Authorization: Bearer ACCESS_TOKEN" \
     -H "User-Agent: YourAppName/1.0 by YOUR_REDDIT_USERNAME" \
  https://ads-api.reddit.com/api/v3/me
```

### 3.2 List businesses linked to you

```bash
curl -H "Authorization: Bearer ACCESS_TOKEN" \
     -H "User-Agent: YourAppName/1.0 by YOUR_REDDIT_USERNAME" \
  https://ads-api.reddit.com/api/v3/me/businesses
```

Grab a `business_id` from the response.

### 3.3 List ad accounts under a business

```bash
curl -H "Authorization: Bearer ACCESS_TOKEN" \
     -H "User-Agent: YourAppName/1.0 by YOUR_REDDIT_USERNAME" \
  https://ads-api.reddit.com/api/v3/businesses/BUSINESS_ID/ad_accounts
```

Copy the `ad_account_id` you'll use for most operations.

---

## 4) Common API Operations

### 4.1 List campaigns in an ad account

```bash
curl -H "Authorization: Bearer ACCESS_TOKEN" \
     -H "User-Agent: YourAppName/1.0 by YOUR_REDDIT_USERNAME" \
  https://ads-api.reddit.com/api/v3/ad_accounts/AD_ACCOUNT_ID/campaigns
```

### 4.2 Get a performance report (POST)

```bash
curl -X POST \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -H "User-Agent: YourAppName/1.0 by YOUR_REDDIT_USERNAME" \
  -d '{
        "level": "CAMPAIGN",
        "timeframe": {"start_date": "2025-07-01", "end_date": "2025-07-31"},
        "metrics": ["IMPRESSIONS","CLICKS","SPEND"],
        "breakdowns": ["DATE"]
      }' \
  https://ads-api.reddit.com/api/v3/ad_accounts/AD_ACCOUNT_ID/reports
```

### 4.3 Create a campaign (requires approved write access)

```bash
curl -X POST \
  -H "Authorization: Bearer ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -H "User-Agent: YourAppName/1.0 by YOUR_REDDIT_USERNAME" \
  -d '{
        "data": {
          "name": "My API Campaign",
          "configured_status": "PAUSED",
          "objective": "IMPRESSIONS"
        }
      }' \
  https://ads-api.reddit.com/api/v3/ad_accounts/AD_ACCOUNT_ID/campaigns
```

If your app/account isn't approved for write, this will 401/403. Apply to unlock create/edit/delete.

---

## 5) Important Notes

* **Headers:** Always send a non-generic `User-Agent` and your bearer token. Missing UA can trigger confusing 429s.
* **Pagination:** many list/report endpoints return `next_url`/`previous_url`. Follow those URLs verbatim.
* **Scopes & rate limits:** choose scopes intentionally; rate limits are per authorized user/app and documented in headers.
* **Official Postman collection:** great for exploring endpoints and seeing request shapes.

## References

- [Create a Reddit Application](https://business.reddithelp.com/s/article/Create-a-Reddit-Application)
- [Reddit Ads API v3 Postman Collection](https://www.postman.com/reddit-ads-api/reddit-ads-api-v3/overview)
- [Get API Token](https://www.postman.com/reddit-ads-api/reddit-ads-api-v3/collection/j7vyiky/get-api-token)