const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { search, getListing } = require('./stay-api.cjs');

const publicPages = require('./public-pages.cjs');
const operations = require('./operations-http.cjs');
const booking = require('./booking-http.cjs');
const platform = require('./platform.cjs');
booking.startWorker();

const root = path.join(__dirname, 'dist');
const contentTypes = {
    '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8', '.png': 'image/png',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp'
};
function json(res, status, body) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
}

http.createServer(async (req, res) => {
    const requestId=platform.requestId();
    res.setHeader('X-Request-Id',requestId);
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=(self)');
    const client=(req.headers['x-forwarded-for']||req.socket.remoteAddress||'unknown').split(',')[0].trim();
    if (!(await platform.rateLimit(client,240,60000))) return json(res,429,{error:'Too many requests.',requestId});
    if (/^\/(?:api\/operations|media\/property)(?:\/|$|\?)/.test(req.url)) {
        try {
            const result = await operations.route(req,res,new URL(req.url,'http://localhost'));
            if (!res.headersSent) return json(res,200,result);
            return;
        } catch(error) {
            if (error.code==='ER_DUP_ENTRY') return json(res,409,{error:'A record already uses those details.'});
            if (!error.status) console.error('Operations request failed',error.code||error.name);
            return json(res,error.status||503,{error:error.status?error.message:'Operations are temporarily unavailable. Try again.'});
        }
    }
    if (/^\/api\/(properties|reservations|hotel-bookings|razorpay-webhook)(?:\/|$|\?)/.test(req.url)) {
        try {
            const data = await booking.route(req, res, new URL(req.url, 'http://localhost'));
            return json(res, 200, data);
        } catch (error) {
            if (!error.status) console.error('Reservation request failed', error.code || error.name);
            return json(res, error.status || 503, { error: error.status ? error.message : 'Reservations are temporarily unavailable. Please try again.' });
        }
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.setHeader('Allow', 'GET, HEAD');
        return json(res, 405, { error: 'Method not allowed.' });
    }
    try {
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname === '/healthz') return json(res,200,{ok:true,service:'mahakumbh-stage',requestId});
        if (url.pathname === '/readyz') return json(res,200,{ok:Boolean(require('./booking-db.cjs').pool),database:Boolean(require('./booking-db.cjs').pool),requestId});
        if (url.pathname.startsWith('/api/')) {
            const detail = url.pathname.match(/^\/api\/stays\/(\d+)$/);
            const result = url.pathname === '/api/stays' ? await search(url.searchParams)
                : detail ? await getListing(Number(detail[1])) : { status: 404, body: { error: 'Endpoint not found.' } };
            return json(res, result.status, result.body);
        }
        if(await publicPages.route(req,res,url))return;
        const relative = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
        const file = path.resolve(root, '.' + relative);
        if (!file.startsWith(root + path.sep)) return json(res, 403, { error: 'Access denied.' });
        fs.readFile(file, (error, data) => {
            if (error) return json(res, 404, { error: 'File not found.' });
            const type=path.extname(file);
            res.writeHead(200,{'Content-Type':contentTypes[type]||'application/octet-stream',
                'Cache-Control':type==='.html'?'no-cache':type==='.webp'?'public, max-age=86400':'public, max-age=300',
                'X-Content-Type-Options':'nosniff'});
            res.end(req.method === 'HEAD' ? undefined : data);
        });
    } catch (error) {
        if (error instanceof URIError) return json(res, 400, { error: 'Invalid request path.' });
        console.error(error);
        json(res, 503, { error: 'Stay search is temporarily unavailable. Please try again.' });
    }
}).listen(process.env.PORT || 3000, process.env.HOST || '127.0.0.1', () => console.log('MahakumbhStays is ready.'));
