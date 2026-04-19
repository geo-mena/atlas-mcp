/**
 * SENIAT mock — Day 0 skeleton.
 *
 * Returns a hardcoded urn:atlas:sandbox:seniat:v1 envelope on POST /seniat-mock/authorize.
 * Day 1 wires variable control numbers and fiscal sequences from a counter,
 * and exercises the FLAKE_EVERY_N env var (503 every Nth request) for retry logic.
 *
 * NOT real SENIAT. Synthetic field names only.
 */

import express, { type Request, type Response } from 'express';
import { create } from 'xmlbuilder2';

const app = express();
app.use(express.text({ type: ['application/xml', 'text/xml', 'application/soap+xml'] }));

const PORT = Number(process.env.PORT ?? 3001);
const FLAKE_EVERY_N = Number(process.env.FLAKE_EVERY_N ?? 0);

let requestCounter = 0;
let controlCounter = 1000;

app.get('/seniat-mock/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', namespace: 'urn:atlas:sandbox:seniat:v1' });
});

app.post('/seniat-mock/authorize', (req: Request, res: Response) => {
    requestCounter += 1;

    if (FLAKE_EVERY_N > 0 && requestCounter % FLAKE_EVERY_N === 0) {
        res.status(503)
            .set('Content-Type', 'application/xml')
            .send(buildErrorEnvelope('SERVICE_UNAVAILABLE', 'Synthetic flake'));
        return;
    }

    const body = typeof req.body === 'string' ? req.body : '';
    if (!body.includes('<') || body.length < 16) {
        res.status(400)
            .set('Content-Type', 'application/xml')
            .send(buildErrorEnvelope('MALFORMED_REQUEST', 'Envelope is empty or not XML'));
        return;
    }

    controlCounter += 1;
    res.status(200)
        .set('Content-Type', 'application/xml')
        .send(buildSuccessEnvelope(controlCounter, requestCounter));
});

function buildSuccessEnvelope(controlNumber: number, fiscalSequence: number): string {
    return create({ version: '1.0' })
        .ele('envelope', { xmlns: 'urn:atlas:sandbox:seniat:v1' })
        .ele('authorization')
        .ele('status')
        .txt('AUTHORIZED')
        .up()
        .ele('control_number')
        .txt(`VE-${controlNumber}`)
        .up()
        .ele('fiscal_sequence')
        .txt(String(fiscalSequence).padStart(10, '0'))
        .up()
        .ele('issued_at')
        .txt(new Date().toISOString())
        .up()
        .up()
        .ele('signature', { xmlns: 'http://www.w3.org/2000/09/xmldsig#' })
        .ele('SignatureValue')
        .txt('SYNTHETIC-SIGNATURE-DAY0')
        .up()
        .ele('KeyInfo')
        .ele('KeyName')
        .txt('atlas-sandbox-key')
        .up()
        .up()
        .up()
        .end({ prettyPrint: false });
}

function buildErrorEnvelope(code: string, message: string): string {
    return create({ version: '1.0' })
        .ele('envelope', { xmlns: 'urn:atlas:sandbox:seniat:v1' })
        .ele('error')
        .ele('code')
        .txt(code)
        .up()
        .ele('message')
        .txt(message)
        .up()
        .up()
        .end({ prettyPrint: false });
}

app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`atlas-sandbox-seniat-mock listening on :${PORT}`);
});
