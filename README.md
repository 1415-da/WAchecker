# WhatsApp Number Checker (Local Electron App)

A **local desktop app** (Electron) to verify WhatsApp numbers in bulk using the open-source [Baileys](https://github.com/WhiskeySockets/Baileys) library.

## Features

- ✅ **Completely FREE** - No paid API required
- ✅ Verify multiple WhatsApp numbers at once
- 📊 Visual statistics (valid/invalid counts)
- 🔍 Filter results by status
- 📥 Export results as JSON
- 📱 Connect via QR code (like WhatsApp Web)
- 📱 Responsive design

## Tech stack

- Electron (main process in `electron/main.js`)
- React + Vite (renderer)
- Tailwind CSS
- shadcn/ui components
- Express + Baileys backend (still in `server.js`, runs locally on port `3000`)

## How It Works

This app connects to WhatsApp Web using your own WhatsApp account (just like the official WhatsApp Web). You scan a QR code once, and then you can verify if phone numbers are registered on WhatsApp.

## Requirements

- Node.js 14+
- A WhatsApp account on your phone

## Installation

1. Install dependencies:

   ```bash
   npm install
   ```

## Run (desktop)

### Development

This starts the Vite dev server and launches Electron pointing at it.

```bash
npm run dev
```

### Production build

Build the React renderer:

```bash
npm run build
```

Then run Electron loading the built files:

```bash
npm start
```

## Backend notes

- The backend is your existing Express server in `server.js`.
- The Electron main process starts it automatically (port `3000`) and the React UI calls `http://127.0.0.1:3000/api/*`.
- Your WhatsApp auth/session is stored locally in `auth_info/`.

## Usage

1. Click **Connect WhatsApp**
2. Scan the QR code with your WhatsApp:
   - Open WhatsApp on your phone
   - Go to Settings → Linked Devices → Link a Device
   - Scan the QR code shown in the app
3. Once connected, enter phone numbers (one per line) with country code:
   ```
   1234567890
   14155552671
   447911123456
   ```
4. Click **Verify Numbers**
5. View results with filtering options
6. Export results as JSON if needed

## Development

If you want to run only the backend:

```bash
npm run backend
```

Watch mode backend-only:

```bash
npm run backend:watch
```

## Important Notes

⚠️ **Use Responsibly:**

- Your WhatsApp session is stored locally in the `auth_info` folder
- Don't use this for spamming or malicious purposes
- WhatsApp may restrict accounts that make too many verification requests
- This is for legitimate use cases like cleaning contact lists

## Technologies Used

- [Express.js](https://expressjs.com/) - Web framework
- [Baileys](https://github.com/WhiskeySockets/Baileys) - WhatsApp Web API (open source)
- [qrcode](https://www.npmjs.com/package/qrcode) - QR code generation

## License

MIT
