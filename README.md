# Maldives Tax Filer Fullstack

Fullstack Next.js app with:

- GST calculator
- Income Tax calculator
- Employee Withholding Tax calculator
- MIRA Input Tax Claim builder
- Bill image scan using OpenAI Vision
- CSV export for input claim rows
- Local storage for profile/history/input claims

## Run locally

```bash
npm install
cp .env.local.example .env.local
```

Add your OpenAI API key in `.env.local`:

```bash
OPENAI_API_KEY=your_openai_api_key_here
```

Start the app:

```bash
npm run dev
```

Open:

```txt
http://localhost:3000
```

## Important

- Do not put your OpenAI API key in frontend code.
- The backend endpoint is `app/api/extract-input-claim/route.js`.
- The frontend sends bill images to `POST /api/extract-input-claim`.
- Always verify OCR output before filing with MIRA.
