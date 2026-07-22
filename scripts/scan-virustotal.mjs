// Submits the built installer to VirusTotal for scanning and prints the permanent report URL
// (addressed by the file's SHA-256, so the link is valid immediately even before the scan
// finishes — VirusTotal's own report page shows live progress). Requires VT_API_KEY in the
// environment. Files over 32MB (our installer is) need the special upload-URL flow instead of
// posting directly to /files.
import { createHash } from 'crypto'
import { readFileSync } from 'fs'

const filePath = process.argv[2]
const apiKey = process.env.VT_API_KEY
if (!filePath || !apiKey) {
  console.error('Usage: VT_API_KEY=... node scan-virustotal.mjs <file>')
  process.exit(1)
}

const fileBuffer = readFileSync(filePath)
const sha256 = createHash('sha256').update(fileBuffer).digest('hex')
const reportUrl = `https://www.virustotal.com/gui/file/${sha256}`

const uploadUrlRes = await fetch('https://www.virustotal.com/api/v3/files/upload_url', {
  headers: { 'x-apikey': apiKey }
})
if (!uploadUrlRes.ok) {
  console.error(`Failed to get VirusTotal upload URL: ${uploadUrlRes.status} ${await uploadUrlRes.text()}`)
  process.exit(1)
}
const { data: uploadUrl } = await uploadUrlRes.json()

const form = new FormData()
form.append('file', new Blob([fileBuffer]), filePath.split(/[\\/]/).pop())

const submitRes = await fetch(uploadUrl, {
  method: 'POST',
  headers: { 'x-apikey': apiKey },
  body: form
})
if (!submitRes.ok) {
  console.error(`Failed to submit file to VirusTotal: ${submitRes.status} ${await submitRes.text()}`)
  process.exit(1)
}

console.error(`VirusTotal report: ${reportUrl}`)
console.log(`vt_report_url=${reportUrl}`)
