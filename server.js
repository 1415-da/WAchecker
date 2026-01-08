import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import makeWASocket, { DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } from '@whiskeysockets/baileys'
import pino from 'pino'
import QRCode from 'qrcode'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const PORT = process.env.PORT || 3000

// Middleware
app.use(express.json())
app.use(express.static(path.join(__dirname, 'public')))

// WhatsApp connection state
let sock = null
let qrCode = null
let connectionStatus = 'disconnected' // disconnected, connecting, connected
let reconnectAttempts = 0
const MAX_RECONNECT_ATTEMPTS = 3

// Logger
const logger = pino({ level: 'silent' })

// Initialize WhatsApp connection
async function connectToWhatsApp() {
  try {
    // Fetch latest version to avoid 405 errors
    const { version, isLatest } = await fetchLatestBaileysVersion()
    console.log(`Using WA version: ${version.join('.')}, isLatest: ${isLatest}`)

    const { state, saveCreds } = await useMultiFileAuthState('auth_info')
    
    connectionStatus = 'connecting'
    qrCode = null

    sock = makeWASocket({
      version,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger)
      },
      logger,
      browser: ['WhatsApp Checker', 'Chrome', '120.0.0'],
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      markOnlineOnConnect: false
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update

      if (qr) {
        // Generate QR code as data URL
        try {
          qrCode = await QRCode.toDataURL(qr)
          connectionStatus = 'connecting'
          reconnectAttempts = 0 // Reset on new QR
          console.log('📱 Scan the QR code with your WhatsApp to connect')
        } catch (err) {
          console.error('Failed to generate QR:', err)
        }
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut && 
                                reconnectAttempts < MAX_RECONNECT_ATTEMPTS
        
        console.log(`Connection closed (code: ${statusCode}). Reconnecting: ${shouldReconnect}`)
        connectionStatus = 'disconnected'
        qrCode = null
        sock = null
        
        if (shouldReconnect) {
          reconnectAttempts++
          const delay = Math.min(reconnectAttempts * 2000, 10000) // Progressive delay
          console.log(`Reconnect attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${delay/1000}s...`)
          setTimeout(connectToWhatsApp, delay)
        } else if (statusCode === DisconnectReason.loggedOut) {
          console.log('Logged out. Please click Connect again to get a new QR code.')
          reconnectAttempts = 0
        }
      } else if (connection === 'open') {
        console.log('✅ Connected to WhatsApp!')
        connectionStatus = 'connected'
        qrCode = null
        reconnectAttempts = 0
      }
    })
  } catch (error) {
    console.error('Connection error:', error)
    connectionStatus = 'disconnected'
    qrCode = null
  }
}

// API: Get connection status
app.get('/api/status', (req, res) => {
  res.json({
    status: connectionStatus,
    qrCode: qrCode,
    connected: connectionStatus === 'connected'
  })
})

// API: Connect/Reconnect to WhatsApp
app.post('/api/connect', async (req, res) => {
  try {
    if (connectionStatus === 'connected') {
      return res.json({ success: true, message: 'Already connected' })
    }
    
    await connectToWhatsApp()
    res.json({ success: true, message: 'Connecting... Please scan QR code' })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// API: Disconnect from WhatsApp
app.post('/api/disconnect', async (req, res) => {
  try {
    if (sock) {
      await sock.logout()
      sock = null
    }
    connectionStatus = 'disconnected'
    qrCode = null
    res.json({ success: true, message: 'Disconnected' })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// API: Verify phone numbers
app.post('/api/verify', async (req, res) => {
  try {
    const { phoneNumbers } = req.body

    if (!phoneNumbers || !Array.isArray(phoneNumbers) || phoneNumbers.length === 0) {
      return res.status(400).json({ 
        error: 'Please provide an array of phone numbers' 
      })
    }

    if (connectionStatus !== 'connected' || !sock) {
      return res.status(400).json({ 
        error: 'WhatsApp is not connected. Please scan the QR code first.' 
      })
    }

    // Clean phone numbers (remove + and spaces)
    const cleanedNumbers = phoneNumbers
      .map(num => num.trim().replace(/[^\d]/g, ''))
      .filter(num => num.length >= 7)

    if (cleanedNumbers.length === 0) {
      return res.status(400).json({ 
        error: 'No valid phone numbers provided' 
      })
    }

    // Check numbers on WhatsApp
    const results = []
    
    for (const number of cleanedNumbers) {
      try {
        // Format for WhatsApp: number@s.whatsapp.net
        const jid = `${number}@s.whatsapp.net`
        const [result] = await sock.onWhatsApp(jid)
        
        results.push({
          phone: `+${number}`,
          exists: !!result?.exists,
          jid: result?.jid || null
        })
      } catch (error) {
        results.push({
          phone: `+${number}`,
          exists: false,
          error: error.message
        })
      }
    }

    res.json({
      success: true,
      total: results.length,
      valid: results.filter(r => r.exists).length,
      invalid: results.filter(r => !r.exists).length,
      results
    })

  } catch (error) {
    console.error('Verification error:', error)
    res.status(500).json({ 
      error: error.message || 'An error occurred during verification' 
    })
  }
})

// Serve the frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
})

app.listen(PORT, () => {
  console.log(`🚀 WhatsApp Number Checker running at http://localhost:${PORT}`)
  console.log('📱 Click "Connect WhatsApp" in the app to start')
})
