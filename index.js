import { createHash } from "crypto";
import { WebSocketServer } from "ws";
import express from "express";
import { exec } from "child_process";

const port = 7777;
const wss = new WebSocketServer({ noServer: true });
const app = express();

let supported_servers = [
    "jk"
]

let server_keys = []
let queue = []
let open_servers = []

server_keys.push({serverKey: '7b080071d634f2b4a64a201658ab804e', serverName: 'jk' });


let matchmakerState = {
    connectedClients: 0, 
    matchId: "",
    sessionId: "",
    postRequestReceived: false,
    queueOpen: true,
    gameOpen: false,
};

wss.on('connection', async (ws, req) => {
    if (ws.protocol.toLowerCase().includes("xmpp")) {
        return ws.close();
    }
    const authHeader = req.headers['authorization'];
    if (!authHeader)
        return ws.close();

    var authpart = authHeader.split(' ');
    ws.accountid = authpart[3];
    ws.playlist = authpart[4];
    ws.region = authpart[5];
    ws.current_server = authpart[6];
    
    if (ws.playlist === undefined || ws.region === undefined || ws.current_server === undefined)
    {
        console.log(`We closed the connection to a client due invalid headers.`)
        return ws.close();
    }

    ws.serverId = null;
    ws.serverFound = false

    if (!supported_servers.includes(ws.current_server)) 
    {
        console.log(`We closed the connection to a client due to ${serverKey} is not in our server list.`)
        return ws.close();
    }

    ws.queueId = createHash('md5').update(`${ws.accountid}${Date.now()}`).digest('hex');
    queue.push({playlist: ws.playlist, region: ws.region, current_server: ws.current_server, queueId: ws.queueId });

    const clientIp = req.socket.remoteAddress;
    ws.isConnected = true;
    ws.searchtime = 0;
    matchmakerState.connectedClients++;

    const ticketId = createHash('md5').update(`1${Date.now()}`).digest('hex');
    const matchId = createHash('md5').update(`2${Date.now()}`).digest('hex');
    const sessionId = createHash('md5').update(`3${Date.now()}`).digest('hex');

    setTimeout(() => Connecting(), 2);
    setTimeout(() => Waiting(), 4);
    setTimeout(() => Queued(), 6);
    setTimeout(() => SessionAssignment(), 8);

    async function Connecting() {
        if (!ws.isConnected) { return; }
        ws.send(JSON.stringify({
            "payload": {
                "state": "Connecting"
            },
            "name": "StatusUpdate"
        }));
    }

    async function Waiting() {
        if (!ws.isConnected) { return; }
        ws.send(JSON.stringify({
            "payload": {
                "totalPlayers": matchmakerState.connectedClients,
                "connectedPlayers": matchmakerState.connectedClients,
                "state": "Waiting"
            },
            "name": "StatusUpdate"
        }));
    }

    async function Queued() {
        if (matchmakerState.queueOpen) {
            if (!ws.isConnected) { return; }
            const getMatchmakes = queue.filter(item => {
                return (
                    item.playlist === ws.playlist &&
                    item.region === ws.region &&
                    item.current_server === ws.current_server
                );
            });
            const queuedPlayers = matchmakerState.connectedClients;
            const status = queuedPlayers === 0 ? 2 : 3;

            ws.send(JSON.stringify({
                "payload": {
                    "ticketId": ticketId,
                    "queuedPlayers": getMatchmakes.length,
                    "estimatedWaitSec": estimatedWaitSec,
                    "status": status,
                    "state": "Queued"
                },
                "name": "StatusUpdate"
            }));
        }
    }

    async function SessionAssignment() {
        ws.estimatedWaitSec = ((server_calc.lateGameTime / server_calc.lateGameServers) * Math.ceil(matchmakerState.connectedClients / 100)) + (Math.random() * 30);
        while (!ws.serverFound) {
            if (!ws.isConnected) { return; }
            const matchingServer = open_servers.find(server =>
                server.region === ws.region &&
                server.playlist === ws.playlist &&
                server.serverName === ws.current_server
            );
        
            if (matchingServer) {
                ws.serverid = matchingServer.serverId;
                ws.serverFound = true;
            }

            const getMatchmakes = queue.filter(item => {
                return (
                    item.playlist === ws.playlist &&
                    item.region === ws.region &&
                    item.current_server === ws.current_server
                );
            });

            const queuedPlayers = matchmakerState.connectedClients;
            const status = queuedPlayers === 0 ? 2 : 3;

            ws.send(JSON.stringify({
                "payload": {
                    "ticketId": ticketId,
                    "queuedPlayers": getMatchmakes.length,
                    "estimatedWaitSec": ws.estimatedWaitSec,
                    "status": status,
                    "state": "Queued"
                },
                "name": "StatusUpdate"
            }));
            
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        ws.send(JSON.stringify({
            "payload": {
                "matchId": matchId,
                "state": "SessionAssignment"
            },
            "name": "StatusUpdate"
        }));

        setTimeout(() => Join(), 20);
    }

    async function Join() {
        if (!ws.isConnected) { return; }
        ws.send(JSON.stringify({
            "payload": {
                "matchId": matchId,
                "sessionId": createHash('md5').update(`${ws.serverid}`).digest('hex'),
                "joinDelaySec": (Math.random() * 8)
            },
            "name": "Play"
        }));
    }

    ws.on('close', () => {
        matchmakerState.connectedClients--;
        ws.isConnected = false;
        queue = queue.filter(player => player.queueId !== ws.queueId);
    });
});

const server = app.listen(port, () => {
    console.log(`Ultimate Matchmaker made by Boosted and Mstreem`);
    server.on('upgrade', (request, socket, head) => {
        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
        });
    });
});

app.post('/start', (req, res) => {
    const serverName = req.query.server;
    const privateKey = req.query.privateKey;
    const serverId = req.query.serverId;
    const region = req.query.region;
    const playlist = req.query.playlist;

    if (!serverName || !privateKey || !region || !serverId || !playlist) {
        res.json({ 
            error: 'Invalid request.',
            success: false 
        });
        return;
    }

    if (!server_keys.some(key => key.serverName === serverName && key.serverKey === privateKey)) {
        res.json({ 
            error: 'Unknown Server Key',
            success: false 
        });
        return;
    }

    if (open_servers.some(server => server.serverId === serverId)) {
        res.json({ 
            error: 'Already started',
            success: false 
        });
        return;
    }

    open_servers.push({serverName: serverName, serverId: serverId, region: region, playlist: playlist });
    res.json({ success: true });
});

app.post('/close', (req, res) => {
    const serverName = req.query.server;
    const privateKey = req.query.privateKey;
    const serverId = req.query.serverId;

    if (!serverName || !privateKey || !serverId) {
        res.json({ 
            error: 'Invalid request.',
            success: false 
        });
        return;
    }

    if (!server_keys.some(key => key.serverName === serverName && key.serverKey === privateKey)) {
        res.json({ 
            error: 'Unknown Server Key',
            success: false 
        });
        return;
    }

    if (!open_servers.some(server => server.serverId === serverId)) {
        res.json({
            error: 'Already closed or not found',
            success: false 
        });
        return;
    }

    open_servers = open_servers.filter(server => server.serverId !== serverId);
    res.json({ success: true });
});
