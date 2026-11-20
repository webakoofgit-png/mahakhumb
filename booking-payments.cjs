const { createHmac, timingSafeEqual, randomUUID } = require('node:crypto');
const nodemailer = require('nodemailer');
const { pool, transaction } = require('./booking-db.cjs');
const { fail, hash, json, gatewayConfigured, lockedBooking, release, queue, queueRefund, expireHolds } = require('./booking-engine.cjs');

async function gateway(path, body, extra = {}) {
    const credentials = Buffer.from(process.env.RAZORPAY_KEY_ID + ':' + process.env.RAZORPAY_KEY_SECRET).toString('base64');
    let response;
    try {
        response = await fetch('https://api.razorpay.com/v1' + path, {
            method: body ? 'POST' : 'GET',
            headers: { Authorization: 'Basic ' + credentials, 'Content-Type':'application/json', ...extra },
            body: body ? JSON.stringify(body) : undefined,
            signal: AbortSignal.timeout(8000)
        });
    } catch {
        throw fail(502, 'The payment provider did not respond. Please retry.');
    }
    if (!response.ok) throw Object.assign(fail(502, 'The payment provider could not complete this request. Please retry.'), { providerStatus: response.status });
    return response.json();
}

async function startPayment(reference, owner, key) {
    if (!gatewayConfigured()) throw fail(503, 'Online payment is not configured.');
    return transaction(async db => {
        const row = await lockedBooking(db, reference);
        if (!row || row.owner_hash !== owner) throw fail(404, 'Reservation not found.');
        if (row.status !== 'held' || row.expired) throw fail(409, 'This hold is no longer payable.');
        if (row.payment_key && row.payment_key !== key) throw fail(409, 'Payment has already been started for this hold.');
        let order = row.gateway_order;
        if (!order) {
            // A stable receipt lets a retry recover an order whose successful response was lost.
            let result;
            try {
                result = await gateway('/orders',{ amount:row.total,currency:'INR',receipt:reference });
            } catch (error) {
                if (error.providerStatus !== 400 && error.providerStatus !== 409) throw error;
                const existing = await gateway('/orders?receipt='+encodeURIComponent(reference));
                result = existing.items?.find(item => item.receipt === reference && item.amount === row.total && item.currency === 'INR');
                if (!result) throw error;
            }
            if (!/^order_[A-Za-z0-9]+$/.test(result.id) || result.amount !== row.total || result.currency !== 'INR' || result.receipt !== reference) {
                throw fail(502, 'The gateway returned an unexpected order.');
            }
            order = result.id;
            await db.execute('UPDATE mks_bookings SET gateway_order=?,payment_key=? WHERE reference=?', [order,key,reference]);
        }
        const [[fresh]] = await db.execute('SELECT expires_at<=UTC_TIMESTAMP() AS expired FROM mks_bookings WHERE reference=?', [reference]);
        return fresh.expired ? { expired: true } : { order, key:process.env.RAZORPAY_KEY_ID, amount:row.total, currency:'INR',
            prefill:{ name:row.guest_name,email:row.guest_email,contact:row.guest_phone } };
    });
}

function verifiedEvent(raw, signature, eventId) {
    if (!process.env.RAZORPAY_WEBHOOK_SECRET) throw fail(503, 'Payment webhook is not configured.');
    if (!/^[a-f0-9]{64}$/i.test(signature || '') || !/^[\w-]{1,128}$/.test(eventId || '')) throw fail(400,'Invalid payment webhook.');
    const expected = createHmac('sha256',process.env.RAZORPAY_WEBHOOK_SECRET).update(raw).digest();
    if (!timingSafeEqual(expected,Buffer.from(signature,'hex'))) throw fail(401,'Invalid webhook signature.');
    try { return JSON.parse(raw); } catch { throw fail(400,'Invalid payment webhook body.'); }
}
async function webhook(raw, signature, eventId) {
    const event = verifiedEvent(raw,signature,eventId);
    if (event?.event === 'refund.processed' || event?.event === 'refund.failed') {
        const refund = event.payload?.refund?.entity;
        if (refund && /^rfnd_[A-Za-z0-9]+$/.test(refund.id) && /^pay_[A-Za-z0-9]+$/.test(refund.payment_id) && Number.isSafeInteger(refund.amount)) await transaction(async db => {
            const result = event.event === 'refund.processed' ? 'processed' : 'failed';
            await db.execute(`UPDATE mks_payments SET refund_id=?,refund_status=? WHERE id=? AND refund_amount=?
                AND (refund_id=? OR (refund_id IS NULL AND refund_status='queued' AND ?=?
                )) AND refund_status!='processed'`,
                [refund.id,result,refund.payment_id,refund.amount,refund.id,refund.receipt ?? null,'mks-'+refund.payment_id]);
        });
        return;
    }
    if (event?.event !== 'payment.captured') return;
    const payment = event.payload?.payment?.entity;
    if (!payment || payment.status !== 'captured' || !/^pay_[A-Za-z0-9]+$/.test(payment.id) || !/^order_[A-Za-z0-9]+$/.test(payment.order_id) ||
        !Number.isSafeInteger(payment.amount) || payment.amount < 1 || payment.currency !== 'INR') throw fail(400,'Invalid payment data.');
    await transaction(async db => {
        const [[match]] = await db.execute('SELECT reference FROM mks_bookings WHERE gateway_order=?',[payment.order_id]);
        if (!match) return;
        const row = await lockedBooking(db,match.reference);
        const [record] = await db.execute('INSERT IGNORE INTO mks_webhook_events(id) VALUES (?)',[eventId]);
        if (!record.affectedRows) return;
        const [capture] = await db.execute('INSERT IGNORE INTO mks_payments(id,reference,amount) VALUES (?,?,?)',[payment.id,row.reference,payment.amount]);
        if (!capture.affectedRows) return;
        if (row.status !== 'held' || row.expired || row.total !== payment.amount) {
            if (row.status === 'held' && row.expired) await release(db,row,'expired');
            await queueRefund(db,payment.id,payment.amount);
            return;
        }
        // Held stock was already deducted, so confirmation only transfers ownership.
        await db.execute("UPDATE mks_bookings SET status='confirmed',payment_id=? WHERE reference=?",[payment.id,row.reference]);
        await db.execute('INSERT INTO mks_ops_commissions(reference,commission_bps) SELECT ?,commission_bps FROM mks_ops_settings WHERE id=1',[row.reference]);
        const [[hotel]]=await db.execute(`SELECT h.business_email FROM mks_hotel_partners h JOIN mks_property_workflow w ON w.owner_id=h.user_id
            WHERE w.listing_id=? AND h.booking_notifications=1`,[row.listing_id]);
        if(hotel)await queue(db,'email','hotel-confirmed-'+row.reference,{reference:row.reference,to:hotel.business_email,status:'confirmed',partner:true});
        await queue(db,'email','confirmed-'+row.reference,{ reference:row.reference,to:row.guest_email,status:'confirmed' });
    });
}

const mail = process.env.SMTP_URL && process.env.SMTP_FROM ? nodemailer.createTransport(process.env.SMTP_URL, {
    connectionTimeout:8000,greetingTimeout:8000,socketTimeout:15000
}) : null;
async function executeJob(job) {
    const data = json(job.payload);
    if (job.kind === 'email') {
        const subject=data.groupQuote?'MahakumbhStays group quotation':
            data.groupMessage?'MahakumbhStays group stay enquiry':'MahakumbhStays reservation '+data.status;
        const text=data.groupQuote?'Review your private group stay quote: '+data.groupQuote:
            data.groupMessage?data.groupMessage+'\n\nEnquiry reference '+data.reference:
            'Your reservation '+data.reference+' is '+data.status+(data.partner?'. Sign in to the Hotel Partner Portal for details.':'. Open My trips in the browser used to book for details.');
        await mail.sendMail({from:process.env.SMTP_FROM,to:[{name:'',address:data.to}],subject,text,
            messageId:'<'+hash(job.dedupe_key)+'@mahakumbhstays.local>'});
        return;
    }
    const [[payment]] = await pool.execute('SELECT refund_status,refund_id FROM mks_payments WHERE id=?',[data.id]);
    if (!payment || ['processed','failed'].includes(payment.refund_status)) return true;
    const path = '/payments/'+encodeURIComponent(data.id);
    const refund = payment.refund_id
        ? await gateway(path+'/refunds/'+encodeURIComponent(payment.refund_id))
        : await gateway(path+'/refund',{ amount:data.amount,receipt:'mks-'+data.id },
            { 'X-Refund-Idempotency':hash('refund:'+data.id) });
    if (!/^rfnd_[A-Za-z0-9]+$/.test(refund.id) || refund.payment_id !== data.id || refund.amount !== data.amount ||
        (payment.refund_id && payment.refund_id !== refund.id)) {
        throw fail(502,'The gateway returned unexpected refund details.');
    }
    const status = ['processed','failed'].includes(refund.status) ? refund.status : 'pending';
    await pool.execute("UPDATE mks_payments SET refund_id=?,refund_status=? WHERE id=? AND refund_status IN ('queued','pending')",[refund.id,status,data.id]);
    return status !== 'pending';
}
async function takeJob() {
    const kinds = [...(mail ? ['email'] : []), ...(gatewayConfigured() ? ['refund'] : [])];
    if (!kinds.length) return null;
    return transaction(async db => {
        const [[job]] = await db.execute(`SELECT * FROM mks_booking_jobs WHERE kind IN (${kinds.map(()=>'?').join(',')})
            AND done=0 AND run_after<=UTC_TIMESTAMP() ORDER BY run_after,id LIMIT 1 FOR UPDATE SKIP LOCKED`,kinds);
        if (!job) return null;
        job.lease = randomUUID();
        await db.execute('UPDATE mks_booking_jobs SET lease=?,run_after=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 2 MINUTE) WHERE id=?',[job.lease,job.id]);
        return job;
    });
}
async function processJobs() {
    for (let i=0;i<10;i++) {
        const job = await takeJob();
        if (!job) break;
        try {
            const finished = await executeJob(job);
            if (finished === false) {
                await pool.execute('UPDATE mks_booking_jobs SET run_after=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 15 MINUTE) WHERE id=? AND lease=?',[job.id,job.lease]);
            } else {
                await pool.execute("UPDATE mks_booking_jobs SET done=1,payload=JSON_REMOVE(payload,'$.groupQuote') WHERE id=? AND lease=?",[job.id,job.lease]);
            }
        } catch (error) {
            const delay = Math.min(3600,30 * 2 ** Math.min(job.attempts,7));
            await pool.execute('UPDATE mks_booking_jobs SET attempts=attempts+1,run_after=DATE_ADD(UTC_TIMESTAMP(),INTERVAL ? SECOND) WHERE id=? AND lease=?',
                [delay,job.id,job.lease]);
            console.error('Booking job retry',job.id,error.code || error.providerStatus || 'delivery_error');
        }
    }
}

function startWorker() {
    if (!pool) return;
    let running = false;
    async function tick() {
        if (running) return;
        running = true;
        try { await expireHolds(); await processJobs(); }
        catch (error) { console.error('Booking worker',error.code || 'worker_error'); }
        finally { running = false; }
    }
    tick();
    setInterval(tick,10000).unref();
}
module.exports = { startPayment, webhook, startWorker };
