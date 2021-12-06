const basicAuth = require('express-basic-auth')
const express = require('express')
const sockio = require('socket.io')
const helmet = require('helmet');
const http = require('http');
const path = require('path');
const uuid = require('uuid');

const app = express();
const sockets = new Map();

const server = http.createServer(app)

app.use(helmet());

app.use((req, res, next) => {
    console.log(req.method, req.originalUrl)

    next()
});

app.use(basicAuth({
    challenge: true,
    users: JSON.parse(process.env.USERS)
}))

app.use(express.static(path.resolve(__dirname, '../assets')));

let host;

const sendToClients = msg => {
    for ([key, sock] of sockets.entries()) {
        if (key !== host) {
            sock.emit('host.msg', msg);
        }
    }
}

const sendToHost = msg => {
    if (!sockets.has(host)) return;

    const sock = sockets.get(host);
    sock.emit('client.msg', msg);
}

io = sockio(server)
io.on('connection', socket => {
    const id = uuid.v4();
    console.log(`new connection from: ${id}`);
    sockets.set(id, socket);

    socket.on('hello', type => {
        console.log('hello', type);
        if (type === 'host') {
            host = id;
            sendToClients({ type: 'connection' });
        } else {
            sendToHost({ type: 'connection' });
        }
    });

    socket.on('host.msg', msg => {
        console.log('host.msg');
        if (!host) {
            host = id;
            // Tell clients about new host
            sendToClients('host.msg', { type: 'connection' });
        } else {
            sendToClients(msg);
        }
    });

    socket.on('client.msg', msg => {
        console.log('client.msg');
        if (sockets.has(host)) {
            const sock = sockets.get(host);
            sock.emit('client.msg', msg);
        } else console.warn('No host');
    });

    socket.on('disconnect', () => {
        console.log(`${id} disconnected`);
        sockets.delete(id);
        if (host == id) {
            host = null;
        }
    });
});

const port = process.env.PORT || 8080

server.listen(port, () => console.log(`Listening on ${port}`));