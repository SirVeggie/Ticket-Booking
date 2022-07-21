import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import morgan from 'morgan';
import cors from 'cors';
import 'express-async-errors';
import database from './src/database';
import extractType from './src/tools/extractType';
import errors from './src/tools/errors';
import { MiscData, Seats, Show, Showtime, Ticket } from 'shared';
import auth from './src/auth';
import email from './src/tools/email';

//====| middleware |====//

morgan.token('body', (req: any) => JSON.stringify(req.body));

const server = express();
server.use(express.json());
server.use(express.static('build'));
server.use(cors());
server.use(morgan(':method :url :status :res[content-length] - :response-time ms :body'));

//===| models |===//

const showModel: Show = new Show();
const showtimeModel: Showtime = new Showtime();
const ticketModel: Ticket = new Ticket();

//===| generic |===//

type DataType = 'shows' | 'showtimes' | 'tickets';

function getall(target: DataType, admin: boolean) {
    return async (req: any, res: any) => {
        if (admin)
            checkAdmin(req);
        const result = await database[target].getall();
        res.json(result);
    };
}

function getone(target: DataType, admin: boolean) {
    return async (req: any, res: any) => {
        if (admin)
            checkAdmin(req);
        const id = req.params.id;
        const data = await database[target].get(id);
        res.json(data);
    };
}

function add(target: DataType, admin: boolean, model: any) {
    return async (req: any, res: any) => {
        if (admin)
            checkAdmin(req);
        const data = extractType(req.body, model);
        const result = await database[target].add(data);
        res.json(result);
    };
}

function replace(target: DataType, admin: boolean, model: any) {
    return async (req: any, res: any) => {
        if (admin)
            checkAdmin(req);
        const data = extractType(req.body, model);
        data.id = req.params.id;
        const result = await database[target].replace(data.id, data);
        res.json(result);
    };
}

function del(target: DataType, admin: boolean) {
    return async (req: any, res: any) => {
        if (admin)
            checkAdmin(req);
        const id = req.params.id;
        await database[target].delete(id);
        res.status(204).end();
    };
}

function checkAdmin(request: any): void {
    const ip = getIP(request);
    const header: string = request.get('authorization');
    if (!header)
        throw errors.noAdmin;
    const split = header.split(' ');
    if (split[0].toLowerCase() === 'bearer') {
        const data: any = auth.checkToken(split[1]);
        if (ip === data.ip)
            return;
        throw errors.invalidIP;
    }

    throw errors.noAdmin;
}

function isAdmin(request: any): boolean {
    try {
        checkAdmin(request);
        return true;
    } catch (error) {
        if (error === errors.noAdmin)
            return false;
        else
            throw error;
    }
}

function getIP(request: any): string {
    return request.headers['x-forwarded-for'] || request.connection.remoteAddress;
}

//====| auth |====//

server.get('/api/ip', (req, res) => {
    const ip = getIP(req);
    console.log('ip: ' + ip);
    res.send('ok');
});

server.post('/api/login', async (req, res) => {
    if (!auth.checkPassword(req.body.password))
        return res.status(401).send('Invalid password');
    res.status(200).send(auth.getToken(getIP(req)));
});

server.get('/api/check_token', async (req, res) => {
    checkAdmin(req);
    res.status(200).end();
});

server.post('/api/refresh_token', async (req, res) => {
    checkAdmin(req);
    res.status(200).send(auth.getToken(getIP(req)));
});

//====| common |====//

server.get('/api/health', (req, res) => {
    res.send('ok');
});

server.get('/api/packet', async (req, res) => {
    res.json(await database.getPacket());
});

server.get('/api/misc', async (req, res) => {
    res.json(await database.getMisc());
});

server.put('/api/misc', async (req, res) => {
    checkAdmin(req);
    const data = extractType(req.body, new MiscData());
    res.json(await database.replaceMisc(data));
});

//====| shows |====//

server.get('/api/shows', getall('shows', false));
server.get('/api/shows/:id', getone('shows', false));
server.post('/api/shows', add('shows', true, showModel));
server.put('/api/shows/:id', replace('shows', true, showModel));
server.delete('/api/shows/:id', del('shows', true));

//===| showtimes |===//

server.get('/api/showtimes', getall('showtimes', false));
server.get('/api/showtimes/:id', getone('showtimes', false));
server.post('/api/showtimes', add('showtimes', true, showtimeModel));
server.put('/api/showtimes/:id', replace('showtimes', true, showtimeModel));
server.delete('/api/showtimes/:id', del('showtimes', true));

server.get('/api/available_seats/:id', async (req, res) => {
    const id = req.params.id;
    const data = await database.showtimes.getAvailableSeats(id);
    res.json(data);
});

//===| tickets |===//

server.get('/api/tickets', getall('tickets', true));
server.get('/api/tickets/:id', async (req, res) => {
    const id = req.params.id;
    const data = await database.tickets.get(id);
    if (data.confirmed)
        return res.json(data);
    res.json(data);
});
server.post('/api/tickets', async (req, res) => {
    const data = extractType(req.body, ticketModel);
    const result = await database.tickets.add(data);
    if (!result.confirmed)
        email.ticketConfirmation(result.email, result.id);
    res.json(result);
});
server.put('/api/tickets/:id', replace('tickets', false, ticketModel));
server.delete('/api/tickets/:id', del('tickets', false));

server.post('/api/confirm/:id', async (req, res) => {
    const id = req.params.id;
    const data = await database.tickets.get(id);

    if (data.confirmed)
        return res.status(410).send('Confirmation link already processed');

    data.confirmed = true;
    await database.tickets.replace(id, data);
    res.status(200).end();
});

server.get('/api/ticket_amounts', async (req, res) => {
    const data = await database.tickets.getAmounts();
    res.json(data);
});

server.post('/api/update_seats/:id', async (req, res) => {
    const id = req.params.id;
    const data = extractType(req.body, new Seats());
    await database.tickets.updateSeats(id, data, isAdmin(req));
    res.status(200).end();
});

//====| serve static files |====//

server.get('*', (req, res, next) => {
    const path = (req as any).params['0'];
    if (!path.includes('/api/')) {
        res.sendFile(`${__dirname}/index.html`);
    } else {
        next();
    }
});

//====| other |====//

function unknownEndpoint(req: any, res: any) {
    res.status(404).send('unknown endpoint');
}

server.use(unknownEndpoint);

function errorHandler(error: any, req: any, res: any, next: any) {
    console.error('Error: ' + error);
    
    if (!error?.startsWith) {
        next(error);
        return;
    }
    
    if (error?.startsWith(errors.noData))
        return res.status(404).send('unknown endpoint');
    if (error?.startsWith(errors.invalidData))
        return res.status(400).send('Data provided was invalid');
    if (error?.startsWith(errors.illegalData))
        return res.status(400).send(errors.illegalData);
    if (error?.startsWith(errors.noAdmin))
        return res.status(401).send('Performed Admin action without proper admin token');
    if (error?.startsWith(errors.invalidIP))
        return res.status(401).send('Admin token was invalid');
    if (error?.startsWith(errors.tokenExpire))
        return res.status(401).send('Token has already expired');

    next(error);
}

server.use(errorHandler);

const PORT = process.env.PORT;
server.listen(PORT, () => {
    console.log('Server running on port ' + PORT);
});