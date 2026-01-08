# WhatsApp Number Checker (FREE)

A **100% FREE** web application to verify WhatsApp numbers in bulk using the open-source [Baileys](https://github.com/WhiskeySockets/Baileys) library.

## Features

- ✅ **Completely FREE** - No paid API required
- ✅ Verify multiple WhatsApp numbers at once
- 📊 Visual statistics (valid/invalid counts)
- 🔍 Filter results by status
- 📥 Export results as JSON
- 📱 Connect via QR code (like WhatsApp Web)
- 📱 Responsive design

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

2. Start the server:
   ```bash
   npm start
   ```

3. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

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

Run with auto-reload:
```bash
npm run dev
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
